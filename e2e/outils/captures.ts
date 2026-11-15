import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  dimensionsPng,
  DOSSIER_CAPTURES,
  ErreurCaptures,
  FICHIER_INDEX_CAPTURES,
  HAUTEUR_MAX_CAPTURE,
  ligneIndexCapture,
  lireProjet,
  nomFichierCapture,
  THEMES,
  tranchesCapture,
  type PartieCapture,
  type Theme,
} from "./captures-noms";
import type { MesureDialogue } from "./dialogues";

const SELECTEUR_DIALOGUE = '[data-slot="dialog-content"], [data-slot="alert-dialog-content"]';

// Le premier contexte qui produit un fichier l'emporte ; un autre contexte pour le même fichier est une erreur.
const contextesParFichier = new Map<string, string>();

async function appliquerTheme(page: Page, theme: Theme, contexte: string): Promise<void> {
  const sombre = theme === "sombre";
  await page.emulateMedia({ colorScheme: sombre ? "dark" : "light" });
  const applique = await page
    .waitForFunction((attendu) => document.documentElement.classList.contains("dark") === attendu, sombre, {
      timeout: 5000,
    })
    .then(() => true)
    .catch(() => false);
  expect(applique, `Thème ${theme} non appliqué (classe dark ${sombre ? "absente de" : "présente sur"} <html>) — ${contexte}`).toBe(true);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

/** Mode passe seulement (l'appelant vérifie le mode). Capture clair + sombre, éventuellement l'élément du dialogue, et complète l'index. */
export async function capturerEcran(page: Page, contexte: string, dialogues: readonly MesureDialogue[]): Promise<void> {
  const info = test.info();
  const projet = lireProjet(info.project.name);
  const racine = path.resolve(info.project.testDir, "..");
  const dossier = path.join(racine, DOSSIER_CAPTURES);

  // Clé indépendante du type réellement produit (fenêtre, page ou tranches).
  const fichierCle = nomFichierCapture({ projet, theme: "clair", contexte, partie: { type: "page" } });
  const fichierTranche1 = nomFichierCapture({
    projet,
    theme: "clair",
    contexte,
    partie: { type: "tranche", numero: 1, total: 2 },
  });
  const connu = contextesParFichier.get(fichierCle);
  if (connu !== undefined) {
    if (connu !== contexte) {
      throw new ErreurCaptures(
        `Deux points de capture produisent le même fichier : ${fichierCle} (« ${connu} », « ${contexte} »).`,
      );
    }
    return;
  }
  if (existsSync(path.join(dossier, fichierCle)) || existsSync(path.join(dossier, fichierTranche1))) {
    return;
  }

  info.setTimeout(info.timeout + 15_000);

  const url = new URL(page.url());
  const dernier = dialogues[dialogues.length - 1];
  const nomDialogue = dernier === undefined ? null : dernier.nom;
  const tropHaut = dialogues.some((d) => d.hauteur > d.hauteurFenetre + 1);
  const dialogueOuvert = dialogues.length > 0;

  function inscrire(
    fichier: string,
    partie: PartieCapture,
    octets: Uint8Array,
    theme: Theme,
    hauteurAttendue: number | null,
  ): void {
    const { largeur, hauteur } = dimensionsPng(octets);
    if (partie.type !== "dialogue" && hauteur > HAUTEUR_MAX_CAPTURE) {
      throw new ErreurCaptures(`Capture de plus de ${String(HAUTEUR_MAX_CAPTURE)} px de haut : ${fichier} (${String(hauteur)} px).`);
    }
    if (partie.type === "tranche" && hauteurAttendue !== null && hauteur !== hauteurAttendue) {
      throw new ErreurCaptures(
        `Tranche de hauteur inattendue : ${fichier} (${String(hauteur)} px au lieu de ${String(hauteurAttendue)}).`,
      );
    }
    appendFileSync(
      path.join(dossier, FICHIER_INDEX_CAPTURES),
      ligneIndexCapture({
        fichier,
        partie,
        largeur,
        hauteur,
        contexte,
        url: `${url.pathname}${url.search}`,
        dialogue: nomDialogue,
        projet,
        theme,
      }),
      "utf8",
    );
  }

  try {
    for (const theme of THEMES) {
      await appliquerTheme(page, theme, contexte);

      if (dialogueOuvert) {
        const partie: PartieCapture = { type: "fenetre" };
        const fichier = nomFichierCapture({ projet, theme, contexte, partie });
        const octets = await page.screenshot({
          path: path.join(dossier, fichier),
          fullPage: false,
          animations: "disabled",
        });
        inscrire(fichier, partie, octets, theme, null);

        if (tropHaut) {
          const partieDialogue: PartieCapture = { type: "dialogue" };
          const fichierDialogue = nomFichierCapture({ projet, theme, contexte, partie: partieDialogue });
          const octetsDialogue = await page
            .locator(SELECTEUR_DIALOGUE)
            .filter({ visible: true })
            .last()
            .screenshot({ path: path.join(dossier, fichierDialogue), animations: "disabled" });
          inscrire(fichierDialogue, partieDialogue, octetsDialogue, theme, null);
        }
      } else {
        const entiere = await page.screenshot({ fullPage: true, animations: "disabled" });
        const { largeur, hauteur } = dimensionsPng(entiere);
        const tranches = tranchesCapture(hauteur);
        if (tranches.length === 1) {
          const partie: PartieCapture = { type: "page" };
          const fichier = nomFichierCapture({ projet, theme, contexte, partie });
          writeFileSync(path.join(dossier, fichier), entiere);
          inscrire(fichier, partie, entiere, theme, null);
        } else {
          for (const [i, t] of tranches.entries()) {
            const partie: PartieCapture = { type: "tranche", numero: i + 1, total: tranches.length };
            const fichier = nomFichierCapture({ projet, theme, contexte, partie });
            const octets = await page.screenshot({
              path: path.join(dossier, fichier),
              fullPage: true,
              clip: { x: 0, y: t.y, width: largeur, height: t.hauteur },
              animations: "disabled",
            });
            inscrire(fichier, partie, octets, theme, t.hauteur);
          }
        }
      }
    }
  } finally {
    await appliquerTheme(page, "clair", contexte);
  }

  contextesParFichier.set(fichierCle, contexte);
}
