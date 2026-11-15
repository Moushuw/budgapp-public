import type { ReactNode } from "react";
import { formatMontant, type Cents } from "@/domain/money";
import { cn } from "@/lib/utils";

export function MontantTransaction(props: { readonly cents: Cents; readonly className?: string }): ReactNode {
  const { cents, className } = props;
  return (
    <span
      className={cn(
        "font-montant",
        cents < 0 && "text-money-out",
        cents > 0 && "text-money-in",
        className,
      )}
    >
      {formatMontant(cents, "CENTS")}
    </span>
  );
}
