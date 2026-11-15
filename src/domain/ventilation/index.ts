// Barillet côté client (schémas zod, revue, éditeur). Il ne réexporte volontairement pas le module de hachage,
// qui dépend d'une API serveur : le serveur et l'outillage e2e l'importent directement (même raison que
// ingestion/arbitrage.ts, journal d'INDEX.md du 2026-09-20).
export * from "./limites";
export * from "./parts";
export * from "./repartition";
export * from "./validation";
