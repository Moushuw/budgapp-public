// docs/lot-m2.md §4.2 — les fonctions pures de l'éditeur de ventilation.

import { describe, expect, it } from "vitest";
import type { DetailTransaction } from "@/domain/consultation";
import { AUCUN_REFUS } from "@/domain/edition";
import { formatMontant } from "@/domain/money";
import { formatMontantChamp } from "@/lib/champs-formulaire";
import { messageResteARepartir, parentVentilationDepuisDetail, versValeursVentilation } from "./ventilation";

const DETAIL: DetailTransaction = {
  id: "t1",
  parentId: null,
  accountId: "a1",
  compteNom: "Chèque",
  date: "2026-09-01",
  description: "IGA",
  typeOperation: "Achat",
  montantCents: -9000,
  payeeId: null,
  beneficiaireNom: null,
  subcategoryId: "s-cafe",
  sousCategorieNom: "Café",
  categorieNom: "Sorties",
  note: null,
  etiquettes: [],
  aRevoir: false,
  exclureDuBudget: false,
  exclureDesRapports: false,
  source: "COPIER_COLLER",
  etat: "COMPTABILISEE",
  rapprochement: "NON_RAPPROCHEE",
  externalId: null,
  empreinte: "e",
  lotImport: null,
  regle: null,
  estVentilee: false,
  contrepartie: null,
  lignesVentilation: [],
  nbLignesVentilation: 0,
  recurrence: null,
  refus: AUCUN_REFUS,
};

describe("versValeursVentilation", () => {
  it("FV1 — une non ventilée donne deux lignes, la première porte la sous-catégorie courante", () => {
    expect(versValeursVentilation(DETAIL).lignes).toEqual([
      { subcategoryId: "s-cafe", montant: "", note: "", tagIds: [] },
      { subcategoryId: null, montant: "", note: "", tagIds: [] },
    ]);
  });

  it("FV2 — une ventilée donne une ligne par fille", () => {
    const detail: DetailTransaction = {
      ...DETAIL,
      subcategoryId: null,
      estVentilee: true,
      nbLignesVentilation: 3,
      lignesVentilation: [
        { id: "f1", montantCents: -4000, subcategoryId: "s1", sousCategorieNom: "A", categorieNom: "C", note: "n1", etiquettes: [{ id: "e1", nom: "T", couleur: null }] },
        { id: "f2", montantCents: -3000, subcategoryId: null, sousCategorieNom: null, categorieNom: null, note: null, etiquettes: [] },
        { id: "f3", montantCents: -2000, subcategoryId: "s3", sousCategorieNom: "B", categorieNom: "C", note: null, etiquettes: [] },
      ],
    };
    expect(versValeursVentilation(detail).lignes).toEqual([
      { subcategoryId: "s1", montant: formatMontantChamp(-4000), note: "n1", tagIds: ["e1"] },
      { subcategoryId: null, montant: formatMontantChamp(-3000), note: "", tagIds: [] },
      { subcategoryId: "s3", montant: formatMontantChamp(-2000), note: "", tagIds: [] },
    ]);
  });
});

describe("messageResteARepartir", () => {
  it("FV3 — le reste, puis rien quand la somme tombe juste", () => {
    expect(messageResteARepartir(-9000, ["-40,00", "-30,00", "-12,00"])).toBe(
      `Il reste ${formatMontant(800)} à répartir.`,
    );
    expect(messageResteARepartir(-9000, ["-40,00", "-30,00", "-20,00"])).toBeNull();
  });

  it("FV4 — un montant vide compte pour 0, un montant illisible ne dit rien", () => {
    expect(messageResteARepartir(-9000, ["-40,00", ""])).toBe(`Il reste ${formatMontant(5000)} à répartir.`);
    expect(messageResteARepartir(-9000, ["-40,00", "abc"])).toBeNull();
  });

  it("FV5 — un dépassement", () => {
    expect(messageResteARepartir(-9000, ["-100,00"])).toBe(`Les lignes dépassent la transaction de ${formatMontant(1000)}.`);
  });

  it("une entrée d'argent dit « il reste » dans le bon sens", () => {
    expect(messageResteARepartir(9000, ["40,00"])).toBe(`Il reste ${formatMontant(5000)} à répartir.`);
  });
});

describe("parentVentilationDepuisDetail", () => {
  it("lit le montant, la filiation et le virement", () => {
    expect(parentVentilationDepuisDetail(DETAIL)).toEqual({ montantCents: -9000, estFille: false, estVirement: false });
    expect(parentVentilationDepuisDetail({ ...DETAIL, parentId: "p" }).estFille).toBe(true);
    expect(
      parentVentilationDepuisDetail({
        ...DETAIL,
        contrepartie: { transactionId: "x", compteId: null, compteNom: null, date: null, montantCents: null, description: null },
      }).estVirement,
    ).toBe(true);
  });
});
