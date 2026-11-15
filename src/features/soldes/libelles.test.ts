import { describe, expect, it } from "vitest";
import { formatMontant } from "@/domain/money";
import type { AncrageAffiche } from "@/domain/solde";
import {
  consequenceSuppressionAncrage,
  detailAjustement,
  libelleAjustement,
  libelleBoutonAjustement,
  libelleSaisie,
  libelleSuppressionAncrage,
  LIBELLE_EXPLICATION,
} from "./libelles";

const fmt = (c: number) => formatMontant(c, "CENTS");

function ancrage(reconciliation: AncrageAffiche["reconciliation"]): AncrageAffiche {
  return {
    id: "clx0000000000000000000001",
    accountId: "clx0000000000000000000002",
    date: "2026-09-20",
    source: "RELEVE",
    soldeDeclareCents: 105_000,
    soldeCalculeCents: 100_000,
    ecartCourantCents: 5_000,
    statut: "ECART_OUVERT",
    refusAjustement: null,
    reconciliation,
  };
}

const BASE = `Le solde « Relevé » du 20 septembre 2026 (${fmt(105_000)}) sera supprimé.`;

describe("libellés des soldes", () => {
  it("FL1 — saisie", () => {
    expect(libelleSaisie(0)).toBe("Solde enregistré : il correspond au solde calculé.");
    expect(libelleSaisie(5_000)).toBe(`Solde enregistré : écart de ${fmt(5_000)} à expliquer.`);
    expect(libelleSaisie(-3_500)).toBe(`Solde enregistré : écart de ${fmt(-3_500)} à expliquer.`);
    expect(LIBELLE_EXPLICATION).toBe("Explication enregistrée.");
  });
  it("FL2 — ajustement", () => {
    expect(libelleAjustement(5_000)).toBe(`Ajustement de ${fmt(5_000)} créé : l'écart est soldé.`);
    expect(detailAjustement(true)).toBe(
      "La sous-catégorie « Ajustement de solde » a été créée dans la catégorie « Ajustements ».",
    );
    expect(detailAjustement(false)).toBeNull();
  });
  it("FL3 — suppression", () => {
    expect(libelleSuppressionAncrage(null)).toBe("Solde supprimé.");
    expect(libelleSuppressionAncrage({ montantCents: 5_000 })).toBe(`Solde supprimé, avec son ajustement de ${fmt(5_000)}.`);
  });
  it("FL4 — conséquence de la suppression, quatre variantes", () => {
    expect(consequenceSuppressionAncrage(ancrage(null))).toBe(BASE);
    expect(
      consequenceSuppressionAncrage(ancrage({ id: "r", ecartConstateCents: 5_000, explication: "importé plus tard", ajustement: null })),
    ).toBe(`${BASE} Son explication part avec lui.`);
    const ajustement = { transactionId: "t", date: "2026-09-20", montantCents: 5_000 };
    const phraseAjustement = `Son ajustement de ${fmt(5_000)} sera supprimé avec lui : le solde calculé à partir du 20 septembre 2026 changera d'autant.`;
    expect(consequenceSuppressionAncrage(ancrage({ id: "r", ecartConstateCents: 5_000, explication: null, ajustement }))).toBe(
      `${BASE} ${phraseAjustement}`,
    );
    expect(
      consequenceSuppressionAncrage(ancrage({ id: "r", ecartConstateCents: 5_000, explication: "x", ajustement })),
    ).toBe(`${BASE} Son explication part avec lui. ${phraseAjustement}`);
  });
  it("FL4 — une explication d'espaces ne s'annonce pas", () => {
    expect(
      consequenceSuppressionAncrage(ancrage({ id: "r", ecartConstateCents: 5_000, explication: "   ", ajustement: null })),
    ).toBe(BASE);
  });
  it("FL5 — bouton d'ajustement, écart négatif compris", () => {
    expect(libelleBoutonAjustement(-3_500)).toBe(`Créer un ajustement de ${fmt(-3_500)}`);
    expect(libelleBoutonAjustement(5_000)).toBe(`Créer un ajustement de ${fmt(5_000)}`);
  });
  it("FL5b — bouton d'ajustement refusé : aucun montant", () => {
    expect(libelleBoutonAjustement(0, true)).toBe("Créer un ajustement");
    expect(libelleBoutonAjustement(5_000, true)).toBe("Créer un ajustement");
  });
});
