import { describe, expect, it } from "vitest";
import { FILTRES_VIDES, type DetailTransaction, type FiltresTransactions } from "@/domain/consultation";
import { AUCUN_REFUS } from "@/domain/edition";
import { formatMontant } from "@/domain/money";
import { LIMITE_LIGNES_VENTILATION } from "@/domain/ventilation";
import {
  appliquerFormulaire,
  changementsModification,
  MESSAGE_AUCUNE_MODIFICATION,
  MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE,
  MESSAGE_ID_REPETE_SELECTION,
  MESSAGE_SELECTION_TROP_GRANDE,
  schemaCreationContrepartie,
  schemaCreationTransaction,
  schemaCurseurTransactions,
  schemaFormulaireContrepartie,
  schemaFormulaireNouvelleTransaction,
  schemaLiaisonVirement,
  schemaSaisieVirement,
  schemaSuppressionTransaction,
  versSaisieNouvelleTransaction,
  type ValeursFormulaireNouvelleTransaction,
  schemaFiltresTransactions,
  schemaFormulaireFiltres,
  schemaFormulaireModification,
  schemaGesteMasse,
  schemaModificationTransaction,
  schemaRequetePageTransactions,
  schemaFormulaireVentilation,
  schemaSelectionTransactions,
  schemaVentilation,
  versValeursFormulaire,
  versValeursModification,
  type EntreeCreationTransaction,
  type ValeursFormulaireModification,
} from "./schema";

const CUID_A = "cm0000000000000000000000a";
const CUID_B = "cm0000000000000000000000b";

const COMPLET: FiltresTransactions = {
  du: "2026-01-01",
  au: "2026-01-31",
  toutesDates: false,
  texte: "cafe",
  comptes: [CUID_A],
  sousCategories: [CUID_B],
  nonCategorisee: true,
  beneficiaires: [CUID_A],
  etiquettes: [CUID_B],
  montantMinCents: 1000,
  montantMaxCents: 5000,
  sens: "SORTIES",
  aRevoir: true,
  virements: "EXCLURE",
  recurrences: "SEULEMENT",
  ventileesSeulement: true,
  exclueDuBudget: true,
  exclueDesRapports: true,
};

describe("ventilation (docs/lot-m2.md §4.2)", () => {
  const ligne = (montant: string) => ({ subcategoryId: CUID_A, montant, note: "", tagIds: [] as string[] });
  const parent = { montantCents: -5000, estFille: false, estVirement: false };

  it("TS1 — schemaVentilation convertit le montant et la note vide", () => {
    const resultat = schemaVentilation.safeParse({ id: CUID_A, lignes: [ligne("-12,34"), ligne("-20,00")] });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.lignes[0]).toMatchObject({ montant: -1234, note: null });
    }
  });

  it("TS2 — un montant illisible est refusé sur sa ligne", () => {
    const resultat = schemaVentilation.safeParse({ id: CUID_A, lignes: [ligne("abc"), ligne("-20,00")] });
    const issue = resultat.error?.issues.find((i) => i.path.join(".") === "lignes.0.montant");
    expect(issue?.message).toBe("Montant illisible. Exemple : -25,00");
  });

  it("TS3 — plus de cinquante lignes", () => {
    const resultat = schemaVentilation.safeParse({
      id: CUID_A,
      lignes: Array.from({ length: LIMITE_LIGNES_VENTILATION + 1 }, () => ligne("-1,00")),
    });
    expect(messages(resultat)).toContain(`Une ventilation compte au plus ${LIMITE_LIGNES_VENTILATION} lignes.`);
  });

  it("TS4 — le formulaire dit combien il reste, ou ce que la ligne à zéro a de faux", () => {
    const schema = schemaFormulaireVentilation(parent);
    const reste = schema.safeParse({ lignes: [ligne("-20,00"), ligne("-17,60")] });
    expect(reste.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["lignes", `Il reste ${formatMontant(1240)} à répartir.`],
    ]);
    const zero = schema.safeParse({ lignes: [ligne("-50,00"), ligne("0")] });
    expect(zero.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["lignes.1.montant", `La ligne 2 est à ${formatMontant(0)} : retire-la ou donne-lui un montant.`],
    ]);
  });

  it("TS5 — des montants justes passent", () => {
    expect(schemaFormulaireVentilation(parent).safeParse({ lignes: [ligne("-20,00"), ligne("-30,00")] }).success).toBe(true);
  });

  it("une entrée dont le parent est une entrée d'argent dit « il reste » dans le bon sens", () => {
    const entree = schemaFormulaireVentilation({ montantCents: 5000, estFille: false, estVirement: false });
    const resultat = entree.safeParse({ lignes: [ligne("20,00"), ligne("17,60")] });
    expect(messages(resultat)).toEqual([`Il reste ${formatMontant(1240)} à répartir.`]);
  });
});

function messages(resultat: { success: boolean; error?: { issues: { message: string }[] } }): string[] {
  return resultat.error?.issues.map((issue) => issue.message) ?? [];
}

describe("schemaFiltresTransactions", () => {
  it("accepte les filtres vides et un objet complet", () => {
    expect(schemaFiltresTransactions.safeParse(FILTRES_VIDES).success).toBe(true);
    expect(schemaFiltresTransactions.safeParse(COMPLET).success).toBe(true);
  });

  it.each([
    [{ du: "2026-02-30" }, "Date invalide (AAAA-MM-JJ attendu)."],
    [{ du: "2026-02-10", au: "2026-02-01" }, "La date de fin précède la date de début."],
    [{ montantMinCents: -1 }, "Le montant doit être positif ou nul."],
    [{ montantMinCents: 12.5 }, "Montant en cents entier attendu."],
    [{ montantMinCents: 1e20 }, "Montant trop grand."],
    [{ montantMaxCents: Number.MAX_SAFE_INTEGER + 1 }, "Montant trop grand."],
    [{ montantMinCents: 500, montantMaxCents: 100 }, "Le montant maximum est inférieur au minimum."],
    [{ toutesDates: true, du: "2026-01-01" }, "« Toutes les dates » exclut une plage du / au."],
    [{ comptes: ["pas-un-cuid"] }, "Identifiant invalide."],
    [{ comptes: Array.from({ length: 101 }, () => CUID_A) }, "Au plus 100 valeurs par filtre."],
    [{ texte: "a".repeat(101) }, "La recherche dépasse 100 caractères."],
    [{ texte: "   " }, "La recherche est vide."],
  ])("refuse %j avec le message exact", (partiel, message) => {
    const resultat = schemaFiltresTransactions.safeParse({ ...FILTRES_VIDES, ...partiel });
    expect(resultat.success).toBe(false);
    expect(messages(resultat)).toContain(message);
  });
});

describe("schemaCurseurTransactions et schemaRequetePageTransactions", () => {
  it("refuse un curseur DATE qui porte un montant", () => {
    expect(schemaCurseurTransactions.safeParse({ champ: "DATE", montantCents: 5, id: CUID_A }).success).toBe(false);
  });

  it.each([1e20, -1e20, Number.MAX_SAFE_INTEGER + 1, -Number.MAX_SAFE_INTEGER - 1])(
    "refuse un curseur MONTANT hors bornes (%s)",
    (montantCents) => {
      const resultat = schemaCurseurTransactions.safeParse({ champ: "MONTANT", montantCents, id: CUID_A });
      expect(resultat.success).toBe(false);
      expect(messages(resultat)).toContain("Montant trop grand.");
    },
  );

  it("accepte un curseur MONTANT aux bornes sûres", () => {
    for (const montantCents of [Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
      expect(schemaCurseurTransactions.safeParse({ champ: "MONTANT", montantCents, id: CUID_A }).success).toBe(true);
    }
  });

  it("refuse un curseur MONTANT avec un tri DATE", () => {
    const resultat = schemaRequetePageTransactions.safeParse({
      filtres: FILTRES_VIDES,
      periode: { type: "TOUT", mois: "2026-09" },
      tri: { champ: "DATE", ordre: "DESC" },
      curseur: { champ: "MONTANT", montantCents: -100, id: CUID_A },
    });
    expect(resultat.success).toBe(false);
    expect(messages(resultat)).toContain("Le curseur ne correspond pas au tri demandé.");
  });
});

describe("schemaFormulaireFiltres", () => {
  const base = versValeursFormulaire(FILTRES_VIDES);

  it("convertit « 12,50 » en 1250 et « » en null", () => {
    const resultat = schemaFormulaireFiltres.safeParse({ ...base, montantMin: "12,50", montantMax: "" });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.montantMin).toBe(1250);
      expect(resultat.data.montantMax).toBeNull();
    }
  });

  it("refuse un montant illisible et un montant négatif", () => {
    expect(messages(schemaFormulaireFiltres.safeParse({ ...base, montantMin: "abc" }))).toContain(
      "Montant illisible. Exemple : 25,00",
    );
    expect(messages(schemaFormulaireFiltres.safeParse({ ...base, montantMin: "-5" }))).toContain(
      "Le montant doit être positif ou nul.",
    );
  });

  it("une saisie énorme produit un message de champ, pas une erreur", () => {
    const enorme = "9".repeat(400);
    for (const saisie of ["100000000000000000000", enorme]) {
      const resultat = schemaFormulaireFiltres.safeParse({ ...base, montantMin: saisie, montantMax: saisie });
      expect(resultat.success).toBe(false);
      if (!resultat.success) {
        const chemins = resultat.error.issues.filter((i) => i.message === "Montant trop grand.").map((i) => i.path[0]);
        expect(chemins).toEqual(expect.arrayContaining(["montantMin", "montantMax"]));
      }
    }
  });

  it("une date vide devient null", () => {
    const resultat = schemaFormulaireFiltres.safeParse({ ...base, du: "" });
    expect(resultat.success && resultat.data.du).toBeNull();
  });

  it("refuse du > au et min > max", () => {
    expect(messages(schemaFormulaireFiltres.safeParse({ ...base, du: "2026-02-10", au: "2026-02-01" }))).toContain(
      "La date de fin précède la date de début.",
    );
    expect(messages(schemaFormulaireFiltres.safeParse({ ...base, montantMin: "50", montantMax: "10" }))).toContain(
      "Le montant maximum est inférieur au minimum.",
    );
  });
});

describe("appliquerFormulaire", () => {
  it("conserve le texte ; un du posé fait tomber toutesDates", () => {
    const courants: FiltresTransactions = { ...FILTRES_VIDES, texte: "cafe", toutesDates: true };
    const analyse = schemaFormulaireFiltres.parse({ ...versValeursFormulaire(courants), du: "2026-01-01" });
    const resultat = appliquerFormulaire(courants, analyse);
    expect(resultat.texte).toBe("cafe");
    expect(resultat.toutesDates).toBe(false);
    expect(resultat.du).toBe("2026-01-01");
  });

  it("toutesDates reste posé sans plage saisie", () => {
    const courants: FiltresTransactions = { ...FILTRES_VIDES, toutesDates: true };
    const resultat = appliquerFormulaire(courants, schemaFormulaireFiltres.parse(versValeursFormulaire(courants)));
    expect(resultat.toutesDates).toBe(true);
  });

  it("la sortie du formulaire appliquée est acceptée par le schéma des filtres", () => {
    const analyse = schemaFormulaireFiltres.parse(versValeursFormulaire(COMPLET));
    expect(schemaFiltresTransactions.safeParse(appliquerFormulaire(COMPLET, analyse)).success).toBe(true);
    expect(appliquerFormulaire(COMPLET, analyse)).toEqual(COMPLET);
  });
});

// ── les écritures — docs/lot-m2.md §6

const CUID_C = "cm0000000000000000000000c";
const CUID_D = "cm0000000000000000000000d";

const CREATION: EntreeCreationTransaction = {
  accountId: CUID_A,
  date: "2026-02-10",
  description: "Café",
  montant: "-12,34",
  payeeId: null,
  payeeNouveauNom: null,
  subcategoryId: null,
  note: "",
  tagIds: [],
};

describe("schemaCreationTransaction", () => {
  it("accepte une entrée valide : montant en cents, note vide → null", () => {
    const analyse = schemaCreationTransaction.parse(CREATION);
    expect(analyse.montant).toBe(-1234);
    expect(analyse.note).toBeNull();
  });

  it.each([
    [{ montant: "" }, "Ce montant est obligatoire."],
    [{ montant: "abc" }, "Montant illisible. Exemple : -25,00"],
    [{ montant: "21474836,48" }, "Montant trop grand."],
    [{ description: "   " }, "La description est obligatoire."],
    [{ description: "a".repeat(201) }, "200 caractères au maximum."],
    [{ date: "2026-02-30" }, "Date invalide (AAAA-MM-JJ attendu)."],
    [{ accountId: "" }, "Choisis un compte."],
    [{ payeeId: CUID_B, payeeNouveauNom: "Nouveau" }, "Choisis un bénéficiaire existant ou saisis-en un nouveau, pas les deux."],
    [{ payeeNouveauNom: "  " }, MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE],
    [{ tagIds: Array.from({ length: 21 }, (_, i) => `cm00000000000000000000${String(i).padStart(3, "0")}`) }, "Au plus 20 étiquettes."],
    [{ tagIds: [CUID_C, CUID_C] }, "Une étiquette ne peut figurer qu'une fois."],
    [{ note: "a".repeat(201) }, "200 caractères au maximum."],
  ])("refuse %j avec le message exact", (partiel, message) => {
    expect(messages(schemaCreationTransaction.safeParse({ ...CREATION, ...partiel }))).toContain(message);
  });

  it("accepte les bornes de montant et zéro", () => {
    expect(schemaCreationTransaction.safeParse({ ...CREATION, montant: "-21474836,47" }).success).toBe(true);
    expect(schemaCreationTransaction.safeParse({ ...CREATION, montant: "0" }).success).toBe(true);
  });
});

describe("schemaModificationTransaction", () => {
  it("refuse une entrée sans aucun champ", () => {
    expect(messages(schemaModificationTransaction.safeParse({ id: CUID_A }))).toContain(MESSAGE_AUCUNE_MODIFICATION);
  });

  it("refuse un bénéficiaire à moitié", () => {
    expect(messages(schemaModificationTransaction.safeParse({ id: CUID_A, payeeId: CUID_B }))).toContain(
      "Le bénéficiaire se modifie en entier : choisis-en un existant, un nouveau, ou « Aucun ».",
    );
  });

  it("accepte le retrait de la sous-catégorie et convertit le montant", () => {
    expect(schemaModificationTransaction.safeParse({ id: CUID_A, subcategoryId: null }).success).toBe(true);
    const analyse = schemaModificationTransaction.parse({ id: CUID_A, montant: "-5,00" });
    expect(analyse.montant).toBe(-500);
  });
});

describe("changementsModification", () => {
  const DETAIL: DetailTransaction = {
    id: CUID_A,
    parentId: null,
    accountId: CUID_B,
    compteNom: "Chèque",
    date: "2026-02-10",
    description: "Café",
    typeOperation: null,
    montantCents: -1234,
    payeeId: CUID_C,
    beneficiaireNom: "Café Dépôt",
    subcategoryId: null,
    sousCategorieNom: null,
    categorieNom: null,
    note: null,
    etiquettes: [
      { id: CUID_C, nom: "A", couleur: null },
      { id: CUID_D, nom: "B", couleur: null },
    ],
    aRevoir: false,
    exclureDuBudget: false,
    exclureDesRapports: false,
    source: "MANUELLE",
    etat: "COMPTABILISEE",
    rapprochement: "NON_RAPPROCHEE",
    externalId: null,
    empreinte: "e",
    lotImport: null,
    regle: null,
    estVentilee: false,
    contrepartie: null,
    lignesVentilation: [],
    nbLignesVentilation: 0,
    recurrence: null,
    refus: AUCUN_REFUS,
  };

  function changements(retouche: Partial<ValeursFormulaireModification>) {
    const valeurs = { ...versValeursModification(DETAIL), ...retouche };
    return changementsModification(DETAIL, valeurs, schemaFormulaireModification.parse(valeurs));
  }

  it("rend null quand rien ne change", () => {
    expect(changements({})).toBeNull();
  });

  it("ignore un montant ressaisi autrement, une note vide, un autre ordre d'étiquettes", () => {
    expect(changements({ montant: "-12,340" })).toBeNull();
    expect(changements({ note: "" })).toBeNull();
    expect(changements({ tagIds: [CUID_D, CUID_C] })).toBeNull();
  });

  it("ne rend que les champs qui diffèrent", () => {
    expect(changements({ description: "Autre" })).toEqual({ id: CUID_A, description: "Autre" });
    expect(changements({ montant: "-20,00" })).toEqual({ id: CUID_A, montant: "-20,00" });
  });

  it("un bénéficiaire nouveau envoie payeeId et payeeNouveauNom", () => {
    expect(changements({ payeeId: null, payeeNouveauNom: "Neuf" })).toEqual({
      id: CUID_A,
      payeeId: null,
      payeeNouveauNom: "Neuf",
    });
  });

  it("le passage à « Aucun » envoie les deux champs à null", () => {
    expect(changements({ payeeId: null })).toEqual({ id: CUID_A, payeeId: null, payeeNouveauNom: null });
  });
});

describe("schemaSelectionTransactions", () => {
  it("refuse une liste vide, trop longue ou répétée", () => {
    expect(messages(schemaSelectionTransactions.safeParse({ type: "IDS", ids: [] }))).toContain(
      "Aucune transaction sélectionnée.",
    );
    const trop = Array.from({ length: 5001 }, (_, i) => `c${i.toString(36).padStart(10, "0")}`);
    expect(messages(schemaSelectionTransactions.safeParse({ type: "IDS", ids: trop }))).toContain(
      MESSAGE_SELECTION_TROP_GRANDE,
    );
    expect(messages(schemaSelectionTransactions.safeParse({ type: "IDS", ids: [CUID_A, CUID_A] }))).toContain(
      MESSAGE_ID_REPETE_SELECTION,
    );
  });

  it("accepte un FILTRE avec des filtres vides et une période valide", () => {
    expect(
      schemaSelectionTransactions.safeParse({
        type: "FILTRE",
        filtres: FILTRES_VIDES,
        periode: { type: "TOUT", mois: "2026-09" },
      }).success,
    ).toBe(true);
  });
});

describe("virements (docs/lot-m2.md §4.4 et §6.3)", () => {
  const DESTINATION_REQUISE = "Choisis le compte de destination.";
  const DESTINATION_IDENTIQUE = "Choisis un compte différent du compte de départ.";
  const VIREMENT_NUL = "Un virement de 0,00 $ ne se saisit pas.";

  const formulaire = (surcharge: Partial<ValeursFormulaireNouvelleTransaction> = {}): ValeursFormulaireNouvelleTransaction => ({
    accountId: CUID_A,
    date: "2026-03-10",
    description: "Transfert",
    montant: "-75,00",
    payeeId: null,
    payeeNouveauNom: null,
    subcategoryId: null,
    note: "",
    tagIds: [],
    estVirement: true,
    accountIdDestination: CUID_B,
    ...surcharge,
  });
  const issue = (resultat: { error?: { issues: { path: PropertyKey[]; message: string }[] } }, chemin: string) =>
    resultat.error?.issues.find((i) => i.path.join(".") === chemin)?.message;

  it("TS-V1 — nominal : succès, montant en cents", () => {
    const resultat = schemaFormulaireNouvelleTransaction.safeParse(formulaire());
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.montant).toBe(-7500);
    }
  });

  it("TS-V1 — bascule vraie sans destination : MESSAGE_DESTINATION_REQUISE", () => {
    expect(issue(schemaFormulaireNouvelleTransaction.safeParse(formulaire({ accountIdDestination: null })), "accountIdDestination")).toBe(
      DESTINATION_REQUISE,
    );
    expect(issue(schemaFormulaireNouvelleTransaction.safeParse(formulaire({ accountIdDestination: "pas-un-cuid" })), "accountIdDestination")).toBe(
      DESTINATION_REQUISE,
    );
  });

  it("TS-V1 — destination égale au compte : MESSAGE_DESTINATION_IDENTIQUE", () => {
    expect(issue(schemaFormulaireNouvelleTransaction.safeParse(formulaire({ accountIdDestination: CUID_A })), "accountIdDestination")).toBe(
      DESTINATION_IDENTIQUE,
    );
  });

  it("TS-V1 — montant 0 : MESSAGE_VIREMENT_NUL, mais pas pour une transaction ordinaire", () => {
    expect(issue(schemaFormulaireNouvelleTransaction.safeParse(formulaire({ montant: "0,00" })), "montant")).toBe(VIREMENT_NUL);
    expect(schemaFormulaireNouvelleTransaction.safeParse(formulaire({ montant: "0,00", estVirement: false })).success).toBe(true);
  });

  it("TS-V1 — virement avec une sous-catégorie : refusé sur subcategoryId", () => {
    expect(issue(schemaFormulaireNouvelleTransaction.safeParse(formulaire({ subcategoryId: CUID_A })), "subcategoryId")).toBe(
      "Un virement ne porte pas de sous-catégorie.",
    );
  });

  it("TS-V1 — bascule fausse : la destination est ignorée, même égale au compte ou invalide", () => {
    expect(schemaFormulaireNouvelleTransaction.safeParse(formulaire({ estVirement: false, accountIdDestination: CUID_A })).success).toBe(true);
    expect(schemaFormulaireNouvelleTransaction.safeParse(formulaire({ estVirement: false, accountIdDestination: null })).success).toBe(true);
  });

  it("TS-V2 — versSaisieNouvelleTransaction, branche TRANSACTION : sans estVirement ni destination", () => {
    const saisie = versSaisieNouvelleTransaction(formulaire({ estVirement: false, accountIdDestination: CUID_B, subcategoryId: CUID_B }));
    expect(saisie.type).toBe("TRANSACTION");
    expect(saisie.entree).not.toHaveProperty("estVirement");
    expect(saisie.entree).not.toHaveProperty("accountIdDestination");
    expect(saisie.entree).toMatchObject({ subcategoryId: CUID_B, montant: "-75,00" });
  });

  it("TS-V2 — branche VIREMENT : sans subcategoryId, montant en chaîne", () => {
    const saisie = versSaisieNouvelleTransaction(formulaire({ subcategoryId: CUID_A }));
    expect(saisie.type).toBe("VIREMENT");
    expect(saisie.entree).not.toHaveProperty("subcategoryId");
    expect(saisie.entree).not.toHaveProperty("estVirement");
    expect(saisie.entree).toMatchObject({ accountId: CUID_A, accountIdDestination: CUID_B, montant: "-75,00" });
  });

  it("TS-V2 — branche VIREMENT sans destination : reste un VIREMENT, destination vide refusée par le schéma", () => {
    const saisie = versSaisieNouvelleTransaction(formulaire({ estVirement: true, accountIdDestination: null }));
    expect(saisie.type).toBe("VIREMENT");
    expect(saisie.entree).toMatchObject({ accountIdDestination: "" });
    if (saisie.type === "VIREMENT") {
      expect(issue(schemaSaisieVirement.safeParse({ ...saisie.entree }), "accountIdDestination")).toBe(DESTINATION_REQUISE);
    }
  });

  it("TS-V3 — schemaSaisieVirement : mêmes refus", () => {
    const entree = {
      accountId: CUID_A,
      accountIdDestination: CUID_B,
      date: "2026-03-10",
      description: "Transfert",
      montant: "-75,00",
      payeeId: null,
      payeeNouveauNom: null,
      note: "",
      tagIds: [] as string[],
    };
    expect(schemaSaisieVirement.safeParse(entree).success).toBe(true);
    expect(issue(schemaSaisieVirement.safeParse({ ...entree, accountIdDestination: CUID_A }), "accountIdDestination")).toBe(DESTINATION_IDENTIQUE);
    expect(issue(schemaSaisieVirement.safeParse({ ...entree, accountIdDestination: "" }), "accountIdDestination")).toBe(DESTINATION_REQUISE);
    expect(issue(schemaSaisieVirement.safeParse({ ...entree, montant: "0" }), "montant")).toBe(VIREMENT_NUL);
    expect(issue(schemaSaisieVirement.safeParse({ ...entree, montant: "abc" }), "montant")).toBe("Montant illisible. Exemple : -25,00");
    expect(
      issue(schemaSaisieVirement.safeParse({ ...entree, payeeId: CUID_A, payeeNouveauNom: "Nouveau" }), "payeeNouveauNom"),
    ).toBe("Choisis un bénéficiaire existant ou saisis-en un nouveau, pas les deux.");
  });

  it("TS-V4 — schemaLiaisonVirement refuse id === contrepartieId", () => {
    expect(schemaLiaisonVirement.safeParse({ id: CUID_A, contrepartieId: CUID_B }).success).toBe(true);
    const resultat = schemaLiaisonVirement.safeParse({ id: CUID_A, contrepartieId: CUID_A });
    expect(issue(resultat, "contrepartieId")).toBe("Une transaction ne se lie pas à elle-même.");
    expect(schemaLiaisonVirement.safeParse({ id: CUID_A, contrepartieId: "x" }).success).toBe(false);
  });

  it("schemaCreationContrepartie et son formulaire : le compte est obligatoire", () => {
    expect(schemaCreationContrepartie.safeParse({ id: CUID_A, accountId: CUID_B }).success).toBe(true);
    expect(issue(schemaCreationContrepartie.safeParse({ id: CUID_A, accountId: "" }), "accountId")).toBe("Choisis un compte.");
    expect(issue(schemaFormulaireContrepartie.safeParse({ accountId: "" }), "accountId")).toBe("Choisis un compte.");
    expect(schemaFormulaireContrepartie.safeParse({ accountId: CUID_B }).success).toBe(true);
  });

  it("TS-V5 — schemaGesteMasse SUPPRIMER exige la clé virements (null permis)", () => {
    expect(schemaGesteMasse.safeParse({ type: "SUPPRIMER" }).success).toBe(false);
    expect(schemaGesteMasse.safeParse({ type: "SUPPRIMER", virements: null }).success).toBe(true);
    expect(schemaGesteMasse.safeParse({ type: "SUPPRIMER", virements: "SUPPRIMER_LES_DEUX" }).success).toBe(true);
    expect(schemaGesteMasse.safeParse({ type: "SUPPRIMER", virements: "DELIER_L_AUTRE" }).success).toBe(true);
    expect(schemaGesteMasse.safeParse({ type: "SUPPRIMER", virements: "N_IMPORTE_QUOI" }).success).toBe(false);
  });

  it("schemaSuppressionTransaction exige le choix (null permis) et refuse une valeur inconnue", () => {
    expect(schemaSuppressionTransaction.safeParse({ id: CUID_A }).success).toBe(false);
    expect(schemaSuppressionTransaction.safeParse({ id: CUID_A, virement: null }).success).toBe(true);
    expect(schemaSuppressionTransaction.safeParse({ id: CUID_A, virement: "DELIER_L_AUTRE" }).success).toBe(true);
    expect(schemaSuppressionTransaction.safeParse({ id: CUID_A, virement: "TOUT" }).success).toBe(false);
  });
});

describe("schemaGesteMasse", () => {
  it("refuse une sous-catégorie ou un bénéficiaire nul", () => {
    expect(messages(schemaGesteMasse.safeParse({ type: "SOUS_CATEGORIE", subcategoryId: null }))).toContain(
      "Choisis une sous-catégorie.",
    );
    expect(messages(schemaGesteMasse.safeParse({ type: "BENEFICIAIRE", payeeId: null }))).toContain(
      "Choisis un bénéficiaire.",
    );
  });

  it("refuse des étiquettes vides ou en recouvrement", () => {
    expect(messages(schemaGesteMasse.safeParse({ type: "ETIQUETTES", ajouter: [], retirer: [] }))).toContain(
      "Choisis au moins une étiquette à ajouter ou à retirer.",
    );
    expect(messages(schemaGesteMasse.safeParse({ type: "ETIQUETTES", ajouter: [CUID_A], retirer: [CUID_A] }))).toContain(
      "Une étiquette ne peut pas être à la fois ajoutée et retirée.",
    );
  });

  it("accepte SUPPRIMER", () => {
    expect(schemaGesteMasse.safeParse({ type: "SUPPRIMER", virements: null }).success).toBe(true);
  });
});
