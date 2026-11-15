import { Fragment, type ReactNode } from "react";
import { decouperMontants } from "@/domain/money";

/** Le texte, dont chaque montant formaté passe en police des montants (chiffres tabulaires). */
export function TexteAvecMontants(props: { readonly texte: string }): ReactNode {
  // La clé suit la position : le découpage d'un texte donné est figé, la liste n'est jamais réordonnée.
  return decouperMontants(props.texte).map((segment, position) =>
    segment.montant ? (
      <span key={position} data-montant="" className="font-montant">
        {segment.texte}
      </span>
    ) : (
      <Fragment key={position}>{segment.texte}</Fragment>
    ),
  );
}
