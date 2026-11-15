import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { casseDeTitre, type SuggestionAffichee } from "@/domain/recurrence";

export interface SectionSuggestionsProps {
  readonly suggestions: readonly SuggestionAffichee[];
  readonly nbSuggestions: number;
  readonly enCours: boolean;
  readonly onConfirmer: (suggestion: SuggestionAffichee) => void;
  readonly onRefuser: (id: string) => void;
}

/** Une carte par suggestion : la phrase, puis confirmer ou refuser. Aucune ne s'applique sans le geste de l'utilisateur. */
export function SectionSuggestions(props: SectionSuggestionsProps): ReactNode {
  const { suggestions, nbSuggestions, enCours, onConfirmer, onRefuser } = props;
  return (
    <section data-section="suggestions" aria-labelledby="titre-suggestions" className="flex flex-col gap-3">
      <h2 id="titre-suggestions" className="text-lg font-semibold">
        Suggestions
      </h2>
      {suggestions.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucune suggestion. La recherche tourne après chaque import.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.id}
              data-suggestion-id={suggestion.id}
              className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <p data-phrase className="min-w-0 text-sm break-words">
                {suggestion.phrase ??
                  `${casseDeTitre(suggestion.motif)} : les transactions de cette suggestion n'existent plus. Relance la recherche.`}
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={suggestion.proposition === null || enCours}
                  onClick={() => {
                    onConfirmer(suggestion);
                  }}
                >
                  Confirmer
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={enCours}
                  onClick={() => {
                    onRefuser(suggestion.id);
                  }}
                >
                  Refuser
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {nbSuggestions > suggestions.length && (
        <p className="text-muted-foreground text-sm">
          {suggestions.length} affichées sur {nbSuggestions}.
        </p>
      )}
    </section>
  );
}
