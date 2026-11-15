import type { ReactNode } from "react";
import { RecurrencesEcran } from "@/features/recurrences/RecurrencesEcran";

// Server Component minimal : la page ne contient que de la mise en page.
export default function RecurrencesPage(): ReactNode {
  return <RecurrencesEcran />;
}
