// Vérifie la migration §3.3 de docs/lot-m1.md : Payee.sousCategorieParDefautId
// pointe vers une vraie sous-catégorie pour les bénéficiaires qui en portent une,
// et reste nul pour les autres — les deux branches doivent exister.
//
// Ce test lit la base de test (schéma `test` de budgapp_dev), migrée et seedée par prisma/test/preparer-base-de-test.ts à chaque lancement de Vitest ; il ne touche jamais la base de dev.

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const prisma = new PrismaClient();

// Même correspondance que prisma/seed.ts — SOUS_CATEGORIE_PAR_DEFAUT.
const SOUS_CATEGORIE_PAR_DEFAUT: Record<string, string> = {
  "HYDRO-QUEBEC": "Électricité",
  VIDEOTRON: "Internet",
  "NETFLIX.COM": "Streaming",
  "MICROSOFT 365": "Logiciels",
  "STATIONNEMENT INDIGO": "Stationnement",
  "PHARMACIE JEAN COUTU": "Pharmacie",
};

// Bénéficiaires du seed (prisma/seed.ts, PAYEES_BRUTS) sans sous-catégorie par défaut.
const HORS_TABLE = ["IGA VALBRUME", "TIM HORTONS", "AMAZON.CA"] as const;

let payees: {
  nom: string;
  sousCategorieParDefautId: string | null;
  sousCategorieParDefaut: { nom: string } | null;
}[] = [];

beforeAll(async () => {
  payees = await prisma.payee.findMany({
    where: { nom: { in: [...Object.keys(SOUS_CATEGORIE_PAR_DEFAUT), ...HORS_TABLE] } },
    select: {
      nom: true,
      sousCategorieParDefautId: true,
      sousCategorieParDefaut: { select: { nom: true } },
    },
  });
  expect(payees.length).toBeGreaterThan(0); // la base doit être seedée avant ce test
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Payee.sousCategorieParDefautId après le seed", () => {
  it("chaque bénéficiaire de la table porte la bonne sous-catégorie par défaut", () => {
    for (const [nom, nomSousCategorie] of Object.entries(SOUS_CATEGORIE_PAR_DEFAUT)) {
      const payee = payees.find((p) => p.nom === nom);
      expect(payee).toBeDefined();
      expect(payee?.sousCategorieParDefautId).not.toBeNull();
      expect(payee?.sousCategorieParDefaut?.nom).toBe(nomSousCategorie);
    }
  });

  it("au moins un bénéficiaire hors de la table n'a pas de sous-catégorie par défaut", () => {
    const horsTable = payees.filter((p) => !(p.nom in SOUS_CATEGORIE_PAR_DEFAUT));
    expect(horsTable.length).toBeGreaterThan(0);
    expect(horsTable.some((p) => p.sousCategorieParDefautId === null)).toBe(true);
  });

  it("aucun sousCategorieParDefautId ne pointe vers une sous-catégorie inexistante", () => {
    for (const payee of payees) {
      if (payee.sousCategorieParDefautId !== null) {
        expect(payee.sousCategorieParDefaut).not.toBeNull();
      }
    }
  });
});
