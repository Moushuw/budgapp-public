import type { ReactNode } from "react";
import { ParametresOnglets, type OngletParametres } from "./ParametresOnglets";

const ONGLETS_VALIDES: readonly OngletParametres[] = [
  "comptes",
  "categories",
  "beneficiaires",
  "etiquettes",
  "regles",
  "filtres",
];

function versOnglet(valeur: string | string[] | undefined): OngletParametres {
  const candidat = Array.isArray(valeur) ? valeur[0] : valeur;
  return ONGLETS_VALIDES.find((onglet) => onglet === candidat) ?? "comptes";
}

export default async function ParametresPage(props: PageProps<"/parametres">): Promise<ReactNode> {
  const { onglet } = await props.searchParams;

  return <ParametresOnglets key={versOnglet(onglet)} ongletInitial={versOnglet(onglet)} />;
}
