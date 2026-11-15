import { describe, expect, it } from "vitest";
import type { CompteursRevue } from "./etat-revue";
import {
  accorder,
  messageAImporterVide,
  messageConflitsNonTranches,
  messageEmpreintesEnDouble,
  messageOccurrencesEnConflit,
  messageOccurrencesTronquees,
  messageReglesInapplicables,
  messageTransactionsIntrouvables,
  recapitulatifApres,
  recapitulatifAvant,
  type ChiffresEnregistrement,
  type OccurrenceEnConflitAffichee,
} from "./libelles-revue";

const COMPTEURS: CompteursRevue = {
  aImporter: 0,
  aMettreAJour: 0,
  ignoreesDoublon: 0,
  filtrees: 0,
  nonReconnues: 0,
  conflitsNonTranches: 0,
  virements: 0,
  rapprochements: 0,
};

const CHIFFRES: ChiffresEnregistrement = {
  importees: 0,
  misesAJour: 0,
  beneficiairesCrees: 0,
  etiquettesPosees: 0,
  virementsLies: 0,
  occurrencesLiees: 0,
  couvreDu: null,
  couvreAu: null,
};

const textes = (lignes: readonly { readonly texte: string }[]): string[] => lignes.map((ligne) => ligne.texte);

describe("accorder", () => {
  it("LR1 — 0 et 1 au singulier, 2 et plus au pluriel", () => {
    expect(accorder(0, "ligne", "lignes")).toBe("0 ligne");
    expect(accorder(1, "ligne", "lignes")).toBe("1 ligne");
    expect(accorder(2, "ligne", "lignes")).toBe("2 lignes");
    expect(accorder(10, "ligne", "lignes")).toBe("10 lignes");
  });
});

describe("recapitulatifAvant", () => {
  it("LR2 — les cinq lignes fixes, sans alerte", () => {
    const lignes = recapitulatifAvant({ ...COMPTEURS, aImporter: 1, ignoreesDoublon: 2, nonReconnues: 3 });
    expect(textes(lignes)).toEqual([
      "1 ligne à importer.",
      "0 ligne à mettre à jour.",
      "2 lignes ignorées comme doublons.",
      "0 ligne filtrée, non importée.",
      "3 lignes non reconnues.",
    ]);
    expect(lignes.some((ligne) => ligne.alerte)).toBe(false);
  });

  it("LR3 — virements et conflits, omis à 0, conflits en dernier et en alerte", () => {
    const lignes = recapitulatifAvant({ ...COMPTEURS, aImporter: 2, filtrees: 1, virements: 1, conflitsNonTranches: 2 });
    const t = textes(lignes);
    expect(t).toContain("2 lignes à importer.");
    expect(t).toContain("1 ligne filtrée, non importée.");
    expect(t).toContain("1 ligne sera liée en virement.");
    const derniere = lignes[lignes.length - 1];
    expect(derniere).toEqual({
      cle: "conflits",
      texte: "2 lignes portent un conflit de règles non tranché.",
      alerte: true,
    });
    expect(textes(recapitulatifAvant({ ...COMPTEURS, virements: 2 }))).toContain("2 lignes seront liées en virement.");
  });

  it("LR3 — un conflit au singulier, et les clés suivent les noms de compteurs", () => {
    const lignes = recapitulatifAvant({ ...COMPTEURS, filtrees: 2, conflitsNonTranches: 1 });
    expect(textes(lignes)).toContain("2 lignes filtrées, non importées.");
    expect(textes(lignes)).toContain("1 ligne porte un conflit de règles non tranché.");
    expect(lignes.map((ligne) => ligne.cle)).toEqual([
      "aImporter",
      "aMettreAJour",
      "ignoreesDoublon",
      "filtrees",
      "nonReconnues",
      "conflits",
    ]);
  });
});

describe("recapitulatifApres", () => {
  it("LR4 — les lignes, la période comprise ; virements omis à 0", () => {
    const lignes = recapitulatifApres({
      ...CHIFFRES,
      importees: 1,
      misesAJour: 2,
      etiquettesPosees: 1,
      couvreDu: "2026-08-01",
      couvreAu: "2026-08-31",
    });
    expect(textes(lignes)).toEqual([
      "1 transaction importée.",
      "2 transactions mises à jour.",
      "0 bénéficiaire créé.",
      "1 étiquette posée.",
      "Période couverte : 2026-08-01 → 2026-08-31.",
    ]);
  });

  it("LR4 — virements liés ajoutés ; période retirée si une borne est nulle", () => {
    const base = { ...CHIFFRES, virementsLies: 2, couvreDu: "2026-08-01", couvreAu: null };
    expect(textes(recapitulatifApres(base))).toEqual([
      "0 transaction importée.",
      "0 transaction mise à jour.",
      "0 bénéficiaire créé.",
      "0 étiquette posée.",
      "2 virements liés.",
    ]);
    expect(textes(recapitulatifApres({ ...base, virementsLies: 1 }))).toContain("1 virement lié.");
    expect(textes(recapitulatifApres({ ...CHIFFRES, importees: 3, beneficiairesCrees: 2, misesAJour: 1 }))).toEqual([
      "3 transactions importées.",
      "1 transaction mise à jour.",
      "2 bénéficiaires créés.",
      "0 étiquette posée.",
    ]);
  });
});

describe("rapprochement (docs/lot-m3.md §4.5)", () => {
  it("LR-O1 — récapitulatif avant : accord, omis à 0, entre virements et conflits", () => {
    expect(textes(recapitulatifAvant({ ...COMPTEURS, rapprochements: 1 }))).toContain(
      "1 ligne sera liée à une échéance récurrente.",
    );
    expect(textes(recapitulatifAvant({ ...COMPTEURS, rapprochements: 2 }))).toContain(
      "2 lignes seront liées à une échéance récurrente.",
    );
    expect(recapitulatifAvant(COMPTEURS).some((l) => l.cle === "rapprochements")).toBe(false);
    const cles = recapitulatifAvant({ ...COMPTEURS, virements: 1, rapprochements: 1, conflitsNonTranches: 1 }).map((l) => l.cle);
    expect(cles.indexOf("rapprochements")).toBe(cles.indexOf("virements") + 1);
    expect(cles.indexOf("conflits")).toBe(cles.indexOf("rapprochements") + 1);
  });

  it("LR-O2 — récapitulatif après : accord, omis à 0, entre virementsLies et période", () => {
    expect(textes(recapitulatifApres({ ...CHIFFRES, occurrencesLiees: 1 }))).toContain("1 paiement lié à son échéance.");
    expect(textes(recapitulatifApres({ ...CHIFFRES, occurrencesLiees: 2 }))).toContain("2 paiements liés à leur échéance.");
    expect(recapitulatifApres(CHIFFRES).some((l) => l.cle === "occurrencesLiees")).toBe(false);
    const cles = recapitulatifApres({
      ...CHIFFRES,
      virementsLies: 1,
      occurrencesLiees: 1,
      couvreDu: "2026-08-01",
      couvreAu: "2026-08-31",
    }).map((l) => l.cle);
    expect(cles.indexOf("occurrencesLiees")).toBe(cles.indexOf("virementsLies") + 1);
    expect(cles.indexOf("periode")).toBe(cles.indexOf("occurrencesLiees") + 1);
  });

  const conflit = (motif: OccurrenceEnConflitAffichee["motif"], surcharge: Partial<OccurrenceEnConflitAffichee> = {}) => ({
    date: "2026-10-14",
    description: "NETFLIX.COM",
    motif,
    libelle: "Netflix",
    echeance: "2026-10-12",
    ...surcharge,
  });

  it("LR-O3 — un conflit PRISE ou LIEE_ENTRE_TEMPS : le message de la spec", () => {
    const attendu = "Rien n'a été enregistré : le paiement Netflix du 12 octobre vient d'être lié ailleurs.";
    expect(messageOccurrencesEnConflit([conflit("PRISE")])).toBe(attendu);
    expect(messageOccurrencesEnConflit([conflit("LIEE_ENTRE_TEMPS")])).toBe(attendu);
  });

  it("LR-O4 — INTROUVABLE, AUTRE_COMPTE, PLUS_CANDIDATE : fragments exacts", () => {
    expect(messageOccurrencesEnConflit([conflit("INTROUVABLE", { libelle: null, echeance: null })])).toBe(
      "Rien n'a été enregistré : l'échéance proposée pour la ligne du 2026-10-14 (NETFLIX.COM) n'existe plus.",
    );
    expect(messageOccurrencesEnConflit([conflit("AUTRE_COMPTE")])).toBe(
      "Rien n'a été enregistré : l'échéance Netflix du 12 octobre n'est pas du compte de la ligne du 2026-10-14.",
    );
    expect(messageOccurrencesEnConflit([conflit("PLUS_CANDIDATE")])).toBe(
      "Rien n'a été enregistré : l'échéance Netflix du 12 octobre ne correspond plus à la ligne du 2026-10-14.",
    );
  });

  it("LR-O4 — libellé ou échéance absents hors INTROUVABLE : retombe sur le fragment « n'existe plus »", () => {
    expect(messageOccurrencesEnConflit([conflit("PRISE", { libelle: null })])).toBe(
      "Rien n'a été enregistré : l'échéance proposée pour la ligne du 2026-10-14 (NETFLIX.COM) n'existe plus.",
    );
  });

  it("LR-O5 — deux conflits : séparateur « ; », un seul point final", () => {
    const m = messageOccurrencesEnConflit([conflit("PRISE"), conflit("PLUS_CANDIDATE", { echeance: "2026-11-01" })]);
    expect(m).toBe(
      "Rien n'a été enregistré : le paiement Netflix du 12 octobre vient d'être lié ailleurs ; l'échéance Netflix du 1er novembre ne correspond plus à la ligne du 2026-10-14.",
    );
    expect(m.match(/\./g)?.length).toBe(1);
  });

  it("LR-O5 — sept conflits : cinq fragments puis « ; et 2 autres. »", () => {
    const m = messageOccurrencesEnConflit(Array.from({ length: 7 }, () => conflit("PRISE")));
    expect(m.split(" ; ")).toHaveLength(6);
    expect(m.endsWith(" ; et 2 autres.")).toBe(true);
    expect(m.match(/vient d'être lié ailleurs/g)?.length).toBe(5);
    expect(messageOccurrencesEnConflit(Array.from({ length: 6 }, () => conflit("PRISE"))).endsWith(" ; et 1 autre.")).toBe(true);
    expect(messageOccurrencesEnConflit(Array.from({ length: 5 }, () => conflit("PRISE"))).includes("et ")).toBe(false);
  });

  it("LR-O6 — messageOccurrencesTronquees", () => {
    expect(messageOccurrencesTronquees(500)).toBe(
      "Plus de 500 échéances attendues sur la période du relevé : seules les 500 premières ont été comparées aux lignes. Importe le relevé en plusieurs fois.",
    );
  });
});

describe("messages de la revue", () => {
  it("LR5— conflits non tranchés et règles inapplicables", () => {
    expect(messageConflitsNonTranches(1)).toBe("1 ligne porte un conflit de règles non tranché.");
    expect(messageConflitsNonTranches(3)).toBe("3 lignes portent un conflit de règles non tranché.");
    expect(messageReglesInapplicables(1)).toBe("1 règle n'a pas pu être évaluée : configuration invalide.");
    expect(messageReglesInapplicables(2)).toBe("2 règles n'ont pas pu être évaluées : configuration invalide.");
  });

  it("LR6 — la section À importer vide", () => {
    expect(messageAImporterVide(0)).toBe("Aucune ligne à importer.");
    expect(messageAImporterVide(1)).toBe(
      "Aucune ligne dans cette section : 1 ligne réintégrée d'une autre section sera importée.",
    );
    expect(messageAImporterVide(2)).toBe(
      "Aucune ligne dans cette section : 2 lignes réintégrées d'une autre section seront importées.",
    );
  });

  it("LR8 — messages des actions d'enregistrement, à 1 et à 2", () => {
    expect(messageTransactionsIntrouvables(1)).toBe("1 ligne visait une transaction qui n'existe plus.");
    expect(messageTransactionsIntrouvables(2)).toBe("2 lignes visaient une transaction qui n'existe plus.");
    expect(messageEmpreintesEnDouble(1, "2026-08-01 A")).toBe(
      "1 ligne est déjà en base (ou en double dans ce lot) : 2026-08-01 A. Rien n'a été enregistré.",
    );
    expect(messageEmpreintesEnDouble(2, "x · y")).toBe(
      "2 lignes sont déjà en base (ou en double dans ce lot) : x · y. Rien n'a été enregistré.",
    );
  });

  it("LR7 — aucun texte ne contient (s)", () => {
    for (const n of [0, 1, 2, 3]) {
      const tous = [
        ...textes(
          recapitulatifAvant({
            aImporter: n,
            aMettreAJour: n,
            ignoreesDoublon: n,
            filtrees: n,
            nonReconnues: n,
            conflitsNonTranches: n,
            virements: n,
            rapprochements: n,
          }),
        ),
        ...textes(
          recapitulatifApres({
            importees: n,
            misesAJour: n,
            beneficiairesCrees: n,
            etiquettesPosees: n,
            virementsLies: n,
            occurrencesLiees: n,
            couvreDu: "2026-08-01",
            couvreAu: "2026-08-31",
          }),
        ),
        messageConflitsNonTranches(n),
        messageReglesInapplicables(n),
        messageAImporterVide(n),
        messageTransactionsIntrouvables(n),
        messageEmpreintesEnDouble(n, "détail"),
      ];
      for (const texte of tous) {
        expect(texte).not.toContain("(s)");
      }
    }
  });
});
