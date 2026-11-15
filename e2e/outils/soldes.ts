// Localisateurs de la fiche d'un compte (soldes et réconciliation) et oracles en lecture seule, hors de
// l'application — docs/lot-m3.md §5 et §11.1.

import { expect, type Locator, type Page } from "@playwright/test";
import { depuisDateUtc, versDateUtc, type DateCivile } from "@/domain/dates";
import type { Cents } from "@/domain/money";
import { clientE2e } from "./base";

/** Une ligne de relevé chèque inventée : « 8 Janvier Achat /DESCRIPTION −30,00 $ » (signe U+2212, virgule décimale). */
export function ligneReleveCheque(jour: number, mois: string, description: string, montantCents: Cents): string {
  const absolu = Math.abs(montantCents);
  const texte = `${String(Math.trunc(absolu / 100))},${String(absolu % 100).padStart(2, "0")}`;
  return `${String(jour)} ${mois} Achat /${description} −${texte} $`;
}

/** Ouvre « Saisir un solde », remplit Date et Solde déclaré (source par défaut), enregistre, attend que le dialogue soit fermé. */
export async function saisirSolde(page: Page, date: DateCivile, montant: string): Promise<void> {
  await page.getByRole("button", { name: "Saisir un solde", exact: true }).click();
  const dialogue = page.getByRole("dialog", { name: "Saisir un solde", exact: true });
  await expect(dialogue).toBeVisible();
  await dialogue.getByLabel("Date", { exact: true }).fill(date);
  await dialogue.getByLabel("Solde déclaré", { exact: true }).fill(montant);
  await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialogue).toBeHidden();
}

export function ligneAncrage(page: Page, statementId: string): Locator {
  return page.locator(`[data-ancrage-id="${statementId}"]`);
}

export function panneauReconciliation(page: Page): Locator {
  return page.getByRole("dialog", { name: /^Réconciliation du solde du / });
}

export function explicationsAffichees(panneau: Locator): Locator {
  return panneau.locator("[data-explication]");
}

/** soldeInitial + somme des transactions (parentId null) dont la date est au plus `date`. */
export async function soldeCalculeOracle(accountId: string, date: DateCivile): Promise<Cents> {
  const client = clientE2e();
  const compte = await client.account.findUniqueOrThrow({ where: { id: accountId }, select: { soldeInitialCents: true } });
  const somme = await client.transaction.aggregate({
    where: { accountId, parentId: null, date: { lte: versDateUtc(date) } },
    _sum: { montantCents: true },
  });
  return compte.soldeInitialCents + (somme._sum.montantCents ?? 0);
}

export async function ancragesDuCompte(accountId: string): Promise<
  readonly {
    id: string;
    date: DateCivile;
    source: string;
    soldeCents: Cents;
    ajustementTxId: string | null;
    explication: string | null;
  }[]
> {
  const lignes = await clientE2e().balanceStatement.findMany({
    where: { accountId },
    orderBy: [{ date: "desc" }, { saisiLe: "desc" }, { id: "asc" }],
    take: 100,
    select: {
      id: true,
      date: true,
      source: true,
      soldeCents: true,
      reconciliation: { select: { ajustementTxId: true, explication: true } },
    },
  });
  return lignes.map((l) => ({
    id: l.id,
    date: depuisDateUtc(l.date),
    source: l.source,
    soldeCents: l.soldeCents,
    ajustementTxId: l.reconciliation?.ajustementTxId ?? null,
    explication: l.reconciliation?.explication ?? null,
  }));
}

export async function ajustementsDuCompte(
  accountId: string,
): Promise<readonly { id: string; date: DateCivile; montantCents: Cents }[]> {
  const lignes = await clientE2e().transaction.findMany({
    where: { accountId, source: "AJUSTEMENT" },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: 100,
    select: { id: true, date: true, montantCents: true },
  });
  return lignes.map((l) => ({ id: l.id, date: depuisDateUtc(l.date), montantCents: l.montantCents }));
}
