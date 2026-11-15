"use client";

// Onglets secondaires des Paramètres — docs/lot-m1.md §8.1 : pas de barre
// latérale, six onglets. Contrôlé pour centrer l'onglet actif dans sa bande
// (docs/lot-m2.md §10.3), toujours sans synchronisation d'URL : `?onglet=` ne
// sert qu'au premier rendu.

import { useRef, useState, type ReactNode } from "react";
import { useCentrerOngletActif } from "@/components/navigation/use-centrer-onglet-actif";
import { ComptesEcran } from "@/features/accounts/ComptesEcran";
import { CategoriesEcran } from "@/features/categories/CategoriesEcran";
import { EtiquettesEcran } from "@/features/etiquettes/EtiquettesEcran";
import { FiltresImportEcran } from "@/features/import-filters/FiltresImportEcran";
import { BeneficiairesEcran } from "@/features/payees/BeneficiairesEcran";
import { ReglesEcran } from "@/features/regles/ReglesEcran";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type OngletParametres = "comptes" | "categories" | "beneficiaires" | "etiquettes" | "regles" | "filtres";

const ONGLETS: readonly { valeur: OngletParametres; libelle: string }[] = [
  { valeur: "comptes", libelle: "Comptes" },
  { valeur: "categories", libelle: "Catégories" },
  { valeur: "beneficiaires", libelle: "Bénéficiaires" },
  { valeur: "etiquettes", libelle: "Étiquettes" },
  { valeur: "regles", libelle: "Règles" },
  { valeur: "filtres", libelle: "Filtres" },
];

export function ParametresOnglets({ ongletInitial }: { ongletInitial: OngletParametres }): ReactNode {
  const [onglet, setOnglet] = useState<OngletParametres>(ongletInitial);
  const bandeRef = useRef<HTMLDivElement>(null);
  useCentrerOngletActif(bandeRef, onglet);

  return (
    <Tabs
      value={onglet}
      onValueChange={(valeur) => {
        const suivant = ONGLETS.find((candidat) => candidat.valeur === valeur)?.valeur;
        if (suivant !== undefined) {
          setOnglet(suivant);
        }
      }}
      className="p-4 md:p-6"
    >
      {/* Même traitement que la barre du haut : la liste défile dans sa bande plutôt que d'élargir la page. */}
      <div ref={bandeRef} className="-m-1 min-w-0 overflow-x-auto p-1 [scrollbar-width:none]">
        <TabsList aria-label="Sections des paramètres">
          {ONGLETS.map((candidat) => (
            <TabsTrigger key={candidat.valeur} value={candidat.valeur} className="shrink-0">
              {candidat.libelle}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="comptes">
        <ComptesEcran />
      </TabsContent>
      <TabsContent value="categories">
        <CategoriesEcran />
      </TabsContent>
      <TabsContent value="beneficiaires">
        <BeneficiairesEcran />
      </TabsContent>
      <TabsContent value="etiquettes">
        <EtiquettesEcran />
      </TabsContent>
      <TabsContent value="regles">
        <ReglesEcran />
      </TabsContent>
      <TabsContent value="filtres">
        <FiltresImportEcran />
      </TabsContent>
    </Tabs>
  );
}
