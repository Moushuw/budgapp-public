// Constante isolée hors de rules.ts : un fichier "use server" ne peut
// exporter que des fonctions asynchrones (Next.js 16) — une const exportée
// depuis rules.ts casse `next build` (Turbopack : « Only async functions are
// allowed to be exported in a "use server" file », toutes les autres
// exportations du module, pourtant valides, deviennent alors introuvables
// pour ses consommateurs). rules.ts importe cette constante sans la
// réexporter ; seul rules.test.ts (hors bundle Next) l'importe directement.
export const EXTRAIT_APERCU = 50;
