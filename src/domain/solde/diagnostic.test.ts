import { describe, expect, it } from "vitest";
import { formatMontant } from "../money";
import type { SourceIngestion } from "../referentiel";
import { explicationsProbables } from "./diagnostic";
import {
  ORDRE_EXPLICATIONS,
  type ContexteDiagnostic,
  type Explication,
  type NatureExplication,
  type PaireQuasiDoublon,
  type TransactionDiagnostic,
} from "./types";

const fmt = (c: number) => formatMontant(c, "CENTS");

const BASE: ContexteDiagnostic = {
  dateAncrage: "2026-09-20",
  ecartCourantCents: 5_000,
  dateAncragePrecedent: "2026-07-20",
  dateDerniereTransaction: "2026-09-25",
  finCouvertureImports: null,
  enAttente: { nombre: 0, sommeCents: 0 },
  quasiDoublons: [],
  quasiDoublonsTronques: false,
  transactionsAVerifier: [],
  transactionsAVerifierTronquees: false,
};

function tx(id: string, date: string, montantCents: number, source: SourceIngestion, description = "X"): TransactionDiagnostic {
  return { id, date, montantCents, description, source };
}

function entree<N extends NatureExplication>(c: ContexteDiagnostic, nature: N): Extract<Explication, { nature: N }> {
  const e = explicationsProbables(c).find((x) => x.nature === nature);
  if (e === undefined) throw new Error("entrée absente");
  return e as Extract<Explication, { nature: N }>;
}

const PORTEE_PRECEDENT = "entre l'ancrage précédent et celui-ci";
const PORTEE_AUCUN = "jusqu'à cet ancrage";

describe("explicationsProbables", () => {
  it("DG1 — toujours cinq entrées dans l'ordre constant", () => {
    expect(explicationsProbables(BASE).map((e) => e.nature)).toEqual([...ORDRE_EXPLICATIONS]);
    const paire: PaireQuasiDoublon = { a: tx("a", "2026-08-01", -1, "COPIER_COLLER"), b: tx("b", "2026-08-02", -1, "COPIER_COLLER") };
    const tout: ContexteDiagnostic = {
      ...BASE,
      dateDerniereTransaction: "2026-09-01",
      enAttente: { nombre: 2, sommeCents: -100 },
      quasiDoublons: [paire],
      transactionsAVerifier: [tx("m", "2026-09-02", -450, "MANUELLE")],
    };
    expect(explicationsProbables(tout).map((e) => e.nature)).toEqual([...ORDRE_EXPLICATIONS]);
    expect(explicationsProbables(tout)).toHaveLength(5);
  });

  describe("DG2 — période non couverte", () => {
    const m = (c: Partial<ContexteDiagnostic>) => entree({ ...BASE, ...c }, "PERIODE_NON_COUVERTE");
    it("(a) un lot qui s'arrête avant, aucune transaction", () => {
      const e = m({ finCouvertureImports: "2026-09-05", dateDerniereTransaction: null });
      expect(e.constat).toBe("PISTE");
      expect(e.message).toBe(
        "Le dernier import s'arrête au 5 septembre ; l'ancrage est daté du 20 septembre. Il manque probablement des transactions.",
      );
    });
    it("(b) une transaction avant, aucun lot", () => {
      const e = m({ finCouvertureImports: null, dateDerniereTransaction: "2026-09-05" });
      expect(e.constat).toBe("PISTE");
      expect(e.message).toBe(
        "La transaction la plus récente du compte date du 5 septembre ; l'ancrage est daté du 20 septembre. Il manque probablement des transactions.",
      );
    });
    it("(c) lot plus ancien que la transaction : la transaction parle", () => {
      expect(m({ finCouvertureImports: "2026-09-05", dateDerniereTransaction: "2026-09-10" }).message).toBe(
        "La transaction la plus récente du compte date du 10 septembre ; l'ancrage est daté du 20 septembre. Il manque probablement des transactions.",
      );
    });
    it("(d) lot plus récent que la transaction : le lot parle", () => {
      expect(m({ finCouvertureImports: "2026-09-10", dateDerniereTransaction: "2026-09-05" }).message).toBe(
        "Le dernier import s'arrête au 10 septembre ; l'ancrage est daté du 20 septembre. Il manque probablement des transactions.",
      );
    });
    it("(e) fin égale à l'ancrage : rien", () => {
      const e = m({ dateDerniereTransaction: "2026-09-20" });
      expect(e.constat).toBe("RIEN");
      expect(e.message).toBe("Couverture complète jusqu'à l'ancrage.");
    });
    it("(f) fin après l'ancrage : rien", () => {
      const e = m({ dateDerniereTransaction: "2026-09-25" });
      expect(e.constat).toBe("RIEN");
      expect(e.message).toBe("Couverture complète jusqu'à l'ancrage.");
    });
    it("(g) ni transaction ni import : piste", () => {
      const e = m({ dateDerniereTransaction: null, finCouvertureImports: null });
      expect(e.constat).toBe("PISTE");
      expect(e.message).toBe(
        "Aucune transaction ni aucun import sur ce compte : rien ne couvre la période jusqu'à l'ancrage.",
      );
    });
    it("(h) l'année apparaît quand elle diffère de celle de l'ancrage", () => {
      expect(
        m({ dateAncrage: "2026-01-05", finCouvertureImports: "2025-12-28", dateDerniereTransaction: null }).message,
      ).toBe(
        "Le dernier import s'arrête au 28 décembre 2025 ; l'ancrage est daté du 5 janvier. Il manque probablement des transactions.",
      );
    });
    it("(i) premier du mois en ordinal", () => {
      expect(
        m({ dateAncrage: "2026-09-01", finCouvertureImports: "2026-08-01", dateDerniereTransaction: null }).message,
      ).toBe(
        "Le dernier import s'arrête au 1er août ; l'ancrage est daté du 1er septembre. Il manque probablement des transactions.",
      );
    });
    it("un lot daté exactement comme la transaction : le lot parle", () => {
      expect(m({ finCouvertureImports: "2026-09-05", dateDerniereTransaction: "2026-09-05" }).message).toMatch(
        /^Le dernier import/,
      );
    });
  });

  describe("DG3 — en attente", () => {
    it("aucune", () => {
      const e = entree(BASE, "EN_ATTENTE");
      expect(e.constat).toBe("RIEN");
      expect(e.message).toBe("Aucune transaction en attente.");
    });
    it("une seule", () => {
      const e = entree({ ...BASE, enAttente: { nombre: 1, sommeCents: -1_200 } }, "EN_ATTENTE");
      expect(e.constat).toBe("PISTE");
      expect(e.message).toBe(
        `1 transaction en attente, de ${fmt(-1_200)}, est comptée dans le solde calculé : la banque ne l'a peut-être pas encore portée au solde déclaré.`,
      );
      expect(e.nombre).toBe(1);
      expect(e.sommeCents).toBe(-1_200);
    });
    it("plusieurs", () => {
      const e = entree({ ...BASE, enAttente: { nombre: 3, sommeCents: -6_200 } }, "EN_ATTENTE");
      expect(e.message).toBe(
        `3 transactions en attente, pour un total de ${fmt(-6_200)}, sont comptées dans le solde calculé : la banque ne les a peut-être pas encore portées au solde déclaré.`,
      );
      expect(e.nombre).toBe(3);
      expect(e.sommeCents).toBe(-6_200);
    });
  });

  describe("DG4 — doublons", () => {
    const paire = (n: number): PaireQuasiDoublon => ({
      a: tx(`a${n}`, "2026-08-01", -1_000, "COPIER_COLLER", "CAFE"),
      b: tx(`b${n}`, "2026-08-02", -1_000, "COPIER_COLLER", "CAFE"),
    });
    const T = 3;
    it("aucune paire, avec ancrage précédent", () => {
      const e = entree(BASE, "DOUBLON");
      expect(e.constat).toBe("RIEN");
      expect(e.message).toBe(`Aucun doublon possible ${PORTEE_PRECEDENT}.`);
      expect(e.tronquee).toBe(false);
    });
    it("aucune paire, sans ancrage précédent", () => {
      expect(entree({ ...BASE, dateAncragePrecedent: null }, "DOUBLON").message).toBe(
        "Aucun doublon possible jusqu'à cet ancrage.",
      );
    });
    it("une paire", () => {
      const e = entree({ ...BASE, quasiDoublons: [paire(1)] }, "DOUBLON");
      expect(e.constat).toBe("PISTE");
      expect(e.message).toContain("1 paire de transactions identiques (même montant, même description, à ");
      expect(e.message).toBe(
        `1 paire de transactions identiques (même montant, même description, à ${T} jours ou moins d'écart) ${PORTEE_PRECEDENT} : l'une est peut-être comptée deux fois.`,
      );
    });
    it("deux paires, recopiées dans l'ordre reçu", () => {
      const paires = [paire(2), paire(1)];
      const e = entree({ ...BASE, quasiDoublons: paires, dateAncragePrecedent: null }, "DOUBLON");
      expect(e.message).toBe(
        `2 paires de transactions identiques (même montant, même description, à ${T} jours ou moins d'écart) ${PORTEE_AUCUN} : l'une de chaque paire est peut-être comptée deux fois.`,
      );
      expect(e.paires).toEqual(paires);
    });
    it("vingt paires tronquées", () => {
      const paires = Array.from({ length: 20 }, (_, i) => paire(i));
      const e = entree({ ...BASE, quasiDoublons: paires, quasiDoublonsTronques: true }, "DOUBLON");
      expect(e.tronquee).toBe(true);
      expect(e.constat).toBe("PISTE");
      expect(e.message).toBe(
        `Plus de 20 paires de transactions identiques (même montant, même description, à ${T} jours ou moins d'écart) ${PORTEE_PRECEDENT} : seules les 20 premières sont affichées.`,
      );
      expect(e.paires).toHaveLength(20);
    });
  });

  it("DG5 — la ligne non reconnue est un rappel, quel que soit le contexte", () => {
    const attendu =
      "Une ligne écartée à l'import a peut-être été oubliée : vérifie la section Non reconnues lors du prochain import.";
    for (const c of [BASE, { ...BASE, dateAncragePrecedent: null, ecartCourantCents: 0 }, { ...BASE, enAttente: { nombre: 2, sommeCents: -5 } }]) {
      const e = entree(c, "LIGNE_NON_RECONNUE");
      expect(e.constat).toBe("RAPPEL");
      expect(e.message).toBe(attendu);
    }
  });

  describe("DG6 — montant erroné", () => {
    const m = (c: Partial<ContexteDiagnostic>) => entree({ ...BASE, ...c }, "MONTANT_ERRONE");
    it("(a) aucune ligne", () => {
      const e = m({});
      expect(e.constat).toBe("RIEN");
      expect(e.message).toBe(
        `Aucune transaction saisie à la main ni aucune transaction du montant de l'écart ${PORTEE_PRECEDENT}.`,
      );
      expect(e.lignes).toEqual([]);
      expect(e.tronquee).toBe(false);
    });
    it("(b) montant égal à l'écart, au signe près", () => {
      const e = m({ transactionsAVerifier: [tx("t1", "2026-09-03", -5_000, "COPIER_COLLER")] });
      expect(e.constat).toBe("PISTE");
      expect(e.message).toBe(`1 transaction à vérifier ${PORTEE_PRECEDENT}.`);
      expect(e.lignes).toHaveLength(1);
      expect(e.lignes[0]?.motif).toBe("MONTANT_EGAL_ECART");
      expect(e.lignes[0]?.message).toBe(`Une transaction de ${fmt(5_000)} le 3 septembre : comptée en trop ou manquante ?`);
    });
    it("(c) saisie à la main", () => {
      const e = m({ transactionsAVerifier: [tx("t1", "2026-09-02", -450, "MANUELLE", "CAFE")] });
      expect(e.lignes[0]?.motif).toBe("MANUELLE");
      expect(e.lignes[0]?.message).toBe(`Saisie à la main : CAFE, ${fmt(-450)} le 2 septembre.`);
    });
    it("(d) manuelle et du montant de l'écart : les deux", () => {
      const e = m({ transactionsAVerifier: [tx("t1", "2026-09-02", 5_000, "MANUELLE")] });
      expect(e.lignes[0]?.motif).toBe("LES_DEUX");
      expect(e.lignes[0]?.message).toBe(
        `Une transaction de ${fmt(5_000)} le 2 septembre, saisie à la main : comptée en trop ou manquante ?`,
      );
    });
    it("(e) écart nul : une transaction de montant nul n'est pas une piste", () => {
      const e = m({ ecartCourantCents: 0, transactionsAVerifier: [tx("t1", "2026-09-02", 0, "COPIER_COLLER")] });
      expect(e.constat).toBe("RIEN");
      expect(e.lignes).toEqual([]);
    });
    it("(e bis) une transaction qui n'est ni manuelle ni du montant de l'écart est écartée", () => {
      const e = m({ transactionsAVerifier: [tx("t1", "2026-09-02", -777, "COPIER_COLLER")] });
      expect(e.lignes).toEqual([]);
      expect(e.constat).toBe("RIEN");
    });
    it("(f) tri : date décroissante puis id croissant", () => {
      const e = m({
        transactionsAVerifier: [
          tx("b", "2026-09-02", -5_000, "COPIER_COLLER"),
          tx("z", "2026-09-10", -5_000, "COPIER_COLLER"),
          tx("a", "2026-09-02", -5_000, "COPIER_COLLER"),
        ],
      });
      expect(e.lignes.map((l) => l.transaction.id)).toEqual(["z", "a", "b"]);
      expect(e.message).toBe(`3 transactions à vérifier ${PORTEE_PRECEDENT}.`);
    });
    it("(g) tronqué", () => {
      const e = m({
        transactionsAVerifier: [tx("t1", "2026-09-02", -5_000, "COPIER_COLLER")],
        transactionsAVerifierTronquees: true,
      });
      expect(e.tronquee).toBe(true);
      expect(e.message).toBe(
        `Plus de 20 transactions à vérifier ${PORTEE_PRECEDENT} : seules les 20 premières sont affichées.`,
      );
    });
    it("(h) une date d'une autre année porte l'année", () => {
      const e = m({ transactionsAVerifier: [tx("t1", "2025-12-30", -5_000, "COPIER_COLLER")] });
      expect(e.lignes[0]?.message).toBe(
        `Une transaction de ${fmt(5_000)} le 30 décembre 2025 : comptée en trop ou manquante ?`,
      );
    });
    it("sans ancrage précédent, la portée change", () => {
      expect(m({ dateAncragePrecedent: null }).message).toBe(
        `Aucune transaction saisie à la main ni aucune transaction du montant de l'écart ${PORTEE_AUCUN}.`,
      );
    });
  });
});
