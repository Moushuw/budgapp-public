import { describe, expect, it } from "vitest";
import {
  AUCUN_REFUS,
  contrepartieEligibilite,
  refusDelierVirement,
  refusLierVirement,
  messageRefus,
  raisonIgnoree,
  refusDate,
  refusEcriture,
  refusGesteMasse,
  refusModification,
  refusMontant,
  refusSousCategorie,
  refusSuppression,
  refusDeventilation,
  refusVentilation,
} from "./eligibilite";
import type {
  ContrepartieEligibilite,
  GesteMasse,
  LigneEligibilite,
  LigneMasse,
  MotifRefus,
  MotifRefusMasse,
} from "./types";
import type { SourceIngestion } from "../referentiel";
import { messageErreurVentilation } from "../ventilation";

function ligne(partiel: Partial<LigneEligibilite> = {}): LigneEligibilite {
  return {
    source: "MANUELLE",
    parentId: null,
    estVentilee: false,
    transferTransactionId: null,
    estLiee: false,
    filleLiee: false,
    porteCotisation: false,
    montantCents: 1000,
    ...partiel,
  };
}

const AUCUNE: ContrepartieEligibilite = { etat: "AUCUNE" };
const INTROUVABLE: ContrepartieEligibilite = { etat: "INTROUVABLE" };
function trouvee(source: SourceIngestion, porteCotisation = false): ContrepartieEligibilite {
  return { etat: "TROUVEE", source, porteCotisation, estLiee: false };
}

/** Une ligne de masse : la ligne d'éligibilité, avec le reste que le geste ne lit pas. */
function enMasse(l: LigneEligibilite, contrepartie: ContrepartieEligibilite = AUCUNE): LigneMasse {
  return {
    ...l,
    id: "id",
    subcategoryId: null,
    payeeId: null,
    tagIds: [],
    aRevoir: false,
    exclureDuBudget: false,
    exclureDesRapports: false,
    nbLignesVentilation: 0,
    contrepartie,
  };
}

const SOURCES_IMPORTEES: readonly SourceIngestion[] = ["COPIER_COLLER", "FICHIER", "AGREGATEUR", "AJUSTEMENT"];

describe("refusDate", () => {
  it.each(SOURCES_IMPORTEES)("refuse la date d'une source %s", (source) => {
    expect(refusDate(ligne({ source }))).toBe("DATE_HORS_MANUELLE");
  });
  it("permet la date d'une transaction MANUELLE", () => {
    expect(refusDate(ligne())).toBeNull();
  });
  it("refuse une fille, même MANUELLE", () => {
    expect(refusDate(ligne({ parentId: "p" }))).toBe("LIGNE_FILLE");
  });
});

describe("refusMontant", () => {
  it("refuse une importée, y compris un côté de virement (passe avant la contrepartie)", () => {
    expect(refusMontant(ligne({ source: "COPIER_COLLER" }), AUCUNE)).toBe("MONTANT_HORS_MANUELLE");
    expect(refusMontant(ligne({ source: "COPIER_COLLER", transferTransactionId: "v" }), INTROUVABLE)).toBe(
      "MONTANT_HORS_MANUELLE",
    );
  });
  it("permet une MANUELLE simple", () => {
    expect(refusMontant(ligne(), AUCUNE)).toBeNull();
  });
  it("refuse un parent ventilé", () => {
    expect(refusMontant(ligne({ estVentilee: true }), AUCUNE)).toBe("MONTANT_PARENT_VENTILE");
  });
  it("refuse une transaction qui porte une cotisation", () => {
    expect(refusMontant(ligne({ porteCotisation: true }), AUCUNE)).toBe("MONTANT_COTISATION");
  });
  it("permet un virement MANUELLE dont la contrepartie l'est aussi", () => {
    expect(refusMontant(ligne({ transferTransactionId: "v" }), trouvee("MANUELLE"))).toBeNull();
  });
  it("refuse quand la contrepartie vient d'un relevé", () => {
    expect(refusMontant(ligne({ transferTransactionId: "v" }), trouvee("COPIER_COLLER"))).toBe(
      "MONTANT_CONTREPARTIE_HORS_MANUELLE",
    );
  });
  it("refuse quand la contrepartie est introuvable", () => {
    expect(refusMontant(ligne({ transferTransactionId: "v" }), INTROUVABLE)).toBe("MONTANT_CONTREPARTIE_INTROUVABLE");
  });
  it("refuse quand la contrepartie porte une cotisation", () => {
    expect(refusMontant(ligne({ transferTransactionId: "v" }), trouvee("MANUELLE", true))).toBe("MONTANT_COTISATION");
  });
  it("refuse une fille", () => {
    expect(refusMontant(ligne({ parentId: "p" }), AUCUNE)).toBe("LIGNE_FILLE");
  });
});

describe("refusSousCategorie", () => {
  it("permet une importée ordinaire", () => {
    expect(refusSousCategorie(ligne({ source: "COPIER_COLLER" }))).toBeNull();
  });
  it("refuse un virement", () => {
    expect(refusSousCategorie(ligne({ transferTransactionId: "v" }))).toBe("SOUS_CATEGORIE_VIREMENT");
  });
  it("refuse un parent ventilé", () => {
    expect(refusSousCategorie(ligne({ estVentilee: true }))).toBe("SOUS_CATEGORIE_PARENT_VENTILE");
  });
  it("refuse une fille", () => {
    expect(refusSousCategorie(ligne({ parentId: "p" }))).toBe("LIGNE_FILLE");
  });
});

describe("refusSuppression", () => {
  it("permet une ordinaire et un parent ventilé", () => {
    expect(refusSuppression(ligne(), AUCUNE, null)).toBeNull();
    expect(refusSuppression(ligne({ estVentilee: true }), AUCUNE, null)).toBeNull();
  });
  it("refuse un virement sans choix", () => {
    expect(refusSuppression(ligne({ transferTransactionId: "v" }), INTROUVABLE, null)).toBe("SUPPRESSION_VIREMENT");
  });
  it("refuse une liée", () => {
    expect(refusSuppression(ligne({ estLiee: true }), AUCUNE, null)).toBe("SUPPRESSION_LIEE");
  });
  it("donne le motif du lien avant celui du virement", () => {
    expect(refusSuppression(ligne({ transferTransactionId: "v", estLiee: true }), INTROUVABLE, null)).toBe(
      "SUPPRESSION_LIEE",
    );
  });
  it("refuse une fille", () => {
    expect(refusSuppression(ligne({ parentId: "p" }), AUCUNE, null)).toBe("LIGNE_FILLE");
  });
});

describe("refusModification", () => {
  const sans = { date: false, montant: false, sousCategoriePosee: false, autres: false };
  it("ne refuse rien quand rien ne change, même sur une fille", () => {
    expect(refusModification(ligne({ parentId: "p" }), AUCUNE, sans)).toBeNull();
  });
  it("refuse tout changement sur une fille", () => {
    expect(refusModification(ligne({ parentId: "p" }), AUCUNE, { ...sans, autres: true })).toBe("LIGNE_FILLE");
  });
  it("permet un changement ordinaire sur une importée", () => {
    expect(refusModification(ligne({ source: "COPIER_COLLER" }), AUCUNE, { ...sans, autres: true })).toBeNull();
  });
  it("refuse la date d'une importée", () => {
    expect(refusModification(ligne({ source: "COPIER_COLLER" }), AUCUNE, { ...sans, date: true })).toBe(
      "DATE_HORS_MANUELLE",
    );
  });
  it("respecte l'ordre : la date avant la sous-catégorie", () => {
    expect(
      refusModification(ligne({ source: "COPIER_COLLER", transferTransactionId: "v" }), AUCUNE, {
        ...sans,
        date: true,
        sousCategoriePosee: true,
      }),
    ).toBe("DATE_HORS_MANUELLE");
  });
  it("permet le retrait d'une sous-catégorie sur un virement", () => {
    expect(refusModification(ligne({ transferTransactionId: "v" }), AUCUNE, { ...sans, autres: true })).toBeNull();
  });
  it("refuse la pose d'une sous-catégorie sur un virement", () => {
    expect(refusModification(ligne({ transferTransactionId: "v" }), AUCUNE, { ...sans, sousCategoriePosee: true })).toBe(
      "SOUS_CATEGORIE_VIREMENT",
    );
  });
  it("refuse le montant quand la contrepartie vient d'un relevé", () => {
    expect(
      refusModification(ligne({ transferTransactionId: "v" }), trouvee("COPIER_COLLER"), { ...sans, montant: true }),
    ).toBe("MONTANT_CONTREPARTIE_HORS_MANUELLE");
  });
});

describe("refusEcriture", () => {
  it("décrit une importée ordinaire", () => {
    expect(refusEcriture(ligne({ source: "COPIER_COLLER" }), AUCUNE)).toEqual({
      modification: null,
      date: "DATE_HORS_MANUELLE",
      montant: "MONTANT_HORS_MANUELLE",
      sousCategorie: null,
      suppression: null,
      suppressionLesDeux: null,
      suppressionDelier: null,
      ventilation: null,
      deventilation: "NON_VENTILEE",
      lierVirement: null,
      delierVirement: "NON_VIREMENT",
    });
  });
  it("refuse tout sur une fille", () => {
    expect(refusEcriture(ligne({ parentId: "p" }), AUCUNE)).toEqual({
      modification: "LIGNE_FILLE",
      date: "LIGNE_FILLE",
      montant: "LIGNE_FILLE",
      sousCategorie: "LIGNE_FILLE",
      suppression: "LIGNE_FILLE",
      suppressionLesDeux: null,
      suppressionDelier: null,
      ventilation: "LIGNE_FILLE",
      deventilation: "LIGNE_FILLE",
      lierVirement: "LIGNE_FILLE",
      delierVirement: "NON_VIREMENT",
    });
  });
  it("AUCUN_REFUS a onze champs à null", () => {
    expect(AUCUN_REFUS).toEqual({
      modification: null,
      date: null,
      montant: null,
      sousCategorie: null,
      suppression: null,
      suppressionLesDeux: null,
      suppressionDelier: null,
      ventilation: null,
      deventilation: null,
      lierVirement: null,
      delierVirement: null,
    });
  });
});

describe("refusGesteMasse", () => {
  const ordinaire = ligne({ source: "COPIER_COLLER" });
  const virement = ligne({ transferTransactionId: "v" });
  const ventilee = ligne({ estVentilee: true });
  const fille = ligne({ parentId: "p" });
  const liee = ligne({ estLiee: true });
  const gestes: readonly GesteMasse[] = [
    { type: "SOUS_CATEGORIE", subcategoryId: "s" },
    { type: "BENEFICIAIRE", payeeId: "p" },
    { type: "ETIQUETTES", ajouter: ["t"], retirer: [] },
    { type: "A_REVOIR", valeur: true },
    { type: "EXCLURE_BUDGET", valeur: true },
    { type: "EXCLURE_RAPPORTS", valeur: true },
    { type: "SUPPRIMER", virements: null },
  ];

  it.each(gestes)("$type : le motif attendu pour chaque forme de ligne", (geste) => {
    const attendu = (autre: MotifRefusMasse | null): (MotifRefusMasse | null)[] => [null, autre, null, "LIGNE_FILLE", null];
    let motifs: (MotifRefusMasse | null)[];
    if (geste.type === "SOUS_CATEGORIE") {
      motifs = [null, "SOUS_CATEGORIE_VIREMENT", "SOUS_CATEGORIE_PARENT_VENTILE", "LIGNE_FILLE", null];
    } else if (geste.type === "SUPPRIMER") {
      motifs = [null, "SUPPRESSION_VIREMENT", null, "LIGNE_FILLE", "SUPPRESSION_LIEE"];
    } else {
      motifs = attendu(null);
    }
    const obtenus = [ordinaire, virement, ventilee, fille, liee].map((l) => refusGesteMasse(enMasse(l, INTROUVABLE), geste));
    expect(obtenus).toEqual(motifs);
  });

  it("le bénéficiaire passe sur un virement et sur une ventilée", () => {
    const geste: GesteMasse = { type: "BENEFICIAIRE", payeeId: "p" };
    expect(refusGesteMasse(enMasse(virement, INTROUVABLE), geste)).toBeNull();
    expect(refusGesteMasse(enMasse(ventilee), geste)).toBeNull();
  });
});

describe("raisonIgnoree", () => {
  it("range les cinq motifs de masse", () => {
    expect(raisonIgnoree("SOUS_CATEGORIE_VIREMENT")).toBe("VIREMENT");
    expect(raisonIgnoree("SUPPRESSION_VIREMENT")).toBe("VIREMENT");
    expect(raisonIgnoree("SOUS_CATEGORIE_PARENT_VENTILE")).toBe("VENTILEE");
    expect(raisonIgnoree("LIGNE_FILLE")).toBe("LIGNE_FILLE");
    expect(raisonIgnoree("SUPPRESSION_LIEE")).toBe("LIEE");
  });
  it("EL4 — une fille liée est rangée avec les liées", () => {
    expect(raisonIgnoree("SUPPRESSION_FILLE_LIEE")).toBe("LIEE");
    expect(refusGesteMasse(enMasse(ligne({ estVentilee: true, filleLiee: true })), { type: "SUPPRIMER", virements: null })).toBe(
      "SUPPRESSION_FILLE_LIEE",
    );
  });
});

describe("refusVentilation", () => {
  it("EL1 — ordinaire, ventilée, liée elle-même : permis", () => {
    expect(refusVentilation(ligne())).toBeNull();
    expect(refusVentilation(ligne({ estVentilee: true }))).toBeNull();
    expect(refusVentilation(ligne({ estVentilee: true, estLiee: true }))).toBeNull();
  });
  it("EL1 — virement, fille, ventilée avec fille liée", () => {
    expect(refusVentilation(ligne({ transferTransactionId: "v" }))).toBe("VENTILATION_VIREMENT");
    expect(refusVentilation(ligne({ parentId: "p" }))).toBe("LIGNE_FILLE");
    expect(refusVentilation(ligne({ estVentilee: true, filleLiee: true }))).toBe("VENTILATION_FILLE_LIEE");
  });
  it("EL1 — non ventilée avec filleLiee (incohérent) : permis", () => {
    expect(refusVentilation(ligne({ filleLiee: true }))).toBeNull();
  });
});

describe("refusVentilation — transaction de 0,00 $", () => {
  it("E-VN1 — montant nul : refusé", () => {
    expect(refusVentilation(ligne({ montantCents: 0 }))).toBe("VENTILATION_MONTANT_NUL");
  });
  it("E-VN2 — l'ordre des motifs", () => {
    expect(refusVentilation(ligne({ parentId: "p", montantCents: 0 }))).toBe("LIGNE_FILLE");
    expect(refusVentilation(ligne({ transferTransactionId: "v", montantCents: 0 }))).toBe("VENTILATION_VIREMENT");
    expect(refusVentilation(ligne({ estVentilee: true, filleLiee: true, montantCents: 0 }))).toBe("VENTILATION_FILLE_LIEE");
  });
  it("E-VN3 — limites : -1 et 1 sont permis", () => {
    expect(refusVentilation(ligne({ montantCents: -1 }))).toBeNull();
    expect(refusVentilation(ligne({ montantCents: 1 }))).toBeNull();
  });
  it("E-VN4 — coexiste avec VIREMENT_MONTANT_NUL", () => {
    const refus = refusEcriture(ligne({ montantCents: 0 }), { etat: "AUCUNE" });
    expect(refus.ventilation).toBe("VENTILATION_MONTANT_NUL");
    expect(refus.lierVirement).toBe("VIREMENT_MONTANT_NUL");
  });
  it("E-VN5 — un seul texte, celui de la validation", () => {
    expect(messageRefus("VENTILATION_MONTANT_NUL")).toBe(messageErreurVentilation({ motif: "PARENT_NUL" }));
  });
});

describe("refusDeventilation", () => {
  it("EL2 — non ventilée, ventilée, fille liée, fille", () => {
    expect(refusDeventilation(ligne())).toBe("NON_VENTILEE");
    expect(refusDeventilation(ligne({ estVentilee: true }))).toBeNull();
    expect(refusDeventilation(ligne({ estVentilee: true, filleLiee: true }))).toBe("VENTILATION_FILLE_LIEE");
    expect(refusDeventilation(ligne({ parentId: "p" }))).toBe("LIGNE_FILLE");
  });
});

describe("refusSuppression — filles liées", () => {
  it("EL3 — l'ordre des motifs", () => {
    expect(refusSuppression(ligne({ estVentilee: true, filleLiee: true }), AUCUNE, null)).toBe("SUPPRESSION_FILLE_LIEE");
    expect(refusSuppression(ligne({ estLiee: true, filleLiee: true }), AUCUNE, null)).toBe("SUPPRESSION_LIEE");
    expect(refusSuppression(ligne({ transferTransactionId: "v", filleLiee: true }), INTROUVABLE, null)).toBe(
      "SUPPRESSION_FILLE_LIEE",
    );
  });
});

function trouveeAvec(partiel: { porteCotisation?: boolean; estLiee?: boolean } = {}): ContrepartieEligibilite {
  return { etat: "TROUVEE", source: "MANUELLE", porteCotisation: false, estLiee: false, ...partiel };
}

describe("contrepartieEligibilite (M2-T5)", () => {
  const faits = { ownerId: "moi", source: "MANUELLE" as const, porteCotisation: true, estLiee: true };

  it("EL1 — pas de pointeur : AUCUNE, même si des faits sont fournis", () => {
    expect(contrepartieEligibilite(null, "moi", null)).toEqual({ etat: "AUCUNE" });
    expect(contrepartieEligibilite(null, "moi", faits)).toEqual({ etat: "AUCUNE" });
  });
  it("EL1 — pointeur dans le vide : INTROUVABLE", () => {
    expect(contrepartieEligibilite("x", "moi", null)).toEqual({ etat: "INTROUVABLE" });
  });
  it("EL1 — contrepartie d'un autre propriétaire : INTROUVABLE", () => {
    expect(contrepartieEligibilite("x", "moi", { ...faits, ownerId: "autre" })).toEqual({ etat: "INTROUVABLE" });
  });
  it("EL1 — même propriétaire : TROUVEE avec ses trois faits", () => {
    expect(contrepartieEligibilite("x", "moi", { ...faits, source: "COPIER_COLLER" })).toEqual({
      etat: "TROUVEE",
      source: "COPIER_COLLER",
      porteCotisation: true,
      estLiee: true,
    });
  });
});

describe("refusSuppression — virements (M2-T5)", () => {
  const cote = ligne({ transferTransactionId: "v" });

  it("EL2 — côté de virement sans choix : SUPPRESSION_VIREMENT", () => {
    expect(refusSuppression(cote, trouveeAvec(), null)).toBe("SUPPRESSION_VIREMENT");
  });
  it("EL2 — SUPPRIMER_LES_DEUX avec une contrepartie ordinaire : permis", () => {
    expect(refusSuppression(cote, trouveeAvec(), "SUPPRIMER_LES_DEUX")).toBeNull();
  });
  it("EL2 — SUPPRIMER_LES_DEUX avec une contrepartie liée : SUPPRESSION_CONTREPARTIE_LIEE", () => {
    expect(refusSuppression(cote, trouveeAvec({ estLiee: true }), "SUPPRIMER_LES_DEUX")).toBe(
      "SUPPRESSION_CONTREPARTIE_LIEE",
    );
  });
  it("EL2 — DELIER_L_AUTRE avec une contrepartie liée (occurrence) : permis", () => {
    expect(refusSuppression(cote, trouveeAvec({ estLiee: true }), "DELIER_L_AUTRE")).toBeNull();
  });
  it("EL2 — DELIER_L_AUTRE avec une contrepartie qui porte une cotisation : VIREMENT_COTISATION", () => {
    expect(refusSuppression(cote, trouveeAvec({ porteCotisation: true }), "DELIER_L_AUTRE")).toBe("VIREMENT_COTISATION");
  });
  it("EL2 — SUPPRIMER_LES_DEUX avec une contrepartie à cotisation non liée : permis (la cotisation ne bloque que délier)", () => {
    expect(refusSuppression(cote, trouveeAvec({ porteCotisation: true }), "SUPPRIMER_LES_DEUX")).toBeNull();
  });
  it("EL2 — contrepartie INTROUVABLE : permis quel que soit le choix", () => {
    expect(refusSuppression(cote, INTROUVABLE, "SUPPRIMER_LES_DEUX")).toBeNull();
    expect(refusSuppression(cote, INTROUVABLE, "DELIER_L_AUTRE")).toBeNull();
  });
  it("EL2 — ligne liée, côté de virement : SUPPRESSION_LIEE, avant tout motif de virement", () => {
    const liee = ligne({ transferTransactionId: "v", estLiee: true });
    for (const choix of [null, "SUPPRIMER_LES_DEUX", "DELIER_L_AUTRE"] as const) {
      expect(refusSuppression(liee, trouveeAvec({ estLiee: true, porteCotisation: true }), choix)).toBe(
        "SUPPRESSION_LIEE",
      );
    }
  });
  it("EL2 — non-virement : le choix est sans effet", () => {
    for (const choix of [null, "SUPPRIMER_LES_DEUX", "DELIER_L_AUTRE"] as const) {
      expect(refusSuppression(ligne(), AUCUNE, choix)).toBeNull();
    }
  });
});

describe("refusLierVirement (M2-T5)", () => {
  it("EL3 — nominal", () => {
    expect(refusLierVirement(ligne())).toBeNull();
  });
  it("EL3 — fille, déjà lié, ventilée, 0,00 $", () => {
    expect(refusLierVirement(ligne({ parentId: "p" }))).toBe("LIGNE_FILLE");
    expect(refusLierVirement(ligne({ transferTransactionId: "v" }))).toBe("VIREMENT_DEJA_LIE");
    expect(refusLierVirement(ligne({ estVentilee: true }))).toBe("VIREMENT_VENTILEE");
    expect(refusLierVirement(ligne({ montantCents: 0 }))).toBe("VIREMENT_MONTANT_NUL");
  });
  it("EL3 — une sortie (montant négatif) se lie", () => {
    expect(refusLierVirement(ligne({ montantCents: -2500 }))).toBeNull();
  });
  it("EL3 — priorité : fille avant déjà lié avant ventilée avant nul", () => {
    expect(refusLierVirement(ligne({ parentId: "p", transferTransactionId: "v", estVentilee: true, montantCents: 0 }))).toBe(
      "LIGNE_FILLE",
    );
    expect(refusLierVirement(ligne({ transferTransactionId: "v", estVentilee: true, montantCents: 0 }))).toBe(
      "VIREMENT_DEJA_LIE",
    );
    expect(refusLierVirement(ligne({ estVentilee: true, montantCents: 0 }))).toBe("VIREMENT_VENTILEE");
  });
});

describe("refusDelierVirement (M2-T5)", () => {
  it("EL4 — pas un virement : NON_VIREMENT", () => {
    expect(refusDelierVirement(ligne(), AUCUNE)).toBe("NON_VIREMENT");
  });
  it("EL4 — cotisation de ce côté", () => {
    expect(refusDelierVirement(ligne({ transferTransactionId: "v", porteCotisation: true }), trouveeAvec())).toBe(
      "VIREMENT_COTISATION",
    );
  });
  it("EL4 — cotisation de l'autre côté", () => {
    expect(refusDelierVirement(ligne({ transferTransactionId: "v" }), trouveeAvec({ porteCotisation: true }))).toBe(
      "VIREMENT_COTISATION",
    );
  });
  it("EL4 — nominal, y compris contrepartie introuvable", () => {
    expect(refusDelierVirement(ligne({ transferTransactionId: "v" }), trouveeAvec())).toBeNull();
    expect(refusDelierVirement(ligne({ transferTransactionId: "v" }), INTROUVABLE)).toBeNull();
  });
});

describe("refusEcriture — côté de virement (M2-T5)", () => {
  it("EL5 — ordinaire : suppressionLesDeux et suppressionDelier null, delierVirement NON_VIREMENT", () => {
    const r = refusEcriture(ligne(), AUCUNE);
    expect(r.suppressionLesDeux).toBeNull();
    expect(r.suppressionDelier).toBeNull();
    expect(r.delierVirement).toBe("NON_VIREMENT");
  });
  it("EL5 — côté de virement : suppression null, lierVirement VIREMENT_DEJA_LIE, options calculées", () => {
    const r = refusEcriture(ligne({ transferTransactionId: "v" }), trouveeAvec({ estLiee: true }));
    expect(r.suppression).toBeNull();
    expect(r.lierVirement).toBe("VIREMENT_DEJA_LIE");
    expect(r.suppressionLesDeux).toBe("SUPPRESSION_CONTREPARTIE_LIEE");
    expect(r.suppressionDelier).toBeNull();
    expect(r.delierVirement).toBeNull();
  });
  it("EL5 — côté de virement dont la contrepartie porte une cotisation : délier et supprimer-délier refusés", () => {
    const r = refusEcriture(ligne({ transferTransactionId: "v" }), trouveeAvec({ porteCotisation: true }));
    expect(r.suppressionDelier).toBe("VIREMENT_COTISATION");
    expect(r.suppressionLesDeux).toBeNull();
    expect(r.delierVirement).toBe("VIREMENT_COTISATION");
  });
  it("EL5 — côté de virement lui-même lié : suppression porte SUPPRESSION_LIEE", () => {
    const r = refusEcriture(ligne({ transferTransactionId: "v", estLiee: true }), trouveeAvec());
    expect(r.suppression).toBe("SUPPRESSION_LIEE");
    expect(r.suppressionLesDeux).toBe("SUPPRESSION_LIEE");
    expect(r.suppressionDelier).toBe("SUPPRESSION_LIEE");
  });
});

describe("raisonIgnoree — virements (M2-T5)", () => {
  it("EL6 — contrepartie liée et cotisation : CONTREPARTIE_LIEE", () => {
    expect(raisonIgnoree("SUPPRESSION_CONTREPARTIE_LIEE")).toBe("CONTREPARTIE_LIEE");
    expect(raisonIgnoree("VIREMENT_COTISATION")).toBe("CONTREPARTIE_LIEE");
  });
});

describe("refusGesteMasse — SUPPRIMER avec choix (M2-T5)", () => {
  it("lit le choix du geste et la contrepartie de la ligne", () => {
    const l = enMasse(ligne({ transferTransactionId: "v" }), trouveeAvec({ estLiee: true }));
    expect(refusGesteMasse(l, { type: "SUPPRIMER", virements: null })).toBe("SUPPRESSION_VIREMENT");
    expect(refusGesteMasse(l, { type: "SUPPRIMER", virements: "SUPPRIMER_LES_DEUX" })).toBe(
      "SUPPRESSION_CONTREPARTIE_LIEE",
    );
    expect(refusGesteMasse(l, { type: "SUPPRIMER", virements: "DELIER_L_AUTRE" })).toBeNull();
  });
});

describe("messageRefus", () => {
  const attendus: Record<MotifRefus, string> = {
    LIGNE_FILLE: "Cette ligne fait partie d'une ventilation : elle se modifie depuis la ventilation de sa transaction.",
    DATE_HORS_MANUELLE:
      "La date d'une transaction importée vient de la banque : elle ne se modifie pas. Seule une transaction saisie à la main change de date.",
    MONTANT_HORS_MANUELLE:
      "Le montant d'une transaction importée vient de la banque : il ne se modifie pas. Seule une transaction saisie à la main change de montant.",
    MONTANT_PARENT_VENTILE:
      "Cette transaction est ventilée : son montant doit rester égal à la somme de ses lignes. Modifie sa ventilation plutôt que son montant.",
    MONTANT_COTISATION: "Ce montant est aussi celui d'une cotisation enregistrée : il ne se modifie pas depuis cet écran.",
    MONTANT_CONTREPARTIE_INTROUVABLE:
      "L'autre côté de ce virement est introuvable : le montant ne peut pas changer des deux côtés à la fois.",
    MONTANT_CONTREPARTIE_HORS_MANUELLE:
      "L'autre côté de ce virement vient d'un relevé : son montant ne se modifie pas, donc celui-ci non plus. Les deux côtés d'un virement changent ensemble ou pas du tout.",
    SOUS_CATEGORIE_VIREMENT:
      "Un virement n'est ni une dépense ni un revenu : il ne reçoit pas de sous-catégorie. Pour la catégoriser, délie d'abord le virement.",
    SOUS_CATEGORIE_PARENT_VENTILE:
      "Cette transaction est ventilée : ce sont ses lignes qui portent les sous-catégories. Modifie sa ventilation pour en changer.",
    SUPPRESSION_VIREMENT:
      "Cette transaction est un côté de virement : choisis de supprimer aussi l'autre côté, ou de supprimer celle-ci seule en déliant l'autre.",
    SUPPRESSION_LIEE:
      "Cette transaction est rattachée à une échéance récurrente, une cotisation ou un objectif : la supprimer déferait ce lien sans le montrer. Elle ne se supprime pas depuis cet écran.",
    SUPPRESSION_FILLE_LIEE:
      "Une ligne de la ventilation de cette transaction est rattachée à une échéance récurrente, une cotisation ou un objectif : la supprimer déferait ce lien sans le montrer. Elle ne se supprime pas depuis cet écran.",
    VENTILATION_VIREMENT: messageErreurVentilation({ motif: "PARENT_VIREMENT" }),
    VENTILATION_FILLE_LIEE:
      "Une ligne de cette ventilation est rattachée à une échéance récurrente, une cotisation ou un objectif : la remplacer ou la retirer déferait ce lien sans le montrer. La ventilation ne se modifie pas depuis cet écran.",
    VENTILATION_MONTANT_NUL: messageErreurVentilation({ motif: "PARENT_NUL" }),
    NON_VENTILEE: "Cette transaction n'est pas ventilée : il n'y a rien à déventiler.",
    SUPPRESSION_CONTREPARTIE_LIEE:
      "L'autre côté de ce virement est rattaché à une échéance récurrente, une cotisation ou un objectif : il ne se supprime pas depuis cet écran.",
    VIREMENT_DEJA_LIE: "Cette transaction est déjà un côté de virement : délie-la d'abord pour la lier autrement.",
    VIREMENT_VENTILEE: "Une transaction ventilée ne devient pas un côté de virement : déventile-la d'abord.",
    VIREMENT_MONTANT_NUL: "Une transaction de 0,00 $ ne devient pas un virement.",
    VIREMENT_COTISATION: "Ce virement porte une cotisation enregistrée : il ne se délie pas depuis cet écran.",
    NON_VIREMENT: "Cette transaction n'est pas un côté de virement : il n'y a rien à délier.",
  };
  it.each(Object.keys(attendus) as MotifRefus[])("%s", (motif) => {
    expect(messageRefus(motif)).toBe(attendus[motif]);
  });
});
