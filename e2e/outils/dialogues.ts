import { expect, test, type Locator, type Page } from "@playwright/test";

export type RegleDialogue =
  | "DIALOGUE_PLUS_HAUT_QUE_LA_FENETRE"
  | "AUCUN_BOUTON_D_ACTION"
  | "BOUTON_HORS_FENETRE"
  | "BOUTON_RECOUVERT";

export interface ProblemeDialogue {
  readonly regle: RegleDialogue;
  readonly description: string;
}

export interface MesureDialogue {
  readonly nom: string;
  readonly hauteur: number;
  readonly hauteurFenetre: number;
  readonly problemes: readonly ProblemeDialogue[];
}

// Exécutée dans la page : doit rester autonome (aucune référence à un identifiant du module).
function mesurerDansLaPage(): MesureDialogue[] {
  const MAX = 20;
  const racine = document.documentElement;
  const H = racine.clientHeight;
  const L = racine.clientWidth;

  const visible = (el: Element): boolean => {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const normaliser = (texte: string): string => texte.replace(/\s+/g, " ").trim();
  const nomDe = (el: Element): string => {
    const ids = (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter((id) => id !== "");
    const textes = ids.map((id) => normaliser(document.getElementById(id)?.textContent ?? "")).filter((t) => t !== "");
    if (textes.length > 0) {
      return textes.join(" ");
    }
    const label = normaliser(el.getAttribute("aria-label") ?? "");
    return label === "" ? "(sans titre)" : label;
  };
  const dansRect = (haut: number, bas: number, gauche: number, droite: number, hautMin: number, basMax: number, gaucheMin: number, droiteMax: number): boolean =>
    haut >= hautMin - 1 && bas <= basMax + 1 && gauche >= gaucheMin - 1 && droite <= droiteMax + 1;

  const dialogues = Array.from(
    document.querySelectorAll('[data-slot="dialog-content"], [data-slot="alert-dialog-content"], [data-slot="sheet-content"]'),
  ).filter(visible);

  return dialogues.map((dialogue): MesureDialogue => {
    const nom = nomDe(dialogue);
    const rect = dialogue.getBoundingClientRect();
    const problemes: { regle: RegleDialogue; description: string }[] = [];
    const ajouter = (regle: RegleDialogue, description: string): void => {
      if (problemes.length < MAX) {
        problemes.push({ regle, description });
      }
    };

    if (rect.height > H + 1 || rect.top < -1 || rect.bottom > H + 1) {
      ajouter(
        "DIALOGUE_PLUS_HAUT_QUE_LA_FENETRE",
        `« ${nom} » : hauteur ${String(Math.round(rect.height))} px, haut ${String(Math.round(rect.top))}, bas ${String(Math.round(rect.bottom))}, fenêtre ${String(H)} px`,
      );
    }

    const rolesExclus = ["combobox", "switch", "checkbox", "radio", "tab"];
    // La croix d'un Sheet est le dernier enfant du contenu, après le pied : elle serait prise pour le bouton d'action.
    // Le bouton « Fermer » d'un pied, lui, a le même data-slot mais n'est pas enfant direct du contenu.
    const croixDuSheet = (b: Element): boolean => b.getAttribute("data-slot") === "sheet-close" && b.parentElement === dialogue;
    const candidats = Array.from(dialogue.querySelectorAll("button")).filter(
      (b) =>
        visible(b) &&
        b.getAttribute("data-slot") !== "dialog-close" &&
        !croixDuSheet(b) &&
        !rolesExclus.includes(b.getAttribute("role") ?? ""),
    );
    const dernier = candidats[candidats.length - 1];

    // Ce qui recouvre le bouton : un toast qui le coupe, sinon l'élément qui reçoit un clic en son centre. Un bouton
    // désactivé (pointer-events: none) ne reçoit aucun clic : seul le toast peut alors le recouvrir.
    const recouvrement = (bouton: Element): string | null => {
      const r = bouton.getBoundingClientRect();
      for (const toast of Array.from(document.querySelectorAll("[data-sonner-toast]"))) {
        if (!visible(toast)) {
          continue;
        }
        const t = toast.getBoundingClientRect();
        const largeur = Math.min(r.right, t.right) - Math.max(r.left, t.left);
        const hauteur = Math.min(r.bottom, t.bottom) - Math.max(r.top, t.top);
        if (largeur > 1 && hauteur > 1) {
          return `toast « ${normaliser(toast.textContent).slice(0, 40)} »`;
        }
      }
      if (getComputedStyle(bouton).pointerEvents !== "none") {
        const centre = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (centre === null) {
          return "aucun élément (centre du bouton hors de la fenêtre)";
        }
        if (centre !== bouton && !bouton.contains(centre)) {
          const id = centre.id === "" ? "" : `#${centre.id}`;
          return `${centre.tagName.toLowerCase()}${id} « ${normaliser(centre.textContent).slice(0, 40)} »`;
        }
      }
      return null;
    };

    // docs/lot-m2.md §5.3 : mobile = sous `md`. La croix d'un dialogue ou d'un Sheet y est contrôlée même sans pied.
    const LARGEUR_MD = 768;
    if (L < LARGEUR_MD) {
      const croix = Array.from(dialogue.children).filter(
        (enfant) => ["dialog-close", "sheet-close"].includes(enfant.getAttribute("data-slot") ?? "") && visible(enfant),
      );
      for (const c of croix) {
        const recouvrant = recouvrement(c);
        if (recouvrant !== null) {
          ajouter("BOUTON_RECOUVERT", `« ${nom} » : bouton de fermeture recouvert par ${recouvrant}`);
        }
      }
    }

    if (dernier === undefined) {
      ajouter("AUCUN_BOUTON_D_ACTION", `« ${nom} » : aucun bouton d'action trouvé`);
      return { nom, hauteur: Math.round(rect.height), hauteurFenetre: H, problemes };
    }
    const pied = dernier.parentElement;
    const boutons = candidats.filter((b) => b.parentElement === pied);

    const ancetresDe = (bouton: Element): HTMLElement[] => {
      const liste: HTMLElement[] = [];
      for (let a = bouton.parentElement; a !== null; a = a.parentElement) {
        liste.push(a);
        if (a === dialogue) {
          break;
        }
      }
      return liste;
    };
    const defilants = (bouton: Element): HTMLElement[] =>
      ancetresDe(bouton).filter((a) => {
        const overflowY = getComputedStyle(a).overflowY;
        return ["auto", "scroll", "hidden", "clip"].includes(overflowY) && a.scrollHeight > a.clientHeight + 1;
      });

    const tousDefilants = new Set<HTMLElement>();
    for (const bouton of boutons) {
      for (const a of defilants(bouton)) {
        if (["auto", "scroll"].includes(getComputedStyle(a).overflowY)) {
          tousDefilants.add(a);
        }
      }
    }
    const origines = new Map<HTMLElement, number>();
    for (const a of tousDefilants) {
      origines.set(a, a.scrollTop);
    }

    const verifier = (position: "courant" | "en haut" | "en bas"): void => {
      for (const bouton of boutons) {
        const r = bouton.getBoundingClientRect();
        let dedans = dansRect(r.top, r.bottom, r.left, r.right, 0, H, 0, L);
        if (dedans) {
          for (const a of defilants(bouton)) {
            const ra = a.getBoundingClientRect();
            if (!dansRect(r.top, r.bottom, r.left, r.right, ra.top, ra.bottom, ra.left, ra.right)) {
              dedans = false;
              break;
            }
          }
        }
        if (!dedans) {
          ajouter(
            "BOUTON_HORS_FENETRE",
            `« ${nom} » : bouton « ${normaliser(bouton.textContent)} » non visible (défilement interne ${position}) [haut ${String(Math.round(r.top))}, bas ${String(Math.round(r.bottom))}]`,
          );
        } else if (position === "courant") {
          const recouvrant = recouvrement(bouton);
          if (recouvrant !== null) {
            ajouter("BOUTON_RECOUVERT", `« ${nom} » : bouton « ${normaliser(bouton.textContent)} » recouvert par ${recouvrant}`);
          }
        }
      }
    };

    try {
      verifier("courant");
      if (tousDefilants.size > 0) {
        for (const a of tousDefilants) {
          a.scrollTop = 0;
        }
        verifier("en haut");
        for (const a of tousDefilants) {
          a.scrollTop = a.scrollHeight;
        }
        verifier("en bas");
      }
    } finally {
      for (const [a, haut] of origines) {
        a.scrollTop = haut;
      }
    }

    return { nom, hauteur: Math.round(rect.height), hauteurFenetre: H, problemes };
  });
}

export async function mesurerDialogues(page: Page): Promise<readonly MesureDialogue[]> {
  return page.evaluate(mesurerDansLaPage);
}

// Exécutée dans la page sur le bouton : mêmes deux critères que `recouvrement` de mesurerDansLaPage, dupliqués parce
// que chaque fonction passée à evaluate doit rester autonome.
function recouvrementDuBouton(bouton: Element): string | null {
  const normaliser = (texte: string): string => texte.replace(/\s+/g, " ").trim();
  const visible = (el: Element): boolean => {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  if (!visible(bouton)) {
    return "bouton non visible";
  }
  const r = bouton.getBoundingClientRect();
  for (const toast of Array.from(document.querySelectorAll("[data-sonner-toast]"))) {
    if (!visible(toast)) {
      continue;
    }
    const t = toast.getBoundingClientRect();
    const largeur = Math.min(r.right, t.right) - Math.max(r.left, t.left);
    const hauteur = Math.min(r.bottom, t.bottom) - Math.max(r.top, t.top);
    if (largeur > 1 && hauteur > 1) {
      return `toast « ${normaliser(toast.textContent).slice(0, 40)} »`;
    }
  }
  if (getComputedStyle(bouton).pointerEvents !== "none") {
    const centre = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (centre === null) {
      return "aucun élément (centre du bouton hors de la fenêtre)";
    }
    if (centre !== bouton && !bouton.contains(centre)) {
      const id = centre.id === "" ? "" : `#${centre.id}`;
      return `${centre.tagName.toLowerCase()}${id} « ${normaliser(centre.textContent).slice(0, 40)} »`;
    }
  }
  return null;
}

/** null si le bouton est visible et non recouvert (mêmes deux critères), sinon la description du recouvrant. */
export async function mesurerRecouvrement(bouton: Locator): Promise<string | null> {
  return bouton.evaluate(recouvrementDuBouton);
}

/** expect (non soft) : mesurerRecouvrement(bouton) est null. */
export async function verifierBoutonNonRecouvert(bouton: Locator, contexte: string): Promise<void> {
  expect(await mesurerRecouvrement(bouton), `Bouton recouvert — ${contexte}`).toBeNull();
}

// Exécutée dans la page : doit rester autonome. Lève quand aucun toast n'est visible : le contrôle serait vide.
function toastCouvrantDansLaPage(): string[] {
  const MAX = 20;
  const problemes: string[] = [];
  const ajouter = (description: string): void => {
    if (problemes.length < MAX) {
      problemes.push(description);
    }
  };
  const visible = (el: Element): boolean => {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const toasts = Array.from(document.querySelectorAll("[data-sonner-toast]")).filter(visible);
  if (toasts.length === 0) {
    throw new Error("contrôle impossible : aucun toast");
  }

  const coupe = (a: DOMRect, b: DOMRect): boolean =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;

  const cibles: { nom: string; el: Element }[] = [];
  const dialogues = Array.from(
    document.querySelectorAll('[data-slot="dialog-content"], [data-slot="alert-dialog-content"], [data-slot="sheet-content"]'),
  ).filter(visible);
  dialogues.forEach((dialogue, i) => {
    for (const titre of Array.from(dialogue.querySelectorAll('[data-slot$="-title"]')).filter(visible)) {
      cibles.push({ nom: `titre du dialogue ${String(i + 1)}`, el: titre });
    }
    for (const croix of Array.from(dialogue.querySelectorAll('[data-slot="dialog-close"], [data-slot="sheet-close"]')).filter(visible)) {
      cibles.push({ nom: `croix du dialogue ${String(i + 1)}`, el: croix });
    }
  });
  Array.from(document.querySelectorAll('nav[aria-label="Navigation principale"] a'))
    .filter(visible)
    .forEach((lien, i) => {
      cibles.push({ nom: `lien ${String(i + 1)} de la navigation principale`, el: lien });
    });

  toasts.forEach((toast, t) => {
    const rt = toast.getBoundingClientRect();
    for (const { nom, el } of cibles) {
      if (coupe(rt, el.getBoundingClientRect())) {
        ajouter(`toast ${String(t + 1)} couvre le ${nom}`);
      }
    }
  });

  for (const { nom, el } of cibles) {
    if (nom.startsWith("lien")) {
      continue;
    }
    const r = el.getBoundingClientRect();
    const auCentre = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (auCentre === null || !(auCentre === el || el.contains(auCentre))) {
      ajouter(`le ${nom} n'est pas atteignable en son centre`);
    }
  }
  return problemes;
}

/** [] : aucun toast ne couvre le titre ni la croix d'un dialogue, ni un lien de la navigation. Lève s'il n'y a aucun toast visible. */
export async function mesurerToastCouvrant(page: Page): Promise<readonly string[]> {
  return page.evaluate(toastCouvrantDansLaPage);
}

/** expect (non soft) : aucun toast ne couvre le titre, la croix ni la navigation. */
export async function verifierToastNeCouvrePas(page: Page, contexte: string): Promise<void> {
  expect(await mesurerToastCouvrant(page), `Toast qui couvre un titre, une croix ou la navigation — ${contexte}`).toEqual([]);
}

export async function verifierDialogues(page: Page, contexte: string): Promise<readonly MesureDialogue[]> {
  const mesures = await mesurerDialogues(page);
  const problemes = mesures.flatMap((m) => m.problemes);
  const noms = mesures.length === 0 ? "aucun dialogue" : mesures.map((m) => m.nom).join(", ");
  expect
    .soft(
      problemes,
      `Dialogue trop haut ou boutons d'action invisibles — ${noms} — ${contexte} (projet ${test.info().project.name})`,
    )
    .toEqual([]);
  return mesures;
}
