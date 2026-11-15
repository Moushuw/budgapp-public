import type { ReactNode } from "react";
import { FicheCompteEcran } from "@/features/soldes/FicheCompteEcran";

// Server Component minimal : la page ne contient que de la mise en page.
export default async function FicheComptePage(props: PageProps<"/parametres/comptes/[id]">): Promise<ReactNode> {
  const { id } = await props.params;
  return <FicheCompteEcran accountId={id} />;
}
