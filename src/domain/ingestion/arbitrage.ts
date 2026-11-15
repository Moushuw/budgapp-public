// Extrait de pipeline.ts — relecture tranche 6, point 8 : etat-revue.ts
// ("use client") a besoin de conflitNonTranche, mais pipeline.ts importe
// calculerEmpreinte (./empreinte.ts, node:crypto) pour sa propre
// orchestration. Passer par le barillet @/domain/ingestion ou par pipeline.ts
// directement ferait dépendre le bundle client de l'arbre de modules de
// empreinte.ts, tree-shaking ou pas — établi au runtime (npm run dev,
// /transactions/import, aucune erreur) que ce n'était pas déjà le cas, mais
// une frontière de module explicite ne dépend d'aucune optimisation de
// bundler. Le calcul de l'empreinte reste entièrement côté serveur ; ceci
// n'est qu'un découpage de fichier, pas un changement de comportement.

import type { ConflitRegles, SlotAffectation } from "../categorization";

/** Un conflit dont le créneau n'a pas encore été arbitré par l'utilisateur. */
export function conflitNonTranche(
  conflits: readonly ConflitRegles[],
  slotsArbitres: readonly SlotAffectation[],
): boolean {
  return conflits.some((conflit) => !slotsArbitres.includes(conflit.slot));
}
