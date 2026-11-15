// Parcours e2e ciblés d'une tranche ou d'une correction : au moins un fichier ou un filtre est exigé,
// pour qu'un oubli ne relance pas la suite complète (réservée aux passes et à la fusion).
const cibles = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const filtreTitre = process.argv.slice(2).some((a) => a === "-g" || a.startsWith("--grep"));
if (cibles.length === 0 && !filtreTitre) {
  process.stderr.write(
    "npm run e2e:cible attend au moins un fichier ou un filtre : npm run e2e:cible -- e2e/transactions.e2e.ts\n",
  );
  process.exit(1);
}

await import("./e2e.mts");
