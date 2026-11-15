// Case de sélection : l'élément HTML natif, faute de pouvoir lancer la CLI
// shadcn pour une case à cocher (docs/lot-m2.md §6.4).

import type { ReactNode } from "react";

export interface CaseSelectionProps {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly "aria-label": string;
  readonly onChange: () => void;
}

export function CaseSelection(props: CaseSelectionProps): ReactNode {
  const { checked, disabled = false, onChange } = props;
  return (
    <input
      type="checkbox"
      className="accent-primary size-4 cursor-pointer disabled:cursor-not-allowed"
      checked={checked}
      disabled={disabled}
      aria-label={props["aria-label"]}
      onChange={onChange}
    />
  );
}
