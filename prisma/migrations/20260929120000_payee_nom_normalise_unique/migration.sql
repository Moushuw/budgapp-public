-- ============================================================================
-- À LIRE AVANT D'APPLIQUER CETTE MIGRATION SUR UNE BASE PORTANT DE VRAIES DONNÉES
-- ============================================================================
--
-- Cette migration pose @@unique([ownerId, nomNormalise]) sur une colonne dont
-- les valeurs existantes ont été calculées par l'ANCIENNE fonction
-- (normaliserDescription, qui retire les jetons numériques : « Les 3
-- Brasseurs » → « LES »). Elle ne les recalcule pas. Elle n'a fonctionné le
-- 2026-09-29 que parce que budgapp_dev ne contenait que le seed, réensemencé
-- (npm run seed) juste après avec la nouvelle fonction.
--
-- Sur une base avec de vraies données, dans cet ordre, AVANT cette migration :
--
--   1. Recalculer Payee.nomNormalise = normaliserNom(nom) pour chaque ligne,
--      par un script TS qui importe normaliserNom depuis
--      src/domain/ingestion/normaliser.ts. PAS par unaccent() en SQL : il ne
--      donne pas le même résultat que la décomposition NFD du domaine (Œ, ß,
--      ligatures), et une clé calculée deux façons n'est plus une clé.
--   2. Chercher les collisions :
--        SELECT "ownerId", "nomNormalise", array_agg("nom"), count(*)
--        FROM "Payee" GROUP BY 1, 2 HAVING count(*) > 1;
--      Chaque paire trouvée est un même marchand saisi deux fois : la faire
--      trancher par l'utilisateur (fusion de bénéficiaires, docs/lot-m1.md
--      §4.3), jamais la résoudre en silence.
--   3. Seulement ensuite, appliquer cette migration.
--
-- Sans les étapes 1 et 2, la contrainte est posée sur des clés périmées : elle
-- laisse passer des doublons réels et peut refuser des noms distincts.
-- Journal INDEX.md du 2026-09-29.

-- DropIndex
DROP INDEX "Payee_ownerId_nomNormalise_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Payee_ownerId_nomNormalise_key" ON "Payee"("ownerId", "nomNormalise");
