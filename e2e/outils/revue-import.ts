import { expect, type Page } from "@playwright/test";

export type RegleAlignement = "TABLEAU_ABSENT" | "AUCUNE_LIGNE" | "EN_TETE_ABSENT" | "CELLULE_ABSENTE" | "DECALAGE";

export interface EcartAlignement {
  readonly regle: RegleAlignement;
  readonly description: string;
}

export type RegleChampDate = "AUCUN_CHAMP_DATE" | "DATE_TROP_ETROITE" | "DATE_DEFILE" | "PARENT_ABSENT";

export interface ChampDateIllisible {
  readonly regle: RegleChampDate;
  readonly description: string;
}

export type RegleEnTeteSection =
  | "AUCUNE_SECTION"
  | "NOMBRE_SECTIONS"
  | "PARTIE_ABSENTE"
  | "HORS_CARTE"
  | "HORS_FENETRE"
  | "SANS_MARGE_INTERIEURE";

export type RegleEtiquetteChamp = "AUCUNE_LIGNE" | "ETIQUETTE_ABSENTE" | "ETIQUETTE_INVISIBLE";

export interface EcartEtiquetteChamp {
  readonly regle: RegleEtiquetteChamp;
  readonly description: string;
}

export type RegleNomCompte =
  | "AUCUN_SELECTEUR_COMPTE"
  | "PARTIE_ABSENTE"
  | "TITRE_INCOMPLET"
  | "TEXTE_INCOMPLET"
  | "NON_TRONQUE"
  | "DEBORDE";

export interface EcartNomCompte {
  readonly regle: RegleNomCompte;
  readonly description: string;
}

export interface EcartEnTeteSection {
  readonly regle: RegleEnTeteSection;
  readonly description: string;
}

// Exécutée dans la page : doit rester autonome (aucune référence à un identifiant du module).
function mesurerAlignementDansLaPage(): EcartAlignement[] {
  const MAX = 20;
  const TOLERANCE_PX = 2;
  const resultats: EcartAlignement[] = [];

  const visible = (el: Element): boolean => {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const ajouter = (ecart: EcartAlignement): void => {
    if (resultats.length < MAX) {
      resultats.push(ecart);
    }
  };

  const tableaux = Array.from(document.querySelectorAll("[data-tableau-revue]")).filter(visible);
  if (tableaux.length === 0) {
    return [{ regle: "TABLEAU_ABSENT", description: "aucun tableau [data-tableau-revue] visible" }];
  }

  for (const tableau of tableaux) {
    const entetes = new Map<string, Element>();
    for (const entete of Array.from(tableau.querySelectorAll("[data-entete-colonne]")).filter(visible)) {
      entetes.set(entete.getAttribute("data-entete-colonne") ?? "", entete);
    }
    const lignes = Array.from(tableau.querySelectorAll("[data-ligne-a-importer]")).filter(visible);
    if (lignes.length === 0) {
      ajouter({ regle: "AUCUNE_LIGNE", description: "aucune ligne [data-ligne-a-importer] visible" });
      continue;
    }

    lignes.forEach((ligne, index) => {
      const numero = index + 1;
      const cles = new Set<string>();
      for (const cellule of Array.from(ligne.querySelectorAll("[data-colonne]")).filter(visible)) {
        const cle = cellule.getAttribute("data-colonne") ?? "";
        cles.add(cle);
        const entete = entetes.get(cle);
        if (entete === undefined) {
          ajouter({ regle: "EN_TETE_ABSENT", description: `colonne ${cle}, ligne ${String(numero)}` });
          continue;
        }
        const h = entete.getBoundingClientRect();
        const c = cellule.getBoundingClientRect();
        if (Math.abs(c.left - h.left) > TOLERANCE_PX || c.right > h.right + TOLERANCE_PX) {
          ajouter({
            regle: "DECALAGE",
            description: `colonne ${cle}, ligne ${String(numero)} : en-tête [${String(Math.round(h.left))}, ${String(Math.round(h.right))}], cellule [${String(Math.round(c.left))}, ${String(Math.round(c.right))}]`,
          });
        }
      }
      for (const cle of entetes.keys()) {
        if (!cles.has(cle)) {
          ajouter({ regle: "CELLULE_ABSENTE", description: `colonne ${cle}, ligne ${String(numero)}` });
        }
      }
    });
  }

  return resultats;
}

// Exécutée dans la page : doit rester autonome (aucune référence à un identifiant du module).
function mesurerChampsDateDansLaPage(): ChampDateIllisible[] {
  const MAX = 20;
  const resultats: ChampDateIllisible[] = [];

  const visible = (el: Element): boolean => {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const ajouter = (ecart: ChampDateIllisible): void => {
    if (resultats.length < MAX) {
      resultats.push(ecart);
    }
  };

  const champs = Array.from(document.querySelectorAll('input[data-colonne="date"], input[data-champ-date]')).filter(
    (el): el is HTMLInputElement => el instanceof HTMLInputElement && visible(el),
  );
  if (champs.length === 0) {
    return [
      {
        regle: "AUCUN_CHAMP_DATE",
        description: "aucun champ input[data-colonne=\"date\"] ou input[data-champ-date] visible",
      },
    ];
  }

  champs.forEach((el, index) => {
    const numero = index + 1;
    const parent = el.parentElement;
    let necessaire = 0;
    if (parent === null) {
      ajouter({
        regle: "PARENT_ABSENT",
        description: `champ ${String(numero)} (valeur ${el.value}) : aucun parent, largeur nécessaire non mesurée`,
      });
    } else {
      const clone = el.cloneNode(false) as HTMLInputElement;
      clone.value = el.value;
      clone.style.cssText =
        "position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;width:max-content;min-width:0;max-width:none";
      parent.appendChild(clone);
      try {
        necessaire = clone.getBoundingClientRect().width;
      } finally {
        clone.remove();
      }
    }
    const largeur = el.getBoundingClientRect().width;
    if (parent !== null && largeur < necessaire - 1) {
      ajouter({
        regle: "DATE_TROP_ETROITE",
        description: `champ ${String(numero)} (valeur ${el.value}) : largeur ${String(Math.round(largeur))} px, nécessaire ${String(Math.round(necessaire))} px`,
      });
    }
    if (el.scrollWidth > el.clientWidth + 1) {
      ajouter({
        regle: "DATE_DEFILE",
        description: `champ ${String(numero)} : scrollWidth ${String(el.scrollWidth)} / clientWidth ${String(el.clientWidth)}`,
      });
    }
  });

  return resultats;
}

// Exécutée dans la page : doit rester autonome (aucune référence à un identifiant du module).
function mesurerEnTetesSectionsDansLaPage(): EcartEnTeteSection[] {
  const MAX = 20;
  const TOLERANCE_PX = 1;
  const MARGE_MIN_PX = 4;
  const L = document.documentElement.clientWidth;
  const resultats: EcartEnTeteSection[] = [];

  const visible = (el: Element): boolean => {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const ajouter = (ecart: EcartEnTeteSection): void => {
    if (resultats.length < MAX) {
      resultats.push(ecart);
    }
  };
  const boite = (r: DOMRect): string =>
    `[${String(Math.round(r.left))}, ${String(Math.round(r.right))}, ${String(Math.round(r.top))}, ${String(Math.round(r.bottom))}]`;

  const cartes = Array.from(document.querySelectorAll("[data-section-repliable]")).filter(visible);
  if (cartes.length === 0) {
    return [{ regle: "AUCUNE_SECTION", description: "aucune carte [data-section-repliable] visible" }];
  }
  if (cartes.length !== 4) {
    ajouter({
      regle: "NOMBRE_SECTIONS",
      description: `${String(cartes.length)} carte(s) [data-section-repliable] visibles, 4 attendues`,
    });
  }

  for (const carte of cartes) {
    const brut = carte.querySelector("[data-entete-section]")?.textContent.replace(/\s+/g, " ").trim().slice(0, 60) ?? "";
    const titre = brut === "" ? "(sans en-tête)" : brut;
    const c = carte.getBoundingClientRect();
    const parties: readonly (readonly [string, string])[] = [
      ["bouton", "[data-entete-section]"],
      ["texte", "[data-entete-texte]"],
      ["chevron", "[data-chevron-section]"],
    ];
    const boites = new Map<string, DOMRect>();
    for (const [nom, selecteur] of parties) {
      const el = Array.from(carte.querySelectorAll(selecteur)).find(visible);
      if (el === undefined) {
        ajouter({ regle: "PARTIE_ABSENTE", description: `« ${titre} » : partie ${nom} absente` });
        continue;
      }
      const r = el.getBoundingClientRect();
      boites.set(nom, r);
      if (
        r.left < c.left - TOLERANCE_PX ||
        r.right > c.right + TOLERANCE_PX ||
        r.top < c.top - TOLERANCE_PX ||
        r.bottom > c.bottom + TOLERANCE_PX
      ) {
        ajouter({ regle: "HORS_CARTE", description: `« ${titre} » : ${nom} ${boite(r)} ; carte ${boite(c)}` });
      }
      if (r.left < -TOLERANCE_PX || r.right > L + TOLERANCE_PX) {
        ajouter({
          regle: "HORS_FENETRE",
          description: `« ${titre} » : ${nom} ${boite(r)} ; fenêtre [0, ${String(L)}]`,
        });
      }
    }

    // Docs/lot-m2.md §10.2 point 7 : la bande de survol du bouton déborde du texte et du chevron.
    const bouton = boites.get("bouton");
    const texte = boites.get("texte");
    const chevron = boites.get("chevron");
    if (bouton !== undefined && texte !== undefined && chevron !== undefined) {
      if (texte.left - bouton.left < MARGE_MIN_PX || bouton.right - chevron.right < MARGE_MIN_PX) {
        ajouter({
          regle: "SANS_MARGE_INTERIEURE",
          description: `« ${titre} » : texte ${boite(texte)}, chevron ${boite(chevron)}, bouton ${boite(bouton)}, marge minimale ${String(MARGE_MIN_PX)} px`,
        });
      }
    }
  }

  return resultats;
}

// Exécutée dans la page : doit rester autonome (aucune référence à un identifiant du module).
function mesurerEtiquettesChampsDansLaPage(): EcartEtiquetteChamp[] {
  const MAX = 20;
  const TAILLE_MIN_PX = 8;
  const resultats: EcartEtiquetteChamp[] = [];

  const visible = (el: Element): boolean => {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const ajouter = (ecart: EcartEtiquetteChamp): void => {
    if (resultats.length < MAX) {
      resultats.push(ecart);
    }
  };

  const lignes = Array.from(document.querySelectorAll("[data-ligne-a-importer]")).filter(visible);
  if (lignes.length === 0) {
    return [{ regle: "AUCUNE_LIGNE", description: "aucune ligne [data-ligne-a-importer] visible" }];
  }

  lignes.forEach((ligne, index) => {
    const numero = index + 1;
    for (const cle of ["beneficiaire", "sousCategorie"]) {
      const etiquette = ligne.querySelector(`[data-etiquette-champ="${cle}"]`);
      if (etiquette === null) {
        ajouter({ regle: "ETIQUETTE_ABSENTE", description: `ligne ${String(numero)} : étiquette ${cle} absente` });
        continue;
      }
      const style = getComputedStyle(etiquette);
      const rect = etiquette.getBoundingClientRect();
      const raisons: string[] = [];
      if (!etiquette.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
        raisons.push("non visible");
      }
      if (rect.width < TAILLE_MIN_PX || rect.height < TAILLE_MIN_PX) {
        raisons.push(`boîte ${String(Math.round(rect.width))} x ${String(Math.round(rect.height))} px`);
      }
      if (style.getPropertyValue("clip") !== "auto") {
        raisons.push(`clip ${style.getPropertyValue("clip")}`);
      }
      if (style.clipPath !== "none") {
        raisons.push(`clip-path ${style.clipPath}`);
      }
      if (raisons.length > 0) {
        ajouter({
          regle: "ETIQUETTE_INVISIBLE",
          description: `ligne ${String(numero)} : étiquette ${cle} (${raisons.join(", ")})`,
        });
      }
    }
  });

  return resultats;
}

// Exécutée dans la page : doit rester autonome (aucune référence à un identifiant du module).
function mesurerNomsComptesDansLaPage(nom: string): EcartNomCompte[] {
  const MAX = 20;
  const resultats: EcartNomCompte[] = [];

  const visible = (el: Element): boolean => {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const ajouter = (ecart: EcartNomCompte): void => {
    if (resultats.length < MAX) {
      resultats.push(ecart);
    }
  };

  const colonnes = Array.from(document.querySelectorAll('[data-colonne="compte"]')).filter(visible);
  if (colonnes.length === 0) {
    return [{ regle: "AUCUN_SELECTEUR_COMPTE", description: "aucune colonne [data-colonne=\"compte\"] visible" }];
  }

  colonnes.forEach((colonne, index) => {
    const numero = index + 1;
    const declencheur = colonne.querySelector('[data-slot="select-trigger"]');
    const texte = colonne.querySelector("[data-nom-compte]");
    if (declencheur === null || texte === null) {
      ajouter({
        regle: "PARTIE_ABSENTE",
        description: `colonne ${String(numero)} : ${declencheur === null ? "déclencheur" : "texte [data-nom-compte]"} absent`,
      });
      return;
    }
    if (declencheur.getAttribute("title") !== nom) {
      ajouter({
        regle: "TITRE_INCOMPLET",
        description: `colonne ${String(numero)} : title « ${declencheur.getAttribute("title") ?? ""} »`,
      });
    }
    if (texte.textContent.trim() !== nom) {
      ajouter({
        regle: "TEXTE_INCOMPLET",
        description: `colonne ${String(numero)} : texte « ${texte.textContent.trim()} »`,
      });
    }
    const overflow = getComputedStyle(texte).getPropertyValue("text-overflow");
    if (overflow !== "ellipsis" || texte.scrollWidth <= texte.clientWidth) {
      ajouter({
        regle: "NON_TRONQUE",
        description: `colonne ${String(numero)} : text-overflow ${overflow}, scrollWidth ${String(texte.scrollWidth)} / clientWidth ${String(texte.clientWidth)}`,
      });
    }
    const c = colonne.getBoundingClientRect();
    const d = declencheur.getBoundingClientRect();
    const t = texte.getBoundingClientRect();
    if (d.right > c.right + 1 || t.right > d.right + 1) {
      ajouter({
        regle: "DEBORDE",
        description: `colonne ${String(numero)} : colonne droite ${String(Math.round(c.right))}, déclencheur ${String(Math.round(d.right))}, texte ${String(Math.round(t.right))}`,
      });
    }
  });

  return resultats;
}

export async function mesurerEtiquettesChamps(page: Page): Promise<readonly EcartEtiquetteChamp[]> {
  return page.evaluate(mesurerEtiquettesChampsDansLaPage);
}

export async function mesurerNomsComptes(page: Page, nom: string): Promise<readonly EcartNomCompte[]> {
  return page.evaluate(mesurerNomsComptesDansLaPage, nom);
}

export async function mesurerEnTetesSections(page: Page): Promise<readonly EcartEnTeteSection[]> {
  return page.evaluate(mesurerEnTetesSectionsDansLaPage);
}

export async function mesurerAlignementEnTetes(page: Page): Promise<readonly EcartAlignement[]> {
  return page.evaluate(mesurerAlignementDansLaPage);
}

export async function mesurerChampsDate(page: Page): Promise<readonly ChampDateIllisible[]> {
  return page.evaluate(mesurerChampsDateDansLaPage);
}

async function attendreFinDesAnimations(page: Page): Promise<void> {
  // 2 s au plus : une animation sans fin (squelette de chargement) ne doit pas bloquer la mesure.
  await page
    .waitForFunction(() => !document.getAnimations().some((animation) => animation.playState === "running"), undefined, {
      timeout: 2000,
    })
    .catch(() => undefined);
}

export async function verifierEnTetesAlignes(page: Page, contexte: string): Promise<void> {
  await attendreFinDesAnimations(page);
  const ecarts = await mesurerAlignementEnTetes(page);
  expect.soft(ecarts, `En-têtes de la revue désalignés — ${contexte}`).toEqual([]);
}

export async function verifierEnTetesSectionsContenus(page: Page, contexte: string): Promise<void> {
  await attendreFinDesAnimations(page);
  const ecarts = await mesurerEnTetesSections(page);
  expect.soft(ecarts, `En-têtes de section hors de la carte — ${contexte}`).toEqual([]);
}

export async function verifierEtiquettesChampsVisibles(page: Page, contexte: string): Promise<void> {
  await attendreFinDesAnimations(page);
  const ecarts = await mesurerEtiquettesChamps(page);
  expect.soft(ecarts, `Étiquettes de champ de la revue invisibles — ${contexte}`).toEqual([]);
}

export async function verifierNomCompteTronque(page: Page, nom: string, contexte: string): Promise<void> {
  await attendreFinDesAnimations(page);
  const ecarts = await mesurerNomsComptes(page, nom);
  expect.soft(ecarts, `Nom de compte de la revue mal tronqué — ${contexte}`).toEqual([]);
}

export async function verifierChampsDateLisibles(page: Page, contexte: string): Promise<void> {
  await attendreFinDesAnimations(page);
  const champs = await mesurerChampsDate(page);
  expect.soft(champs, `Champ date de la revue illisible — ${contexte}`).toEqual([]);
}
