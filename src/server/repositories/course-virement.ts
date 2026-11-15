/** Ce qui a bougé entre la lecture et l'écriture. */
export type ObjetCourse = "LIGNE" | "AUTRE_COTE" | "LIGNE_OU_AUTRE_COTE";

/**
 * Levée dans une $transaction quand un updateMany gardé d'un côté de virement n'écrit pas exactement les lignes
 * attendues : la transaction est annulée (docs/lot-m2.md §4.4). Jamais hors d'un repository.
 */
export class CourseVirement extends Error {
  readonly objet: ObjetCourse;

  constructor(objet: ObjetCourse = "AUTRE_COTE") {
    super("Course sur un côté de virement.");
    this.objet = objet;
  }
}

/** Exécute f ; une CourseVirement devient `siCourse(course)`, toute autre erreur est relancée. */
export async function siCourseVirement<T>(f: () => Promise<T>, siCourse: (course: CourseVirement) => T): Promise<T> {
  try {
    return await f();
  } catch (erreur) {
    if (erreur instanceof CourseVirement) {
      return siCourse(erreur);
    }
    throw erreur;
  }
}
