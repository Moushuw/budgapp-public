// Outil de test : tient un verrou de ligne dans une transaction ouverte pendant qu'une opération concurrente se met
// en attente, sans minuterie : on sonde pg_blocking_pids jusqu'à voir l'opération bloquée. Aucun import de la base au
// chargement : le client est passé en argument.

import type { Prisma, PrismaClient } from "@prisma/client";

export interface VerrouTenu {
  /** Attend (sondage toutes les 20 ms, délai max delaiMs = 5000) qu'au moins une autre session soit bloquée
   *  par la session qui tient le verrou (pg_blocking_pids) ; lève une Error explicite sinon. */
  readonly attendreUnBloque: (delaiMs?: number) => Promise<void>;
  /** Exécute `ensuite` dans la transaction qui tient le verrou, puis la valide ; rend quand elle est validée. */
  readonly relacher: (ensuite?: (tx: Prisma.TransactionClient) => Promise<void>) => Promise<void>;
}

type Ensuite = ((tx: Prisma.TransactionClient) => Promise<void>) | undefined;

const PAUSE_SONDAGE_MS = 20;
const DELAI_PAR_DEFAUT_MS = 5000;
const TIMEOUT_TRANSACTION_TENUE_MS = 30_000;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Ouvre une transaction interactive (timeout 30 000 ms) qui prend `SELECT … WHERE "id" = $1 FOR UPDATE` sur `id`
 *  et lit son `pg_backend_pid()` ; rend dès que le verrou est tenu. */
export async function tenirVerrou(prisma: PrismaClient, id: string): Promise<VerrouTenu> {
  let signalerPid: (pid: number) => void = () => undefined;
  const pidTenu = new Promise<number>((resolve) => {
    signalerPid = resolve;
  });
  let donnerEnsuite: (ensuite: Ensuite) => void = () => undefined;
  const ensuiteDonnee = new Promise<Ensuite>((resolve) => {
    donnerEnsuite = resolve;
  });

  const transaction = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Transaction" WHERE "id" = ${id} FOR UPDATE`;
      const lignes = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`;
      const pid = lignes[0]?.pid;
      if (pid === undefined) {
        throw new Error("pg_backend_pid() n'a rien rendu.");
      }
      signalerPid(pid);
      const ensuite = await ensuiteDonnee;
      if (ensuite !== undefined) {
        await ensuite(tx);
      }
    },
    { timeout: TIMEOUT_TRANSACTION_TENUE_MS, maxWait: TIMEOUT_TRANSACTION_TENUE_MS },
  );
  // Une erreur avant que le verrou soit tenu doit sortir de tenirVerrou, pas rester une promesse orpheline.
  const pid = await Promise.race([pidTenu, transaction.then(() => Promise.reject(new Error("transaction tenue terminée trop tôt")))]);

  return {
    attendreUnBloque: async (delaiMs = DELAI_PAR_DEFAUT_MS) => {
      const limite = Date.now() + delaiMs;
      for (;;) {
        const lignes = await prisma.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
        if ((lignes[0]?.n ?? 0) > 0) {
          return;
        }
        if (Date.now() >= limite) {
          throw new Error(`Aucune session n'est bloquée par le verrou tenu sur ${id} après ${String(delaiMs)} ms.`);
        }
        await pause(PAUSE_SONDAGE_MS);
      }
    },
    relacher: async (ensuite) => {
      donnerEnsuite(ensuite);
      await transaction;
    },
  };
}

/** Les deux id rangés dans l'ordre de la base (SELECT … ORDER BY "id"), pas celui de JavaScript. */
export async function ordreBase(prisma: PrismaClient, a: string, b: string): Promise<readonly [string, string]> {
  const lignes = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Transaction" WHERE "id" IN (${a}, ${b}) ORDER BY "id"`;
  const premier = lignes[0]?.id;
  const second = lignes[1]?.id;
  if (premier === undefined || second === undefined) {
    throw new Error("ordreBase : les deux transactions doivent exister et être distinctes.");
  }
  return [premier, second];
}
