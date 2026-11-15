import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface PiedListeProps {
  readonly affichees: number;
  readonly total: number;
  readonly hasNextPage: boolean;
  readonly enChargement: boolean;
  readonly onChargerPlus: () => void;
}

export function PiedListe(props: PiedListeProps): ReactNode {
  const { affichees, total, hasNextPage, enChargement, onChargerPlus } = props;
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <p className="text-muted-foreground text-sm">
        {String(affichees)} affichées sur {String(total)}
      </p>
      {hasNextPage && (
        <Button variant="outline" disabled={enChargement} onClick={onChargerPlus}>
          {enChargement ? "Chargement…" : "Charger plus"}
        </Button>
      )}
    </div>
  );
}
