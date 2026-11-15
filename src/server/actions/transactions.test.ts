// Test d'intégration des actions sur les transactions — docs/lot-m2.md §5, §6 et §8.
// Tourne dans le schéma `test`, seedé. Les écritures ne touchent que des
// données jetables (2099, compte hors budget), nettoyées en afterAll.

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FILTRES_VIDES } from "@/domain/consultation";
import { versDateUtc } from "@/domain/dates";
import { messageRefus } from "@/domain/edition";
import { messageRefusLiaison } from "@/domain/virement";
import { formatMontant } from "@/domain/money";
import { exigerInvariants } from "../../../prisma/test/invariants";
import { tenirVerrou } from "../../../prisma/test/verrou-tenu";
import { MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE, MESSAGE_EMPREINTE_EXISTANTE, MESSAGE_SELECTION_TROP_GRANDE } from "@/features/transactions/schema";
import {
  apercevoirSuppressionEnMasse,
  compterTransactionsARevoir,
  creerContrepartie,
  creerTransaction,
  delierVirement,
  deventilerTransaction,
  lierVirement,
  lireTransaction,
  listerCandidatsVirement,
  listerTransactions,
  modifierTransaction,
  modifierTransactionsEnMasse,
  saisirVirement,
  supprimerTransaction,
  ventilerTransaction,
} from "./transactions";
import { messageCourse } from "./transactions-messages";

const prisma = new PrismaClient();

// Données jetables des actions d'écriture : 2099, compte hors budget, nettoyées en afterAll.
const M = "X" + randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase();
let compteJetable = "";

beforeAll(async () => {
  const proprietaire = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  compteJetable = (
    await prisma.account.create({
      data: {
        ownerId: proprietaire.id,
        nom: `Action Ecriture ${M}`,
        dateSoldeInitial: versDateUtc("2099-01-01"),
        estBudgetaire: false,
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { accountId: compteJetable } });
  await prisma.payee.deleteMany({ where: { nomNormalise: { contains: M.toLowerCase() } } });
  await prisma.account.deleteMany({ where: { id: compteJetable } });
  await prisma.$disconnect();
});

const TOUT = { type: "TOUT", mois: "2026-09" } as const;
const TRI_DATE = { champ: "DATE", ordre: "DESC" } as const;
const CUID_INEXISTANT = "clx0000000000000000099999";

describe("listerTransactions", () => {
  it("refuse un curseur MONTANT avec un tri DATE", async () => {
    const resultat = await listerTransactions({
      filtres: FILTRES_VIDES,
      periode: TOUT,
      tri: TRI_DATE,
      curseur: { champ: "MONTANT", montantCents: -100, id: CUID_INEXISTANT },
    });
    expect(resultat).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: "Le curseur ne correspond pas au tri demandé.",
    });
  });

  it("refuse un montant minimum négatif", async () => {
    const resultat = await listerTransactions({
      filtres: { ...FILTRES_VIDES, montantMinCents: -1 },
      periode: TOUT,
      tri: TRI_DATE,
      curseur: null,
    });
    expect(resultat).toMatchObject({ ok: false, code: "VALIDATION", message: "Le montant doit être positif ou nul." });
  });

  it("un curseur MONTANT et un seuil au-delà de 2^31 ne lèvent pas d'erreur", async () => {
    const triMontant = { champ: "MONTANT", ordre: "DESC" } as const;
    const visa = await prisma.account.findFirstOrThrow({ where: { nom: "Visa" }, select: { id: true } });
    const filtresVisa = { ...FILTRES_VIDES, comptes: [visa.id] };
    const curseur = await listerTransactions({
      filtres: filtresVisa,
      periode: TOUT,
      tri: triMontant,
      curseur: { champ: "MONTANT", montantCents: 3_000_000_000, id: CUID_INEXISTANT },
    });
    expect(curseur.ok).toBe(true);
    if (curseur.ok) expect(curseur.data.lignes.length).toBeGreaterThan(0);
    const negatif = await listerTransactions({
      filtres: filtresVisa,
      periode: TOUT,
      tri: triMontant,
      curseur: { champ: "MONTANT", montantCents: -3_000_000_000, id: CUID_INEXISTANT },
    });
    expect(negatif.ok).toBe(true);
    if (negatif.ok) {
      expect(negatif.data.lignes).toEqual([]);
      expect(negatif.data.curseurSuivant).toBeNull();
    }
    const horsBornes = await listerTransactions({
      filtres: filtresVisa,
      periode: TOUT,
      tri: triMontant,
      curseur: { champ: "MONTANT", montantCents: 1e20, id: CUID_INEXISTANT },
    });
    expect(horsBornes).toMatchObject({ ok: false, code: "VALIDATION", message: "Montant trop grand." });
    const seuil = await listerTransactions({
      filtres: { ...FILTRES_VIDES, montantMinCents: 3_000_000_000 },
      periode: TOUT,
      tri: triMontant,
      curseur: null,
    });
    expect(seuil.ok).toBe(true);
    if (seuil.ok) expect(seuil.data.totaux).toMatchObject({ nombre: 0, sommeCents: 0, proprietaireSansTransaction: false });
  });

  it("première page avec totaux, page suivante sans totaux", async () => {
    const visa = await prisma.account.findFirstOrThrow({ where: { nom: "Visa" }, select: { id: true } });
    const requete = { filtres: { ...FILTRES_VIDES, comptes: [visa.id] }, periode: TOUT, tri: TRI_DATE };

    const premiere = await listerTransactions({ ...requete, curseur: null });
    expect(premiere.ok).toBe(true);
    if (!premiere.ok) return;
    expect(premiere.data.totaux).not.toBeNull();
    expect(premiere.data.totaux?.nombre).toBeGreaterThan(50);
    expect(premiere.data.curseurSuivant).not.toBeNull();

    const seconde = await listerTransactions({ ...requete, curseur: premiere.data.curseurSuivant });
    expect(seconde.ok).toBe(true);
    if (!seconde.ok) return;
    expect(seconde.data.totaux).toBeNull();
  });
});

describe("lireTransaction", () => {
  it("NOT_FOUND sur un identifiant inexistant", async () => {
    expect(await lireTransaction({ id: CUID_INEXISTANT })).toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "Cette transaction est introuvable.",
    });
  });
});

describe("écritures", () => {
  const entreeJetable = () => ({
    accountId: compteJetable,
    date: "2099-06-01",
    description: `Action Jetable ${M}`,
    montant: "-12,34",
    payeeId: null,
    payeeNouveauNom: null,
    subcategoryId: null,
    note: "",
    tagIds: [],
  });
  let idJetable = "";

  it("1. modifierTransaction : identifiant inexistant → NOT_FOUND", async () => {
    expect(await modifierTransaction({ id: CUID_INEXISTANT, note: "x" })).toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "Cette transaction est introuvable.",
    });
  });

  it("2. modifierTransaction : aucun champ → VALIDATION", async () => {
    expect(await modifierTransaction({ id: CUID_INEXISTANT })).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: "Aucune modification à enregistrer.",
    });
  });

  it("3. la date d'une importée du seed est refusée, rien ne change", async () => {
    const ligne = await prisma.transaction.findFirstOrThrow({
      where: { account: { nom: "Visa" }, source: "COPIER_COLLER", transferTransactionId: null, parentId: null },
      select: { id: true, date: true },
    });
    expect(await modifierTransaction({ id: ligne.id, date: "2026-01-01" })).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: messageRefus("DATE_HORS_MANUELLE"),
    });
    const apres = await prisma.transaction.findUniqueOrThrow({ where: { id: ligne.id }, select: { date: true } });
    expect(apres.date).toEqual(ligne.date);
  });

  it("4. un côté de virement du seed ne se supprime pas", async () => {
    const ligne = await prisma.transaction.findFirstOrThrow({
      where: { description: "PAIEMENT VISA DESJARDINS", transferTransactionId: { not: null } },
      select: { id: true },
    });
    expect(await supprimerTransaction({ id: ligne.id, virement: null })).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: messageRefus("SUPPRESSION_VIREMENT"),
    });
    expect(await prisma.transaction.count({ where: { id: ligne.id } })).toBe(1);
  });

  it("5. une saisie jetable passe ; la même une seconde fois est un doublon", async () => {
    const premiere = await creerTransaction(entreeJetable());
    expect(premiere.ok).toBe(true);
    if (premiere.ok) idJetable = premiere.data.id;
    expect(await creerTransaction(entreeJetable())).toMatchObject({
      ok: false,
      code: "DUPLICATE",
      message: MESSAGE_EMPREINTE_EXISTANTE,
    });
  });

  it("6. 5001 identifiants → VALIDATION, sélection trop grande", async () => {
    const idsSynthetiques = Array.from({ length: 5001 }, (_, i) => `c${i.toString(36).padStart(10, "0")}`);
    expect(
      await modifierTransactionsEnMasse({
        selection: { type: "IDS", ids: idsSynthetiques },
        geste: { type: "A_REVOIR", valeur: true },
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION", message: MESSAGE_SELECTION_TROP_GRANDE });
  });

  it("7. une sous-catégorie inexistante → NOT_FOUND", async () => {
    expect(
      await modifierTransactionsEnMasse({
        selection: { type: "IDS", ids: [idJetable] },
        geste: { type: "SOUS_CATEGORIE", subcategoryId: CUID_INEXISTANT },
      }),
    ).toEqual({ ok: false, code: "NOT_FOUND", message: "Cette sous-catégorie n'existe plus." });
  });

  it("8. l'aperçu d'une suppression par filtre compte les lignes jetables", async () => {
    const attendu = await prisma.transaction.count({ where: { accountId: compteJetable, parentId: null } });
    const resultat = await apercevoirSuppressionEnMasse({
      selection: {
        type: "FILTRE",
        filtres: { ...FILTRES_VIDES, comptes: [compteJetable] },
        periode: { type: "TOUT", mois: "2099-06" },
      },
    });
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.data.sansChoix.aSupprimer).toBe(attendu);
  });

  it("9. un nom de bénéficiaire fait d'accents combinants → VALIDATION", async () => {
    expect(await creerTransaction({ ...entreeJetable(), description: `Autre ${M}`, payeeNouveauNom: "́" })).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE,
    });
  });
});

describe("ventilation (docs/lot-m2.md §4.2)", () => {
  let idLigne = "";
  const deuxLignes = (a: string, b: string) => [
    { subcategoryId: null, montant: a, note: "", tagIds: [] as string[] },
    { subcategoryId: null, montant: b, note: "", tagIds: [] as string[] },
  ];

  beforeAll(async () => {
    const resultat = await creerTransaction({
      accountId: compteJetable,
      date: "2099-07-01",
      description: `Action Ventil ${M}`,
      montant: "-50,00",
      payeeId: null,
      payeeNouveauNom: null,
      subcategoryId: null,
      note: "",
      tagIds: [],
    });
    if (!resultat.ok) {
      throw new Error("la ligne jetable n'a pas pu être créée");
    }
    idLigne = resultat.data.id;
  });

  it("AT1 — identifiant inexistant : NOT_FOUND", async () => {
    expect(await ventilerTransaction({ id: CUID_INEXISTANT, lignes: deuxLignes("-20,00", "-30,00") })).toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "Cette transaction est introuvable.",
    });
  });

  it("AT2 — un côté de virement du seed : CONFLICT, rien ne change", async () => {
    const ligne = await prisma.transaction.findFirstOrThrow({
      where: { description: "PAIEMENT VISA DESJARDINS", transferTransactionId: { not: null } },
      select: { id: true, estVentilee: true, montantCents: true },
    });
    expect(await ventilerTransaction({ id: ligne.id, lignes: deuxLignes("-1,00", "-1,00") })).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: messageRefus("VENTILATION_VIREMENT"),
    });
    const apres = await prisma.transaction.findUniqueOrThrow({
      where: { id: ligne.id },
      select: { estVentilee: true, montantCents: true },
    });
    expect(apres).toEqual({ estVentilee: ligne.estVentilee, montantCents: ligne.montantCents });
  });

  it("AT3 — une somme fausse : VALIDATION avec le reste à répartir", async () => {
    expect(await ventilerTransaction({ id: idLigne, lignes: deuxLignes("-20,00", "-20,00") })).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: `Il reste ${formatMontant(1000)} à répartir.`,
    });
  });

  it("AT4 — un montant illisible traverse defineAction avec son message", async () => {
    expect(await ventilerTransaction({ id: idLigne, lignes: deuxLignes("abc", "-30,00") })).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: "Montant illisible. Exemple : -25,00",
    });
  });

  it("AT5 — ventiler, déventiler, déventiler encore", async () => {
    const ventilee = await ventilerTransaction({ id: idLigne, lignes: deuxLignes("-20,00", "-30,00") });
    expect(ventilee).toMatchObject({ ok: true, data: { lignes: 2 } });
    const filles = await prisma.transaction.findMany({ where: { parentId: idLigne }, select: { id: true } });
    expect(filles).toHaveLength(2);
    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [idLigne, ...filles.map((f) => f.id)] });
    expect(await deventilerTransaction({ id: idLigne })).toMatchObject({ ok: true, data: { lignesSupprimees: 2 } });
    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [idLigne] });
    expect(await deventilerTransaction({ id: idLigne })).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: messageRefus("NON_VENTILEE"),
    });
  });
});

describe("virements (docs/lot-m2.md §4.4)", () => {
  const DESTINATION_IDENTIQUE = "Choisis un compte différent du compte de départ.";
  let proprietaireId = "";
  let compteB = "";
  let compteC = "";
  let utilisateur2Id = "";
  let compteEtranger = "";
  let transactionEtrangere = "";
  let compteurLigne = 0;

  async function ligne(accountId: string, date: string, montantCents: number): Promise<string> {
    compteurLigne += 1;
    const description = `Action Vir ${String(compteurLigne)} ${M}`;
    return (
      await prisma.transaction.create({
        data: {
          ownerId: proprietaireId,
          accountId,
          date: versDateUtc(date),
          description,
          descriptionNormalisee: description.toUpperCase(),
          montantCents,
          source: "MANUELLE",
          empreinte: `action-vir-${String(compteurLigne)}-${M}`,
        },
        select: { id: true },
      })
    ).id;
  }

  beforeAll(async () => {
    proprietaireId = (await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } })).id;
    const creerCompte = async (nom: string, ownerId: string) =>
      (
        await prisma.account.create({
          data: { ownerId, nom, dateSoldeInitial: versDateUtc("2099-01-01"), estBudgetaire: false },
          select: { id: true },
        })
      ).id;
    compteB = await creerCompte(`Action Vir B ${M}`, proprietaireId);
    compteC = await creerCompte(`Action Vir C ${M}`, proprietaireId);
    // Un second utilisateur n'existe que le temps de ce describe : prisma/test/garde-schema.test.ts compte les utilisateurs.
    utilisateur2Id = (await prisma.user.create({ data: { email: `action-vir-u2-${M}@example.test` }, select: { id: true } })).id;
    compteEtranger = await creerCompte(`Action Vir Etranger ${M}`, utilisateur2Id);
    transactionEtrangere = (
      await prisma.transaction.create({
        data: {
          ownerId: utilisateur2Id,
          accountId: compteEtranger,
          date: versDateUtc("2099-08-01"),
          description: `Etranger action ${M}`,
          descriptionNormalisee: `ETRANGER ACTION ${M}`,
          montantCents: 4401,
          source: "MANUELLE",
          empreinte: `action-vir-etranger-${M}`,
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    const comptes = [compteJetable, compteB, compteC, compteEtranger];
    await prisma.transaction.updateMany({
      where: { accountId: { in: comptes } },
      data: { transferTransactionId: null, transferAccountId: null },
    });
    await prisma.transaction.deleteMany({ where: { accountId: { in: [compteB, compteC, compteEtranger] } } });
    await prisma.account.deleteMany({ where: { id: { in: [compteB, compteC, compteEtranger] } } });
    await prisma.user.deleteMany({ where: { id: utilisateur2Id } });
  });

  it("AV1 — lierVirement avec l'id d'un autre propriétaire (d'un côté ou de l'autre) : NOT_FOUND", async () => {
    const a = await ligne(compteJetable, "2099-08-01", -4401);
    const attendu = { ok: false, code: "NOT_FOUND", message: "Cette transaction est introuvable." };
    expect(await lierVirement({ id: a, contrepartieId: transactionEtrangere })).toEqual(attendu);
    expect(await lierVirement({ id: transactionEtrangere, contrepartieId: a })).toEqual(attendu);
    expect(await delierVirement({ id: transactionEtrangere })).toEqual(attendu);
    expect(await listerCandidatsVirement({ id: transactionEtrangere })).toEqual(attendu);
    expect(await creerContrepartie({ id: transactionEtrangere, accountId: compteB })).toEqual(attendu);
    expect(await prisma.transaction.count({ where: { id: a, transferTransactionId: null } })).toBe(1);
  });

  it("AV1 — lier, puis refus à travers l'action : CONFLICT avec le message du motif", async () => {
    const a = await ligne(compteJetable, "2099-08-02", -3201);
    const b = await ligne(compteB, "2099-08-02", 3201);
    const c = await ligne(compteC, "2099-08-02", -3201);
    expect(await lierVirement({ id: b, contrepartieId: c })).toEqual({
      ok: true,
      data: { id: b, contrepartieId: c, sousCategoriesRetirees: 0 },
    });
    expect(await lierVirement({ id: a, contrepartieId: b })).toEqual({
      ok: false,
      code: "CONFLICT",
      message: messageRefusLiaison({ motif: "DEJA_LIEE", cote: "SECONDE" }),
    });
    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [a, b, c] });
  });

  it("AV1 — lierVirement : un id qui n'est pas un cuid, ou deux fois le même : VALIDATION", async () => {
    const a = await ligne(compteJetable, "2099-08-03", -3202);
    expect(await lierVirement({ id: "pas-un-cuid", contrepartieId: a })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await lierVirement({ id: a, contrepartieId: a })).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: "Une transaction ne se lie pas à elle-même.",
    });
  });

  it("AV1 — listerCandidatsVirement : les candidats, ou CONFLICT quand la ligne est déjà un côté", async () => {
    const a = await ligne(compteJetable, "2099-08-04", -3203);
    const b = await ligne(compteB, "2099-08-05", 3203);
    const resultat = await listerCandidatsVirement({ id: a });
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.data.map((c) => c.id)).toEqual([b]);
    }
    await lierVirement({ id: a, contrepartieId: b });
    expect(await listerCandidatsVirement({ id: a })).toEqual({
      ok: false,
      code: "CONFLICT",
      message: messageRefus("VIREMENT_DEJA_LIE"),
    });
  });

  it("AV1 — délier : DELIEE, puis NON_VIREMENT en CONFLICT", async () => {
    const a = await ligne(compteJetable, "2099-08-06", -3204);
    const b = await ligne(compteB, "2099-08-06", 3204);
    await lierVirement({ id: a, contrepartieId: b });
    expect(await delierVirement({ id: a })).toEqual({ ok: true, data: { id: a, contrepartieId: b } });
    expect(await delierVirement({ id: a })).toEqual({ ok: false, code: "CONFLICT", message: messageRefus("NON_VIREMENT") });
    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [a, b] });
  });

  it("AV2 — saisirVirement avec destination = source : VALIDATION, MESSAGE_DESTINATION_IDENTIQUE", async () => {
    expect(
      await saisirVirement({
        accountId: compteJetable,
        accountIdDestination: compteJetable,
        date: "2099-08-07",
        description: `Saisie ${M}`,
        montant: "-10,00",
        payeeId: null,
        payeeNouveauNom: null,
        note: "",
        tagIds: [],
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION", message: DESTINATION_IDENTIQUE });
  });

  it("AV2 — saisirVirement : succès, puis doublon ; destination absente : NOT_FOUND ; montant 0 : VALIDATION", async () => {
    const entree = {
      accountId: compteJetable,
      accountIdDestination: compteB,
      date: "2099-08-08",
      description: `Saisie ok ${M}`,
      montant: "-75,00",
      payeeId: null,
      payeeNouveauNom: null,
      note: "",
      tagIds: [] as string[],
    };
    const premiere = await saisirVirement(entree);
    expect(premiere.ok).toBe(true);
    if (premiere.ok) {
      await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [premiere.data.id, premiere.data.contrepartieId] });
      const b = await prisma.transaction.findUniqueOrThrow({ where: { id: premiere.data.contrepartieId } });
      expect(b.montantCents).toBe(7500);
    }
    expect(await saisirVirement(entree)).toMatchObject({ ok: false, code: "DUPLICATE", message: MESSAGE_EMPREINTE_EXISTANTE });
    expect(await saisirVirement({ ...entree, description: `Saisie 2 ${M}`, accountIdDestination: CUID_INEXISTANT })).toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "Le compte de destination n'existe plus.",
    });
    expect(await saisirVirement({ ...entree, description: `Saisie 3 ${M}`, montant: "0,00" })).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: "Un virement de 0,00 $ ne se saisit pas.",
    });
  });

  it("AV3 — creerContrepartie puis recréation : DUPLICATE avec le message de la contrepartie existante", async () => {
    const a = await ligne(compteJetable, "2099-08-09", -3301);
    const premiere = await creerContrepartie({ id: a, accountId: compteB });
    expect(premiere.ok).toBe(true);
    if (!premiere.ok) {
      return;
    }
    expect(premiere.data).toMatchObject({ id: a, sousCategorieRetiree: false });
    await delierVirement({ id: a });
    expect(await creerContrepartie({ id: a, accountId: compteB })).toEqual({
      ok: false,
      code: "DUPLICATE",
      message: `Une contrepartie de cette transaction existe déjà sur Action Vir B ${M}, le 2099-08-09 : lie-la plutôt que d'en créer une autre.`,
    });
    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [a, premiere.data.contrepartieId] });
  });

  it("AV3 — creerContrepartie : compte étranger ou même compte", async () => {
    const a = await ligne(compteJetable, "2099-08-10", -3302);
    expect(await creerContrepartie({ id: a, accountId: compteEtranger })).toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "Ce compte n'existe plus.",
    });
    expect(await creerContrepartie({ id: a, accountId: compteJetable })).toEqual({
      ok: false,
      code: "CONFLICT",
      message: messageRefusLiaison({ motif: "MEME_COMPTE" }),
    });
  });

  it("supprimerTransaction : les deux options, et le message du nouveau refus quand l'autre côté est rattaché", async () => {
    const a = await ligne(compteJetable, "2099-08-11", -3401);
    const b = await ligne(compteB, "2099-08-11", 3401);
    await lierVirement({ id: a, contrepartieId: b });
    expect(await supprimerTransaction({ id: a, virement: "DELIER_L_AUTRE" })).toEqual({
      ok: true,
      data: { id: a, lignesVentilationSupprimees: 0, contrepartie: "DELIEE" },
    });
    const c = await ligne(compteJetable, "2099-08-12", -3402);
    const d = await ligne(compteB, "2099-08-12", 3402);
    await lierVirement({ id: c, contrepartieId: d });
    expect(await supprimerTransaction({ id: c, virement: "SUPPRIMER_LES_DEUX" })).toEqual({
      ok: true,
      data: { id: c, lignesVentilationSupprimees: 0, contrepartie: "SUPPRIMEE" },
    });
    expect(await prisma.transaction.count({ where: { id: { in: [c, d] } } })).toBe(0);
    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [b] });
  });

  it("modifierTransactionsEnMasse : SUPPRIMER sans la clé virements : VALIDATION", async () => {
    const resultat = await modifierTransactionsEnMasse({
      selection: { type: "IDS", ids: [CUID_INEXISTANT] },
      geste: { type: "SUPPRIMER" } as never,
    });
    expect(resultat).toMatchObject({ ok: false, code: "VALIDATION" });
  });
});

describe("messages de course à travers l'action (docs/lot-m2.md §4.4)", () => {
  let proprietaireId = "";
  let compteAutre = "";
  const idsCrees: string[] = [];

  async function ligne(accountId: string, numero: number, montantCents: number): Promise<string> {
    const description = `Action Course ${String(numero)} ${M}`;
    const id = (
      await prisma.transaction.create({
        data: {
          ownerId: proprietaireId,
          accountId,
          date: versDateUtc("2099-09-01"),
          description,
          descriptionNormalisee: description.toUpperCase(),
          montantCents,
          source: "MANUELLE",
          empreinte: `action-course-${String(numero)}-${M}`,
        },
        select: { id: true },
      })
    ).id;
    idsCrees.push(id);
    return id;
  }

  beforeAll(async () => {
    proprietaireId = (await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } })).id;
    compteAutre = (
      await prisma.account.create({
        data: {
          ownerId: proprietaireId,
          nom: `Action Course ${M}`,
          dateSoldeInitial: versDateUtc("2099-01-01"),
          estBudgetaire: false,
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.transaction.updateMany({
      where: { id: { in: idsCrees } },
      data: { transferTransactionId: null, transferAccountId: null },
    });
    await prisma.transaction.deleteMany({ where: { id: { in: idsCrees } } });
    await prisma.account.deleteMany({ where: { id: compteAutre } });
  });

  /** Tient `a`, lance le geste sans l'attendre, puis lie `a` à `b` dans la transaction qui tient le verrou. */
  async function courseLiaison<T>(a: string, b: string, geste: () => Promise<T>): Promise<T> {
    const verrou = await tenirVerrou(prisma, a);
    const enCours = geste();
    try {
      await verrou.attendreUnBloque();
    } catch (erreur) {
      await verrou.relacher();
      await enCours.catch(() => undefined);
      throw erreur;
    }
    await verrou.relacher(async (tx) => {
      await tx.transaction.update({ where: { id: a }, data: { transferTransactionId: b, transferAccountId: compteAutre } });
      await tx.transaction.update({ where: { id: b }, data: { transferTransactionId: a, transferAccountId: compteJetable } });
    });
    return enCours;
  }

  it("AC1 — supprimerTransaction : une ligne liée pendant l'attente du verrou rend le message de la ligne, portée unitaire", async () => {
    const a = await ligne(compteJetable, 1, -9801);
    const b = await ligne(compteAutre, 2, 9801);
    const resultat = await courseLiaison(a, b, () => supprimerTransaction({ id: a, virement: null }));
    expect(resultat).toEqual({ ok: false, code: "CONFLICT", message: messageCourse("LIGNE", "UNITAIRE") });
    expect(await prisma.transaction.count({ where: { id: a } })).toBe(1);
  });

  it("AC2 — modifierTransactionsEnMasse : une ligne liée pendant l'attente du verrou rend le message de la ligne, portée masse", async () => {
    const a = await ligne(compteJetable, 3, -9802);
    const b = await ligne(compteAutre, 4, 9802);
    const resultat = await courseLiaison(a, b, () =>
      modifierTransactionsEnMasse({ selection: { type: "IDS", ids: [a] }, geste: { type: "SUPPRIMER", virements: null } }),
    );
    expect(resultat).toEqual({ ok: false, code: "CONFLICT", message: messageCourse("LIGNE", "MASSE") });
    expect(await prisma.transaction.count({ where: { id: a } })).toBe(1);
  });
});

describe("compterTransactionsARevoir", () => {
  it("égale le compte Prisma indépendant", async () => {
    const proprietaire = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    const compter = () => prisma.transaction.count({ where: { ownerId: proprietaire.id, parentId: null, aRevoir: true } });
    // Le schéma est partagé avec d'autres fichiers qui écrivent : on ne tranche que si le compte n'a pas bougé.
    let derniere: { lu: unknown; attendu: number } = { lu: null, attendu: -1 };
    for (let essai = 0; essai < 10; essai += 1) {
      const avant = await compter();
      const lu = await compterTransactionsARevoir({});
      const apres = await compter();
      derniere = { lu, attendu: avant };
      if (avant === apres) break;
    }
    expect(derniere.lu).toEqual({ ok: true, data: derniere.attendu });
  });
});
