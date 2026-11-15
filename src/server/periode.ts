// La période persistante, lue côté serveur — docs/lot-m2.md §5.5. Sans
// directive "use server" : un fichier de ce type n'exporte que des fonctions
// asynchrones, et ces constantes servent aussi à l'action qui écrit le cookie.

import { cookies } from "next/headers";
import { dateCivileDansFuseau, FUSEAU_APPLICATION, type DateCivile } from "@/domain/dates";
import { lirePeriode, type Periode } from "@/domain/periode";

export const NOM_COOKIE_PERIODE = "budgapp-periode";

// Pas de `secure` : le serveur e2e (http://127.0.0.1:3100) et l'hébergement
// local servent en http.
export const OPTIONS_COOKIE_PERIODE = {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 365,
} as const;

export function aujourdhui(): DateCivile {
  return dateCivileDansFuseau(new Date(), FUSEAU_APPLICATION);
}

export async function periodeCourante(): Promise<Periode> {
  return lirePeriode((await cookies()).get(NOM_COOKIE_PERIODE)?.value, aujourdhui());
}
