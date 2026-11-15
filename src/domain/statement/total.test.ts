// docs/lot-m1.md §5.9 — contrôle du total du relevé.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyserReleve } from "./analyser";
import { DESJARDINS_ACCESD } from "./profils";
import { controlerTotal } from "./total";
import type { ProfilImport } from "./types";

const ANNEE = 2026;

function lireTexte(nom: string): string {
  return readFileSync(new URL(`./fixtures/${nom}.txt`, import.meta.url), "utf8");
}

function controler(texte: string, profil: ProfilImport = DESJARDINS_ACCESD) {
  const { reconnues } = analyserReleve(texte, profil, ANNEE);
  return controlerTotal(texte, profil, reconnues);
}

describe("controlerTotal — fixtures", () => {
  it("T1 : visa-desjardins-2026-09 concorde", () => {
    expect(controler(lireTexte("visa-desjardins-2026-09"))).toEqual({
      numeroLigne: 27,
      totalReleveCents: 42,
      sommeReconnuesCents: 42,
      ecartCents: 0,
    });
  });

  it("T2 : une transaction retirée du texte fait apparaître l'écart", () => {
    const lignes = lireTexte("visa-desjardins-2026-09").split("\n");
    expect(lignes[25]).toBe("6 Septembre Stockage Nuage Mensuel 2,79 $");
    const texte = lignes.filter((_, index) => index !== 25).join("\n");

    const { reconnues } = analyserReleve(texte, DESJARDINS_ACCESD, ANNEE);
    expect(reconnues).toHaveLength(8);
    expect(controlerTotal(texte, DESJARDINS_ACCESD, reconnues)).toEqual({
      numeroLigne: 26,
      totalReleveCents: 42,
      sommeReconnuesCents: 321,
      ecartCents: 279,
    });
  });

  it("T3 : cheque-desjardins concorde", () => {
    expect(controler(lireTexte("cheque-desjardins"))).toEqual({
      numeroLigne: 123,
      totalReleveCents: -27830,
      sommeReconnuesCents: -27830,
      ecartCents: 0,
    });
  });

  it("T4 : visa-desjardins, l'anonymisation connue donne un écart de -19,00 $", () => {
    expect(controler(lireTexte("visa-desjardins"))).toEqual({
      numeroLigne: 78,
      totalReleveCents: 48106,
      sommeReconnuesCents: 46206,
      ecartCents: -1900,
    });
  });

  it("T5 : cas-limites n'a pas de Total, pas de contrôle", () => {
    expect(controler(lireTexte("cas-limites"))).toBeNull();
  });

  it("T13 : le contrat d'analyserReleve ne change pas, 42 rejets AUCUNE_DATE sur la fixture de septembre", () => {
    const resultat = analyserReleve(lireTexte("visa-desjardins-2026-09"), DESJARDINS_ACCESD, ANNEE);
    expect(resultat.rejetees).toHaveLength(42);
    expect(resultat.rejetees.every((r) => r.raison === "AUCUNE_DATE")).toBe(true);
  });
});

describe("controlerTotal — cas limites", () => {
  it("T6 : un profil sans controleTotal rend null même avec une ligne Total", () => {
    const sansControle: ProfilImport = { ...DESJARDINS_ACCESD, controleTotal: undefined };
    expect(controler("15 août X 10,00 $\nTotal 5,00 $", sansControle)).toBeNull();
  });

  it("T7 : une ligne Total sans montant lisible rend null", () => {
    expect(controler("15 août X 10,00 $\nTotal\t\t")).toBeNull();
  });

  it("T8 : PLUS_EXPLICITE, un Total sans signe est une sortie comme les transactions", () => {
    expect(controler("15 août X 10,00 $\nTotal 10,00 $")).toEqual({
      numeroLigne: 2,
      totalReleveCents: -1000,
      sommeReconnuesCents: -1000,
      ecartCents: 0,
    });
  });

  it("T9 : MOINS_EXPLICITE, le même texte donne +1000 des deux côtés", () => {
    const profil: ProfilImport = { ...DESJARDINS_ACCESD, regleSigne: "MOINS_EXPLICITE" };
    expect(controler("15 août X 10,00 $\nTotal 10,00 $", profil)).toEqual({
      numeroLigne: 2,
      totalReleveCents: 1000,
      sommeReconnuesCents: 1000,
      ecartCents: 0,
    });
  });

  it("T10 : signes opposés, l'écart est la différence signée", () => {
    expect(controler("15 août X +5,00 $\nTotal −5,00 $")).toEqual({
      numeroLigne: 2,
      totalReleveCents: -500,
      sommeReconnuesCents: 500,
      ecartCents: 1000,
    });
  });

  it("T11 : un Total à zéro, sans aucune reconnue, concorde", () => {
    expect(controler("Total 0,00 $")).toEqual({
      numeroLigne: 1,
      totalReleveCents: 0,
      sommeReconnuesCents: 0,
      ecartCents: 0,
    });
  });

  it("T12 : plusieurs Total, la première ligne lisible compte", () => {
    expect(controler("15 août X 10,00 $\nTotal\t\t\nTotal 10,00 $\nTotal 99,00 $")).toEqual({
      numeroLigne: 3,
      totalReleveCents: -1000,
      sommeReconnuesCents: -1000,
      ecartCents: 0,
    });
  });

  it("aucune reconnue mais un Total non nul : alerte (écart non nul)", () => {
    expect(controler("Total 5,00 $")).toEqual({
      numeroLigne: 1,
      totalReleveCents: -500,
      sommeReconnuesCents: 0,
      ecartCents: 500,
    });
  });

  it("les fins de ligne Windows ne décalent pas le numéro de ligne", () => {
    expect(controler("15 août X 10,00 $\r\nTotal 10,00 $")?.numeroLigne).toBe(2);
  });

  it("un texte vide ne lève pas et rend null", () => {
    expect(controler("")).toBeNull();
  });
});
