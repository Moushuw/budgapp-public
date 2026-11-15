import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TriTransactions } from "@/domain/consultation";

const OPTIONS: readonly { readonly valeur: string; readonly libelle: string; readonly tri: TriTransactions }[] = [
  { valeur: "DATE:DESC", libelle: "Date, récentes d'abord", tri: { champ: "DATE", ordre: "DESC" } },
  { valeur: "DATE:ASC", libelle: "Date, anciennes d'abord", tri: { champ: "DATE", ordre: "ASC" } },
  { valeur: "MONTANT:ASC", libelle: "Montant croissant", tri: { champ: "MONTANT", ordre: "ASC" } },
  { valeur: "MONTANT:DESC", libelle: "Montant décroissant", tri: { champ: "MONTANT", ordre: "DESC" } },
];

export function SelecteurTri(props: {
  readonly tri: TriTransactions;
  readonly onChange: (tri: TriTransactions) => void;
}): ReactNode {
  const { tri, onChange } = props;
  return (
    <Select
      value={`${tri.champ}:${tri.ordre}`}
      onValueChange={(valeur) => {
        const option = OPTIONS.find((candidate) => candidate.valeur === valeur);
        if (option !== undefined) {
          onChange(option.tri);
        }
      }}
    >
      <SelectTrigger aria-label="Tri" className="w-full sm:w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((option) => (
          <SelectItem key={option.valeur} value={option.valeur}>
            {option.libelle}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
