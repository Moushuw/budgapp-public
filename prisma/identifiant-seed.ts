// Identifiants au format cuid pour le seed. Ne dépend de rien : ni node:crypto,
// ni bibliothèque, ni seed.ts (qui lance main() au chargement).

/** Graine des identifiants du seed : la valeur ne change pas (les transactions du seed gardent leurs ids). */
export const GRAINE_IDENTIFIANTS_SEED = 20260906;

function mulberry32(graine: number): () => number {
  let a = graine;
  return function alea(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fabrique d'identifiants au format cuid (v1, comme @default(cuid()) de Prisma) :
 * "c" + 24 caractères [0-9a-z], 25 au total. Déterministe : même graine,
 * même suite. Utilise SA PROPRE instance mulberry32, jamais celle du seed.
 */
export function creerFabriqueIdentifiants(graine: number): () => string {
  const alea = mulberry32(graine);
  return function nouvelIdentifiant(): string {
    let id = "c";
    for (let i = 0; i < 24; i += 1) {
      id += Math.floor(alea() * 36).toString(36);
    }
    return id;
  };
}
