/** Levée dans la $transaction du lot quand la liaison gardée d'une occurrence n'écrit pas une ligne : la transaction est annulée (docs/lot-m3.md §4.5). Jamais hors d'un repository. */
export class CourseOccurrence extends Error {}
