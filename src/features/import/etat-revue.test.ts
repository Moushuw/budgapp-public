// docs/lot-m1.md §6.1.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LigneEnRevue } from "@/domain/ingestion";
import type { ConflitRegles } from "@/domain/categorization";
import { formatMontant } from "@/domain/money";
import { analyserReleve, DESJARDINS_ACCESD } from "@/domain/statement";
import type { LigneRejetee, RaisonRejet } from "@/domain/statement";
import { formatMontantChamp } from "@/lib/champs-formulaire";
import type { CandidatVirement } from "@/domain/virement";
import { messageRefusLiaison } from "@/domain/virement";
import { candidatsOccurrence, type OccurrenceCandidate } from "@/domain/recurrence";
import {
  candidatOccurrenceChoisi,
  categorieDeLaRecurrence,
  choisirOccurrence,
  choisirSousCategorie,
  choisirVirement,
  erreursOccurrenceRevue,
  erreursVirementRevue,
  messageCategorieRecurrence,
  MESSAGE_OCCURRENCE_AUTRE_COMPTE,
  MESSAGE_OCCURRENCE_PLUS_CANDIDATE,
  MESSAGE_OCCURRENCE_PLUS_PROPOSEE,
  occurrenceAutoConservee,
  libelleReferenceDoublon,
  messageAutreCote,
  messageRetraitVirement,
  MESSAGE_VENTILATION_MISE_A_JOUR,
  nbReintegreesAilleurs,
  ventilationIgnoreeParMiseAJour,
  erreurVentilationRevue,
  modifierLigneVentilation,
  ventilationRetiree,
  mentionFragmentsMasques,
  messageEcartTotal,
  rejeteesAffichees,
  compter,
  conflitNonTrancheSurLigne,
  decrireTranchage,
  dedoublonnagePerime,
  depuisLigneEnRevue,
  designerLigne,
  entetesSections,
  erreurBeneficiaireNouveau,
  slotsNonArbitres,
  versLigneImport,
} from "./etat-revue";
import { MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE } from "./schema";
import type { LigneRevueEditee } from "./etat-revue";

const CUID_COMPTE = "clx0000000000000000000010";
const CUID_SC = "clx0000000000000000000011";

function ligneEnRevue(overrides: Partial<LigneEnRevue> & { cle: string }): LigneEnRevue {
  return {
    date: "2026-03-05",
    description: "Épicerie",
    typeOperation: null,
    descriptionNormalisee: "EPICERIE",
    montantCents: -1234,
    accountId: CUID_COMPTE,
    externalId: null,
    ligneBrute: null,
    numeroLigne: 1,
    payeeId: null,
    payeeNouveauNom: null,
    subcategoryId: null,
    ventilation: null,
    tagIds: [],
    note: null,
    exclureDuBudget: false,
    exclureDesRapports: false,
    aRevoir: false,
    empreinte: "empreinte-test",
    statutDoublon: "AUCUN",
    doublonDe: null,
    regleAppliqueeId: null,
    reglesEnConflit: [],
    conflits: [],
    filtreId: null,
    candidatsVirement: [],
    virementAvec: null,
    categorisationRetiree: null,
    candidatsOccurrence: [],
    occurrenceAvec: null,
    categorieHeritee: false,
    action: "IMPORTER",
    section: "A_IMPORTER",
    ...overrides,
  };
}

describe("depuisLigneEnRevue / versLigneImport — aller-retour", () => {
  it("préserve tout", () => {
    const base = ligneEnRevue({
      cle: "L1.0",
      subcategoryId: CUID_SC,
      tagIds: ["clx0000000000000000000012"],
      note: "Une note",
      aRevoir: true,
      exclureDuBudget: true,
      regleAppliqueeId: "clx0000000000000000000099",
    });
    const editee = depuisLigneEnRevue(base);
    const entree = versLigneImport(editee);

    expect(entree).toEqual({
      cle: "L1.0",
      action: "IMPORTER",
      transactionExistanteId: null,
      accountId: CUID_COMPTE,
      date: "2026-03-05",
      description: "Épicerie",
      typeOperation: null,
      montant: editee.montantSaisi,
      note: "Une note",
      payeeId: null,
      payeeNouveauNom: null,
      subcategoryId: CUID_SC,
      ventilation: null,
      tagIds: ["clx0000000000000000000012"],
      externalId: null,
      appliedRuleId: "clx0000000000000000000099",
      aRevoir: true,
      exclureDuBudget: true,
      exclureDesRapports: false,
      virementAvec: null,
      occurrenceAvec: null,
      occurrenceAuto: false,
    });
  });

  it("V7 — le type d'opération de la ligne lue part avec la ligne", () => {
    const editee = depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0", typeOperation: "Paie" }));
    expect(versLigneImport(editee)?.typeOperation).toBe("Paie");
  });

  it("une ligne IGNORER rend null : elle n'est pas envoyée à l'action", () => {
    const editee = depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0", action: "IGNORER", section: "FILTREES", filtreId: "f1" }));
    expect(versLigneImport(editee)).toBeNull();
  });

  it("METTRE_A_JOUR transmet transactionExistanteId depuis doublonDe.id", () => {
    const editee = depuisLigneEnRevue(
      ligneEnRevue({
        cle: "L1.0",
        action: "METTRE_A_JOUR",
        statutDoublon: "EXTERNAL_ID_EXISTANT",
        section: "DOUBLONS",
        doublonDe: {
          id: "tx-existante",
          date: "2026-03-01",
          description: "Épicerie",
          montantCents: -1234,
          empreinte: "e",
          virement: null,
        },
      }),
    );
    const entree = versLigneImport(editee);
    expect(entree?.transactionExistanteId).toBe("tx-existante");
  });

  it("action IMPORTER : transactionExistanteId reste null même si doublonDe est renseigné (quasi-doublon)", () => {
    const editee = depuisLigneEnRevue(
      ligneEnRevue({
        cle: "L1.0",
        action: "IMPORTER",
        statutDoublon: "QUASI_DOUBLON",
        section: "DOUBLONS",
        doublonDe: {
          id: "tx-quasi",
          date: "2026-03-01",
          description: "Épicerie",
          montantCents: -1234,
          empreinte: "e",
          virement: null,
        },
      }),
    );
    const entree = versLigneImport(editee);
    expect(entree?.transactionExistanteId).toBeNull();
  });
});

describe("dedoublonnagePerime", () => {
  it("faux à l'initialisation", () => {
    const editee = depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0" }));
    expect(dedoublonnagePerime(editee)).toBe(false);
  });

  it("vrai après changement de montant", () => {
    const editee = depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0" }));
    const modifiee: LigneRevueEditee = { ...editee, montantSaisi: "99,99" };
    expect(dedoublonnagePerime(modifiee)).toBe(true);
  });

  it("vrai après changement de date, description ou compte", () => {
    const editee = depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0" }));
    expect(dedoublonnagePerime({ ...editee, date: "2026-03-06" })).toBe(true);
    expect(dedoublonnagePerime({ ...editee, description: "Autre description" })).toBe(true);
    expect(dedoublonnagePerime({ ...editee, accountId: "clx0000000000000000099999" })).toBe(true);
  });

  it("faux si seule la sous-catégorie change", () => {
    const editee = depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0" }));
    const modifiee: LigneRevueEditee = { ...editee, subcategoryId: CUID_SC };
    expect(dedoublonnagePerime(modifiee)).toBe(false);
  });
});

describe("conflitNonTrancheSurLigne", () => {
  const conflit: ConflitRegles = { slot: "SOUS_CATEGORIE", priorite: 5, candidats: [] };
  const conflitNote: ConflitRegles = { slot: "NOTE", priorite: 5, candidats: [] };

  it("bascule à faux dès que le créneau est arbitré", () => {
    const editee = depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0", conflits: [conflit], aRevoir: true }));
    expect(conflitNonTrancheSurLigne(editee)).toBe(true);

    const arbitree: LigneRevueEditee = { ...editee, slotsArbitres: ["SOUS_CATEGORIE"] };
    expect(conflitNonTrancheSurLigne(arbitree)).toBe(false);
  });

  it("reste vrai si un autre créneau est encore en conflit", () => {
    const editee = depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0", conflits: [conflit, conflitNote], aRevoir: true }));
    const partiellementArbitree: LigneRevueEditee = { ...editee, slotsArbitres: ["SOUS_CATEGORIE"] };
    expect(conflitNonTrancheSurLigne(partiellementArbitree)).toBe(true);
  });

  it("une ligne IGNORER n'est jamais bloquante, même avec un conflit non arbitré", () => {
    const editee = depuisLigneEnRevue(
      ligneEnRevue({ cle: "L1.0", conflits: [conflit], aRevoir: true, action: "IGNORER", section: "FILTREES", filtreId: "f1" }),
    );
    expect(conflitNonTrancheSurLigne(editee)).toBe(false);
  });
});

describe("compter", () => {
  it("sur un lot mêlé", () => {
    const aImporter = depuisLigneEnRevue(ligneEnRevue({ cle: "a", action: "IMPORTER", section: "A_IMPORTER" }));
    const aMettreAJour = depuisLigneEnRevue(
      ligneEnRevue({ cle: "b", action: "METTRE_A_JOUR", section: "DOUBLONS", statutDoublon: "EXTERNAL_ID_EXISTANT" }),
    );
    const ignoreeDoublon = depuisLigneEnRevue(
      ligneEnRevue({ cle: "c", action: "IGNORER", section: "DOUBLONS", statutDoublon: "EMPREINTE_EXISTANTE" }),
    );
    const filtree = depuisLigneEnRevue(ligneEnRevue({ cle: "d", action: "IGNORER", section: "FILTREES", filtreId: "f1" }));
    const filtreeReintegree = depuisLigneEnRevue(
      ligneEnRevue({ cle: "e", action: "IMPORTER", section: "FILTREES", filtreId: "f1" }),
    );
    const conflitNonTranche = depuisLigneEnRevue(
      ligneEnRevue({ cle: "f", action: "IMPORTER", section: "A_IMPORTER", conflits: [{ slot: "SOUS_CATEGORIE", priorite: 5, candidats: [] }], aRevoir: true }),
    );

    const lignes = [aImporter, aMettreAJour, ignoreeDoublon, filtree, filtreeReintegree, conflitNonTranche];
    const compteurs = compter(lignes, 2);

    expect(compteurs).toEqual({
      aImporter: 3, // aImporter, filtreeReintegree, conflitNonTranche
      aMettreAJour: 1,
      ignoreesDoublon: 1,
      filtrees: 1, // seule « filtree » (toujours IGNORER) compte ; la réintégrée ne compte plus
      nonReconnues: 2,
      conflitsNonTranches: 1,
      virements: 0,
      rapprochements: 0,
    });
  });
});

describe("erreurBeneficiaireNouveau", () => {
  const avecNom = (payeeNouveauNom: string | null, action: LigneRevueEditee["action"] = "IMPORTER"): LigneRevueEditee => ({
    ...depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0" })),
    payeeNouveauNom,
    action,
  });

  it("null sans nouveau bénéficiaire", () => {
    expect(erreurBeneficiaireNouveau(avecNom(null))).toBeNull();
  });

  it("« Nouveau bénéficiaire… » choisi sans nom, ou des espaces seulement → message du nom vide", () => {
    expect(erreurBeneficiaireNouveau(avecNom(""))).toBe(MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE);
    expect(erreurBeneficiaireNouveau(avecNom("   "))).toBe(MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE);
  });

  it("des accents combinants seuls se normalisent en vide → même message, le même que le filet serveur", () => {
    expect(erreurBeneficiaireNouveau(avecNom("\u0301"))).toBe(MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE);
  });

  it("un nom qui commence par un nombre est valide depuis la clé douce (journal du 2026-09-29)", () => {
    expect(erreurBeneficiaireNouveau(avecNom("2024"))).toBeNull();
    expect(erreurBeneficiaireNouveau(avecNom("3 Brasseurs"))).toBeNull();
  });

  it("un nom lisible passe", () => {
    expect(erreurBeneficiaireNouveau(avecNom("Tim Hortons"))).toBeNull();
  });

  it("une ligne IGNORER n'est pas envoyée : elle ne bloque rien", () => {
    expect(erreurBeneficiaireNouveau(avecNom("", "IGNORER"))).toBeNull();
  });
});

describe("designerLigne", () => {
  it("nomme le numéro de ligne du relevé et la description courante", () => {
    const editee = { ...depuisLigneEnRevue(ligneEnRevue({ cle: "L12.0", numeroLigne: 12 })), description: "TIM HORTONS" };
    expect(designerLigne(editee)).toBe("ligne 12 du relevé (« TIM HORTONS »)");
  });

  it("sans numéro de ligne (ligne récupérée à la main), la description seule", () => {
    expect(designerLigne(depuisLigneEnRevue(ligneEnRevue({ cle: "M1", numeroLigne: null })))).toBe("« Épicerie »");
  });
});

describe("slotsNonArbitres / decrireTranchage", () => {
  const conflits: ConflitRegles[] = [
    { slot: "SOUS_CATEGORIE", priorite: 5, candidats: [] },
    { slot: "BENEFICIAIRE", priorite: 5, candidats: [] },
    { slot: "NOTE", priorite: 5, candidats: [] },
  ];
  const aucunNom = new Map<string, string>();

  it("sous-catégorie en conflit (créneau à null) : cliquer revient à importer sans sous-catégorie, et c'est écrit", () => {
    const editee = depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0", conflits: [{ slot: "SOUS_CATEGORIE", priorite: 5, candidats: [] }] }));
    expect(decrireTranchage(editee, aucunNom, aucunNom)).toBe("Sera importée sans sous-catégorie");
  });

  it("ne décrit que les créneaux pas encore arbitrés, avec les noms résolus", () => {
    const editee: LigneRevueEditee = {
      ...depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0", conflits, payeeId: "p1" })),
      slotsArbitres: ["NOTE"],
    };
    expect(slotsNonArbitres(editee)).toEqual(["SOUS_CATEGORIE", "BENEFICIAIRE"]);
    expect(decrireTranchage(editee, aucunNom, new Map([["p1", "Tim Hortons"]]))).toBe(
      "Sera importée sans sous-catégorie, avec le bénéficiaire « Tim Hortons »",
    );
  });

  it("bénéficiaire et note vides", () => {
    const editee = depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0", conflits: conflits.slice(1) }));
    expect(decrireTranchage(editee, aucunNom, aucunNom)).toBe("Sera importée sans bénéficiaire, sans note");
  });

  it("tout arbitré : plus rien à trancher", () => {
    const editee: LigneRevueEditee = {
      ...depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0", conflits })),
      slotsArbitres: ["NOTE", "SOUS_CATEGORIE", "BENEFICIAIRE"],
    };
    expect(slotsNonArbitres(editee)).toEqual([]);
  });
});

function rejet(numeroLigne: number, raison: RaisonRejet): LigneRejetee {
  return { numeroLigne, ligneBrute: "x", raison };
}

function lireTexte(nom: string): string {
  return readFileSync(new URL(`../../domain/statement/fixtures/${nom}.txt`, import.meta.url), "utf8");
}

describe("rejeteesAffichees (A2)", () => {
  it("E1 — retire AUCUNE_DATE, garde les trois autres raisons dans l'ordre reçu", () => {
    const rejetees = [
      rejet(1, "AUCUNE_DATE"),
      rejet(2, "MOIS_INCONNU"),
      rejet(3, "AUCUNE_DATE"),
      rejet(4, "AUCUN_MONTANT"),
      rejet(5, "MONTANT_ILLISIBLE"),
    ];
    expect(rejeteesAffichees(rejetees).map((r) => [r.numeroLigne, r.raison])).toEqual([
      [2, "MOIS_INCONNU"],
      [4, "AUCUN_MONTANT"],
      [5, "MONTANT_ILLISIBLE"],
    ]);
  });

  it("E2 — la fixture de septembre n'affiche aucun rejet", () => {
    const { rejetees } = analyserReleve(lireTexte("visa-desjardins-2026-09"), DESJARDINS_ACCESD, 2026);
    expect(rejetees).toHaveLength(42);
    expect(rejeteesAffichees(rejetees)).toEqual([]);
  });

  it("E3 — cas-limites : trois rejets affichés, lignes 6, 13 et 20", () => {
    const { rejetees } = analyserReleve(lireTexte("cas-limites"), DESJARDINS_ACCESD, 2026);
    expect(rejeteesAffichees(rejetees).map((r) => [r.numeroLigne, r.raison])).toEqual([
      [6, "MOIS_INCONNU"],
      [13, "MONTANT_ILLISIBLE"],
      [20, "AUCUN_MONTANT"],
    ]);
  });

  it("une liste vide reste vide", () => {
    expect(rejeteesAffichees([])).toEqual([]);
  });
});

describe("mentionFragmentsMasques (point 6)", () => {
  it("F1 — aucun rejet : null", () => {
    expect(mentionFragmentsMasques([])).toBeNull();
  });

  it("F2 — seulement des rejets visibles : null", () => {
    expect(
      mentionFragmentsMasques([rejet(1, "MOIS_INCONNU"), rejet(2, "AUCUN_MONTANT"), rejet(3, "MONTANT_ILLISIBLE")]),
    ).toBeNull();
  });

  it("F3 — un seul fragment : singulier", () => {
    expect(mentionFragmentsMasques([rejet(1, "AUCUNE_DATE")])).toBe("1 fragment sans date masqué.");
  });

  it("F4 — on compte des fragments, pas des lignes source", () => {
    expect(
      mentionFragmentsMasques([rejet(4, "AUCUNE_DATE"), rejet(4, "AUCUNE_DATE"), rejet(5, "MOIS_INCONNU")]),
    ).toBe("2 fragments sans date masqués.");
  });

  it("F5 — la fixture de septembre : 42 fragments", () => {
    const { rejetees } = analyserReleve(lireTexte("visa-desjardins-2026-09"), DESJARDINS_ACCESD, 2026);
    expect(mentionFragmentsMasques(rejetees)).toBe("42 fragments sans date masqués.");
  });

  it("F6 — cas-limites : 17 fragments", () => {
    const { rejetees } = analyserReleve(lireTexte("cas-limites"), DESJARDINS_ACCESD, 2026);
    expect(mentionFragmentsMasques(rejetees)).toBe("17 fragments sans date masqués.");
  });
});

describe("messageEcartTotal (A2)", () => {
  it("E4 — null sans contrôle, null quand le relevé concorde", () => {
    expect(messageEcartTotal(null)).toBeNull();
    expect(
      messageEcartTotal({ numeroLigne: 27, totalReleveCents: 42, sommeReconnuesCents: 42, ecartCents: 0 }),
    ).toBeNull();
  });

  it("E5 — nomme la ligne, les deux totaux et l'écart", () => {
    const message = messageEcartTotal({
      numeroLigne: 26,
      totalReleveCents: 42,
      sommeReconnuesCents: 321,
      ecartCents: 279,
    });
    expect(message).toContain("ligne 26");
    expect(message).toContain(formatMontant(42));
    expect(message).toContain(formatMontant(321));
    expect(message).toContain(formatMontant(279));
  });

  it("un écart négatif s'affiche en valeur absolue", () => {
    const message = messageEcartTotal({
      numeroLigne: 78,
      totalReleveCents: 48106,
      sommeReconnuesCents: 46206,
      ecartCents: -1900,
    });
    expect(message).toContain(`écart de ${formatMontant(1900)}`);
    expect(message).not.toContain(formatMontant(-1900));
  });
});

describe("choisirSousCategorie (A6)", () => {
  const conflit: ConflitRegles = { slot: "SOUS_CATEGORIE", priorite: 5, candidats: [] };

  it("E6 — lève le conflit et persiste la sous-catégorie choisie, sans règle appliquée", () => {
    const ligne = depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0", conflits: [conflit], aRevoir: true }));
    expect(conflitNonTrancheSurLigne(ligne)).toBe(true);

    const choisie: LigneRevueEditee = { ...ligne, ...choisirSousCategorie(ligne, CUID_SC) };

    expect(conflitNonTrancheSurLigne(choisie)).toBe(false);
    const entree = versLigneImport(choisie);
    expect(entree?.subcategoryId).toBe(CUID_SC);
    expect(entree?.appliedRuleId).toBeNull();
  });

  it("E7 — ne duplique pas un créneau déjà arbitré", () => {
    const ligne: LigneRevueEditee = {
      ...depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0", conflits: [conflit] })),
      slotsArbitres: ["SOUS_CATEGORIE"],
    };
    expect(choisirSousCategorie(ligne, CUID_SC).slotsArbitres).toEqual(["SOUS_CATEGORIE"]);
  });

  it("E8 — choisir « aucune » arbitre aussi", () => {
    const ligne = depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0", conflits: [conflit] }));
    const resultat = choisirSousCategorie(ligne, null);
    expect(resultat.subcategoryId).toBeNull();
    expect(resultat.slotsArbitres).toEqual(["SOUS_CATEGORIE"]);
  });

  it("conserve les autres créneaux déjà arbitrés", () => {
    const ligne: LigneRevueEditee = {
      ...depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0", conflits: [conflit] })),
      slotsArbitres: ["NOTE"],
    };
    expect(choisirSousCategorie(ligne, CUID_SC).slotsArbitres).toEqual(["NOTE", "SOUS_CATEGORIE"]);
  });
});

describe("versLigneImport — appliedRuleId après un changement manuel (point 5)", () => {
  const REGLE = "clx0000000000000000000099";
  const AUTRE_SC = "clx0000000000000000000013";
  const base = () => ligneEnRevue({ cle: "L1.0", subcategoryId: CUID_SC, regleAppliqueeId: REGLE });

  it("V1 — sous-catégorie gardée : la règle reste créditée", () => {
    expect(versLigneImport(depuisLigneEnRevue(base()))?.appliedRuleId).toBe(REGLE);
  });

  it("V2 — changée vers une autre : null", () => {
    const editee = depuisLigneEnRevue(base());
    const entree = versLigneImport({ ...editee, ...choisirSousCategorie(editee, AUTRE_SC) });
    expect(entree?.subcategoryId).toBe(AUTRE_SC);
    expect(entree?.appliedRuleId).toBeNull();
  });

  it("V3 — remise à « Aucune » : null", () => {
    const editee = depuisLigneEnRevue(base());
    expect(versLigneImport({ ...editee, ...choisirSousCategorie(editee, null) })?.appliedRuleId).toBeNull();
  });

  it("V4 — changée puis remise sur celle de la règle : la règle reste créditée", () => {
    const editee = depuisLigneEnRevue(base());
    const changee = { ...editee, ...choisirSousCategorie(editee, AUTRE_SC) };
    const remise = { ...changee, ...choisirSousCategorie(changee, CUID_SC) };
    expect(versLigneImport(remise)?.appliedRuleId).toBe(REGLE);
  });

  it("V5 — conflit sur NOTE seulement, sous-catégorie gardée : la règle reste créditée", () => {
    const conflitNote: ConflitRegles = { slot: "NOTE", priorite: 5, candidats: [] };
    const editee: LigneRevueEditee = {
      ...depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0", subcategoryId: CUID_SC, regleAppliqueeId: REGLE, conflits: [conflitNote] })),
      slotsArbitres: ["NOTE"],
    };
    expect(versLigneImport(editee)?.appliedRuleId).toBe(REGLE);
  });

  it("V6 — sans règle (défaut du bénéficiaire), sous-catégorie changée : null", () => {
    const editee = depuisLigneEnRevue(ligneEnRevue({ cle: "L1.0", subcategoryId: CUID_SC, regleAppliqueeId: null }));
    expect(versLigneImport({ ...editee, ...choisirSousCategorie(editee, AUTRE_SC) })?.appliedRuleId).toBeNull();
  });
});

describe("ventilation proposée par une règle (docs/lot-m2.md §4.3)", () => {
  const REGLE = "clx0000000000000000000099";
  const SC_A = "clx0000000000000000000013";
  const SC_B = "clx0000000000000000000014";
  const SC_Y = "clx0000000000000000000015";
  const ventilee = () =>
    depuisLigneEnRevue(
      ligneEnRevue({
        cle: "L1.0",
        montantCents: -10001,
        regleAppliqueeId: REGLE,
        ventilation: [
          { subcategoryId: SC_A, montantCents: -5000 },
          { subcategoryId: SC_B, montantCents: -5001 },
        ],
      }),
    );

  it("ER1 — depuisLigneEnRevue : les filles en montantSaisi formaté", () => {
    expect(ventilee().ventilation).toEqual([
      { subcategoryId: SC_A, montantSaisi: formatMontantChamp(-5000) },
      { subcategoryId: SC_B, montantSaisi: formatMontantChamp(-5001) },
    ]);
  });

  it("ER2 — choisirSousCategorie annule la ventilation, « Aucune » comprise", () => {
    const ligne = ventilee();
    expect(choisirSousCategorie(ligne, SC_Y)).toEqual({
      subcategoryId: SC_Y,
      ventilation: null,
      slotsArbitres: ["SOUS_CATEGORIE"],
    });
    expect(choisirSousCategorie(ligne, null).ventilation).toBeNull();
    expect(ventilationRetiree({ ...ligne, ...choisirSousCategorie(ligne, SC_Y) })).toBe(true);
    expect(ventilationRetiree(ligne)).toBe(false);
  });

  it("ER3 — une ventilation inchangée part sans sous-catégorie et garde la règle", () => {
    const entree = versLigneImport(ventilee());
    expect(entree?.subcategoryId).toBeNull();
    expect(entree?.ventilation).toEqual([
      { subcategoryId: SC_A, montant: formatMontantChamp(-5000) },
      { subcategoryId: SC_B, montant: formatMontantChamp(-5001) },
    ]);
    expect(entree?.appliedRuleId).toBe(REGLE);
  });

  it("ER4 — modifier une fille défait le crédit de la règle, et seule cette fille change", () => {
    const ligne = ventilee();
    const montant = { ...ligne, ...modifierLigneVentilation(ligne, 0, { montantSaisi: "-49,99" }) };
    expect(versLigneImport(montant)?.appliedRuleId).toBeNull();
    const sousCategorie = { ...ligne, ...modifierLigneVentilation(ligne, 1, { subcategoryId: SC_Y }) };
    expect(versLigneImport(sousCategorie)?.appliedRuleId).toBeNull();
    expect(sousCategorie.ventilation?.[0]).toEqual(ligne.ventilation?.[0]);
    expect(sousCategorie.ventilation?.[1]).toEqual({ subcategoryId: SC_Y, montantSaisi: formatMontantChamp(-5001) });
    expect(modifierLigneVentilation(depuisLigneEnRevue(ligneEnRevue({ cle: "L2.0" })), 0, {}).ventilation).toBeNull();
  });

  it("ER5 — choisir une sous-catégorie sur la ligne : plus de ventilation, plus de règle", () => {
    const ligne = ventilee();
    const choisie = { ...ligne, ...choisirSousCategorie(ligne, SC_Y) };
    const entree = versLigneImport(choisie);
    expect(entree?.ventilation).toBeNull();
    expect(entree?.appliedRuleId).toBeNull();
  });

  it("ER6 — une mise à jour ne pose pas de ventilation", () => {
    const miseAJour = { ...ventilee(), action: "METTRE_A_JOUR" as const };
    expect(versLigneImport(miseAJour)?.ventilation).toBeNull();
  });

  it("erreurVentilationRevue — une entrée d'argent dit « il reste » dans le bon sens", () => {
    const entree = depuisLigneEnRevue(
      ligneEnRevue({
        cle: "L3.0",
        montantCents: 10000,
        ventilation: [
          { subcategoryId: SC_A, montantCents: 4000 },
          { subcategoryId: SC_B, montantCents: 5000 },
        ],
      }),
    );
    expect(erreurVentilationRevue(entree)).toBe(`Il reste ${formatMontant(1000)} à répartir.`);
    const trop = { ...entree, ...modifierLigneVentilation(entree, 0, { montantSaisi: "60,00" }) };
    expect(erreurVentilationRevue(trop)).toBe(`Les lignes dépassent la transaction de ${formatMontant(1000)}.`);
  });

  it("ER6 — erreurVentilationRevue", () => {
    const ligne = ventilee();
    expect(erreurVentilationRevue(ligne)).toBeNull();
    const decalee = { ...ligne, ...modifierLigneVentilation(ligne, 0, { montantSaisi: "-49,99" }) };
    expect(erreurVentilationRevue(decalee)).toBe(`Il reste ${formatMontant(1)} à répartir.`);
    expect(erreurVentilationRevue({ ...ligne, montantSaisi: "-100,00" })).toBe(
      `Les lignes dépassent la transaction de ${formatMontant(1)}.`,
    );
    const illisible = { ...ligne, ...modifierLigneVentilation(ligne, 0, { montantSaisi: "abc" }) };
    expect(erreurVentilationRevue(illisible)).toBe("La ligne 1 de la ventilation porte un montant illisible.");
    expect(erreurVentilationRevue({ ...ligne, action: "IGNORER" })).toBeNull();
    expect(erreurVentilationRevue(depuisLigneEnRevue(ligneEnRevue({ cle: "L2.0" })))).toBeNull();
    expect(erreurVentilationRevue({ ...ligne, montantSaisi: "abc" })).toBeNull();
  });

  it("ER7 — une mise à jour n'envoie pas sa ventilation : aucune erreur, et la ligne le dit", () => {
    const ligne = ventilee();
    const casse = { ...ligne, ...modifierLigneVentilation(ligne, 0, { montantSaisi: "abc" }) };
    expect(erreurVentilationRevue({ ...casse, action: "METTRE_A_JOUR" })).toBeNull();
    expect(erreurVentilationRevue(casse)).toBe("La ligne 1 de la ventilation porte un montant illisible.");

    expect(ventilationIgnoreeParMiseAJour({ ...ligne, action: "METTRE_A_JOUR" })).toBe(true);
    expect(ventilationIgnoreeParMiseAJour({ ...ligne, action: "IMPORTER" })).toBe(false);
    expect(ventilationIgnoreeParMiseAJour({ ...ligne, action: "IGNORER" })).toBe(false);
    expect(
      ventilationIgnoreeParMiseAJour(
        depuisLigneEnRevue(
          ligneEnRevue({ cle: "L2.0", action: "METTRE_A_JOUR", section: "DOUBLONS", statutDoublon: "EXTERNAL_ID_EXISTANT" }),
        ),
      ),
    ).toBe(false);
    expect(MESSAGE_VENTILATION_MISE_A_JOUR).toBe("La ventilation proposée par la règle ne s'applique pas à une mise à jour.");
  });
});

describe("entetesSections", () => {
  const importee = () => depuisLigneEnRevue(ligneEnRevue({ cle: "a", action: "IMPORTER", section: "A_IMPORTER" }));
  const filtree = () =>
    depuisLigneEnRevue(ligneEnRevue({ cle: "f", action: "IGNORER", section: "FILTREES", filtreId: "f1" }));

  it("sans geste : aucun détail, comptes par section", () => {
    const entetes = entetesSections([importee(), filtree(), filtree()], 4, 0);
    expect(entetes.aImporter).toEqual({ compte: 1, detail: null });
    expect(entetes.doublons).toEqual({ compte: 0, detail: null });
    expect(entetes.filtrees).toEqual({ compte: 2, detail: null });
    expect(entetes.nonReconnues).toEqual({ compte: 4, detail: null });
  });

  it("une filtrée réintégrée : le détail le dit, les comptes ne bougent pas", () => {
    const reintegree: LigneRevueEditee = { ...filtree(), action: "IMPORTER" };
    const entetes = entetesSections([importee(), reintegree, filtree()], 0, 0);
    expect(entetes.filtrees).toEqual({ compte: 2, detail: "1 réintégrée" });
    expect(entetes.aImporter).toEqual({ compte: 1, detail: "+ 1 réintégrée d'une autre section" });
  });

  it("deux filtrées réintégrées : le détail s'accorde au pluriel", () => {
    const reintegrees: LigneRevueEditee[] = [
      { ...filtree(), action: "IMPORTER" },
      { ...filtree(), action: "IMPORTER" },
    ];
    const entetes = entetesSections([importee(), ...reintegrees], 0, 0);
    expect(entetes.filtrees.detail).toBe("2 réintégrées");
    expect(entetes.aImporter.detail).toBe("+ 2 réintégrées d'une autre section");
  });

  it("la même ligne remise à IGNORER : les détails reviennent à null", () => {
    const remise: LigneRevueEditee = { ...filtree(), action: "IGNORER" };
    const entetes = entetesSections([importee(), remise], 0, 0);
    expect(entetes.filtrees.detail).toBeNull();
    expect(entetes.aImporter.detail).toBeNull();
  });

  it("doublons : réintégrée et écartée, détail composé", () => {
    const empreinte: LigneRevueEditee = {
      ...depuisLigneEnRevue(
        ligneEnRevue({ cle: "d1", action: "IGNORER", section: "DOUBLONS", statutDoublon: "EMPREINTE_EXISTANTE" }),
      ),
      action: "IMPORTER",
    };
    const externe: LigneRevueEditee = {
      ...depuisLigneEnRevue(
        ligneEnRevue({ cle: "d2", action: "METTRE_A_JOUR", section: "DOUBLONS", statutDoublon: "EXTERNAL_ID_EXISTANT" }),
      ),
      action: "IGNORER",
    };
    const entetes = entetesSections([empreinte, externe], 0, 0);
    expect(entetes.doublons.detail).toBe("1 réintégrée · 1 écartée");
    expect(entetes.aImporter.detail).toBe("+ 1 réintégrée d'une autre section");
  });

  it("un quasi-doublon importé d'emblée et resté tel quel n'est ni réintégré ni écarté", () => {
    const quasi = depuisLigneEnRevue(
      ligneEnRevue({ cle: "q", action: "IMPORTER", section: "DOUBLONS", statutDoublon: "QUASI_DOUBLON" }),
    );
    const entetes = entetesSections([quasi], 0, 0);
    expect(entetes.doublons.detail).toBeNull();
    expect(entetes.aImporter.detail).toBeNull();
  });

  it("non reconnues : total et récupérées", () => {
    expect(entetesSections([], 3, 2).nonReconnues).toEqual({ compte: 3, detail: "2 récupérées" });
    expect(entetesSections([], 3, 1).nonReconnues).toEqual({ compte: 3, detail: "1 récupérée" });
  });
});

describe("nbReintegreesAilleurs", () => {
  it("0 sans geste ; une ligne A_IMPORTER ne compte jamais", () => {
    const importee = depuisLigneEnRevue(ligneEnRevue({ cle: "a" }));
    const filtree = depuisLigneEnRevue(ligneEnRevue({ cle: "f", action: "IGNORER", section: "FILTREES", filtreId: "f1" }));
    expect(nbReintegreesAilleurs([importee, filtree])).toBe(0);
    expect(nbReintegreesAilleurs([{ ...importee, action: "IGNORER" }])).toBe(0);
  });

  it("une filtrée passée à IMPORTER compte, un doublon d'empreinte réintégré aussi", () => {
    const filtree = depuisLigneEnRevue(ligneEnRevue({ cle: "f", action: "IGNORER", section: "FILTREES", filtreId: "f1" }));
    const doublon = depuisLigneEnRevue(
      ligneEnRevue({ cle: "d", action: "IGNORER", section: "DOUBLONS", statutDoublon: "EMPREINTE_EXISTANTE" }),
    );
    expect(nbReintegreesAilleurs([{ ...filtree, action: "IMPORTER" }])).toBe(1);
    expect(nbReintegreesAilleurs([{ ...filtree, action: "IMPORTER" }, { ...doublon, action: "IMPORTER" }])).toBe(2);
  });

  it("un quasi-doublon importé d'emblée ne compte pas", () => {
    const quasi = depuisLigneEnRevue(
      ligneEnRevue({ cle: "q", action: "IMPORTER", section: "DOUBLONS", statutDoublon: "QUASI_DOUBLON" }),
    );
    expect(nbReintegreesAilleurs([quasi])).toBe(0);
  });
});

describe("virements dans la revue (docs/lot-m2.md §4.5)", () => {
  const CHEQUE = "clx0000000000000000000020";
  const VISA = "clx0000000000000000000021";
  const SC_CAFE = "clx0000000000000000000022";

  function candidat(id: string, surcharge: Partial<CandidatVirement> = {}): CandidatVirement {
    return {
      id,
      accountId: CHEQUE,
      date: "2024-05-12",
      montantCents: -48713,
      parentId: null,
      estVentilee: false,
      transferTransactionId: null,
      compteNom: "Chèque",
      description: "VISA DESJARDINS",
      sousCategorieNom: null,
      ...surcharge,
    };
  }

  function base(cle: string, surcharge: Partial<LigneEnRevue> = {}): LigneEnRevue {
    return ligneEnRevue({
      cle,
      date: "2024-05-14",
      description: "Paiement.",
      montantCents: 48713,
      accountId: VISA,
      candidatsVirement: [candidat("c-1")],
      ...surcharge,
    });
  }

  it("ER-V1 — choisirVirement sur une ligne catégorisée : valeurs remises à zéro, retrait consigné", () => {
    const l = depuisLigneEnRevue(base("L1", { subcategoryId: SC_CAFE, regleAppliqueeId: "r1" }));
    expect(choisirVirement(l, "c-1")).toEqual({
      virementAvec: "c-1",
      subcategoryId: null,
      ventilation: null,
      retraitVirement: { subcategoryId: SC_CAFE, ventilee: false },
    });
  });

  it("ER-V1 — une ligne ventilée : retrait consigné comme ventilée, ventilation vidée", () => {
    const l = depuisLigneEnRevue(
      base("L1", { montantCents: 100, ventilation: [{ subcategoryId: SC_CAFE, montantCents: 100 }] }),
    );
    expect(choisirVirement(l, "c-1")).toEqual({
      virementAvec: "c-1",
      subcategoryId: null,
      ventilation: null,
      retraitVirement: { subcategoryId: null, ventilee: true },
    });
  });

  it("ER-V1 — rien à retirer : le retrait précédent est conservé", () => {
    const l: LigneRevueEditee = {
      ...depuisLigneEnRevue(base("L1")),
      retraitVirement: { subcategoryId: SC_CAFE, ventilee: false },
    };
    expect(choisirVirement(l, "c-1").retraitVirement).toEqual({ subcategoryId: SC_CAFE, ventilee: false });
  });

  it("ER-V2 — décocher ne restaure rien : valeurs courantes, retrait effacé", () => {
    const pre = depuisLigneEnRevue(base("L1", { virementAvec: "c-1", categorisationRetiree: { subcategoryId: SC_CAFE, ventilation: null, regleAppliqueeId: "r1" } }));
    expect(pre.subcategoryId).toBeNull();
    expect(choisirVirement(pre, null)).toEqual({
      virementAvec: null,
      subcategoryId: null,
      ventilation: null,
      retraitVirement: null,
    });
  });

  it("ER-V3 — depuisLigneEnRevue d'une ligne pré-remplie : retraitVirement construit depuis categorisationRetiree", () => {
    const sc = depuisLigneEnRevue(
      base("L1", { virementAvec: "c-1", categorisationRetiree: { subcategoryId: SC_CAFE, ventilation: null, regleAppliqueeId: "r1" } }),
    );
    expect(sc.virementAvec).toBe("c-1");
    expect(sc.retraitVirement).toEqual({ subcategoryId: SC_CAFE, ventilee: false });
    const vent = depuisLigneEnRevue(
      base("L2", {
        virementAvec: "c-1",
        categorisationRetiree: { subcategoryId: null, ventilation: [{ subcategoryId: SC_CAFE, montantCents: 48713 }], regleAppliqueeId: "r1" },
      }),
    );
    expect(vent.retraitVirement).toEqual({ subcategoryId: null, ventilee: true });
    expect(depuisLigneEnRevue(base("L3")).retraitVirement).toBeNull();
  });

  it("ER-V4 — versLigneImport d'une ligne virement : cible recopiée, sous-catégorie, ventilation et règle à null", () => {
    const l: LigneRevueEditee = {
      ...depuisLigneEnRevue(base("L1", { subcategoryId: SC_CAFE, regleAppliqueeId: "r1" })),
      ...choisirVirement(depuisLigneEnRevue(base("L1", { subcategoryId: SC_CAFE, regleAppliqueeId: "r1" })), "c-1"),
    };
    const entree = versLigneImport(l);
    expect(entree?.virementAvec).toBe("c-1");
    expect(entree?.subcategoryId).toBeNull();
    expect(entree?.ventilation).toBeNull();
    expect(entree?.appliedRuleId).toBeNull();
  });

  it("ER-V4 — même si la ligne éditée porte encore une sous-catégorie, un virement n'en envoie pas", () => {
    const l: LigneRevueEditee = { ...depuisLigneEnRevue(base("L1", { subcategoryId: SC_CAFE, regleAppliqueeId: "r1" })), virementAvec: "c-1" };
    const entree = versLigneImport(l);
    expect(entree?.subcategoryId).toBeNull();
    expect(entree?.appliedRuleId).toBeNull();
  });

  it("ER-V4 — METTRE_A_JOUR : virementAvec null", () => {
    const l: LigneRevueEditee = { ...depuisLigneEnRevue(base("L1")), virementAvec: "c-1", action: "METTRE_A_JOUR" };
    expect(versLigneImport(l)?.virementAvec).toBeNull();
  });

  it("ER-V4 — sans virement : virementAvec null et sous-catégorie conservée", () => {
    const entree = versLigneImport(depuisLigneEnRevue(base("L1", { subcategoryId: SC_CAFE })));
    expect(entree?.virementAvec).toBeNull();
    expect(entree?.subcategoryId).toBe(SC_CAFE);
  });

  describe("ER-V5 — erreursVirementRevue", () => {
    const pre = (cle: string, surcharge: Partial<LigneEnRevue> = {}): LigneRevueEditee =>
      depuisLigneEnRevue(base(cle, { virementAvec: "c-1", ...surcharge }));

    it("nominal : aucune erreur", () => {
      expect(erreursVirementRevue([pre("L1")]).size).toBe(0);
    });

    it("montant édité qui ne s'annule plus : MONTANT_NON_OPPOSE", () => {
      const l: LigneRevueEditee = { ...pre("L1"), montantSaisi: "500,00" };
      expect(erreursVirementRevue([l]).get("L1")).toBe(
        messageRefusLiaison({ motif: "MONTANT_NON_OPPOSE", sommeCents: 50000 - 48713 }),
      );
    });

    it("compte édité égal à celui du candidat : MEME_COMPTE", () => {
      const l: LigneRevueEditee = { ...pre("L1"), accountId: CHEQUE };
      expect(erreursVirementRevue([l]).get("L1")).toBe(messageRefusLiaison({ motif: "MEME_COMPTE" }));
    });

    it("date éditée hors fenêtre : HORS_FENETRE", () => {
      const l: LigneRevueEditee = { ...pre("L1"), date: "2024-05-30" };
      expect(erreursVirementRevue([l]).get("L1")).toBe(messageRefusLiaison({ motif: "HORS_FENETRE", ecartJours: 18 }));
    });

    it("ligne devenue ventilée à la main : VENTILEE", () => {
      const l: LigneRevueEditee = { ...pre("L1"), ventilation: [{ subcategoryId: SC_CAFE, montantSaisi: "487,13" }] };
      expect(erreursVirementRevue([l]).get("L1")).toBe(messageRefusLiaison({ motif: "VENTILEE", cote: "PREMIERE" }));
    });

    it("candidat choisi absent de la proposition : message dédié", () => {
      const l: LigneRevueEditee = { ...pre("L1"), virementAvec: "fantome" };
      expect(erreursVirementRevue([l]).get("L1")).toBe("Le virement choisi n'est plus proposé pour cette ligne.");
    });

    it("deux lignes sur la même cible : message sur la seconde seulement, qui nomme la première", () => {
      const a = pre("L1", { numeroLigne: 4, description: "Paiement." });
      const b = pre("L2", { numeroLigne: 5, description: "Paiement bis" });
      const erreurs = erreursVirementRevue([a, b]);
      expect(erreurs.has("L1")).toBe(false);
      expect(erreurs.get("L2")).toBe(
        `Ce virement est déjà retenu pour ${designerLigne(a)} : décoche-le sur l'une des deux lignes.`,
      );
    });

    it("une ligne IGNORER ne produit aucune erreur et ne compte pas pour le doublon", () => {
      const a: LigneRevueEditee = { ...pre("L1"), action: "IGNORER", montantSaisi: "500,00" };
      const b = pre("L2");
      const erreurs = erreursVirementRevue([a, b]);
      expect(erreurs.size).toBe(0);
    });

    it("montant illisible : aucune erreur (son champ le dit)", () => {
      const l: LigneRevueEditee = { ...pre("L1"), montantSaisi: "abc" };
      expect(erreursVirementRevue([l]).size).toBe(0);
    });

    it("sans virement : aucune erreur", () => {
      expect(erreursVirementRevue([depuisLigneEnRevue(base("L1"))]).size).toBe(0);
    });
  });

  it("ER-V6 — un conflit SOUS_CATEGORIE est ignoré sur une ligne virement, et bloque de nouveau une fois décochée", () => {
    const conflit: ConflitRegles = { slot: "SOUS_CATEGORIE", priorite: 5, candidats: [] };
    const conflitNote: ConflitRegles = { slot: "NOTE", priorite: 5, candidats: [] };
    const virement = depuisLigneEnRevue(base("L1", { conflits: [conflit], aRevoir: true, virementAvec: "c-1" }));
    expect(conflitNonTrancheSurLigne(virement)).toBe(false);
    expect(slotsNonArbitres(virement)).toEqual([]);

    const decochee: LigneRevueEditee = { ...virement, ...choisirVirement(virement, null) };
    expect(conflitNonTrancheSurLigne(decochee)).toBe(true);
    expect(slotsNonArbitres(decochee)).toEqual(["SOUS_CATEGORIE"]);

    const autreCreneau = depuisLigneEnRevue(base("L2", { conflits: [conflit, conflitNote], virementAvec: "c-1" }));
    expect(conflitNonTrancheSurLigne(autreCreneau)).toBe(true);
    expect(slotsNonArbitres(autreCreneau)).toEqual(["NOTE"]);
  });

  it("ER-V7 — compter().virements ne compte que les lignes IMPORTER à cible", () => {
    const importee = depuisLigneEnRevue(base("a", { virementAvec: "c-1" }));
    const sansCible = depuisLigneEnRevue(base("b"));
    const ignoree = depuisLigneEnRevue(base("c", { virementAvec: "c-1", action: "IGNORER", section: "FILTREES", filtreId: "f" }));
    const miseAJour = depuisLigneEnRevue(base("d", { virementAvec: "c-1", action: "METTRE_A_JOUR", section: "DOUBLONS" }));
    expect(compter([importee, sansCible, ignoree, miseAJour], 0).virements).toBe(1);
    expect(compter([], 0).virements).toBe(0);
  });

  it("ER-V8 — messageRetraitVirement", () => {
    const noms = new Map([[SC_CAFE, "Café"]]);
    const sc: LigneRevueEditee = { ...depuisLigneEnRevue(base("L1")), retraitVirement: { subcategoryId: SC_CAFE, ventilee: false } };
    expect(messageRetraitVirement(sc, noms)).toBe("La sous-catégorie « Café » a été retirée : un virement n'en porte pas.");
    const vent: LigneRevueEditee = { ...sc, retraitVirement: { subcategoryId: null, ventilee: true } };
    expect(messageRetraitVirement(vent, noms)).toBe("La ventilation proposée a été retirée : un virement ne se ventile pas.");
    expect(messageRetraitVirement(depuisLigneEnRevue(base("L2")), noms)).toBeNull();
  });

  it("ER-V8 — messageAutreCote", () => {
    const cand = candidat("c-1", { sousCategorieNom: "Épicerie" });
    const l = depuisLigneEnRevue(base("L1", { candidatsVirement: [cand], virementAvec: "c-1" }));
    expect(messageAutreCote(l)).toBe("La sous-catégorie « Épicerie » de la ligne du 2024-05-12 (Chèque) sera retirée.");
    expect(messageAutreCote({ ...l, virementAvec: null })).toBeNull();
    expect(messageAutreCote(depuisLigneEnRevue(base("L2", { virementAvec: "c-1" })))).toBeNull();
  });

  it("ER-V8 — libelleReferenceDoublon", () => {
    const reference = {
      id: "ex-1",
      date: "2024-05-13",
      description: "Virement depuis Chèque",
      montantCents: 48713,
      empreinte: "e",
      virement: { compteNom: "Chèque" },
    };
    const virement = depuisLigneEnRevue(
      base("L1", { statutDoublon: "VIREMENT_EXISTANT", doublonDe: reference, section: "DOUBLONS", action: "IGNORER" }),
    );
    expect(libelleReferenceDoublon(virement)).toBe(
      "Déjà enregistrée comme virement depuis Chèque, le 2024-05-13 — Virement depuis Chèque",
    );
    const sortie = depuisLigneEnRevue(
      base("L2", {
        statutDoublon: "VIREMENT_EXISTANT",
        doublonDe: { ...reference, montantCents: -48713, virement: { compteNom: "Visa" } },
        section: "DOUBLONS",
        action: "IGNORER",
      }),
    );
    expect(libelleReferenceDoublon(sortie)).toBe(
      "Déjà enregistrée comme virement vers Visa, le 2024-05-13 — Virement depuis Chèque",
    );
    const empreinte = depuisLigneEnRevue(
      base("L3", { statutDoublon: "EMPREINTE_EXISTANTE", doublonDe: { ...reference, virement: null }, section: "DOUBLONS" }),
    );
    expect(libelleReferenceDoublon(empreinte)).toBe("Transaction existante : 2024-05-13 — Virement depuis Chèque");
    expect(libelleReferenceDoublon(depuisLigneEnRevue(base("L4")))).toBeNull();
  });
});

describe("rapprochement à l'import (docs/lot-m3.md §4.5)", () => {
  const OCC_A: OccurrenceCandidate = {
    id: "occ-a",
    ruleId: "r-a",
    echeance: "2026-10-12",
    montantCents: -1799,
    libelle: "Netflix.com",
    motifRapprochement: "NETFLIX.COM",
    toleranceCents: 500,
    toleranceJours: 3,
    subcategoryId: "sc-a",
  };
  const OCC_B: OccurrenceCandidate = { ...OCC_A, id: "occ-b", ruleId: "r-b", echeance: "2026-10-14", subcategoryId: "sc-b" };
  const OCC_C: OccurrenceCandidate = { ...OCC_A, id: "occ-c", ruleId: "r-c", echeance: "2026-10-13", subcategoryId: null };
  const PROPRE = { date: "2026-10-12", montantCents: -1799, descriptionNormalisee: "NETFLIX.COM" };

  /** Ligne AUTO héritée (occ-a, sc-a) ; les surcharges portent sur la base. */
  function ligneAuto(overrides: Partial<LigneEnRevue> = {}): LigneRevueEditee {
    return depuisLigneEnRevue(
      ligneEnRevue({
        cle: "L1",
        description: "NETFLIX.COM",
        descriptionNormalisee: "NETFLIX.COM",
        date: "2026-10-12",
        montantCents: -1799,
        candidatsOccurrence: candidatsOccurrence(PROPRE, [OCC_A, OCC_B, OCC_C]),
        occurrenceAvec: "occ-a",
        subcategoryId: "sc-a",
        categorieHeritee: true,
        ...overrides,
      }),
    );
  }

  /** Ligne À confirmer : candidats, rien de pré-rempli, aucune catégorie. */
  function ligneAConfirmer(overrides: Partial<LigneEnRevue> = {}): LigneRevueEditee {
    return ligneAuto({ occurrenceAvec: null, subcategoryId: null, categorieHeritee: false, ...overrides });
  }

  const appliquer = (l: LigneRevueEditee, patch: Partial<LigneRevueEditee>): LigneRevueEditee => ({ ...l, ...patch });

  it("ER-O1 — depuisLigneEnRevue recopie occurrenceAvec et categorieHeritee", () => {
    const l = ligneAuto();
    expect(l.occurrenceAvec).toBe("occ-a");
    expect(l.categorieHeritee).toBe(true);
    const sans = ligneAConfirmer();
    expect(sans.occurrenceAvec).toBeNull();
    expect(sans.categorieHeritee).toBe(false);
  });

  it("ER-O2 — ligne AUTO héritée intacte : occurrenceAuto, sous-catégorie héritée, aucune règle créditée", () => {
    const entree = versLigneImport(ligneAuto());
    expect(entree?.occurrenceAvec).toBe("occ-a");
    expect(entree?.occurrenceAuto).toBe(true);
    expect(entree?.subcategoryId).toBe("sc-a");
    expect(entree?.appliedRuleId).toBeNull();
  });

  it("ER-O3 — Défaire : plus de lien, plus de catégorie héritée ; l'envoi le dit", () => {
    const l = ligneAuto();
    const defaite = appliquer(l, choisirOccurrence(l, null));
    expect(defaite.occurrenceAvec).toBeNull();
    expect(defaite.subcategoryId).toBeNull();
    expect(defaite.categorieHeritee).toBe(false);
    const entree = versLigneImport(defaite);
    expect(entree?.occurrenceAvec).toBeNull();
    expect(entree?.occurrenceAuto).toBe(false);
  });

  it("ER-O4 — Défaire puis re-choisir la même échéance : AUTO et catégorie rétablis (D5)", () => {
    const l = ligneAuto();
    const defaite = appliquer(l, choisirOccurrence(l, null));
    const refaite = appliquer(defaite, choisirOccurrence(defaite, "occ-a"));
    expect(refaite.occurrenceAvec).toBe("occ-a");
    expect(occurrenceAutoConservee(refaite)).toBe(true);
    expect(refaite.subcategoryId).toBe("sc-a");
    expect(categorieDeLaRecurrence(refaite)).toBe(true);
    expect(versLigneImport(refaite)?.occurrenceAuto).toBe(true);
  });

  it("ER-O5 — choix d'un candidat sur une ligne sans catégorie : manuel, catégorie du candidat", () => {
    const l = ligneAConfirmer();
    const choisie = appliquer(l, choisirOccurrence(l, "occ-b"));
    expect(choisie.occurrenceAvec).toBe("occ-b");
    expect(versLigneImport(choisie)?.occurrenceAuto).toBe(false);
    expect(choisie.subcategoryId).toBe("sc-b");
    expect(categorieDeLaRecurrence(choisie)).toBe(true);
  });

  it("ER-O6 — ligne déjà catégorisée par une règle : sous-catégorie inchangée, rien d'hérité", () => {
    const l = ligneAConfirmer({ subcategoryId: "sc-regle", regleAppliqueeId: "r-1" });
    const choisie = appliquer(l, choisirOccurrence(l, "occ-b"));
    expect(choisie.occurrenceAvec).toBe("occ-b");
    expect(choisie.subcategoryId).toBe("sc-regle");
    expect(choisie.categorieHeritee).toBe(false);
    expect(categorieDeLaRecurrence(choisie)).toBe(false);
  });

  it("ER-O7 — conflit SOUS_CATEGORIE non arbitré : pas d'héritage", () => {
    const conflit: ConflitRegles = { slot: "SOUS_CATEGORIE", priorite: 5, candidats: [] };
    const l = ligneAConfirmer({ conflits: [conflit] });
    const choisie = appliquer(l, choisirOccurrence(l, "occ-b"));
    expect(choisie.occurrenceAvec).toBe("occ-b");
    expect(choisie.subcategoryId).toBeNull();
    expect(choisie.categorieHeritee).toBe(false);
  });

  it("ER-O8 — catégorie changée à la main : plus celle de la récurrence, et Défaire la laisse", () => {
    const l = ligneAuto();
    const changee = appliquer(l, choisirSousCategorie(l, "sc-autre"));
    expect(categorieDeLaRecurrence(changee)).toBe(false);
    const defaite = appliquer(changee, choisirOccurrence(changee, null));
    expect(defaite.subcategoryId).toBe("sc-autre");
    expect(defaite.occurrenceAvec).toBeNull();
  });

  it("ER-O9 — choisir un virement sur une ligne héritée : catégorie retirée, dite, plus celle de la récurrence", () => {
    const l = ligneAuto();
    const virement = appliquer(l, choisirVirement(l, "c-1"));
    expect(virement.subcategoryId).toBeNull();
    expect(messageRetraitVirement(virement, new Map([["sc-a", "Streaming"]]))).toBe(
      "La sous-catégorie « Streaming » a été retirée : un virement n'en porte pas.",
    );
    expect(categorieDeLaRecurrence(virement)).toBe(false);
  });

  it("ER-O10 — héritée, changement de candidat : la catégorie suit, puis disparaît sans sous-catégorie", () => {
    const l = ligneAuto();
    const versB = appliquer(l, choisirOccurrence(l, "occ-b"));
    expect(versB.subcategoryId).toBe("sc-b");
    expect(versB.categorieHeritee).toBe(true);
    const versC = appliquer(versB, choisirOccurrence(versB, "occ-c"));
    expect(versC.occurrenceAvec).toBe("occ-c");
    expect(versC.subcategoryId).toBeNull();
    expect(versC.categorieHeritee).toBe(false);
  });

  it("ER-O11 — IGNORER : null ; METTRE_A_JOUR : jamais de liaison envoyée", () => {
    expect(versLigneImport(appliquer(ligneAuto(), { action: "IGNORER" }))).toBeNull();
    const maj = versLigneImport(appliquer(ligneAuto(), { action: "METTRE_A_JOUR" }));
    expect(maj?.occurrenceAvec).toBeNull();
    expect(maj?.occurrenceAuto).toBe(false);
  });

  it("ER-O12 — deux lignes sur la même échéance : la seconde est bloquée, message exact ; IGNORER et METTRE_A_JOUR ne comptent pas", () => {
    const l1 = ligneAuto({ cle: "L1", numeroLigne: 1 });
    const l2 = ligneAuto({ cle: "L2", numeroLigne: 2, description: "NETFLIX.COM", descriptionNormalisee: "NETFLIX.COM" });
    const erreurs = erreursOccurrenceRevue([l1, l2]);
    expect([...erreurs.keys()]).toEqual(["L2"]);
    expect(erreurs.get("L2")).toBe(
      `Cette échéance est déjà retenue pour ${designerLigne(l1)} : choisis « Ne pas lier » sur l'une des deux lignes.`,
    );
    expect(erreursOccurrenceRevue([l1, appliquer(l2, { action: "IGNORER" })]).size).toBe(0);
    expect(erreursOccurrenceRevue([l1, appliquer(l2, { action: "METTRE_A_JOUR" })]).size).toBe(0);
    expect(erreursOccurrenceRevue([appliquer(l1, { action: "IGNORER" }), l2]).size).toBe(0);
  });

  it("ER-O13 — compte de la ligne changé : message d'autre compte", () => {
    const l = appliquer(ligneAuto(), { accountId: "clx0000000000000000000099" });
    expect(erreursOccurrenceRevue([l]).get("L1")).toBe(MESSAGE_OCCURRENCE_AUTRE_COMPTE);
  });

  it("ER-O14 — date hors tolérance + 7 : la ligne ne correspond plus ; montant illisible : rien ici", () => {
    const l = ligneAuto();
    expect(erreursOccurrenceRevue([appliquer(l, { date: "2026-10-30" })]).get("L1")).toBe(MESSAGE_OCCURRENCE_PLUS_CANDIDATE);
    expect(erreursOccurrenceRevue([appliquer(l, { montantSaisi: "abc" })]).size).toBe(0);
    expect(erreursOccurrenceRevue([l]).size).toBe(0);
  });

  it("ER-O15 — occurrenceAvec absent des candidats : plus proposée", () => {
    const l = appliquer(ligneAuto(), { occurrenceAvec: "occ-inconnue" });
    expect(erreursOccurrenceRevue([l]).get("L1")).toBe(MESSAGE_OCCURRENCE_PLUS_PROPOSEE);
  });

  it("ER-O16 — compter().rapprochements ne compte que les IMPORTER à occurrence", () => {
    const lignes = [
      ligneAuto({ cle: "L1" }),
      ligneAConfirmer({ cle: "L2" }),
      appliquer(ligneAuto({ cle: "L3" }), { action: "IGNORER" }),
      appliquer(ligneAuto({ cle: "L4" }), { action: "METTRE_A_JOUR" }),
    ];
    expect(compter(lignes, 0).rapprochements).toBe(1);
  });

  it("ER-O17 — messageCategorieRecurrence : nom résolu, id si nom inconnu, null si non héritée", () => {
    const l = ligneAuto();
    expect(messageCategorieRecurrence(l, new Map([["sc-a", "Streaming"]]))).toBe(
      "Sous-catégorie « Streaming » : catégorie de la récurrence.",
    );
    expect(messageCategorieRecurrence(l, new Map())).toBe("Sous-catégorie « sc-a » : catégorie de la récurrence.");
    expect(messageCategorieRecurrence(appliquer(l, choisirSousCategorie(l, "sc-autre")), new Map())).toBeNull();
    expect(messageCategorieRecurrence(ligneAConfirmer(), new Map())).toBeNull();
  });

  it("candidatOccurrenceChoisi et occurrenceAutoConservee", () => {
    const auto = ligneAuto();
    expect(candidatOccurrenceChoisi(auto)?.occurrence.id).toBe("occ-a");
    expect(occurrenceAutoConservee(auto)).toBe(true);
    const autre = appliquer(auto, { occurrenceAvec: "occ-b" });
    expect(candidatOccurrenceChoisi(autre)?.occurrence.id).toBe("occ-b");
    expect(occurrenceAutoConservee(autre)).toBe(false);
    expect(candidatOccurrenceChoisi(ligneAConfirmer())).toBeUndefined();
    expect(occurrenceAutoConservee(appliquer(ligneAConfirmer(), { occurrenceAvec: "occ-a" }))).toBe(false);
  });
});
