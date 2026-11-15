// Messages de course isolés hors de transactions.ts : un fichier "use server" n'exporte que des fonctions asynchrones
// (modèle : rules-constantes.ts). docs/lot-m2.md §4.4 ; journal d'INDEX.md 2026-10-06.

import type { ObjetCourse } from "@/server/repositories/course-virement";

export type PorteeCourse = "UNITAIRE" | "MASSE";

export const MESSAGE_VIREMENT_COURSE =
  "L'autre côté vient d'être lié, modifié ou supprimé par ailleurs (deux onglets ouverts ?). Rien n'a été modifié.";

const MESSAGES_COURSE: Record<ObjetCourse, Record<PorteeCourse, string>> = {
  LIGNE: {
    UNITAIRE:
      "Cette transaction vient d'être liée, modifiée ou supprimée par ailleurs (deux onglets ouverts ?). Rien n'a été modifié.",
    MASSE:
      "Une transaction de la sélection vient d'être liée, modifiée ou supprimée par ailleurs (deux onglets ouverts ?). Rien n'a été modifié.",
  },
  AUTRE_COTE: {
    UNITAIRE: MESSAGE_VIREMENT_COURSE,
    MASSE:
      "L'autre côté d'un virement de la sélection vient d'être lié, modifié ou supprimé par ailleurs (deux onglets ouverts ?). Rien n'a été modifié.",
  },
  LIGNE_OU_AUTRE_COTE: {
    UNITAIRE:
      "Cette transaction ou l'autre côté de son virement a changé entre-temps (deux onglets ouverts ?). Rien n'a été modifié.",
    MASSE:
      "Une transaction de la sélection, ou l'autre côté d'un de ses virements, a changé entre-temps (deux onglets ouverts ?). Rien n'a été modifié.",
  },
};

export function messageCourse(objet: ObjetCourse, portee: PorteeCourse): string {
  return MESSAGES_COURSE[objet][portee];
}
