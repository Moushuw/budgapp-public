"use client";

import { Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LONGUEUR_MAX_RECHERCHE } from "./schema";

/**
 * La recherche part à la soumission, sans frappe différée : l'URL reste la
 * seule source de vérité. L'écran monte ce composant avec `key={texte}` pour
 * le resynchroniser quand l'URL change d'ailleurs.
 */
export function BarreRecherche(props: {
  readonly texteInitial: string;
  readonly onRechercher: (texte: string) => void;
}): ReactNode {
  const { texteInitial, onRechercher } = props;
  const [texte, setTexte] = useState(texteInitial);

  return (
    <form
      role="search"
      className="flex w-full items-center gap-2 sm:max-w-sm"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        onRechercher(texte.trim());
      }}
    >
      <Input
        type="search"
        aria-label="Rechercher dans les transactions"
        placeholder="Description, bénéficiaire, note…"
        maxLength={LONGUEUR_MAX_RECHERCHE}
        value={texte}
        onChange={(evenement) => {
          setTexte(evenement.target.value);
        }}
      />
      <Button type="submit" variant="outline" size="icon" aria-label="Rechercher">
        <Search />
      </Button>
    </form>
  );
}
