import { expect, type Page } from "@playwright/test";

export type RegleDebordement = "PAGE" | "ELEMENT_HORS_FENETRE" | "DEFILEMENT_HORIZONTAL" | "ELEMENT_ROGNE";

export interface Debordement {
  readonly regle: RegleDebordement;
  readonly description: string;
}

// Exécutée dans la page : doit rester autonome (aucune référence à un identifiant du module).
function mesurerDansLaPage(): Debordement[] {
  const MAX = 20;
  const racine = document.documentElement;
  const L = racine.clientWidth;
  const resultats: Debordement[] = [];

  const decrire = (el: Element): string => {
    const rect = el.getBoundingClientRect();
    const texte = el.textContent.replace(/\s+/g, " ").trim().slice(0, 40);
    const id = el.id === "" ? "" : `#${el.id}`;
    return `${el.tagName.toLowerCase()}${id} « ${texte} » [${String(Math.round(rect.left))}, ${String(Math.round(rect.right))}]`;
  };
  const visible = (el: Element): boolean => {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  if (racine.scrollWidth > L + 1) {
    resultats.push({
      regle: "PAGE",
      description: `scrollWidth ${String(racine.scrollWidth)} > clientWidth ${String(L)}`,
    });
  }

  const elements = Array.from(document.body.querySelectorAll("*"));

  let nbHors = 0;
  for (const el of elements) {
    if (nbHors >= MAX) {
      break;
    }
    if (!visible(el)) {
      continue;
    }
    let ancetreRogne = false;
    for (let parent = el.parentElement; parent !== null && parent !== document.body; parent = parent.parentElement) {
      if (getComputedStyle(parent).overflowX !== "visible") {
        ancetreRogne = true;
        break;
      }
    }
    if (ancetreRogne) {
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (rect.right > L + 1 || rect.left < -1) {
      resultats.push({ regle: "ELEMENT_HORS_FENETRE", description: decrire(el) });
      nbHors += 1;
    }
  }

  let nbDefilement = 0;
  for (const el of elements) {
    if (nbDefilement >= MAX) {
      break;
    }
    const balise = el.tagName.toLowerCase();
    if (balise === "input" || balise === "textarea" || balise === "select") {
      continue;
    }
    if (!visible(el)) {
      continue;
    }
    const overflowX = getComputedStyle(el).overflowX;
    if ((overflowX === "auto" || overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1) {
      if (balise === "nav" || el.querySelector('[role="tablist"]') !== null) {
        continue;
      }
      resultats.push({
        regle: "DEFILEMENT_HORIZONTAL",
        description: `${decrire(el)} scrollWidth ${String(el.scrollWidth)} / clientWidth ${String(el.clientWidth)}`,
      });
      nbDefilement += 1;
    }
  }

  // ELEMENT_ROGNE : un élément qui dépasse horizontalement l'ancêtre le plus proche qui rogne (overflow-hidden), que la
  // boucle ELEMENT_HORS_FENETRE saute. Exclusions, et pourquoi :
  // - clip / clip-path : texte masqué visuellement (sr-only de Tailwind, VisuallyHidden et <select> caché de Radix) ;
  // - ancêtre à défilement horizontal (overflow-x auto / scroll) : le défilement horizontal relève de
  //   DEFILEMENT_HORIZONTAL ; le halo du Switch est un pseudo-élément, il n'est pas mesuré. Un ancêtre en
  //   overflow-x: hidden et overflow-y: auto (formulaires de dialogue, panneaux) est, lui, vérifié ;
  // - text-overflow: ellipsis ou line-clamp : troncature voulue (truncate, SelectValue) ;
  // - parent déjà signalé : un bouton qui dépasse ne produit pas un signalement par descendant ; l'élément écarté
  //   entre à son tour dans `signales`, de sorte que l'exclusion couvre toute la descendance.
  // Limite : l'ancêtre retenu est le plus proche dont `overflow-x` ≠ `visible`, pas le bloc conteneur : un élément
  // positionné (`absolute`, `fixed`) dont le bloc conteneur est au-dessus de cet ancêtre n'est pas rogné par lui et peut
  // être signalé à tort ; à l'inverse, un élément rogné par un bloc conteneur plus haut que cet ancêtre peut échapper.
  const signales = new Set<Element>();
  let nbRogne = 0;
  for (const el of elements) {
    if (nbRogne >= MAX) {
      break;
    }
    if (!visible(el)) {
      continue;
    }
    let masque = false;
    for (let x: Element | null = el; x !== null && x !== document.body; x = x.parentElement) {
      const style = getComputedStyle(x);
      if (style.getPropertyValue("clip") !== "auto" || style.clipPath !== "none") {
        masque = true;
        break;
      }
    }
    if (masque) {
      continue;
    }
    let ancetre: Element | null = null;
    for (let parent = el.parentElement; parent !== null && parent !== document.body; parent = parent.parentElement) {
      if (getComputedStyle(parent).overflowX !== "visible") {
        ancetre = parent;
        break;
      }
    }
    if (ancetre === null) {
      continue;
    }
    const styleAncetre = getComputedStyle(ancetre);
    if (styleAncetre.overflowX === "auto" || styleAncetre.overflowX === "scroll") {
      continue;
    }
    let texteRogneVoulu = false;
    for (let x: Element | null = el; x !== null; x = x === ancetre ? null : x.parentElement) {
      const style = getComputedStyle(x);
      if (style.getPropertyValue("text-overflow") === "ellipsis" || style.getPropertyValue("-webkit-line-clamp") !== "none") {
        texteRogneVoulu = true;
        break;
      }
    }
    if (texteRogneVoulu) {
      continue;
    }
    if (el.parentElement !== null && signales.has(el.parentElement)) {
      signales.add(el);
      continue;
    }
    const boiteAncetre = ancetre.getBoundingClientRect();
    const gauche = boiteAncetre.left + ancetre.clientLeft;
    const droite = gauche + ancetre.clientWidth;
    const rect = el.getBoundingClientRect();
    if (rect.left < gauche - 1 || rect.right > droite + 1) {
      const slot = ancetre.getAttribute("data-slot");
      resultats.push({
        regle: "ELEMENT_ROGNE",
        description: `${decrire(el)} rogné par ${ancetre.tagName.toLowerCase()}${slot === null ? "" : `[${slot}]`} [${String(Math.round(gauche))}, ${String(Math.round(droite))}]`,
      });
      signales.add(el);
      nbRogne += 1;
    }
  }

  return resultats;
}

export async function mesurerDebordements(page: Page): Promise<readonly Debordement[]> {
  return page.evaluate(mesurerDansLaPage);
}

export async function verifierAucunDebordement(page: Page, contexte: string): Promise<void> {
  // 2 s au plus : une animation sans fin (squelette de chargement) ne doit pas bloquer la mesure.
  await page
    .waitForFunction(() => !document.getAnimations().some((animation) => animation.playState === "running"), undefined, {
      timeout: 2000,
    })
    .catch(() => undefined);
  const debordements = await mesurerDebordements(page);
  expect.soft(debordements, `Débordement horizontal — ${contexte}`).toEqual([]);
}
