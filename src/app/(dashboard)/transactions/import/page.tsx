import type { ReactNode } from "react";
import { ImportEcran } from "@/features/import/ImportEcran";

// Server Component de quatre lignes — docs/lot-m1.md §8.2. Pas de
// "use client" sur la page (docs/lot-m1.md §8.2, premier des trois pièges).
export default function ImportPage(): ReactNode {
  return <ImportEcran />;
}
