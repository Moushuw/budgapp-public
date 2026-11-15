import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { DateCivile } from "@/domain/dates";
import type { Cents } from "@/domain/money";

export type NomFixture =
  | "cheque-desjardins"
  | "cas-limites"
  | "virement-cheque"
  | "virement-visa"
  | "netflix-visa-conforme"
  | "netflix-visa-ecart";

export interface ReconnueAttendue {
  readonly numeroLigne: number;
  readonly date: DateCivile;
  readonly typeOperation: string | null;
  readonly description: string;
  readonly montantCents: Cents;
}

export interface RejeteeAttendue {
  readonly numeroLigne: number;
  readonly raison: "AUCUNE_DATE" | "AUCUN_MONTANT" | "MOIS_INCONNU" | "MONTANT_ILLISIBLE";
}

export interface OracleFixture {
  readonly annee: number;
  readonly reconnues: readonly ReconnueAttendue[];
  readonly rejetees: readonly RejeteeAttendue[];
}

const schemaOracle = z.object({
  annee: z.number().int(),
  reconnues: z.array(
    z.object({
      numeroLigne: z.number().int(),
      date: z.string(),
      typeOperation: z.string().nullable(),
      description: z.string(),
      montantCents: z.number().int(),
    }),
  ),
  rejetees: z.array(
    z.object({
      numeroLigne: z.number().int(),
      raison: z.enum(["AUCUNE_DATE", "AUCUN_MONTANT", "MOIS_INCONNU", "MONTANT_ILLISIBLE"]),
    }),
  ),
});

function cheminFixture(racine: string, nom: NomFixture, extension: "txt" | "json"): string {
  return path.join(racine, "src", "domain", "statement", "fixtures", `${nom}.${extension}`);
}

export function lireTexteFixture(racine: string, nom: NomFixture): string {
  return readFileSync(cheminFixture(racine, nom, "txt"), "utf8");
}

export function lireOracleFixture(racine: string, nom: NomFixture): OracleFixture {
  const brut: unknown = JSON.parse(readFileSync(cheminFixture(racine, nom, "json"), "utf8"));
  return schemaOracle.parse(brut);
}

export const LIGNE_SOURCE_DERIVEE = 14;
export const MARCHAND_SOURCE_DERIVEE = "CAFE LUCIOLE (VALBRUM";

export function ligneDerivee(racine: string, marchand: string): string {
  const lignes = lireTexteFixture(racine, "cheque-desjardins").split(/\r?\n/);
  const ligne = lignes[LIGNE_SOURCE_DERIVEE - 1];
  if (!ligne?.includes(MARCHAND_SOURCE_DERIVEE)) {
    throw new Error(`La ligne ${String(LIGNE_SOURCE_DERIVEE)} de la fixture ne contient plus le marchand attendu.`);
  }
  return ligne.replace(MARCHAND_SOURCE_DERIVEE, marchand);
}
