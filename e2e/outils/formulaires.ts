import { expect, type Locator, type Page } from "@playwright/test";

// Deux contrôles de mise en page de formulaire que ni ELEMENT_ROGNE ni les contrôles de dialogue ne voient :
// des contrôles voisins qui se chevauchent (docs/pilotage/passes/m2.md P1-c) et du contenu visible sous une barre
// d'action collante (P1-e). Les fonctions exécutées dans la page sont autonomes : aucune référence à un identifiant du
// module, ce qui explique la duplication des petits utilitaires.

export type RegleRecouvrement = "RACINE_INVISIBLE" | "AUCUN_CONTROLE" | "CONTROLES_SE_COUPENT";

export interface Recouvrement {
  readonly regle: RegleRecouvrement;
  readonly description: string;
}

export type RegleBarreAction = "CONTENU_SOUS_BARRE";

export interface EcartBarreAction {
  readonly regle: RegleBarreAction;
  readonly description: string;
}

async function attendreAnimations(page: Page): Promise<void> {
  // 2 s au plus : une animation sans fin (squelette de chargement) ne doit pas bloquer la mesure.
  await page
    .waitForFunction(() => !document.getAnimations().some((animation) => animation.playState === "running"), undefined, {
      timeout: 2000,
    })
    .catch(() => undefined);
}

// Exécutée dans la page : doit rester autonome.
function recouvrementsDansLaPage(racine: Element): Recouvrement[] {
  const MAX = 20;
  const resultats: Recouvrement[] = [];
  const ajouter = (regle: RegleRecouvrement, description: string): void => {
    if (resultats.length < MAX) {
      resultats.push({ regle, description });
    }
  };

  interface Boite {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }

  const visible = (el: Element): boolean => {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  // Texte masqué visuellement (sr-only, <select> caché de Radix) : ni lui ni un ancêtre ne porte clip / clip-path.
  const masque = (el: Element): boolean => {
    for (let x: Element | null = el; x !== null && x !== document.body; x = x.parentElement) {
      const style = getComputedStyle(x);
      if (style.getPropertyValue("clip") !== "auto" || style.clipPath !== "none") {
        return true;
      }
    }
    return false;
  };
  const dansCacheAria = (el: Element): boolean => el.closest('[aria-hidden="true"]') !== null;
  const decrire = (el: Element): string => {
    const texte = el.textContent.replace(/\s+/g, " ").trim().slice(0, 40);
    const id = el.id === "" ? "" : `#${el.id}`;
    return `${el.tagName.toLowerCase()}${id} « ${texte} »`;
  };
  const enBoite = (r: DOMRect): Boite => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  const intersection = (a: Boite, b: Boite): Boite | null => {
    const boite = {
      left: Math.max(a.left, b.left),
      top: Math.max(a.top, b.top),
      right: Math.min(a.right, b.right),
      bottom: Math.min(a.bottom, b.bottom),
    };
    return boite.right - boite.left > 0 && boite.bottom - boite.top > 0 ? boite : null;
  };
  // Coupe par chaque ancêtre (de `depuis` jusqu'à body exclu) dont l'overflow rogne.
  const couper = (boite: Boite, depuis: Element | null): Boite | null => {
    let courante: Boite | null = boite;
    for (let x = depuis; x !== null && x !== document.body && courante !== null; x = x.parentElement) {
      const style = getComputedStyle(x);
      if (style.overflowX !== "visible" || style.overflowY !== "visible") {
        courante = intersection(courante, enBoite(x.getBoundingClientRect()));
      }
    }
    return courante;
  };

  if (!visible(racine)) {
    ajouter("RACINE_INVISIBLE", `${decrire(racine)} : racine non visible`);
    return resultats;
  }

  const controles = Array.from(
    new Set(racine.querySelectorAll('label, input:not([type="hidden"]), textarea, select, button, [role="combobox"]')),
  ).filter((el) => visible(el) && !masque(el) && !dansCacheAria(el));
  if (controles.length === 0) {
    ajouter("AUCUN_CONTROLE", `${decrire(racine)} : aucun contrôle visible`);
    return resultats;
  }

  const emprise = (el: Element): Boite[] => {
    const boites: Boite[] = [];
    const propre = couper(enBoite(el.getBoundingClientRect()), el.parentElement);
    if (propre !== null) {
      boites.push(propre);
    }
    const marcheur = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let noeud = marcheur.nextNode(); noeud !== null; noeud = marcheur.nextNode()) {
      const parent = noeud.parentElement;
      if ((noeud.nodeValue ?? "").trim() === "" || parent === null || !visible(parent) || masque(parent)) {
        continue;
      }
      const plage = document.createRange();
      plage.selectNodeContents(noeud);
      for (const r of Array.from(plage.getClientRects())) {
        const coupe = couper(enBoite(r), parent);
        if (coupe !== null) {
          boites.push(coupe);
        }
      }
    }
    return boites;
  };

  const couche = (el: Element): Element | null => {
    for (let x: Element | null = el; x !== null && x !== racine; x = x.parentElement) {
      const position = getComputedStyle(x).position;
      if (position === "sticky" || position === "fixed") {
        return x;
      }
    }
    return null;
  };

  const mesures = controles
    .map((el) => ({ el, boites: emprise(el), couche: couche(el) }))
    .filter((m) => m.boites.length > 0);
  // Tous les contrôles rognés par un ancêtre (formulaire défilé hors de la zone visible) : rien n'a été mesuré.
  if (mesures.length === 0) {
    ajouter("AUCUN_CONTROLE", `${decrire(racine)} : aucun contrôle dans la zone visible`);
    return resultats;
  }

  for (let i = 0; i < mesures.length; i += 1) {
    for (let j = i + 1; j < mesures.length; j += 1) {
      const a = mesures[i];
      const b = mesures[j];
      if (a === undefined || b === undefined) {
        continue;
      }
      if (a.el.contains(b.el) || b.el.contains(a.el) || a.couche !== b.couche) {
        continue;
      }
      let trouve: { l: number; h: number } | null = null;
      for (const ba of a.boites) {
        for (const bb of b.boites) {
          const l = Math.min(ba.right, bb.right) - Math.max(ba.left, bb.left);
          const h = Math.min(ba.bottom, bb.bottom) - Math.max(ba.top, bb.top);
          if (trouve === null && l > 1 && h > 1) {
            trouve = { l, h };
          }
        }
      }
      if (trouve !== null) {
        ajouter(
          "CONTROLES_SE_COUPENT",
          `${decrire(a.el)} ∩ ${decrire(b.el)} : ${String(Math.round(trouve.l))} × ${String(Math.round(trouve.h))} px`,
        );
      }
    }
  }

  return resultats;
}

/** `racine` : un seul élément (un <form>). */
export async function mesurerRecouvrements(racine: Locator): Promise<readonly Recouvrement[]> {
  await attendreAnimations(racine.page());
  return racine.evaluate(recouvrementsDansLaPage);
}

export async function verifierAucunRecouvrement(racine: Locator, contexte: string): Promise<void> {
  expect.soft(await mesurerRecouvrements(racine), `Contrôles qui se recouvrent — ${contexte}`).toEqual([]);
}

// Exécutée dans la page : doit rester autonome.
function barresDansLaPage(): EcartBarreAction[] {
  const MAX = 20;
  const resultats: EcartBarreAction[] = [];

  interface Boite {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }

  const visible = (el: Element): boolean => {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const masque = (el: Element): boolean => {
    for (let x: Element | null = el; x !== null && x !== document.body; x = x.parentElement) {
      const style = getComputedStyle(x);
      if (style.getPropertyValue("clip") !== "auto" || style.clipPath !== "none") {
        return true;
      }
    }
    return false;
  };
  const decrire = (el: Element): string => {
    const texte = el.textContent.replace(/\s+/g, " ").trim().slice(0, 40);
    const id = el.id === "" ? "" : `#${el.id}`;
    return `${el.tagName.toLowerCase()}${id} « ${texte} »`;
  };
  const enBoite = (r: DOMRect): Boite => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  const intersection = (a: Boite, b: Boite): Boite | null => {
    const boite = {
      left: Math.max(a.left, b.left),
      top: Math.max(a.top, b.top),
      right: Math.min(a.right, b.right),
      bottom: Math.min(a.bottom, b.bottom),
    };
    return boite.right - boite.left > 0 && boite.bottom - boite.top > 0 ? boite : null;
  };

  const barres = Array.from(document.querySelectorAll("[data-barre-action]")).filter(visible);
  for (const barre of barres) {
    let defilant: HTMLElement | null = null;
    for (let x = barre.parentElement; x !== null; x = x.parentElement) {
      const overflowY = getComputedStyle(x).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        defilant = x;
        break;
      }
    }
    if (defilant === null) {
      continue;
    }
    const zoneDefilante: HTMLElement = defilant;

    const mesurer = (position: string): void => {
      const boiteS = zoneDefilante.getBoundingClientRect();
      const gauche = boiteS.left + zoneDefilante.clientLeft;
      const haut = boiteS.top + zoneDefilante.clientTop;
      const zone: Boite = {
        left: gauche,
        top: haut,
        right: gauche + zoneDefilante.clientWidth,
        bottom: haut + zoneDefilante.clientHeight,
      };
      const bas = barre.getBoundingClientRect().bottom;

      // Coupe par les ancêtres qui rognent jusqu'à la zone défilante incluse, puis par sa zone cliente.
      const reste = (boite: Boite, depuis: Element | null): Boite | null => {
        let courante: Boite | null = boite;
        for (let x = depuis; x !== null && courante !== null; x = x === zoneDefilante ? null : x.parentElement) {
          const style = getComputedStyle(x);
          if (style.overflowX !== "visible" || style.overflowY !== "visible") {
            courante = intersection(courante, enBoite(x.getBoundingClientRect()));
          }
        }
        return courante === null ? null : intersection(courante, zone);
      };
      const signaler = (candidat: Element, boite: Boite): void => {
        const coupe = reste(boite, candidat);
        if (coupe !== null && coupe.bottom - coupe.top > 1 && coupe.bottom > bas + 1 && resultats.length < MAX) {
          resultats.push({
            regle: "CONTENU_SOUS_BARRE",
            description: `${position} : ${decrire(candidat)} visible sous la barre (bas ${String(Math.round(coupe.bottom))} px, barre ${String(Math.round(bas))} px)`,
          });
        }
      };

      const controles = Array.from(
        new Set(zoneDefilante.querySelectorAll('label, input:not([type="hidden"]), textarea, select, button, [role="combobox"]')),
      ).filter((el) => !barre.contains(el) && visible(el) && !masque(el) && el.closest('[aria-hidden="true"]') === null);
      for (const el of controles) {
        signaler(el, enBoite(el.getBoundingClientRect()));
      }
      const marcheur = document.createTreeWalker(zoneDefilante, NodeFilter.SHOW_TEXT);
      for (let noeud = marcheur.nextNode(); noeud !== null; noeud = marcheur.nextNode()) {
        const parent = noeud.parentElement;
        if ((noeud.nodeValue ?? "").trim() === "" || parent === null || barre.contains(parent) || !visible(parent) || masque(parent)) {
          continue;
        }
        const plage = document.createRange();
        plage.selectNodeContents(noeud);
        for (const r of Array.from(plage.getClientRects())) {
          signaler(parent, enBoite(r));
        }
      }
    };

    const origine = zoneDefilante.scrollTop;
    try {
      mesurer("courant");
      if (zoneDefilante.scrollHeight > zoneDefilante.clientHeight + 1) {
        zoneDefilante.scrollTop = 0;
        mesurer("en haut");
        zoneDefilante.scrollTop = zoneDefilante.scrollHeight;
        mesurer("en bas");
      }
    } finally {
      zoneDefilante.scrollTop = origine;
    }
  }

  return resultats;
}

/** expect (non soft) : les bords hauts de `a` et `b` diffèrent d'au plus 1 px (champs voisins d'une même rangée). */
export async function verifierBordsHautsEgaux(a: Locator, b: Locator, contexte: string): Promise<void> {
  const boiteA = await a.boundingBox();
  const boiteB = await b.boundingBox();
  expect(boiteA, `Bords hauts — premier champ introuvable — ${contexte}`).not.toBeNull();
  expect(boiteB, `Bords hauts — second champ introuvable — ${contexte}`).not.toBeNull();
  if (boiteA === null || boiteB === null) {
    return;
  }
  expect(
    Math.abs(boiteA.y - boiteB.y),
    `Bords hauts décalés (${String(Math.round(boiteA.y))} px et ${String(Math.round(boiteB.y))} px) — ${contexte}`,
  ).toBeLessThanOrEqual(1);
}

/** Toutes les barres `[data-barre-action]` visibles de la page ; [] s'il n'y en a aucune. */
export async function mesurerBarresAction(page: Page): Promise<readonly EcartBarreAction[]> {
  await attendreAnimations(page);
  return page.evaluate(barresDansLaPage);
}

export async function verifierBarresAction(page: Page, contexte: string): Promise<void> {
  expect.soft(await mesurerBarresAction(page), `Contenu visible sous une barre d'action — ${contexte}`).toEqual([]);
}
