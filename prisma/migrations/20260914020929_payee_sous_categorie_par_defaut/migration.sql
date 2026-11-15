-- Renommage sans perte : le SQL généré par défaut (DROP + ADD) viderait la colonne.
ALTER TABLE "Payee" RENAME COLUMN "categorieParDefautId" TO "sousCategorieParDefautId";

-- AddForeignKey
ALTER TABLE "Payee" ADD CONSTRAINT "Payee_sousCategorieParDefautId_fkey" FOREIGN KEY ("sousCategorieParDefautId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
