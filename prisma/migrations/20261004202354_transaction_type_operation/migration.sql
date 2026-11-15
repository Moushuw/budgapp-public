-- docs/lot-m2.md §3.1 : type d'opération persisté à l'import ; null pour les transactions antérieures (ligneBrute n'est pas stocké).
-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "typeOperation" TEXT;
