"use client";

// Select des bénéficiaires + « Aucun » + « Nouveau bénéficiaire… » —
// docs/lot-m1.md §8.2. N'importe que useBeneficiaires (lecture) : jamais
// de hook de mutation ici (CLAUDE.md §8, le défaut de la v1 nommé par
// docs/lot-m1.md §8.2).

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBeneficiaires } from "@/features/payees/use-beneficiaires";
import { LIMITE_NOM_BENEFICIAIRE } from "./schema";

export interface SelecteurBeneficiaireProps {
  /** Posé sur le déclencheur : l'étiquette visible de la ligne s'y rattache (docs/lot-m2.md §10.2 point 2). */
  readonly id?: string;
  readonly payeeId: string | null;
  readonly payeeNouveauNom: string | null;
  /** Calculé par le parent (etat-revue.ts) : la revue n'a pas de react-hook-form. */
  readonly erreur: string | null;
  readonly onChange: (patch: { readonly payeeId: string | null; readonly payeeNouveauNom: string | null }) => void;
}

const AUCUN = "__aucun__";
const NOUVEAU = "__nouveau__";

export function SelecteurBeneficiaire(props: SelecteurBeneficiaireProps): ReactNode {
  const { id, payeeId, payeeNouveauNom, erreur, onChange } = props;
  const { data: beneficiaires } = useBeneficiaires();

  const valeurSelect = payeeNouveauNom !== null ? NOUVEAU : (payeeId ?? AUCUN);

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        value={valeurSelect}
        onValueChange={(valeur) => {
          if (valeur === NOUVEAU) {
            onChange({ payeeId: null, payeeNouveauNom: "" });
            return;
          }
          if (valeur === AUCUN) {
            onChange({ payeeId: null, payeeNouveauNom: null });
            return;
          }
          // Changer pour un bénéficiaire existant remet payeeNouveauNom à
          // null et efface son message d'erreur (CLAUDE.md §9).
          onChange({ payeeId: valeur, payeeNouveauNom: null });
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Bénéficiaire" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUCUN}>Aucun</SelectItem>
          {(beneficiaires ?? []).map((beneficiaire) => (
            <SelectItem key={beneficiaire.id} value={beneficiaire.id}>
              {beneficiaire.nom}
            </SelectItem>
          ))}
          <SelectItem value={NOUVEAU}>Nouveau bénéficiaire…</SelectItem>
        </SelectContent>
      </Select>

      {payeeNouveauNom !== null && (
        <Input
          value={payeeNouveauNom}
          placeholder="Nom du nouveau bénéficiaire"
          maxLength={LIMITE_NOM_BENEFICIAIRE}
          aria-invalid={erreur !== null}
          onChange={(evenement) => {
            onChange({ payeeId: null, payeeNouveauNom: evenement.target.value });
          }}
        />
      )}
      {erreur !== null && <p className="text-destructive text-sm">{erreur}</p>}
    </div>
  );
}
