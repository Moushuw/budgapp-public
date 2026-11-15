export interface OngletNavigation {
  readonly href: string;
  readonly libelle: string;
}

export const ONGLETS_PRINCIPAUX: readonly OngletNavigation[] = [
  { href: "/", libelle: "Accueil" },
  { href: "/transactions", libelle: "Transactions" },
  { href: "/budgets", libelle: "Budgets" },
  { href: "/prevision", libelle: "Prévision" },
  { href: "/rapports", libelle: "Rapports" },
  { href: "/parametres", libelle: "Paramètres" },
];

export const ONGLETS_TRANSACTIONS: readonly OngletNavigation[] = [
  { href: "/transactions", libelle: "Consultation" },
  { href: "/transactions/import", libelle: "Import" },
  { href: "/transactions/recurrences", libelle: "Récurrences" },
];

/** href de l'onglet dont le href est exactement `chemin`, sinon null. */
export function ongletTransactionsActif(chemin: string): string | null {
  return ONGLETS_TRANSACTIONS.find((onglet) => onglet.href === chemin)?.href ?? null;
}

/** href de l'onglet actif : "/" seulement pour "/" exactement ; sinon chemin === href ou chemin commence par href + "/". */
export function ongletActif(chemin: string, onglets: readonly OngletNavigation[]): string | null {
  const trouve = onglets.find((onglet) =>
    onglet.href === "/" ? chemin === "/" : chemin === onglet.href || chemin.startsWith(`${onglet.href}/`),
  );
  return trouve?.href ?? null;
}

export interface MesureBande {
  readonly largeurVisible: number;
  readonly largeurContenu: number;
}

/** `gauche` : position de l'onglet dans le contenu de la bande, défilement compris. */
export interface MesureOnglet {
  readonly gauche: number;
  readonly largeur: number;
}

/** scrollLeft qui centre l'onglet, borné aux limites de la bande. */
export function defilementCentre(bande: MesureBande, onglet: MesureOnglet): number {
  const maximum = Math.max(0, bande.largeurContenu - bande.largeurVisible);
  const voulu = onglet.gauche + onglet.largeur / 2 - bande.largeurVisible / 2;
  return Math.round(Math.min(Math.max(voulu, 0), maximum));
}
