-- Dépendance versionnée, écrite à la main comme la migration de renommage de Payee :
-- src/server/repositories/payees.ts (candidatsFusion) utilise similarity() de pg_trgm
-- en SQL brut pour proposer des candidats de fusion. INDEX.md §2 affirmait ces deux
-- extensions "créées par le conteneur" -- c'était faux sur budgapp_dev, constaté en
-- tranche 3 quand candidatsFusion échouait faute de fonction similarity(). Pas de
-- previewFeatures = ["postgresqlExtensions"] dans le datasource : la décision de M0
-- (docs/lot-m0.md §2.3) tient, ces deux lignes suffisent.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
