// Test d'intégration du repository des soldes — docs/lot-m3.md §3.7, §5 et §7 (invariant 5). Un second et un
// troisième propriétaire n'existent que le temps de ce fichier : sous-catégorie système créée ou promue (D4),
// somme sans lignes filles, appartenance.

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { versDateUtc } from "@/domain/dates";
import { normaliserDescription } from "@/domain/ingestion";
import { exigerInvariants } from "../../../prisma/test/invariants";
import { exigerInvariantsOccurrences } from "../../../prisma/test/invariants-occurrences";
import {
  creerAjustement,
  expliquerEcart,
  lireDiagnostic,
  lireFicheCompte,
  saisirSolde,
  sommesParCompte,
  supprimerAncrage,
} from "./soldes";

const prisma = new PrismaClient();
const M = "X" + randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase();

let ownerSeed = "";
let proprietaire2 = "";
let proprietaire3 = "";
let compte2 = "";
let compteVentile2 = "";
let compte3 = "";

async function compte(ownerId: string, nom: string): Promise<string> {
  return (
    await prisma.account.create({
      data: { ownerId, nom: `${nom} ${M}`, dateSoldeInitial: versDateUtc("2099-01-01"), estBudgetaire: false },
      select: { id: true },
    })
  ).id;
}

async function verifier(ownerId: string): Promise<void> {
  await exigerInvariantsOccurrences(prisma, { type: "PROPRIETAIRE", ownerId });
  const ids = (await prisma.transaction.findMany({ where: { ownerId }, select: { id: true }, take: 100 })).map((t) => t.id);
  await exigerInvariants(prisma, { type: "TRANSACTIONS", ids });
}

beforeAll(async () => {
  ownerSeed = (await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } })).id;
  // Un utilisateur supplémentaire n'existe que le temps de ce fichier : prisma/test/garde-schema.test.ts compte les utilisateurs.
  proprietaire2 = (await prisma.user.create({ data: { email: `soldes-u2-${M}@example.test` }, select: { id: true } })).id;
  proprietaire3 = (await prisma.user.create({ data: { email: `soldes-u3-${M}@example.test` }, select: { id: true } })).id;
  compte2 = await compte(proprietaire2, "Soldes U2");
  compteVentile2 = await compte(proprietaire2, "Soldes U2 ventilé");
  compte3 = await compte(proprietaire3, "Soldes U3");
});

afterAll(async () => {
  // Une seule transaction : aucun état intermédiaire (parent sans filles, réconciliation sans ancrage) visible des lectures BASE.
  await prisma.$transaction(async (client) => {
    const proprietaires = { in: [proprietaire2, proprietaire3] };
    await client.transaction.deleteMany({ where: { ownerId: proprietaires, parentId: { not: null } } });
    await client.transaction.deleteMany({ where: { ownerId: proprietaires } });
    await client.account.deleteMany({ where: { ownerId: proprietaires } });
    await client.user.deleteMany({ where: { id: proprietaires } });
  });
  await prisma.$disconnect();
});

describe("repository des soldes", () => {
  it("R1 — sans sous-catégorie système, le premier ajustement la crée et les suivants la réutilisent", async () => {
    const s1 = await saisirSolde(proprietaire2, { accountId: compte2, date: "2099-03-31", soldeCents: 5_000, source: "MANUEL" });
    expect(s1).toMatchObject({ statut: "SAISI", ecartCents: 5_000 });
    if (s1.statut !== "SAISI") return;
    const a1 = await creerAjustement(proprietaire2, s1.statementId);
    expect(a1).toMatchObject({ statut: "AJUSTE", montantCents: 5_000, sousCategorieCreee: true });

    const categorie = await prisma.category.findFirstOrThrow({
      where: { ownerId: proprietaire2, nom: "Ajustements" },
      select: { id: true, sousCategories: { select: { id: true, nom: true, systeme: true }, take: 10 } },
    });
    expect(categorie.sousCategories).toHaveLength(1);
    expect(categorie.sousCategories[0]).toMatchObject({ nom: "Ajustement de solde", systeme: true });
    const idSousCategorie = categorie.sousCategories[0]?.id;

    const s2 = await saisirSolde(proprietaire2, { accountId: compte2, date: "2099-04-30", soldeCents: 8_000, source: "MANUEL" });
    expect(s2).toMatchObject({ statut: "SAISI", ecartCents: 3_000 });
    if (s2.statut !== "SAISI") return;
    const a2 = await creerAjustement(proprietaire2, s2.statementId);
    expect(a2).toMatchObject({ statut: "AJUSTE", montantCents: 3_000, sousCategorieCreee: false });
    if (a1.statut !== "AJUSTE" || a2.statut !== "AJUSTE") return;

    const ajustements = await prisma.transaction.findMany({
      where: { id: { in: [a1.transactionId, a2.transactionId] } },
      select: { subcategoryId: true },
    });
    expect(ajustements.map((t) => t.subcategoryId)).toEqual([idSousCategorie, idSousCategorie]);
    expect(await prisma.subcategory.count({ where: { systeme: true, category: { ownerId: proprietaire2 } } })).toBe(1);
    expect(await prisma.category.count({ where: { ownerId: proprietaire2, nom: "Ajustements" } })).toBe(1);
    await verifier(proprietaire2);
  });

  it("R2 — une sous-catégorie « Ajustement de solde » non système est promue, sans doublon", async () => {
    const categorie = await prisma.category.create({
      data: { ownerId: proprietaire3, nom: "Ajustements", ordre: 0 },
      select: { id: true },
    });
    const existante = await prisma.subcategory.create({
      data: { categoryId: categorie.id, nom: "Ajustement de solde", systeme: false },
      select: { id: true },
    });
    const s = await saisirSolde(proprietaire3, { accountId: compte3, date: "2099-03-31", soldeCents: -2_500, source: "RELEVE" });
    expect(s).toMatchObject({ statut: "SAISI", ecartCents: -2_500 });
    if (s.statut !== "SAISI") return;
    const a = await creerAjustement(proprietaire3, s.statementId);
    expect(a).toMatchObject({ statut: "AJUSTE", montantCents: -2_500, sousCategorieCreee: false });
    if (a.statut !== "AJUSTE") return;
    const t = await prisma.transaction.findUniqueOrThrow({ where: { id: a.transactionId }, select: { subcategoryId: true } });
    expect(t.subcategoryId).toBe(existante.id);
    const sous = await prisma.subcategory.findMany({ where: { category: { ownerId: proprietaire3 } }, select: { id: true, systeme: true }, take: 10 });
    expect(sous).toEqual([{ id: existante.id, systeme: true }]);
    await verifier(proprietaire3);
  });

  it("R3 — la somme par compte ne compte que le parent d'une ventilation et ignore les autres propriétaires", async () => {
    // Parent et filles dans une seule transaction : les lectures BASE des autres fichiers ne voient jamais un parent ventilé sans filles.
    await prisma.$transaction(async (client) => {
      const parent = await client.transaction.create({
        data: {
          ownerId: proprietaire2,
          accountId: compteVentile2,
          date: versDateUtc("2099-05-05"),
          description: `PARENT ${M}`,
          descriptionNormalisee: normaliserDescription(`PARENT ${M}`),
          montantCents: -10_000,
          source: "COPIER_COLLER",
          estVentilee: true,
          empreinte: `soldes-repo-parent-${M}`,
        },
        select: { id: true },
      });
      for (const [i, m] of [-6_000, -4_000].entries()) {
        await client.transaction.create({
          data: {
            ownerId: proprietaire2,
            accountId: compteVentile2,
            date: versDateUtc("2099-05-05"),
            description: `FILLE${String(i)} ${M}`,
            descriptionNormalisee: normaliserDescription(`FILLE${String(i)} ${M}`),
            montantCents: m,
            source: "COPIER_COLLER",
            parentId: parent.id,
            empreinte: `soldes-repo-fille-${String(i)}-${M}`,
          },
        });
      }
    });
    const carte = await sommesParCompte(proprietaire2, "2099-12-31");
    expect(carte.get(compteVentile2)).toBe(-10_000);
    expect(carte.get(compte2)).toBe(8_000);
    expect(carte.has(compte3)).toBe(false);
    const comptesProprietaire = new Set(
      (await prisma.account.findMany({ where: { ownerId: proprietaire2 }, select: { id: true }, take: 50 })).map((c) => c.id),
    );
    for (const id of carte.keys()) expect(comptesProprietaire.has(id), id).toBe(true);
    // un compte sans transaction est absent de la carte, et la date borne la somme (jour inclus)
    expect((await sommesParCompte(proprietaire2, "2099-03-30")).has(compte2)).toBe(false);
    expect((await sommesParCompte(proprietaire2, "2099-03-31")).get(compte2)).toBe(5_000);
    await verifier(proprietaire2);
  });

  it("R4 — un autre propriétaire ne voit ni ne touche rien", async () => {
    expect(await lireFicheCompte(ownerSeed, compte2, "2099-12-31")).toBeNull();
    const ancrage = await prisma.balanceStatement.findFirstOrThrow({ where: { accountId: compte2 }, orderBy: { date: "asc" }, select: { id: true } });
    const avant = await prisma.transaction.count({ where: { accountId: compte2 } });
    expect(await creerAjustement(ownerSeed, ancrage.id)).toEqual({ statut: "INTROUVABLE" });
    expect(await expliquerEcart(ownerSeed, ancrage.id, "intrus")).toEqual({ statut: "INTROUVABLE" });
    expect(await supprimerAncrage(ownerSeed, ancrage.id)).toEqual({ statut: "INTROUVABLE" });
    expect(await lireDiagnostic(ownerSeed, ancrage.id)).toBeNull();
    expect(await saisirSolde(ownerSeed, { accountId: compte2, date: "2099-06-30", soldeCents: 1, source: "RELEVE" })).toEqual({
      statut: "COMPTE_INTROUVABLE",
    });
    expect(await prisma.balanceStatement.count({ where: { id: ancrage.id } })).toBe(1);
    expect(await prisma.transaction.count({ where: { accountId: compte2 } })).toBe(avant);
    const rec = await prisma.reconciliation.findUniqueOrThrow({ where: { statementId: ancrage.id }, select: { explication: true } });
    expect(rec.explication).toBeNull();
    expect(await lireFicheCompte(proprietaire2, compte2, "2099-12-31")).not.toBeNull();
  });
});
