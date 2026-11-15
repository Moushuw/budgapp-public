import type { ReactNode } from "react";
import { lireEtatUrl } from "@/features/transactions/filtres-url";
import { TransactionsEcran } from "@/features/transactions/TransactionsEcran";
import { periodeCourante } from "@/server/periode";

export default async function TransactionsPage(props: PageProps<"/transactions">): Promise<ReactNode> {
  const parametres = await props.searchParams;
  const periode = await periodeCourante();

  return <TransactionsEcran etatUrl={lireEtatUrl(parametres)} periode={periode} />;
}
