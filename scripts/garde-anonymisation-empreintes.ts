// Empreintes SHA-256 des formes interdites dans les fixtures et les parcours e2e : méthode décrite dans docs/lot-m3.md §10 point 3.
// Aucun nom n'est écrit ici ; une forme retirée de l'historique ne doit pas y revenir.
//
// Copie publique : la liste du dépôt privé n'est pas publiée. Une empreinte SHA-256 non salée d'un nom
// propre se renverse par dictionnaire ; publier la liste reviendrait à publier les noms. Les trois
// entrées ci-dessous sont des formes inventées qui gardent le mécanisme et ses tests en état de marche.

export const EMPREINTES_INTERDITES: readonly string[] = [
  "752c1f42c69d3f37143176cc2898991b9ac52aee6b513c6b01e65d2678337123",
  "7909bcc4614e1ea0e487f13852bf33e42766f677473869a232139d97f94d5d4b",
  "dfbe2f7d9243fe23caed631d415eb30d72203325d9713b59b8b8616c66f1390b",
];
