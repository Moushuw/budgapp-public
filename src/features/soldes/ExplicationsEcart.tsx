import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatMontant } from "@/domain/money";
import {
  LIBELLES_CONSTAT,
  LIBELLES_NATURE_EXPLICATION,
  type Explication,
  type TransactionDiagnostic,
} from "@/domain/solde";
import { hrefTransactionsDuJour } from "./liens";

function LienTransaction(props: { readonly accountId: string; readonly transaction: TransactionDiagnostic }): ReactNode {
  const { accountId, transaction } = props;
  return (
    <Link
      href={hrefTransactionsDuJour(accountId, transaction.date)}
      className="underline-offset-4 break-words hover:underline"
    >
      {transaction.date} · <span className="font-montant">{formatMontant(transaction.montantCents, "CENTS")}</span> ·{" "}
      {transaction.description}
    </Link>
  );
}

function Detail(props: { readonly explication: Explication; readonly accountId: string }): ReactNode {
  const { explication, accountId } = props;
  switch (explication.nature) {
    case "DOUBLON":
      return explication.paires.length === 0 ? null : (
        <ul className="flex flex-col gap-1 text-sm">
          {explication.paires.map((paire) => (
            <li key={`${paire.a.id}-${paire.b.id}`} className="flex flex-col gap-0.5">
              <LienTransaction accountId={accountId} transaction={paire.a} />
              <LienTransaction accountId={accountId} transaction={paire.b} />
            </li>
          ))}
        </ul>
      );
    case "MONTANT_ERRONE":
      return explication.lignes.length === 0 ? null : (
        <ul className="flex flex-col gap-1 text-sm">
          {explication.lignes.map((ligne) => (
            <li key={ligne.transaction.id}>
              <Link
                href={hrefTransactionsDuJour(accountId, ligne.transaction.date)}
                className="underline-offset-4 break-words hover:underline"
              >
                {ligne.message}
              </Link>
            </li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

export function ExplicationsEcart(props: {
  readonly explications: readonly Explication[];
  readonly accountId: string;
}): ReactNode {
  const { explications, accountId } = props;
  return (
    <ol aria-label="Explications probables" className="flex flex-col divide-y">
      {explications.map((explication) => (
        <li
          key={explication.nature}
          data-explication={explication.nature}
          data-constat={explication.constat}
          className="flex flex-col gap-1 py-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{LIBELLES_NATURE_EXPLICATION[explication.nature]}</h3>
            <Badge variant={explication.constat === "PISTE" ? "default" : "outline"}>
              {LIBELLES_CONSTAT[explication.constat]}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm break-words">{explication.message}</p>
          <Detail explication={explication} accountId={accountId} />
        </li>
      ))}
    </ol>
  );
}
