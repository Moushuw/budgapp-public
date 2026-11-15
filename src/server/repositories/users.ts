// Résolution de l'unique utilisateur — décision de plomberie §2 de la spec M1
// tranche 1 : pas d'authentification pour l'instant, un seul propriétaire.

import { prisma } from "@/server/db";

export async function trouverOwnerIdUnique(): Promise<string | null> {
  const utilisateur = await prisma.user.findFirst({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return utilisateur?.id ?? null;
}
