import { trouverOwnerIdUnique } from "@/server/repositories/users";

// Aucun cache : un identifiant mis en cache survivrait à un `npm run seed` et
// pointerait vers un utilisateur détruit. Le jour de l'authentification, seul
// ce fichier change.
export function ownerIdCourant(): Promise<string | null> {
  return trouverOwnerIdUnique();
}
