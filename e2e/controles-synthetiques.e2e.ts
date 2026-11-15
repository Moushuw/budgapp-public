// Contrôles des outils de mesure eux-mêmes, sur des pages synthétiques (page.setContent, styles en ligne) : aucune
// route applicative, aucun serveur sollicité. docs/lot-m2.md §10.2 points 9 et 10.

import { expect, test } from "@playwright/test";
import { mesurerDebordements } from "./outils/debordement";
import { mesurerDialogues, mesurerRecouvrement, mesurerToastCouvrant } from "./outils/dialogues";
import { mesurerBarresAction, mesurerRecouvrements, verifierBordsHautsEgaux } from "./outils/formulaires";
import { mesurerChampsDate } from "./outils/revue-import";

test("ELEMENT_ROGNE attrape un en-tête rogné, une seule fois, et respecte la troncature voulue", async ({ page }) => {
  await page.setContent(`
    <div id="carte" style="width:150px;overflow:hidden;font:16px sans-serif">
      <button id="entete" style="display:block;white-space:nowrap;width:300px;padding:0;border:0;text-align:left">
        <span id="texte">À importer <span id="detail">(0 · + 1 réintégrée d'une autre section)</span></span>
      </button>
    </div>
    <div style="width:150px;overflow:hidden;font:16px sans-serif">
      <span id="ellipse" style="display:block;width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Un nom de compte beaucoup trop long pour sa colonne</span>
    </div>
  `);

  const ecarts = await mesurerDebordements(page);
  const rognes = ecarts.filter((ecart) => ecart.regle === "ELEMENT_ROGNE");
  expect(rognes).toHaveLength(1);
  expect(rognes[0]?.description.startsWith("button#entete")).toBe(true);
  for (const ecart of ecarts) {
    expect(ecart.description).not.toContain("span#texte");
    expect(ecart.description).not.toContain("span#detail");
    expect(ecart.description).not.toContain("span#ellipse");
  }
  expect(ecarts.filter((ecart) => ecart.regle === "PAGE")).toEqual([]);
});

test("mesurerChampsDate plafonne ses écarts et signale un champ sans parent", async ({ page }) => {
  // 19 champs étroits qui ne produisent que DATE_TROP_ETROITE (un champ date ne défile pas), puis 5 champs texte qui
  // produisent DATE_TROP_ETROITE et DATE_DEFILE : le 20e écart tombe au milieu d'un champ qui en produit deux. Un test
  // de tête de boucle (>= MAX) rendrait 21 ; le plafond par ajout en rend exactement 20.
  const etroit = '<div><input type="date" data-colonne="date" value="2026-08-31" style="width:40px"></div>';
  const defile =
    '<div><input type="text" data-colonne="date" value="2026-08-31 2026-08-31 2026-08-31 2026-08-31" style="width:40px"></div>';
  await page.setContent(`<div style="width:900px">${etroit.repeat(19)}${defile.repeat(5)}</div>`);
  const plafonnes = await mesurerChampsDate(page);
  expect(plafonnes).toHaveLength(20);
  // Le 20e écart est celui du champ 20 (le premier champ texte) ; le suivant, tronqué, ne figure pas.
  expect(plafonnes[19]?.regle).toBe("DATE_TROP_ETROITE");
  expect(plafonnes[19]?.description.startsWith("champ 20 (")).toBe(true);
  expect(plafonnes[18]?.description.startsWith("champ 19 (")).toBe(true);

  // Témoin : un seul champ texte produit exactement ses deux écarts, sans que le plafond y soit pour quelque chose.
  await page.setContent(`<div style="width:900px">${defile}</div>`);
  expect((await mesurerChampsDate(page)).map((ecart) => ecart.regle)).toEqual(["DATE_TROP_ETROITE", "DATE_DEFILE"]);

  await page.setContent('<div><input type="date" data-colonne="date" value="2026-08-31"></div>');
  await page.evaluate(() => {
    const input = document.querySelector("input");
    if (input === null) {
      throw new Error("input absent");
    }
    Object.defineProperty(input, "parentElement", { get: () => null });
  });
  const ecarts = await mesurerChampsDate(page);
  expect(ecarts.map((ecart) => ecart.regle)).toContain("PARENT_ABSENT");
});

test("ELEMENT_ROGNE attrape un contenu rogné dans une zone à défilement vertical, et respecte le défilement horizontal", async ({
  page,
}) => {
  const formulaire = (colonnes: string, bouton: string): string => `
    <form id="formulaire" style="width:200px;max-height:100px;overflow-y:auto;overflow-x:hidden;font:16px sans-serif">
      <div style="display:flex;gap:8px">
        <div style="flex:1;${colonnes}"><button style="white-space:nowrap">Champ</button></div>
        <div id="colonne-operateur" style="flex:1;${colonnes}"><button id="operateur" style="white-space:nowrap;${bouton}">contient le mot entier</button></div>
      </div>
      <div style="height:300px"></div>
    </form>`;
  const rognes = async () => (await mesurerDebordements(page)).filter((ecart) => ecart.regle === "ELEMENT_ROGNE");

  await page.setContent(formulaire("", ""));
  const trouves = await rognes();
  expect(trouves).toHaveLength(1);
  expect(trouves[0]?.description.startsWith("div#colonne-operateur")).toBe(true);
  expect(trouves[0]?.description).toContain("rogné par form");

  // Témoin : colonnes à min-width 0 et bouton tronqué voulu.
  await page.setContent(formulaire("min-width:0;", "max-width:100%;overflow:hidden;text-overflow:ellipsis;"));
  expect(await rognes()).toEqual([]);

  // Témoin 2 : le défilement horizontal reste exclu (il relève de DEFILEMENT_HORIZONTAL).
  await page.setContent('<div style="width:150px;overflow-x:auto;font:16px sans-serif"><div style="width:300px">Large</div></div>');
  expect(await rognes()).toEqual([]);
});

test("BOUTON_RECOUVERT attrape un toast sur le pied d'un dialogue, et rien quand le toast est ailleurs", async ({ page }) => {
  const page_ = (haut: number): string => `
    <div data-slot="dialog-content" aria-label="Dialogue synthétique" style="position:fixed;left:20px;top:100px;width:300px;height:200px;background:white;font:16px sans-serif">
      <p>Contenu</p>
      <div style="position:absolute;bottom:10px;right:10px"><button>Annuler</button><button id="appliquer">Appliquer</button></div>
    </div>
    <ol><li data-sonner-toast style="position:fixed;left:0;top:${String(haut)}px;width:375px;height:60px;background:white;font:16px sans-serif">Règle créée.</li></ol>`;

  await page.setContent(page_(250));
  const recouverts = (await mesurerDialogues(page)).flatMap((mesure) => mesure.problemes).filter((p) => p.regle === "BOUTON_RECOUVERT");
  expect(recouverts.length).toBeGreaterThan(0);
  expect(recouverts.some((p) => p.description.includes("Appliquer") && p.description.includes("toast"))).toBe(true);
  expect(await mesurerRecouvrement(page.locator("#appliquer"))).not.toBeNull();

  await page.setContent(page_(0));
  const libres = (await mesurerDialogues(page)).flatMap((mesure) => mesure.problemes).filter((p) => p.regle === "BOUTON_RECOUVERT");
  expect(libres).toEqual([]);
  expect(await mesurerRecouvrement(page.locator("#appliquer"))).toBeNull();
});

test("le contrôle de recouvrement attrape deux étiquettes qui se chevauchent, et rien sur une mise en page saine", async ({
  page,
}) => {
  const formulaire = (colonnes: string): string => `
    <form id="f" style="width:200px;font:16px sans-serif">
      <div style="display:flex;${colonnes}">
        <div style="width:90px"><label style="white-space:nowrap">Sous-catégorie très longue</label></div>
        <div style="width:90px"><label>Montant</label></div>
      </div>
    </form>`;

  await page.setContent(formulaire(""));
  const ecarts = await mesurerRecouvrements(page.locator("#f"));
  const coupes = ecarts.filter((ecart) => ecart.regle === "CONTROLES_SE_COUPENT");
  expect(coupes.length).toBeGreaterThan(0);
  expect(coupes.some((ecart) => ecart.description.includes("Sous-catégorie") && ecart.description.includes("Montant"))).toBe(true);

  // Même géométrie avec un libellé `flex` (comme FormLabel) : sa boîte s'arrête à la colonne, seul le texte déborde.
  const flex = `
    <form id="f" style="width:200px;font:16px sans-serif">
      <div style="display:flex">
        <div style="width:90px"><label style="display:flex;white-space:nowrap">Sous-catégorie très longue</label></div>
        <div style="width:90px"><label>Montant</label></div>
      </div>
    </form>`;
  await page.setContent(flex);
  const coupesFlex = (await mesurerRecouvrements(page.locator("#f"))).filter((ecart) => ecart.regle === "CONTROLES_SE_COUPENT");
  expect(coupesFlex.some((ecart) => ecart.description.includes("Sous-catégorie") && ecart.description.includes("Montant"))).toBe(true);

  // Témoin ellipse : le texte tronqué voulu d'un bouton ne déborde pas sur son voisin.
  await page.setContent(`
    <form id="f" style="width:300px;font:16px sans-serif">
      <div style="display:flex">
        <button type="button" style="width:120px;min-width:0"><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Un nom de compte beaucoup trop long pour sa colonne</span></button>
        <button type="button">Voisin</button>
      </div>
    </form>`);
  expect(await mesurerRecouvrements(page.locator("#f"))).toEqual([]);

  // Témoin 1 : colonnes empilées.
  await page.setContent(formulaire("flex-direction:column;"));
  expect(await mesurerRecouvrements(page.locator("#f"))).toEqual([]);

  // Formulaire entièrement hors de la zone visible d'un conteneur défilant : rien n'est mesuré.
  await page.setContent(`
    <div id="zone" style="height:60px;overflow-y:auto;font:16px sans-serif">
      <div style="height:300px"></div>
      <form id="f"><label>Nom</label><input><button type="button">Envoyer</button></form>
      <div style="height:300px"></div>
    </div>`);
  await page.evaluate(() => {
    const zone = document.querySelector("#zone");
    if (zone !== null) {
      zone.scrollTop = 0;
    }
  });
  const horsZone = await mesurerRecouvrements(page.locator("#f"));
  expect(horsZone.map((ecart) => ecart.regle)).toEqual(["AUCUN_CONTROLE"]);

  // Témoin 2 : une barre collante passe par-dessus des champs qui défilent, ce n'est pas un recouvrement.
  const champs = Array.from({ length: 10 }, (_, i) => `<div><label>Champ ${String(i)}</label><input></div>`).join("");
  await page.setContent(`
    <div style="height:150px;overflow-y:auto;font:16px sans-serif">
      <form id="f">
        ${champs}
        <div style="position:sticky;bottom:0;background:white"><button type="button">Annuler</button><button type="submit">Enregistrer</button></div>
      </form>
    </div>`);
  expect(await mesurerRecouvrements(page.locator("#f"))).toEqual([]);

  // Témoin 3 : un contrôle dans son étiquette, et une liste coupée par son défilement suivie d'un champ.
  const etiquettes = Array.from({ length: 10 }, (_, i) => `<label style="display:block">Option ${String(i)}</label>`).join("");
  await page.setContent(`
    <form id="f" style="width:300px;font:16px sans-serif">
      <label>Nom <input></label>
      <div style="max-height:60px;overflow-y:auto">${etiquettes}</div>
      <input>
    </form>`);
  expect(await mesurerRecouvrements(page.locator("#f"))).toEqual([]);

  // Témoin 4 : un contrôle masqué visuellement posé sur un champ.
  await page.setContent(`
    <form id="f" style="width:300px;font:16px sans-serif">
      <input style="width:200px">
      <span style="position:absolute;clip:rect(0,0,0,0)"><select><option>Un</option></select></span>
    </form>`);
  expect(await mesurerRecouvrements(page.locator("#f"))).toEqual([]);

  // Racine invisible.
  await page.setContent('<form id="f" style="display:none"><input></form>');
  const invisibles = await mesurerRecouvrements(page.locator("#f"));
  expect(invisibles).toHaveLength(1);
  expect(invisibles[0]?.regle).toBe("RACINE_INVISIBLE");
});

test("CONTENU_SOUS_BARRE attrape un contenu visible sous une barre collante, et rien quand la barre compense le rembourrage", async ({
  page,
}) => {
  const champs = Array.from({ length: 12 }, () => '<input style="display:block;margin-bottom:4px">').join("");
  const page_ = (barre: string): string => `
    <div id="defilant" style="height:200px;overflow-y:auto;padding:0 16px 16px;font:16px sans-serif">
      <form>
        ${champs}
        <div data-barre-action style="position:sticky;background:white;${barre}"><button type="button">Enregistrer</button></div>
      </form>
    </div>`;
  const defiler = async (): Promise<void> => {
    await page.evaluate(() => {
      const defilant = document.querySelector("#defilant");
      if (defilant !== null) {
        defilant.scrollTop = 30;
      }
    });
  };
  const lireDefilement = async (): Promise<number | undefined> =>
    page.evaluate(() => document.querySelector("#defilant")?.scrollTop);

  await page.setContent(page_("bottom:0;padding-top:8px"));
  await defiler();
  const ecarts = await mesurerBarresAction(page);
  expect(ecarts.some((ecart) => ecart.description.startsWith("en haut :"))).toBe(true);
  expect(await lireDefilement()).toBe(30);

  await page.setContent(page_("bottom:-16px;padding-top:8px;padding-bottom:16px"));
  await defiler();
  expect(await mesurerBarresAction(page)).toEqual([]);
  expect(await lireDefilement()).toBe(30);

  await page.setContent("<form><input><button>Enregistrer</button></form>");
  expect(await mesurerBarresAction(page)).toEqual([]);
});

test("BOUTON_RECOUVERT attrape un toast sur la croix d'un dialogue en mobile, et rien avec la gouttière ou en bureau", async ({
  page,
}) => {
  const page_ = (largeurToast: number): string => `
    <div data-slot="dialog-content" aria-label="Dialogue synthétique" style="position:fixed;left:16px;top:16px;width:343px;height:300px;background:white;font:16px sans-serif">
      <p>Contenu</p>
      <button data-slot="dialog-close" style="position:absolute;top:8px;right:8px;width:28px;height:28px">X</button>
      <div style="position:absolute;bottom:10px;right:10px"><button>Annuler</button><button>Appliquer</button></div>
    </div>
    <ol><li data-sonner-toast style="position:fixed;left:16px;top:16px;width:${String(largeurToast)}px;height:56px;background:white;font:16px sans-serif">Règle créée.</li></ol>`;
  const recouverts = async (): Promise<string[]> =>
    (await mesurerDialogues(page))
      .flatMap((mesure) => mesure.problemes)
      .filter((p) => p.regle === "BOUTON_RECOUVERT")
      .map((p) => p.description);

  await page.setViewportSize({ width: 375, height: 667 });
  await page.setContent(page_(343));
  const trouves = await recouverts();
  expect(trouves.some((d) => d.includes("bouton de fermeture") && d.includes("toast"))).toBe(true);

  // Témoin (gouttière) : le toast s'arrête avant la croix.
  await page.setContent(page_(295));
  expect(await recouverts()).toEqual([]);

  // Témoin (bureau) : la règle ne vise que les largeurs sous `md`.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(page_(343));
  expect((await recouverts()).filter((d) => d.includes("bouton de fermeture"))).toEqual([]);
});

// docs/pilotage/passes/m2.md P2-a : le message de reste à répartir, dans le flux, sortait de la fenêtre.
test("un message rendu dans le flux sous les champs sort de la fenêtre ; dans la barre collante il y reste", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const champs = Array.from({ length: 20 }, () => '<input style="display:block;margin-bottom:4px">').join("");
  const message = '<p id="message">Il reste 8,00 $ à répartir.</p>';
  const page_ = (dansLaBarre: boolean): string => `
    <div id="defilant" style="height:300px;overflow-y:auto;padding:0 16px 16px;font:16px sans-serif">
      <form>
        ${champs}
        ${dansLaBarre ? "" : message}
        <div data-barre-action style="position:sticky;bottom:-16px;background:white;padding-top:8px;padding-bottom:16px">
          ${dansLaBarre ? message : ""}
          <button type="submit">Enregistrer</button>
        </div>
      </form>
    </div>`;
  const enHaut = async (): Promise<void> => {
    await page.evaluate(() => {
      const defilant = document.querySelector("#defilant");
      if (defilant !== null) {
        defilant.scrollTop = 0;
      }
    });
  };

  await page.setContent(page_(false));
  await enHaut();
  expect(await mesurerRecouvrement(page.locator("#message"))).not.toBeNull();
  await expect(page.locator("#message")).not.toBeInViewport();

  await page.setContent(page_(true));
  await enHaut();
  expect(await mesurerRecouvrement(page.locator("#message"))).toBeNull();
  await expect(page.locator("#message")).toBeInViewport({ ratio: 1 });
  expect(await mesurerBarresAction(page)).toEqual([]);
});

test("mesurerToastCouvrant attrape un toast sur un titre, une croix ou la navigation, et rien quand il est écarté", async ({
  page,
}) => {
  const page_ = (toast: string): string => `
    <nav aria-label="Navigation principale" style="position:fixed;left:0;top:0;width:600px;height:40px;font:16px sans-serif">
      <a href="#" style="display:inline-block;width:100px">Accueil</a><a href="#" style="display:inline-block;width:100px">Budgets</a>
    </nav>
    <div data-slot="dialog-content" aria-label="Dialogue synthétique" style="position:fixed;left:400px;top:100px;width:300px;height:200px;background:white;font:16px sans-serif">
      <h2 data-slot="dialog-title" style="margin:0;height:30px">Titre</h2>
      <button data-slot="dialog-close" style="position:absolute;top:8px;right:8px;width:28px;height:28px">X</button>
    </div>
    <ol><li data-sonner-toast style="position:fixed;${toast};width:200px;height:50px;background:white;font:16px sans-serif">Règle créée.</li></ol>`;

  await page.setContent(page_("left:420px;top:100px"));
  expect((await mesurerToastCouvrant(page)).some((p) => p.includes("titre"))).toBe(true);

  await page.setContent(page_("left:520px;top:104px"));
  expect((await mesurerToastCouvrant(page)).some((p) => p.includes("croix"))).toBe(true);

  await page.setContent(page_("left:20px;top:0px"));
  expect((await mesurerToastCouvrant(page)).some((p) => p.includes("navigation"))).toBe(true);

  await page.setContent(page_("left:20px;bottom:10px"));
  expect(await mesurerToastCouvrant(page)).toEqual([]);

  await page.setContent(page_("display:none"));
  await expect(mesurerToastCouvrant(page)).rejects.toThrow("aucun toast");
});

test("verifierBordsHautsEgaux attrape un décalage de 5 px et accepte 1 px", async ({ page }) => {
  await page.setContent(`
    <div style="position:relative;height:100px">
      <div id="a" style="position:absolute;left:0;top:10px;width:50px;height:20px"></div>
      <div id="b" style="position:absolute;left:100px;top:15px;width:50px;height:20px"></div>
      <div id="c" style="position:absolute;left:200px;top:11px;width:50px;height:20px"></div>
    </div>`);
  await expect(verifierBordsHautsEgaux(page.locator("#a"), page.locator("#b"), "synthétique")).rejects.toThrow();
  await verifierBordsHautsEgaux(page.locator("#a"), page.locator("#c"), "synthétique");
});
