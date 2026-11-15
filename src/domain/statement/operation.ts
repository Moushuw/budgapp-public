// Séparation du type d'opération et du marchand — docs/lot-m1.md §5.8.
// Le séparateur est une donnée du profil : aucune connaissance d'une institution ici.

import type { OperationProfil } from "./types";

export interface OperationSeparee {
  readonly typeOperation: string | null;
  readonly description: string;
}

function reduire(texte: string): string {
  return texte.replace(/\s+/g, " ").trim();
}

/** Ne lève jamais. `operation` absent ⇒ { typeOperation: null, description } inchangée. */
export function separerOperation(description: string, operation: OperationProfil | undefined): OperationSeparee {
  const intacte: OperationSeparee = { typeOperation: null, description };
  if (operation === undefined) {
    return intacte;
  }

  const correspondance = operation.separateur.exec(description);
  if (correspondance === null) {
    return intacte;
  }

  const type = reduire(description.slice(0, correspondance.index));
  const marchand = reduire(
    reduire(description.slice(correspondance.index + correspondance[0].length)).replace(/\/$/, ""),
  );

  // Un côté vide : on ne sépare pas, rien ne se perd (OQ2).
  if (type === "" || marchand === "") {
    return intacte;
  }

  return { typeOperation: type, description: marchand };
}
