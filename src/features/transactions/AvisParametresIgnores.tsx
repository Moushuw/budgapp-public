import type { ReactNode } from "react";
import type { ParametreIgnore } from "./filtres-url";
import { libelleParametreIgnore } from "./presentation";

export function AvisParametresIgnores(props: { readonly ignores: readonly ParametreIgnore[] }): ReactNode {
  const { ignores } = props;
  if (ignores.length === 0) {
    return null;
  }
  return (
    <div role="status" className="border-avertissement/40 bg-avertissement/10 rounded-lg border px-4 py-3 text-sm">
      <p className="font-medium">Paramètres d&apos;adresse ignorés</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {ignores.map((ignore, index) => (
          <li key={`${ignore.parametre}-${String(index)}`} className="break-words">
            {libelleParametreIgnore(ignore)}
          </li>
        ))}
      </ul>
    </div>
  );
}
