import { VARIABLE_CAPTURES, VARIABLE_FILTRE_CAPTURES } from "../e2e/outils/captures-noms.ts";

// Les agents du pilote ne peuvent pas préfixer une commande par une variable d'environnement :
// le mode passe doit pouvoir se lancer par un simple `npm run e2e:passe`.
process.env[VARIABLE_CAPTURES] = "1";

// `--ecrans=import,transactions` limite les captures aux écrans du lot ; les contrôles tournent partout.
const PREFIXE_ECRANS = "--ecrans=";
const ecrans = process.argv.filter((a) => a.startsWith(PREFIXE_ECRANS));
if (ecrans.length > 0) {
  process.env[VARIABLE_FILTRE_CAPTURES] = ecrans.map((a) => a.slice(PREFIXE_ECRANS.length)).join(",");
  process.argv = process.argv.filter((a) => !a.startsWith(PREFIXE_ECRANS));
}

await import("./e2e.mts");
