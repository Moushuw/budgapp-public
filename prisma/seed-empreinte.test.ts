// Preuve que le générateur du seed n'a pas été décalé par docs/lot-m3.md §4.8
// (Netflix n'est plus enregistré comme récurrence confirmée) : les transactions
// du seed restent identiques, octet pour octet.
//
// Les deux constantes ont été capturées sur le seed d'avant ce changement, avec
// `prisma/seed.ts` inchangé. Pour les revérifier, mettre de côté le seul
// `seed.ts` (git stash), relancer ce test, puis le restaurer. Elles ne se
// recapturent jamais après une modification du seed : un échec ici veut dire
// que le générateur pseudo-aléatoire a été décalé.
//
// Exception unique : l'empreinte a été recapturée pour la publication du dépôt,
// après le remplacement de trois libellés de bénéficiaires (noms de lieux) dans
// `seed.ts`. Aucun appel au générateur n'a changé ; NB_TRANSACTIONS_SEED est
// resté identique.

import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { depuisDateUtc } from "../src/domain/dates";
import { creerFabriqueIdentifiants, GRAINE_IDENTIFIANTS_SEED } from "./identifiant-seed";

const NB_IDENTIFIANTS_SONDES = 5000; // > nombre de transactions du seed (~909) + 1
const TAILLE_LOT = 1000;
const NB_TRANSACTIONS_SEED = 909;
const EMPREINTE_TRANSACTIONS_SEED = "f272dda6454ff1ed8380ea0c3e414d879a40825579fe6dec2172f80d95f9d16d";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

async function calculerEmpreinte(): Promise<{ nb: number; empreinte: string }> {
  const nouvelIdentifiant = creerFabriqueIdentifiants(GRAINE_IDENTIFIANTS_SEED);
  const ids: string[] = [];
  for (let i = 0; i < NB_IDENTIFIANTS_SONDES; i += 1) {
    ids.push(nouvelIdentifiant());
  }

  const lignes: { id: string; texte: string }[] = [];
  for (let debut = 0; debut < ids.length; debut += TAILLE_LOT) {
    const lot = ids.slice(debut, debut + TAILLE_LOT);
    const transactions = await prisma.transaction.findMany({
      where: { id: { in: lot } },
      select: {
        id: true,
        date: true,
        montantCents: true,
        description: true,
        source: true,
        parentId: true,
        account: { select: { nom: true } },
      },
    });
    for (const t of transactions) {
      lignes.push({
        id: t.id,
        texte: `${t.id}\t${t.account.nom}\t${depuisDateUtc(t.date)}\t${t.montantCents}\t${t.description}\t${t.source}\t${t.parentId ?? ""}`,
      });
    }
  }

  lignes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const empreinte = createHash("sha256")
    .update(lignes.map((ligne) => ligne.texte).join("\n"))
    .digest("hex");
  return { nb: lignes.length, empreinte };
}

describe("empreinte des transactions du seed (docs/lot-m3.md §4.8)", () => {
  it("SE1 — le nombre de transactions du seed n'a pas changé", async () => {
    const { nb } = await calculerEmpreinte();
    expect(nb).toBe(NB_TRANSACTIONS_SEED);
    expect(NB_TRANSACTIONS_SEED).toBeLessThan(NB_IDENTIFIANTS_SONDES - 1);
  });

  it("SE2 — l'empreinte des transactions du seed n'a pas changé", async () => {
    const { empreinte } = await calculerEmpreinte();
    expect(empreinte).toBe(EMPREINTE_TRANSACTIONS_SEED);
  });
});
