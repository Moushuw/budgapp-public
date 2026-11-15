import { describe, expect, it } from "vitest";
import { FILTRES_VIDES, type DetailTransaction, type LigneTransactionListe, type Pastille } from "@/domain/consultation";
import {
  AUCUN_REFUS,
  IGNOREES_VIDES,
  messageRefus,
  type CompteIgnorees,
  type ApercuSuppression,
  type CompteRenduMasse,
} from "@/domain/edition";
import { formatMontant } from "@/domain/money";
import { messageSuppressionLieeDetail, phraseLiaison } from "@/domain/recurrence";
import type { CandidatVirement } from "@/domain/virement";
import type { CategorieListe } from "@/server/actions/categories";
import {
  etatListe,
  etatsDeLigne,
  libelleApercuSuppression,
  libelleCompteRendu,
  libelleContrepartie,
  libelleDeliaison,
  libelleLiaison,
  libelleRetourSuppression,
  libelleSuppressionVirement,
  libelleDeventilation,
  libelleNombreARevoir,
  libelleNombreTransactions,
  libellePastille,
  libellePortee,
  libelleRaisonsIgnorees,
  libelleSelection,
  libelleSousCategorieLigne,
  libelleSuppressionUnique,
  libelleTotaux,
  messageRefusSuppression,
  LIBELLES_CHAMP_DETAIL,
  LIBELLES_PARAMETRE_URL,
  libelleParametreIgnore,
  optionsSousCategories,
  sousCategorieModifiableEnPlace,
  valeursDetail,
  type ChampDetail,
  type NomsReferentiel,
} from "./presentation";
import { lireEtatUrl, type ParametresRecherche } from "./filtres-url";
import { SELECTION_VIDE } from "./selection";

const LIGNE: LigneTransactionListe = {
  id: "t1",
  date: "2026-09-01",
  accountId: "a1",
  compteNom: "Chèque",
  description: "ÉPICERIE",
  typeOperation: null,
  montantCents: -1234,
  payeeId: null,
  beneficiaireNom: null,
  subcategoryId: null,
  sousCategorieNom: null,
  categorieNom: null,
  etiquettes: [],
  aRevoir: false,
  exclureDuBudget: false,
  exclureDesRapports: false,
  estVentilee: false,
  virement: null,
  lignesVentilation: [],
  nbLignesVentilation: 0,
};

const DETAIL: DetailTransaction = {
  id: "t1",
  parentId: null,
  accountId: "a1",
  compteNom: "Chèque",
  date: "2026-09-01",
  description: "CAFE DEPOT",
  typeOperation: "Achat",
  montantCents: -631,
  payeeId: "p1",
  beneficiaireNom: "Café Dépôt",
  subcategoryId: "s1",
  sousCategorieNom: "Café",
  categorieNom: "Sorties",
  note: "Crème brûlée",
  etiquettes: [
    { id: "e2", nom: "Zèbre", couleur: null },
    { id: "e1", nom: "Auto", couleur: null },
  ],
  aRevoir: true,
  exclureDuBudget: false,
  exclureDesRapports: true,
  source: "COPIER_COLLER",
  etat: "COMPTABILISEE",
  rapprochement: "NON_RAPPROCHEE",
  externalId: "EXT-1",
  empreinte: "abc123def456",
  lotImport: { id: "l1", importeLeDate: "2026-09-02", libelle: "Lot A", couvreDu: "2026-08-01", couvreAu: "2026-08-31" },
  regle: { id: "r1", libelle: "Épicerie IGA" },
  estVentilee: false,
  contrepartie: null,
  lignesVentilation: [],
  nbLignesVentilation: 0,
  recurrence: null,
  refus: AUCUN_REFUS,
};

describe("libelleDeventilation", () => {
  it("PR1 — le nombre de lignes qui partent, au singulier et au pluriel", () => {
    const ventilee = { ...DETAIL, description: "IGA", montantCents: -9000, estVentilee: true };
    const montant = formatMontant(-9000, "CENTS");
    expect(libelleDeventilation({ ...ventilee, nbLignesVentilation: 3 })).toBe(
      `La ventilation de « IGA » (${montant}) sera retirée : ses 3 lignes seront supprimées et la transaction redeviendra non catégorisée. Cette action est définitive.`,
    );
    expect(libelleDeventilation({ ...ventilee, nbLignesVentilation: 1 })).toBe(
      `La ventilation de « IGA » (${montant}) sera retirée : sa ligne sera supprimée et la transaction redeviendra non catégorisée. Cette action est définitive.`,
    );
  });
});

describe("libellés de totaux et de portée", () => {
  it("nombre", () => {
    expect(libelleNombreTransactions(0)).toBe("0 transaction");
    expect(libelleNombreTransactions(1)).toBe("1 transaction");
    expect(libelleNombreTransactions(214)).toBe("214 transactions");
  });

  it("totaux", () => {
    expect(libelleTotaux({ nombre: 2, sommeCents: -1234 })).toBe(
      `2 transactions · ${new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(-12.34)}`,
    );
  });

  it("portée, cinq branches", () => {
    const periode = { type: "MOIS", mois: "2026-09" } as const;
    expect(libellePortee({ ...FILTRES_VIDES, toutesDates: true }, periode)).toBe("Toutes les dates");
    expect(libellePortee({ ...FILTRES_VIDES, du: "2026-01-01", au: "2026-01-31" }, periode)).toBe("Du 2026-01-01 au 2026-01-31");
    expect(libellePortee({ ...FILTRES_VIDES, du: "2026-01-01" }, periode)).toBe("Depuis le 2026-01-01");
    expect(libellePortee({ ...FILTRES_VIDES, au: "2026-01-31" }, periode)).toBe("Jusqu'au 2026-01-31");
    expect(libellePortee(FILTRES_VIDES, periode)).toBe("septembre 2026");
  });

  it("à revoir", () => {
    expect(libelleNombreARevoir(1)).toBe("1 transaction à revoir");
    expect(libelleNombreARevoir(6)).toBe("6 transactions à revoir");
  });
});

describe("libellePastille", () => {
  const noms: NomsReferentiel = {
    comptes: new Map([["c1", "Visa"]]),
    sousCategories: new Map([["s1", "Épicerie"]]),
    beneficiaires: new Map([["b1", "IGA"]]),
    etiquettes: new Map([["e1", "Auto"]]),
  };

  it.each<[Pastille, string]>([
    [{ type: "PLAGE", du: "2026-01-01", au: "2026-01-31" }, "Du 2026-01-01 au 2026-01-31"],
    [{ type: "TOUTES_DATES" }, "Toutes les dates"],
    [{ type: "TEXTE", texte: "cafe" }, "Recherche : cafe"],
    [{ type: "COMPTE", id: "c1" }, "Compte : Visa"],
    [{ type: "SOUS_CATEGORIE", id: "s1" }, "Sous-catégorie : Épicerie"],
    [{ type: "NON_CATEGORISEE" }, "Non catégorisée"],
    [{ type: "BENEFICIAIRE", id: "b1" }, "Bénéficiaire : IGA"],
    [{ type: "ETIQUETTE", id: "e1" }, "Étiquette : Auto"],
    [{ type: "SENS", sens: "ENTREES" }, "Entrées seulement"],
    [{ type: "SENS", sens: "SORTIES" }, "Sorties seulement"],
    [{ type: "A_REVOIR" }, "À revoir"],
    [{ type: "VIREMENTS", mode: "SEULEMENT" }, "Virements seulement"],
    [{ type: "VIREMENTS", mode: "EXCLURE" }, "Sans les virements"],
    [{ type: "RECURRENCES", mode: "SEULEMENT" }, "Liées à une récurrence seulement"],
    [{ type: "RECURRENCES", mode: "EXCLURE" }, "Sans les liées à une récurrence"],
    [{ type: "VENTILEES" }, "Ventilées seulement"],
    [{ type: "EXCLUE_BUDGET" }, "Exclues du budget"],
    [{ type: "EXCLUE_RAPPORTS" }, "Exclues des rapports"],
    [{ type: "COMPTE", id: "x" }, "Compte : Compte inconnu"],
    [{ type: "SOUS_CATEGORIE", id: "x" }, "Sous-catégorie : Sous-catégorie inconnue"],
    [{ type: "BENEFICIAIRE", id: "x" }, "Bénéficiaire : Bénéficiaire inconnu"],
    [{ type: "ETIQUETTE", id: "x" }, "Étiquette : Étiquette inconnue"],
  ])("%j → %s", (pastille, attendu) => {
    expect(libellePastille(pastille, noms)).toBe(attendu);
  });

  it("montants, formatés par formatMontant", () => {
    expect(libellePastille({ type: "MONTANT_MIN", cents: 1250 }, noms)).toMatch(/^Montant ≥ 12,50/);
    expect(libellePastille({ type: "MONTANT_MAX", cents: 9900 }, noms)).toMatch(/^Montant ≤ 99,00/);
  });
});

describe("etatsDeLigne", () => {
  it("aucun, un seul, ou les cinq dans l'ordre", () => {
    expect(etatsDeLigne(LIGNE)).toEqual([]);
    expect(etatsDeLigne({ ...LIGNE, aRevoir: true }).map((etat) => etat.cle)).toEqual(["A_REVOIR"]);
    const tous = etatsDeLigne({
      ...LIGNE,
      aRevoir: true,
      virement: { transactionId: "t2", compteId: "a2", compteNom: "Visa" },
      estVentilee: true,
      nbLignesVentilation: 3,
      exclureDuBudget: true,
      exclureDesRapports: true,
    });
    expect(tous.map((etat) => etat.cle)).toEqual(["A_REVOIR", "VIREMENT", "VENTILEE", "EXCLUE_BUDGET", "EXCLUE_RAPPORTS"]);
    expect(tous.map((etat) => etat.libelle)).toEqual([
      "À revoir",
      "Virement avec Visa",
      "Ventilée en 3 lignes",
      "Exclue du budget",
      "Exclue des rapports",
    ]);
  });

  it("virement dont le compte est inconnu", () => {
    const etats = etatsDeLigne({ ...LIGNE, virement: { transactionId: "t2", compteId: null, compteNom: null } });
    expect(etats[0]?.libelle).toBe("Virement avec un compte inconnu");
  });
});

describe("sousCategorieModifiableEnPlace", () => {
  it("une ligne ordinaire se modifie en place", () => {
    expect(sousCategorieModifiableEnPlace(LIGNE)).toBe(true);
  });

  it("un côté de virement ne se modifie jamais, même quand l'id de l'autre côté est masqué", () => {
    expect(sousCategorieModifiableEnPlace({ ...LIGNE, virement: { transactionId: null, compteId: null, compteNom: null } })).toBe(false);
    expect(sousCategorieModifiableEnPlace({ ...LIGNE, virement: { transactionId: "t2", compteId: "a2", compteNom: "Visa" } })).toBe(false);
  });

  it("un parent ventilé ne se modifie pas en place", () => {
    expect(sousCategorieModifiableEnPlace({ ...LIGNE, estVentilee: true })).toBe(false);
  });
});

describe("libelleSousCategorieLigne", () => {
  it("ventilée, virement, catégorisée, non catégorisée", () => {
    expect(libelleSousCategorieLigne({ ...LIGNE, estVentilee: true })).toBe("Ventilée");
    expect(libelleSousCategorieLigne({ ...LIGNE, virement: { transactionId: "t2", compteId: null, compteNom: null } })).toBe("Virement");
    expect(libelleSousCategorieLigne({ ...LIGNE, sousCategorieNom: "Café", categorieNom: "Sorties" })).toBe("Sorties › Café");
    expect(libelleSousCategorieLigne(LIGNE)).toBe("Non catégorisée");
  });
});

describe("etatListe", () => {
  const sans = { nombre: 0, sommeCents: 0, proprietaireSansTransaction: true };
  const vide = { nombre: 0, sommeCents: 0, proprietaireSansTransaction: false };
  const plein = { nombre: 5, sommeCents: -100, proprietaireSansTransaction: false };

  it("chaque issue", () => {
    expect(etatListe({ chargement: true, erreur: false, totaux: null, filtresActifs: false })).toBe("CHARGEMENT");
    expect(etatListe({ chargement: false, erreur: true, totaux: null, filtresActifs: false })).toBe("ERREUR");
    expect(etatListe({ chargement: false, erreur: false, totaux: plein, filtresActifs: true })).toBe("LISTE");
    expect(etatListe({ chargement: false, erreur: false, totaux: sans, filtresActifs: true })).toBe("SANS_TRANSACTION");
    expect(etatListe({ chargement: false, erreur: false, totaux: vide, filtresActifs: true })).toBe("AUCUN_RESULTAT_FILTRES");
    expect(etatListe({ chargement: false, erreur: false, totaux: vide, filtresActifs: false })).toBe("AUCUN_RESULTAT_PERIODE");
  });

  it("le chargement prime sur l'erreur", () => {
    expect(etatListe({ chargement: true, erreur: true, totaux: plein, filtresActifs: false })).toBe("CHARGEMENT");
  });
});

describe("valeursDetail", () => {
  it("une transaction importée complète", () => {
    const valeurs = valeursDetail(DETAIL);
    expect(valeurs.etat).toBe("Comptabilisée");
    expect(valeurs.externalId).toBe("EXT-1");
    expect(valeurs.empreinte).toBe("abc123def456");
    expect(valeurs.source).toBe("Copier-coller");
    expect(valeurs.etiquettes).toBe("Auto, Zèbre");
    expect(valeurs.sousCategorie).toBe("Sorties › Café");
    expect(valeurs.lotImport).toBe("Importé le 2026-09-02 · relevé du 2026-08-01 au 2026-08-31 · Lot A");
    expect(valeurs.aRevoir).toBe("Oui");
    expect(valeurs.exclureDuBudget).toBe("Non");
    expect(valeurs.regle).toBe("Épicerie IGA");
    expect(valeurs.virement).toBe("—");
    expect(valeurs.ventilation).toBe("—");
  });

  it("un parent ventilé à 53 lignes dont 50 lues", () => {
    const filles = Array.from({ length: 50 }, (_, index) => ({
      id: `f${String(index)}`,
      montantCents: -100,
      subcategoryId: null,
      sousCategorieNom: null,
      categorieNom: null,
      note: null,
      etiquettes: [],
    }));
    const valeurs = valeursDetail({ ...DETAIL, estVentilee: true, lignesVentilation: filles, nbLignesVentilation: 53 });
    expect(valeurs.ventilation).toBe("53 lignes (50 affichées)");
    expect(valeurs.sousCategorie).toBe("Ventilée");
  });

  it("un virement à contrepartie orpheline", () => {
    const valeurs = valeursDetail({
      ...DETAIL,
      contrepartie: { transactionId: "t9", compteId: null, compteNom: null, date: null, montantCents: null, description: null },
    });
    expect(valeurs.virement).toBe("Compte inconnu · date inconnue · montant inconnu");
  });

  it("tous les champs nullables nuls", () => {
    const valeurs = valeursDetail({
      ...DETAIL,
      typeOperation: null,
      note: null,
      externalId: null,
      beneficiaireNom: null,
      sousCategorieNom: null,
      categorieNom: null,
      etiquettes: [],
      lotImport: null,
      regle: null,
    });
    expect(valeurs.typeOperation).toBe("—");
    expect(valeurs.note).toBe("—");
    expect(valeurs.externalId).toBe("—");
    expect(valeurs.empreinte).toBe("abc123def456");
    expect(valeurs.beneficiaire).toBe("Aucun");
    expect(valeurs.sousCategorie).toBe("Aucune");
    expect(valeurs.etiquettes).toBe("Aucune");
    expect(valeurs.lotImport).toBe("—");
    expect(valeurs.regle).toBe("Aucune");
  });

  it("champs de base : compte, date, description, montant signé, rapprochement", () => {
    const valeurs = valeursDetail(DETAIL);
    expect(valeurs.compte).toBe("Chèque");
    expect(valeurs.date).toBe("2026-09-01");
    expect(valeurs.description).toBe("CAFE DEPOT");
    expect(valeurs.typeOperation).toBe("Achat");
    expect(valeurs.note).toBe("Crème brûlée");
    expect(valeurs.beneficiaire).toBe("Café Dépôt");
    expect(valeurs.recurrence).toBe("Aucune récurrence");
    expect(valeurs.exclureDesRapports).toBe("Oui");
    expect(valeurs.montant).toBe(new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(-6.31));
  });

  it("une transaction en attente porte son état", () => {
    expect(valeursDetail({ ...DETAIL, etat: "EN_ATTENTE" }).etat).toBe("En attente");
  });

  it("lot d'import sans plage ni libellé", () => {
    const lotImport = { id: "l1", importeLeDate: "2026-09-02", libelle: null, couvreDu: null, couvreAu: null };
    expect(valeursDetail({ ...DETAIL, lotImport }).lotImport).toBe("Importé le 2026-09-02");
    expect(valeursDetail({ ...DETAIL, lotImport: { ...lotImport, couvreDu: "2026-08-01" } }).lotImport).toBe("Importé le 2026-09-02");
  });

  it("virement dont la contrepartie est connue", () => {
    const valeurs = valeursDetail({
      ...DETAIL,
      contrepartie: { transactionId: "t2", compteId: "a2", compteNom: "Visa", date: "2026-09-08", montantCents: 5000, description: "PAIEMENT RECU" },
    });
    expect(valeurs.virement).toBe(
      `Visa · 2026-09-08 · ${new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(50)}`,
    );
  });

  it("ventilation complète : « 1 ligne » et « N lignes » sans mention d'affichage partielle", () => {
    const fille = { id: "f", montantCents: -100, subcategoryId: null, sousCategorieNom: null, categorieNom: null, note: null, etiquettes: [] };
    expect(valeursDetail({ ...DETAIL, estVentilee: true, lignesVentilation: [fille], nbLignesVentilation: 1 }).ventilation).toBe("1 ligne");
    expect(
      valeursDetail({ ...DETAIL, estVentilee: true, lignesVentilation: [fille, { ...fille, id: "g" }], nbLignesVentilation: 2 }).ventilation,
    ).toBe("2 lignes");
  });

  it("LIBELLES_CHAMP_DETAIL couvre chaque champ", () => {
    const champs = Object.keys(valeursDetail(DETAIL)) as ChampDetail[];
    expect(Object.keys(LIBELLES_CHAMP_DETAIL).sort()).toEqual([...champs].sort());
    expect(LIBELLES_CHAMP_DETAIL.etat).toBe("État");
    expect(LIBELLES_CHAMP_DETAIL.externalId).toBe("Identifiant externe");
    expect(LIBELLES_CHAMP_DETAIL.empreinte).toBe("Empreinte");
    expect(LIBELLES_CHAMP_DETAIL.recurrence).toBe("Liaison");
    expect("rapprochement" in LIBELLES_CHAMP_DETAIL).toBe(false);
  });

  const LIEE = {
    occurrenceId: "o1",
    ruleId: "r1",
    libelle: "Netflix.com",
    echeance: "2026-08-12",
    liaison: "RETROACTIVE",
    lieeLe: "2026-10-14",
  } as const;

  it("une transaction liée affiche la phrase de liaison", () => {
    expect(valeursDetail({ ...DETAIL, recurrence: LIEE }).recurrence).toBe(phraseLiaison(LIEE));
  });

  it("messageRefusSuppression : le message de la récurrence quand il y en a une, sinon celui du motif", () => {
    expect(messageRefusSuppression({ ...DETAIL, recurrence: LIEE }, "SUPPRESSION_LIEE")).toBe(
      messageSuppressionLieeDetail("Netflix.com", "2026-08-12"),
    );
    expect(messageRefusSuppression(DETAIL, "SUPPRESSION_LIEE")).toBe(messageRefus("SUPPRESSION_LIEE"));
  });
});

// ── écritures — docs/lot-m2.md §6

function ignorees(partiel: Partial<CompteIgnorees>): CompteIgnorees {
  return { ...IGNOREES_VIDES, ...partiel };
}

function compteRendu(partiel: Partial<CompteRenduMasse>): CompteRenduMasse {
  return {
    geste: "SOUS_CATEGORIE",
    traitees: 0,
    inchangees: 0,
    ignorees: IGNOREES_VIDES,
    lignesVentilationSupprimees: 0,
    contrepartiesSupprimees: 0,
    contrepartiesDeliees: 0,
    ...partiel,
  };
}

function apercuSuppression(
  partiel: Pick<ApercuSuppression, "aSupprimer" | "parentsVentiles" | "lignesVentilation" | "ignorees">,
): ApercuSuppression {
  return { cotesVirement: 0, contrepartiesSupprimees: 0, contrepartiesDeliees: 0, ...partiel };
}

describe("libelleRaisonsIgnorees", () => {
  it("aucune, une, deux, cinq", () => {
    expect(libelleRaisonsIgnorees(IGNOREES_VIDES)).toBe("");
    expect(libelleRaisonsIgnorees(ignorees({ VIREMENT: 2 }))).toBe("virements");
    expect(libelleRaisonsIgnorees(ignorees({ VIREMENT: 1, VENTILEE: 3 }))).toBe("virements ou ventilées");
    expect(libelleRaisonsIgnorees(ignorees({ VIREMENT: 1, VENTILEE: 1, LIGNE_FILLE: 1, LIEE: 1, INTROUVABLE: 1 }))).toBe(
      "virements, ventilées, lignes de ventilation, rattachées à une échéance, une cotisation ou un objectif ou introuvables",
    );
  });
});

describe("libelleCompteRendu", () => {
  it.each([
    [compteRendu({ traitees: 47, ignorees: ignorees({ VIREMENT: 2, VENTILEE: 1 }) }), "47 modifiées, 3 ignorées : virements ou ventilées"],
    [compteRendu({ geste: "A_REVOIR", traitees: 1 }), "1 modifiée"],
    [compteRendu({ geste: "ETIQUETTES", traitees: 0, inchangees: 2 }), "0 modifiée, 2 inchangées"],
    [
      compteRendu({ geste: "SUPPRIMER", traitees: 2, lignesVentilationSupprimees: 3, ignorees: ignorees({ VIREMENT: 1 }) }),
      "2 supprimées (avec 3 lignes de ventilation), 1 ignorée : virements",
    ],
    [
      compteRendu({ traitees: 5, ignorees: ignorees({ VIREMENT: 1, VENTILEE: 1, INTROUVABLE: 1 }) }),
      "5 modifiées, 3 ignorées : virements, ventilées ou introuvables",
    ],
  ])("%j", (entree, attendu) => {
    expect(libelleCompteRendu(entree)).toBe(attendu);
  });
});

describe("libelleApercuSuppression", () => {
  it.each([
    [
      { aSupprimer: 3, parentsVentiles: 1, lignesVentilation: 3, ignorees: ignorees({ VIREMENT: 1 }) },
      "3 transactions seront supprimées, dont 1 ventilée (ses 3 lignes partent avec elle). 1 transaction sera ignorée : virements. Cette action est définitive.",
    ],
    [
      { aSupprimer: 2, parentsVentiles: 0, lignesVentilation: 0, ignorees: IGNOREES_VIDES },
      "2 transactions seront supprimées. Cette action est définitive.",
    ],
    [
      { aSupprimer: 0, parentsVentiles: 0, lignesVentilation: 0, ignorees: ignorees({ VIREMENT: 84 }) },
      "Aucune transaction de la sélection ne peut être supprimée. 84 transactions seront ignorées : virements.",
    ],
    [
      { aSupprimer: 1, parentsVentiles: 1, lignesVentilation: 1, ignorees: IGNOREES_VIDES },
      "1 transaction sera supprimée, dont 1 ventilée (sa ligne part avec elle). Cette action est définitive.",
    ],
    [
      { aSupprimer: 4, parentsVentiles: 2, lignesVentilation: 5, ignorees: IGNOREES_VIDES },
      "4 transactions seront supprimées, dont 2 ventilées (leurs 5 lignes partent avec elles). Cette action est définitive.",
    ],
  ])("%j", (entree, attendu) => {
    expect(libelleApercuSuppression(apercuSuppression(entree))).toBe(attendu);
  });
});

describe("libelleSuppressionUnique", () => {
  it("une ordinaire et une ventilée à 3 lignes", () => {
    const montant = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(-6.31);
    expect(libelleSuppressionUnique(DETAIL)).toBe(
      `La transaction « CAFE DEPOT » du 2026-09-01 (${montant}) sera supprimée. Cette action est définitive.`,
    );
    expect(libelleSuppressionUnique({ ...DETAIL, estVentilee: true, nbLignesVentilation: 3 })).toBe(
      `La transaction « CAFE DEPOT » du 2026-09-01 (${montant}) sera supprimée. Ses 3 lignes de ventilation partent avec elle. Cette action est définitive.`,
    );
  });
});

describe("libellés de virement (docs/lot-m2.md §4.4 et §5.3)", () => {
  const CONTREPARTIE: NonNullable<DetailTransaction["contrepartie"]> = {
    transactionId: "t2",
    compteId: "a2",
    compteNom: "Épargne",
    date: "2026-09-03",
    montantCents: 631,
    description: "Virement depuis Chèque",
  };
  const COTE: DetailTransaction = { ...DETAIL, sousCategorieNom: null, subcategoryId: null, contrepartie: CONTREPARTIE };
  const candidat = (surcharge: Partial<CandidatVirement> = {}): CandidatVirement => ({
    id: "c1",
    accountId: "a2",
    date: "2026-09-03",
    montantCents: 631,
    parentId: null,
    estVentilee: false,
    transferTransactionId: null,
    compteNom: "Épargne",
    description: "x",
    sousCategorieNom: null,
    ...surcharge,
  });
  const $ = (cents: number): string => formatMontant(cents, "CENTS");

  it("PR-V1 — aperçu : côtés de virement, contreparties supprimées et déliées, singulier et pluriel", () => {
    const base = { aSupprimer: 2, parentsVentiles: 0, lignesVentilation: 0, ignorees: IGNOREES_VIDES };
    expect(libelleApercuSuppression({ ...apercuSuppression(base), cotesVirement: 1, contrepartiesSupprimees: 1 })).toBe(
      "2 transactions seront supprimées, dont 1 côté de virement. 1 autre côté de virement sera aussi supprimé. Cette action est définitive.",
    );
    expect(libelleApercuSuppression({ ...apercuSuppression(base), cotesVirement: 2, contrepartiesSupprimees: 2 })).toBe(
      "2 transactions seront supprimées, dont 2 côtés de virement. 2 autres côtés de virement seront aussi supprimés. Cette action est définitive.",
    );
    expect(libelleApercuSuppression({ ...apercuSuppression(base), cotesVirement: 1, contrepartiesDeliees: 1 })).toBe(
      "2 transactions seront supprimées, dont 1 côté de virement. 1 autre côté de virement sera délié. Cette action est définitive.",
    );
    expect(libelleApercuSuppression({ ...apercuSuppression(base), cotesVirement: 3, contrepartiesDeliees: 3 })).toBe(
      "2 transactions seront supprimées, dont 3 côtés de virement. 3 autres côtés de virement seront déliés. Cette action est définitive.",
    );
  });

  it("PR-V1 — aperçu : le virement ne dit rien quand aucun côté n'est écrit", () => {
    expect(libelleApercuSuppression(apercuSuppression({ aSupprimer: 2, parentsVentiles: 0, lignesVentilation: 0, ignorees: IGNOREES_VIDES }))).not.toMatch(
      /virement/,
    );
  });

  it("PR-V1 — aperçu : les ignorées (virements) restent dites après les contreparties", () => {
    const texte = libelleApercuSuppression({
      aSupprimer: 1,
      parentsVentiles: 0,
      lignesVentilation: 0,
      ignorees: ignorees({ CONTREPARTIE_LIEE: 1 }),
      cotesVirement: 1,
      contrepartiesSupprimees: 1,
      contrepartiesDeliees: 0,
    });
    expect(texte).toBe(
      "1 transaction sera supprimée, dont 1 côté de virement. 1 autre côté de virement sera aussi supprimé. 1 transaction sera ignorée : virements dont l'autre côté est rattaché à une échéance, une cotisation ou un objectif. Cette action est définitive.",
    );
  });

  it("PR-V2 — compte rendu : contreparties supprimées et déliées, singulier et pluriel", () => {
    expect(libelleCompteRendu(compteRendu({ geste: "SUPPRIMER", traitees: 2, contrepartiesSupprimees: 1 }))).toBe(
      "2 supprimées (et 1 autre côté de virement supprimé)",
    );
    expect(libelleCompteRendu(compteRendu({ geste: "SUPPRIMER", traitees: 4, contrepartiesSupprimees: 3 }))).toBe(
      "4 supprimées (et 3 autres côtés de virement supprimés)",
    );
    expect(libelleCompteRendu(compteRendu({ geste: "SUPPRIMER", traitees: 1, contrepartiesDeliees: 1 }))).toBe(
      "1 supprimée (1 autre côté de virement délié)",
    );
    expect(libelleCompteRendu(compteRendu({ geste: "SUPPRIMER", traitees: 3, contrepartiesDeliees: 2 }))).toBe(
      "3 supprimées (2 autres côtés de virement déliés)",
    );
  });

  it("PR-V2 — LIBELLES_RAISON_IGNOREE.CONTREPARTIE_LIEE", () => {
    expect(libelleRaisonsIgnorees(ignorees({ CONTREPARTIE_LIEE: 1 }))).toBe(
      "virements dont l'autre côté est rattaché à une échéance, une cotisation ou un objectif",
    );
  });

  it("PR-V3 — libelleLiaison : deux côtés catégorisés, dans l'ordre détail puis candidat", () => {
    expect(libelleLiaison(DETAIL, candidat({ sousCategorieNom: "Épicerie" }))).toEqual([
      "La sous-catégorie « Café » de la ligne du 2026-09-01 (Chèque) sera retirée.",
      "La sous-catégorie « Épicerie » de la ligne du 2026-09-03 (Épargne) sera retirée.",
    ]);
  });

  it("PR-V3 — libelleLiaison : un seul côté, ou aucun", () => {
    expect(libelleLiaison(DETAIL, candidat())).toEqual(["La sous-catégorie « Café » de la ligne du 2026-09-01 (Chèque) sera retirée."]);
    expect(libelleLiaison(COTE, candidat({ sousCategorieNom: "Épicerie" }))).toEqual([
      "La sous-catégorie « Épicerie » de la ligne du 2026-09-03 (Épargne) sera retirée.",
    ]);
    expect(libelleLiaison(COTE, candidat())).toEqual(["Aucune sous-catégorie à retirer."]);
  });

  it("PR-V4 — libelleContrepartie : opposé du montant, description selon le sens, sous-catégorie retirée", () => {
    expect(libelleContrepartie(COTE, "Épargne", "Chèque")).toBe(
      `Une transaction de ${$(631)} sera créée sur Épargne le 2026-09-01, décrite « Virement depuis Chèque », puis liée à celle-ci.`,
    );
    expect(libelleContrepartie({ ...DETAIL, montantCents: 5000 }, "Visa", "Chèque")).toBe(
      `Une transaction de ${$(-5000)} sera créée sur Visa le 2026-09-01, décrite « Virement vers Chèque », puis liée à celle-ci. La sous-catégorie « Café » de cette transaction sera retirée.`,
    );
  });

  it("PR-V4 — libelleDeliaison", () => {
    expect(libelleDeliaison(COTE)).toBe(
      `Le virement entre « CAFE DEPOT » (Chèque, 2026-09-01, ${$(-631)}) et sa contrepartie (Épargne, 2026-09-03, ${$(631)}) sera délié. Les deux lignes redeviendront des transactions ordinaires, sans sous-catégorie.`,
    );
  });

  it("PR-V4 — libelleDeliaison dit l'inconnu quand la contrepartie manque, sans fuite ni exception", () => {
    const texte = libelleDeliaison({ ...COTE, contrepartie: null });
    expect(texte).toContain("sa contrepartie (compte inconnu, date inconnue, montant inconnu)");
  });

  it("PR-V4 — libelleSuppressionVirement, les deux options", () => {
    expect(libelleSuppressionVirement(COTE, "SUPPRIMER_LES_DEUX")).toBe(
      "Les deux côtés du virement seront supprimés : « CAFE DEPOT » (Chèque) et sa contrepartie sur Épargne. Cette action est définitive.",
    );
    expect(libelleSuppressionVirement(COTE, "DELIER_L_AUTRE")).toBe(
      "« CAFE DEPOT » (Chèque) sera supprimée ; sa contrepartie sur Épargne restera, déliée et sans sous-catégorie. Cette action est définitive.",
    );
  });

  it("PR-V4 — libelleRetourSuppression", () => {
    expect(libelleRetourSuppression(null)).toBe("Transaction supprimée.");
    expect(libelleRetourSuppression("SUPPRIMEE")).toBe("Les deux côtés du virement ont été supprimés.");
    expect(libelleRetourSuppression("DELIEE")).toBe("Transaction supprimée ; l'autre côté du virement est délié.");
  });
});

describe("libelleSelection", () => {
  it("les trois modes, au singulier et au pluriel", () => {
    expect(libelleSelection(SELECTION_VIDE, null)).toBe("Aucune transaction sélectionnée");
    expect(libelleSelection({ mode: "IDS", ids: new Set(["a"]) }, null)).toBe("1 transaction sélectionnée");
    expect(libelleSelection({ mode: "IDS", ids: new Set(["a", "b"]) }, null)).toBe("2 transactions sélectionnées");
    expect(libelleSelection({ mode: "FILTRE" }, 1)).toBe("Tout le résultat : 1 transaction sélectionnée");
    expect(libelleSelection({ mode: "FILTRE" }, 214)).toBe("Tout le résultat : 214 transactions sélectionnées");
  });
});

describe("optionsSousCategories", () => {
  function categorie(id: string, nom: string, sous: readonly { id: string; masquee: boolean }[]): CategorieListe {
    return {
      id,
      nom,
      ordre: 0,
      couleur: null,
      icone: null,
      masquee: false,
      modeBudget: "PAR_SOUS_CATEGORIE",
      nbAllocations: 0,
      sousCategories: sous.map((s) => ({
        id: s.id,
        categoryId: id,
        nom: `Sous ${s.id}`,
        ordre: 0,
        masquee: s.masquee,
        systeme: false,
        reportActif: false,
        reportMode: "AUCUN",
        nbTransactions: 0,
        nbAllocations: 0,
        nbActionsRegles: 0,
        nbMouvements: 0,
        nbBeneficiaires: 0,
        nbRecurrences: 0,
        nbEvenements: 0,
        aCible: false,
        aPrevision: false,
      })),
    };
  }
  const categories = [
    categorie("c1", "Sorties", [{ id: "s1", masquee: false }, { id: "s2", masquee: true }]),
    categorie("c2", "Vieux", [{ id: "s3", masquee: true }]),
  ];

  it("omet une sous-catégorie masquée et une catégorie sans option", () => {
    const groupes = optionsSousCategories(categories, null);
    expect(groupes.map((g) => g.titre)).toEqual(["Sorties"]);
    expect(groupes[0]?.options.map((o) => o.id)).toEqual(["s1"]);
  });

  it("garde la sous-catégorie masquée quand c'est l'idCourant", () => {
    const groupes = optionsSousCategories(categories, "s3");
    expect(groupes.map((g) => g.titre)).toEqual(["Sorties", "Vieux"]);
    expect(optionsSousCategories(categories, "s2")[0]?.options.map((o) => o.id)).toEqual(["s1", "s2"]);
  });
});

describe("libelleParametreIgnore", () => {
  it("PI1 : nomme le montant minimum et dit quoi faire", () => {
    expect(
      libelleParametreIgnore({
        parametre: "montantMin",
        valeur: "abc",
        motif: "Montant illisible : l'adresse attend un nombre de cents, sans virgule ni espace (1250 pour 12,50).",
      }),
    ).toBe(
      "Montant minimum : « abc » ignoré. Montant illisible : l'adresse attend un nombre de cents, sans virgule ni espace (1250 pour 12,50).",
    );
  });

  it("PI2 : À revoir", () => {
    expect(libelleParametreIgnore({ parametre: "aRevoir", valeur: "oui", motif: "Valeur attendue : 1." })).toBe(
      "À revoir : « oui » ignoré. Valeur attendue : 1.",
    );
  });

  it("PI3 : Recherche", () => {
    expect(libelleParametreIgnore({ parametre: "texte", valeur: "a,b", motif: "Paramètre répété." })).toBe(
      "Recherche : « a,b » ignoré. Paramètre répété.",
    );
  });

  it("PI4 : clé inconnue, repli sur la clé brute", () => {
    expect(libelleParametreIgnore({ parametre: "foo", valeur: "bar", motif: "M." })).toBe("foo : « bar » ignoré. M.");
  });

  it("PI5 : la table couvre les 19 clés et tout signalement de lireEtatUrl", () => {
    expect(Object.keys(LIBELLES_PARAMETRE_URL).sort()).toEqual(
      [
        "du", "au", "toutesDates", "texte", "compte", "sousCategorie", "beneficiaire", "etiquette", "montantMin",
        "montantMax", "sens", "aRevoir", "virements", "recurrences", "ventilees", "exclueBudget", "exclueRapports", "tri", "ordre",
      ].sort(),
    );
    const cas: ParametresRecherche[] = [
      { montantMin: "12,50" },
      { aRevoir: "oui" },
      { sens: "x" },
      { tri: "nom" },
      { ordre: "haut" },
      { texte: ["a", "b"] },
      { du: "2026-02-30" },
      { compte: "pas-un-cuid" },
      { montantMax: "x" },
      { ventilees: "2" },
      { exclueBudget: "2" },
      { exclueRapports: "2" },
      { virements: "x" },
      { recurrences: "x" },
      { au: "2026-02-30" },
      { toutesDates: "2" },
      { etiquette: "x" },
      { beneficiaire: "x" },
      { sousCategorie: "x" },
    ];
    for (const parametres of cas) {
      const { ignores } = lireEtatUrl(parametres);
      expect(ignores.length).toBeGreaterThan(0);
      for (const ignore of ignores) {
        expect(Object.keys(LIBELLES_PARAMETRE_URL)).toContain(ignore.parametre);
      }
    }
  });
});
