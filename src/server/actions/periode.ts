"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { serialiserPeriode, type Periode } from "@/domain/periode";
import { schemaPeriode } from "@/features/periode/schema";
import { NOM_COOKIE_PERIODE, OPTIONS_COOKIE_PERIODE } from "@/server/periode";
import { defineAction, type ActionResult } from "./define-action";

export const choisirPeriode = defineAction(schemaPeriode, async (periode): Promise<ActionResult<Periode>> => {
  (await cookies()).set(NOM_COOKIE_PERIODE, serialiserPeriode(periode), OPTIONS_COOKIE_PERIODE);
  // Le layout et la page relisent le cookie.
  refresh();
  return { ok: true, data: periode };
});
