import type { Page } from "@playwright/test";
import { captureRetenue, lireFiltreCaptures, lireModeCaptures } from "./captures-noms";
import { capturerEcran } from "./captures";
import { verifierAucunDebordement } from "./debordement";
import { verifierDialogues } from "./dialogues";
import { verifierBarresAction } from "./formulaires";

/** Point d'examen d'un écran ou d'un dialogue : débordement, dialogues, barres d'action, puis captures en mode passe. */
export async function examinerEcran(page: Page, contexte: string): Promise<void> {
  await verifierAucunDebordement(page, contexte);
  const dialogues = await verifierDialogues(page, contexte);
  await verifierBarresAction(page, contexte);
  if (lireModeCaptures(process.env) === "PASSE" && captureRetenue(contexte, lireFiltreCaptures(process.env))) {
    await capturerEcran(page, contexte, dialogues);
  }
}
