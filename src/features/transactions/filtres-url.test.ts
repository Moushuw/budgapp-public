import { describe, expect, it } from "vitest";
import { FILTRES_VIDES, TRI_PAR_DEFAUT, type FiltresTransactions } from "@/domain/consultation";
import { hrefTransactions, lireEtatUrl, versParametresUrl, type ParametresRecherche } from "./filtres-url";

const CUID_A = "cm0000000000000000000000a";
const CUID_B = "cm0000000000000000000000b";

function enEnregistrement(parametres: URLSearchParams): ParametresRecherche {
  const enregistrement: Record<string, string | string[]> = {};
  for (const cle of new Set(parametres.keys())) {
    const valeurs = parametres.getAll(cle);
    enregistrement[cle] = valeurs.length === 1 ? (valeurs[0] ?? "") : valeurs;
  }
  return enregistrement;
}

const COMPLET: FiltresTransactions = {
  du: "2026-01-01",
  au: "2026-01-31",
  toutesDates: false,
  texte: "café & crème",
  comptes: [CUID_A, CUID_B],
  sousCategories: [CUID_B],
  nonCategorisee: true,
  beneficiaires: [CUID_A],
  etiquettes: [CUID_A, CUID_B],
  montantMinCents: 1250,
  montantMaxCents: 9900,
  sens: "SORTIES",
  aRevoir: true,
  virements: "EXCLURE",
  recurrences: "SEULEMENT",
  ventileesSeulement: true,
  exclueDuBudget: true,
  exclueDesRapports: true,
};

describe("lireEtatUrl", () => {
  it("rien dans l'URL : filtres vides, tri par défaut, rien d'ignoré", () => {
    expect(lireEtatUrl({})).toEqual({ filtres: FILTRES_VIDES, tri: TRI_PAR_DEFAUT, ignores: [] });
  });

  it("aller-retour d'un état complet", () => {
    const tri = { champ: "MONTANT", ordre: "ASC" } as const;
    const href = hrefTransactions(COMPLET, tri);
    const parametres = new URL(href, "http://localhost").searchParams;
    const lu = lireEtatUrl(enEnregistrement(parametres));
    expect(lu.ignores).toEqual([]);
    expect(lu.filtres).toEqual(COMPLET);
    expect(lu.tri).toEqual(tri);
  });

  it("« aucune » devient nonCategorisee et laisse la liste des identifiants", () => {
    const lu = lireEtatUrl({ sousCategorie: ["aucune", CUID_A] });
    expect(lu.filtres.nonCategorisee).toBe(true);
    expect(lu.filtres.sousCategories).toEqual([CUID_A]);
  });

  it("montantMin en cents ; une forme décimale est ignorée et signalée", () => {
    expect(lireEtatUrl({ montantMin: "1250" }).filtres.montantMinCents).toBe(1250);
    const lu = lireEtatUrl({ montantMin: "12,50" });
    expect(lu.filtres.montantMinCents).toBeNull();
    expect(lu.ignores).toEqual([{ parametre: "montantMin", valeur: "12,50", motif: "Montant illisible : l'adresse attend un nombre de cents, sans virgule ni espace (1250 pour 12,50)." }]);
  });

  it("un montantMin à 21 chiffres est ignoré et signalé", () => {
    const valeur = "100000000000000000000";
    const lu = lireEtatUrl({ montantMin: valeur });
    expect(lu.filtres.montantMinCents).toBeNull();
    expect(lu.ignores).toEqual([{ parametre: "montantMin", valeur, motif: "Montant trop grand." }]);
  });

  it("signale chaque forme non reconnue avec son motif", () => {
    const cas: [ParametresRecherche, string, string][] = [
      [{ aRevoir: "oui" }, "aRevoir", "Valeur attendue : 1."],
      [{ sens: "x" }, "sens", "Valeur attendue : entrees ou sorties."],
      [{ tri: "nom" }, "tri", "Valeur attendue : date ou montant."],
      [{ ordre: "haut" }, "ordre", "Valeur attendue : asc ou desc."],
      [{ texte: ["a", "b"] }, "texte", "Paramètre répété."],
      [{ du: "2026-02-30" }, "du", "Date invalide (AAAA-MM-JJ attendu)."],
    ];
    for (const [parametres, parametre, motif] of cas) {
      const lu = lireEtatUrl(parametres);
      expect(lu.ignores.map((ignore) => [ignore.parametre, ignore.motif])).toEqual([[parametre, motif]]);
    }
  });

  it("un identifiant invalide ne fait tomber que lui", () => {
    const lu = lireEtatUrl({ compte: ["pas-un-cuid", CUID_A] });
    expect(lu.filtres.comptes).toEqual([CUID_A]);
    expect(lu.ignores).toEqual([{ parametre: "compte", valeur: "pas-un-cuid", motif: "Identifiant invalide." }]);
  });

  it("une plage inversée tombe entière, en une seule issue", () => {
    const lu = lireEtatUrl({ du: "2026-09-30", au: "2026-09-01" });
    expect(lu.filtres.du).toBeNull();
    expect(lu.filtres.au).toBeNull();
    expect(lu.ignores).toHaveLength(1);
    expect(lu.ignores[0]?.motif).toBe("La date de fin précède la date de début.");
  });

  it("une date de fin illisible ne neutralise qu'elle-même : du est conservé", () => {
    const lu = lireEtatUrl({ du: "2026-09-01", au: "2026-09-31" });
    expect(lu.filtres.du).toBe("2026-09-01");
    expect(lu.filtres.au).toBeNull();
    expect(lu.ignores.map((ignore) => [ignore.parametre, ignore.valeur])).toEqual([["au", "2026-09-31"]]);
  });

  it("toutesDates avec une plage : signalé", () => {
    const lu = lireEtatUrl({ toutesDates: "1", du: "2026-01-01" });
    expect(lu.ignores).toHaveLength(1);
    expect(lu.ignores[0]?.motif).toBe("« Toutes les dates » exclut une plage du / au.");
    expect(lu.filtres.du).toBeNull();
  });

  it("recurrences : seulement et exclure sont lus", () => {
    expect(lireEtatUrl({ recurrences: "seulement" }).filtres.recurrences).toBe("SEULEMENT");
    expect(lireEtatUrl({ recurrences: "exclure" }).filtres.recurrences).toBe("EXCLURE");
  });

  it("recurrences : une valeur inconnue est ignorée et signalée", () => {
    const lu = lireEtatUrl({ recurrences: "oui" });
    expect(lu.filtres.recurrences).toBe("INCLURE");
    expect(lu.ignores).toEqual([
      { parametre: "recurrences", valeur: "oui", motif: "Valeur attendue : seulement ou exclure." },
    ]);
  });

  it("une clé inconnue n'est pas signalée", () => {
    expect(lireEtatUrl({ foo: "bar" }).ignores).toEqual([]);
  });
});

describe("versParametresUrl et hrefTransactions", () => {
  it("rien pour les valeurs par défaut", () => {
    expect(versParametresUrl(FILTRES_VIDES, TRI_PAR_DEFAUT).toString()).toBe("");
    expect(hrefTransactions(FILTRES_VIDES, TRI_PAR_DEFAUT)).toBe("/transactions");
  });

  it("recurrences : INCLURE n'écrit rien, les deux autres modes s'écrivent", () => {
    expect(versParametresUrl({ ...FILTRES_VIDES, recurrences: "INCLURE" }, TRI_PAR_DEFAUT).has("recurrences")).toBe(false);
    expect(versParametresUrl({ ...FILTRES_VIDES, recurrences: "SEULEMENT" }, TRI_PAR_DEFAUT).get("recurrences")).toBe(
      "seulement",
    );
    expect(versParametresUrl({ ...FILTRES_VIDES, recurrences: "EXCLURE" }, TRI_PAR_DEFAUT).get("recurrences")).toBe("exclure");
  });

  it("le lien de l'indicateur « à revoir »", () => {
    expect(hrefTransactions({ ...FILTRES_VIDES, aRevoir: true, toutesDates: true }, TRI_PAR_DEFAUT)).toBe(
      "/transactions?toutesDates=1&aRevoir=1",
    );
  });
});
