// Barillet côté client (revue d'import, schémas, détail). Il ne réexporte volontairement pas le module de hachage,
// qui dépend d'une API serveur : le serveur l'importe directement (même raison que domain/ventilation/index.ts).
export * from "./types";
export * from "./liaison";
export * from "./candidats";
export * from "./description";
export * from "./doublons";
