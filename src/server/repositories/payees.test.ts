// Test d'intégration de candidatsFusion contre le schéma `test` (seedé à chaque
// lancement de Vitest) : écrit trois bénéficiaires à marqueur unique (randomUUID),
// supprimés en afterAll ; ne touche à rien d'autre. Prouve que public.similarity() est
// résolue alors que le search_path de Prisma ne contient que `test`.

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normaliserNom } from "@/domain/ingestion/normaliser";
import { candidatsFusion, SEUIL_SIMILARITE_FUSION } from "./payees";

const prisma = new PrismaClient();

let ownerId: string;
let idAmazonCa: string;
let idSourceTest: string;
const idsPayeesACreer: string[] = [];

beforeAll(async () => {
  const owner = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  ownerId = owner.id;
  const amazon = await prisma.payee.findFirstOrThrow({
    where: { ownerId, nom: "AMAZON.CA" },
    select: { id: true },
  });
  idAmazonCa = amazon.id;

  // Marqueur unique : le test fabrique lui-même au moins deux candidats proches
  // plutôt que de dépendre du contenu du seed.
  const marqueur = `zq${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const noms = [`${marqueur} marche`, `${marqueur} marche centre`, `${marqueur} marche centre ville`];
  for (const nom of noms) {
    const payee = await prisma.payee.create({
      data: { ownerId, nom, nomNormalise: normaliserNom(nom) },
      select: { id: true },
    });
    idsPayeesACreer.push(payee.id);
  }
  const [source] = idsPayeesACreer;
  if (source === undefined) {
    throw new Error("Le bénéficiaire source du test n'a pas été créé.");
  }
  idSourceTest = source;
});

afterAll(async () => {
  await prisma.payee.deleteMany({ where: { id: { in: idsPayeesACreer } } });
  await prisma.$disconnect();
});

describe("candidatsFusion (schéma test)", () => {
  it("P1 trouve AMAZON.COM au-dessus du seuil", async () => {
    const proposition = await candidatsFusion(ownerId, idAmazonCa);
    expect(proposition.seuil).toBe(SEUIL_SIMILARITE_FUSION);
    expect(proposition.source?.nom).toBe("AMAZON.CA");
    const amazonCom = proposition.candidats.find((c) => c.nom === "AMAZON.COM");
    expect(amazonCom).toBeDefined();
    expect(amazonCom?.similarite).toBeGreaterThanOrEqual(SEUIL_SIMILARITE_FUSION);
    expect(amazonCom?.similarite).toBeCloseTo(0.615, 2);
  });

  it("P2 exclut AMZN MKTP CA (sous le seuil) et la source elle-même des candidats", async () => {
    const proposition = await candidatsFusion(ownerId, idAmazonCa);
    expect(proposition.candidats.some((c) => c.nom === "AMZN MKTP CA")).toBe(false);
    expect(proposition.candidats.some((c) => c.id === idAmazonCa)).toBe(false);
  });

  it("P3 trie par similarité décroissante", async () => {
    const { candidats } = await candidatsFusion(ownerId, idSourceTest);
    expect(candidats.length).toBeGreaterThanOrEqual(2);
    const similarites = candidats.map((c) => c.similarite);
    expect(similarites).toEqual([...similarites].sort((a, b) => b - a));
  });

  it("P4 rend une source nulle pour un id inexistant", async () => {
    const proposition = await candidatsFusion(ownerId, "inexistant");
    expect(proposition).toEqual({ seuil: SEUIL_SIMILARITE_FUSION, source: null, candidats: [] });
  });
});
