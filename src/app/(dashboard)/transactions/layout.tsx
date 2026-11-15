import type { ReactNode } from "react";
import { OngletsTransactions } from "@/components/navigation/OngletsTransactions";

export default function TransactionsLayout(props: LayoutProps<"/transactions">): ReactNode {
  return (
    <>
      <div className="px-4 pt-4 md:px-6">
        <OngletsTransactions />
      </div>
      {props.children}
    </>
  );
}
