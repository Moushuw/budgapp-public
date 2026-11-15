// docs/lot-m1.md §6.4 et §7.

import { describe, expect, it } from "vitest";
import { formatMontant } from "@/domain/money";
import {
  LIMITE_TYPE_OPERATION,
  MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE,
  MESSAGE_COMPTE_INVALIDE,
  MESSAGE_COMPTE_REQUIS,
  schemaAnalyse,
  schemaEnregistrementImport,
  schemaLigneImport,
} from "./schema";

const CUID_COMPTE = "clx0000000000000000000010";
const CUID_TAG_A = "clx0000000000000000000011";
const CUID_TAG_B = "clx0000000000000000000012";
const CUID_TX_EXISTANTE = "clx0000000000000000000013";

const BASE_LIGNE = {
  cle: "L1.0",
  action: "IMPORTER" as const,
  transactionExistanteId: null,
  accountId: CUID_COMPTE,
  date: "2026-03-05",
  description: "Épicerie",
  typeOperation: null as string | null,
  montant: "12,34",
  note: null,
  payeeId: null,
  payeeNouveauNom: null,
  subcategoryId: null,
  tagIds: [] as string[],
  externalId: null,
  appliedRuleId: null,
  aRevoir: false,
  exclureDuBudget: false,
  exclureDesRapports: false,
  ventilation: null as { subcategoryId: string | null; montant: string }[] | null,
  virementAvec: null as string | null,
  occurrenceAvec: null as string | null,
  occurrenceAuto: false,
};

describe("schemaLigneImport — ventilation (docs/lot-m2.md §4.3)", () => {
  const filles = (...montants: readonly string[]) => montants.map((montant) => ({ subcategoryId: CUID_TAG_A, montant }));
  const ventilee = { ...BASE_LIGNE, montant: "-100,01" };

  it("IS1 — trois filles justes : succès, montants en cents", () => {
    const resultat = schemaLigneImport.safeParse({ ...ventilee, ventilation: filles("-33,30", "-33,30", "-33,41") });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.ventilation?.map((f) => f.montant)).toEqual([-3330, -3330, -3341]);
    }
  });

  it("IS2 — une mise à jour ne pose pas de ventilation", () => {
    const resultat = schemaLigneImport.safeParse({
      ...ventilee,
      action: "METTRE_A_JOUR",
      transactionExistanteId: CUID_TX_EXISTANTE,
      ventilation: filles("-33,30", "-66,71"),
    });
    const issue = resultat.error?.issues.find((i) => i.path.join(".") === "ventilation");
    expect(issue?.message).toBe("Une mise à jour ne pose pas de ventilation.");
  });

  it("IS3 — une ligne ventilée ne porte pas de sous-catégorie", () => {
    const resultat = schemaLigneImport.safeParse({
      ...ventilee,
      subcategoryId: CUID_TAG_B,
      ventilation: filles("-33,30", "-66,71"),
    });
    const issue = resultat.error?.issues.find((i) => i.path.join(".") === "subcategoryId");
    expect(issue?.message).toBe(
      "Une ligne ventilée ne porte pas de sous-catégorie : ce sont ses lignes qui la portent.",
    );
  });

  it("IS4 — une somme fausse d'un cent dit combien il reste", () => {
    const resultat = schemaLigneImport.safeParse({ ...ventilee, ventilation: filles("-33,30", "-66,70") });
    const issue = resultat.error?.issues.find((i) => i.path.join(".") === "ventilation");
    expect(issue?.message).toBe(`Il reste ${formatMontant(1)} à répartir.`);
  });

  it("une entrée d'argent mal répartie dit « il reste » ou « dépassent » dans le bon sens", () => {
    const entree = { ...BASE_LIGNE, montant: "100,00" };
    const reste = schemaLigneImport.safeParse({ ...entree, ventilation: filles("40,00", "50,00") });
    expect(reste.error?.issues.find((i) => i.path.join(".") === "ventilation")?.message).toBe(
      `Il reste ${formatMontant(1000)} à répartir.`,
    );
    const trop = schemaLigneImport.safeParse({ ...entree, ventilation: filles("60,00", "50,00") });
    expect(trop.error?.issues.find((i) => i.path.join(".") === "ventilation")?.message).toBe(
      `Les lignes dépassent la transaction de ${formatMontant(1000)}.`,
    );
  });

  it("IS5 — ventilation null : comportement d'avant", () => {
    expect(schemaLigneImport.safeParse({ ...BASE_LIGNE, ventilation: null }).success).toBe(true);
  });
});

describe("schemaLigneImport — virementAvec (docs/lot-m2.md §4.5)", () => {
  const CIBLE = "clx0000000000000000000020";
  const issue = (resultat: ReturnType<typeof schemaLigneImport.safeParse>, chemin: string) =>
    resultat.error?.issues.find((i) => i.path.join(".") === chemin);

  it("nominal : une ligne virement sans sous-catégorie ni ventilation passe", () => {
    expect(schemaLigneImport.safeParse({ ...BASE_LIGNE, virementAvec: CIBLE }).success).toBe(true);
  });

  it("IS-V1 — virementAvec avec une sous-catégorie : issue sur subcategoryId", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, virementAvec: CIBLE, subcategoryId: CUID_TAG_B });
    expect(issue(resultat, "subcategoryId")?.message).toBe("Une ligne marquée virement ne porte pas de sous-catégorie.");
  });

  it("IS-V2 — virementAvec avec une ventilation : issue sur ventilation", () => {
    const resultat = schemaLigneImport.safeParse({
      ...BASE_LIGNE,
      montant: "-100,00",
      virementAvec: CIBLE,
      ventilation: [
        { subcategoryId: CUID_TAG_A, montant: "-50,00" },
        { subcategoryId: CUID_TAG_B, montant: "-50,00" },
      ],
    });
    expect(issue(resultat, "ventilation")?.message).toBe("Une ligne marquée virement ne se ventile pas.");
  });

  it("IS-V3 — virementAvec avec METTRE_A_JOUR : issue sur virementAvec", () => {
    const resultat = schemaLigneImport.safeParse({
      ...BASE_LIGNE,
      action: "METTRE_A_JOUR",
      transactionExistanteId: CUID_TX_EXISTANTE,
      virementAvec: CIBLE,
    });
    expect(issue(resultat, "virementAvec")?.message).toBe("Une mise à jour ne pose pas de virement.");
  });

  it("une cible qui n'est pas un cuid est refusée", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, virementAvec: "n'importe quoi" });
    expect(resultat.success).toBe(false);
    expect(issue(resultat, "virementAvec")).toBeDefined();
  });

  it("virementAvec est obligatoire (null permis, absent refusé)", () => {
    const sans: Partial<typeof BASE_LIGNE> = { ...BASE_LIGNE };
    delete sans.virementAvec;
    expect(schemaLigneImport.safeParse(sans).success).toBe(false);
  });
});

describe("schemaEnregistrementImport — cibles de virement (docs/lot-m2.md §4.5)", () => {
  const CIBLE_A = "clx0000000000000000000020";
  const CIBLE_B = "clx0000000000000000000021";
  const lot = (...cibles: (string | null)[]) => ({
    accountId: CUID_COMPTE,
    libelle: null,
    lignes: cibles.map((virementAvec, i) => ({ ...BASE_LIGNE, cle: `L${String(i)}.0`, virementAvec })),
  });

  it("IS-V4 — deux lignes sur la même cible : issue sur lignes.1.virementAvec", () => {
    const resultat = schemaEnregistrementImport.safeParse(lot(CIBLE_A, CIBLE_A));
    expect(resultat.success).toBe(false);
    const issues = resultat.error?.issues.filter((i) => i.message === "Deux lignes visent le même virement.") ?? [];
    expect(issues.map((i) => i.path.join("."))).toEqual(["lignes.1.virementAvec"]);
  });

  it("trois lignes sur la même cible : les deuxième et troisième sont signalées", () => {
    const resultat = schemaEnregistrementImport.safeParse(lot(CIBLE_A, CIBLE_A, CIBLE_A));
    const chemins = (resultat.error?.issues ?? []).map((i) => i.path.join("."));
    expect(chemins).toEqual(["lignes.1.virementAvec", "lignes.2.virementAvec"]);
  });

  it("cibles distinctes, ou null répétés : succès", () => {
    expect(schemaEnregistrementImport.safeParse(lot(CIBLE_A, CIBLE_B)).success).toBe(true);
    expect(schemaEnregistrementImport.safeParse(lot(null, null)).success).toBe(true);
  });
});

describe("schemaLigneImport — occurrenceAvec (docs/lot-m3.md §4.5)", () => {
  const OCC_A = "clx0000000000000000000030";
  const OCC_B = "clx0000000000000000000031";
  const issue = (resultat: ReturnType<typeof schemaLigneImport.safeParse>, chemin: string) =>
    resultat.error?.issues.find((i) => i.path.join(".") === chemin);

  it("IS-O1 — ligne IMPORTER, occurrence cuid, rapprochement automatique : valide", () => {
    expect(schemaLigneImport.safeParse({ ...BASE_LIGNE, occurrenceAvec: OCC_A, occurrenceAuto: true }).success).toBe(true);
  });

  it("IS-O2 — METTRE_A_JOUR avec occurrenceAvec : issue sur occurrenceAvec", () => {
    const resultat = schemaLigneImport.safeParse({
      ...BASE_LIGNE,
      action: "METTRE_A_JOUR",
      transactionExistanteId: CUID_TX_EXISTANTE,
      occurrenceAvec: OCC_A,
    });
    expect(issue(resultat, "occurrenceAvec")?.message).toBe("Une mise à jour ne se lie pas à une échéance.");
  });

  it("IS-O3 — occurrenceAuto sans occurrenceAvec : issue sur occurrenceAuto", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, occurrenceAvec: null, occurrenceAuto: true });
    expect(resultat.success).toBe(false);
    expect(issue(resultat, "occurrenceAuto")?.message).toBe("Un rapprochement automatique vise une échéance.");
  });

  it("IS-O4 — deux lignes sur la même échéance : issue sur la seconde seulement", () => {
    const lot = {
      accountId: CUID_COMPTE,
      libelle: null,
      lignes: [OCC_A, OCC_A].map((occurrenceAvec, i) => ({ ...BASE_LIGNE, cle: `L${String(i)}.0`, occurrenceAvec })),
    };
    const resultat = schemaEnregistrementImport.safeParse(lot);
    expect(resultat.success).toBe(false);
    const issues = resultat.error?.issues.filter((i) => i.message === "Deux lignes visent la même échéance.") ?? [];
    expect(issues.map((i) => i.path.join("."))).toEqual(["lignes.1.occurrenceAvec"]);
  });

  it("échéances distinctes, ou null répétés : succès", () => {
    const lot = (...occ: (string | null)[]) => ({
      accountId: CUID_COMPTE,
      libelle: null,
      lignes: occ.map((occurrenceAvec, i) => ({ ...BASE_LIGNE, cle: `L${String(i)}.0`, occurrenceAvec })),
    });
    expect(schemaEnregistrementImport.safeParse(lot(OCC_A, OCC_B)).success).toBe(true);
    expect(schemaEnregistrementImport.safeParse(lot(null, null)).success).toBe(true);
  });

  it("IS-O5 — occurrenceAvec qui n'est pas un cuid : refusé", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, occurrenceAvec: "n'importe quoi" });
    expect(resultat.success).toBe(false);
    expect(issue(resultat, "occurrenceAvec")).toBeDefined();
  });

  it("IS-O6 — virement et occurrence sur la même ligne : valide", () => {
    const resultat = schemaLigneImport.safeParse({
      ...BASE_LIGNE,
      virementAvec: "clx0000000000000000000020",
      occurrenceAvec: OCC_A,
    });
    expect(resultat.success).toBe(true);
  });

  it("les deux champs sont obligatoires (absents refusés)", () => {
    const sans: Record<string, unknown> = { ...BASE_LIGNE };
    delete sans.occurrenceAvec;
    expect(schemaLigneImport.safeParse(sans).success).toBe(false);
    const sans2: Record<string, unknown> = { ...BASE_LIGNE };
    delete sans2.occurrenceAuto;
    expect(schemaLigneImport.safeParse(sans2).success).toBe(false);
  });
});

describe("schemaLigneImport — montant", () => {
  it("montant illisible refusé", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, montant: "abc" });
    expect(resultat.success).toBe(false);
  });

  it("« 1 234,56 » → 123456", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, montant: "1 234,56" });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.montant).toBe(123456);
    }
  });

  it("« -6,31 $ » → -631", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, montant: "-6,31 $" });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.montant).toBe(-631);
    }
  });
});

describe("schemaLigneImport — typeOperation (docs/lot-m2.md §3.1)", () => {
  it("S1 — « Achat » accepté et rendu tel quel", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, typeOperation: "Achat" });
    expect(resultat.success).toBe(true);
    if (resultat.success) expect(resultat.data.typeOperation).toBe("Achat");
  });

  it("S2 — chaîne vide refusée", () => {
    expect(schemaLigneImport.safeParse({ ...BASE_LIGNE, typeOperation: "" }).success).toBe(false);
  });

  it("S3 — 201 caractères refusés, 200 acceptés", () => {
    expect(schemaLigneImport.safeParse({ ...BASE_LIGNE, typeOperation: "a".repeat(LIMITE_TYPE_OPERATION + 1) }).success).toBe(
      false,
    );
    expect(schemaLigneImport.safeParse({ ...BASE_LIGNE, typeOperation: "a".repeat(LIMITE_TYPE_OPERATION) }).success).toBe(
      true,
    );
  });

  it("S4 — champ absent refusé (obligatoire, nullable)", () => {
    const sansType: Record<string, unknown> = { ...BASE_LIGNE };
    delete sansType.typeOperation;
    expect(schemaLigneImport.safeParse(sansType).success).toBe(false);
  });
});

describe("schemaLigneImport — payeeNouveauNom", () => {
  it("S5 — 61 caractères refusés avec le message de longueur", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, payeeNouveauNom: "a".repeat(61) });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      const issue = resultat.error.issues.find((i) => i.path.join(".") === "payeeNouveauNom");
      expect(issue?.message).toBe("60 caractères au maximum.");
    }
  });

  it("chaîne vide refusée (relecture tranche 6, point 1 : un nom vide s'écrivait sans bénéficiaire, sans un mot)", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, payeeNouveauNom: "" });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      const issue = resultat.error.issues.find((i) => i.path.join(".") === "payeeNouveauNom");
      expect(issue).toBeDefined();
      expect(issue?.message).toBe(MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE);
    }
  });

  it("chaîne faite uniquement d'espaces refusée après trim", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, payeeNouveauNom: "   " });
    expect(resultat.success).toBe(false);
  });

  it("null accepté (aucun nouveau bénéficiaire)", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, payeeNouveauNom: null });
    expect(resultat.success).toBe(true);
  });

  it("nom non vide accepté", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, payeeNouveauNom: "Amazon" });
    expect(resultat.success).toBe(true);
  });
});

describe("schemaLigneImport — coherenceLigneImport", () => {
  it("payeeId et payeeNouveauNom tous deux non nuls → refusée sur payeeNouveauNom", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, payeeId: CUID_COMPTE, payeeNouveauNom: "Nouveau" });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      const issue = resultat.error.issues.find((i) => i.path.join(".") === "payeeNouveauNom");
      expect(issue).toBeDefined();
      expect(issue?.message).toBe("Choisis un bénéficiaire existant ou saisis-en un nouveau, pas les deux.");
    }
  });

  it("action METTRE_A_JOUR avec transactionExistanteId null → refusée sur transactionExistanteId", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, action: "METTRE_A_JOUR", transactionExistanteId: null });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      const issue = resultat.error.issues.find((i) => i.path.join(".") === "transactionExistanteId");
      expect(issue).toBeDefined();
      expect(issue?.message).toBe("Une mise à jour vise une transaction existante.");
    }
  });

  it("action METTRE_A_JOUR avec transactionExistanteId renseigné → acceptée", () => {
    const resultat = schemaLigneImport.safeParse({
      ...BASE_LIGNE,
      action: "METTRE_A_JOUR",
      transactionExistanteId: CUID_TX_EXISTANTE,
    });
    expect(resultat.success).toBe(true);
  });
});

describe("schemaLigneImport — bornes", () => {
  it("21 tagIds refusée", () => {
    const tagIds = Array.from({ length: 21 }, (_, i) => `clx000000000000000000${String(i).padStart(4, "0")}`);
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, tagIds });
    expect(resultat.success).toBe(false);
  });

  it("20 tagIds distincts acceptée", () => {
    const tagIds = Array.from({ length: 20 }, (_, i) => `clx000000000000000000${String(i).padStart(4, "0")}`);
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, tagIds });
    expect(resultat.success).toBe(true);
  });

  it("cuid malformé refusé", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, accountId: "pas-un-cuid" });
    expect(resultat.success).toBe(false);
  });

  it("deux étiquettes valides distinctes ne se confondent pas avec un cuid malformé", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, tagIds: [CUID_TAG_A, CUID_TAG_B] });
    expect(resultat.success).toBe(true);
  });

  it("date « 2026-02-30 » refusée", () => {
    const resultat = schemaLigneImport.safeParse({ ...BASE_LIGNE, date: "2026-02-30" });
    expect(resultat.success).toBe(false);
  });
});

describe("schemaAnalyse — accountId", () => {
  const valide = { annee: 2026, profilId: "desjardins", texte: "un relevé" };

  it("un compte vide donne le message « requis » en premier", () => {
    const resultat = schemaAnalyse.safeParse({ ...valide, accountId: "" });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.path).toEqual(["accountId"]);
      expect(resultat.error.issues[0]?.message).toBe(MESSAGE_COMPTE_REQUIS);
    }
  });

  it("un identifiant qui n'est pas un cuid donne le message « invalide »", () => {
    const resultat = schemaAnalyse.safeParse({ ...valide, accountId: "pas-un-cuid" });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.message).toBe(MESSAGE_COMPTE_INVALIDE);
    }
  });

  it("un cuid avec des champs valides passe", () => {
    expect(schemaAnalyse.safeParse({ ...valide, accountId: "clx0000000000000000000010" }).success).toBe(true);
  });

  it("aucun message sur accountId n'est le texte anglais de zod", () => {
    for (const accountId of ["", "pas-un-cuid"]) {
      const resultat = schemaAnalyse.safeParse({ ...valide, accountId });
      if (!resultat.success) {
        for (const issue of resultat.error.issues.filter((i) => i.path[0] === "accountId")) {
          expect(issue.message).not.toContain("Invalid");
        }
      }
    }
  });
});
