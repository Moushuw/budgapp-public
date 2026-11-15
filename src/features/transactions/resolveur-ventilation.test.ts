// docs/lot-m2.md §4.2 — l'éditeur lit le message de niveau tableau sous `root` : ce que le résolveur rend vraiment.

import { zodResolver } from "@hookform/resolvers/zod";
import { describe, expect, it } from "vitest";
import { formatMontant } from "@/domain/money";
import { schemaFormulaireVentilation } from "./schema";

const ligne = (montant: string) => ({ subcategoryId: null, montant, note: "", tagIds: [] as string[] });

async function resoudre(montantCents: number, montants: readonly string[]) {
  const resolveur = zodResolver(
    schemaFormulaireVentilation({ montantCents, estFille: false, estVirement: false }),
    undefined,
    { raw: true },
  );
  return resolveur({ lignes: montants.map(ligne) }, undefined, {
    fields: {},
    criteriaMode: "firstError",
    shouldUseNativeValidation: false,
  });
}

describe("schemaFormulaireVentilation derrière zodResolver", () => {
  it("une somme fausse : le message de tableau est rangé sous lignes.root, et rien n'est soumis", async () => {
    const resultat = await resoudre(-5000, ["-20,00", "-17,60"]);
    expect(resultat.values).toEqual({});
    const lignes = resultat.errors.lignes as { root?: { message?: string }; message?: string } | undefined;
    expect(lignes?.root?.message ?? lignes?.message).toBe(`Il reste ${formatMontant(1240)} à répartir.`);
  });

  it("une somme juste : aucune erreur, les valeurs brutes (chaînes) sont rendues", async () => {
    const resultat = await resoudre(-5000, ["-20,00", "-30,00"]);
    expect(resultat.errors).toEqual({});
    expect(resultat.values).toMatchObject({ lignes: [{ montant: "-20,00" }, { montant: "-30,00" }] });
  });

  it("une entrée d'argent trop répartie dit « dépassent »", async () => {
    const resultat = await resoudre(5000, ["30,00", "30,00"]);
    const lignes = resultat.errors.lignes as { root?: { message?: string }; message?: string } | undefined;
    expect(lignes?.root?.message ?? lignes?.message).toBe(`Les lignes dépassent la transaction de ${formatMontant(1000)}.`);
  });

  it("une ligne à zéro : l'erreur est sur le champ montant de la ligne, pas sur le tableau", async () => {
    const resultat = await resoudre(-5000, ["-50,00", "0"]);
    const lignes = resultat.errors.lignes as unknown as Record<number, { montant?: { message?: string } }> | undefined;
    expect(lignes?.[1]?.montant?.message).toBe(`La ligne 2 est à ${formatMontant(0)} : retire-la ou donne-lui un montant.`);
  });
});
