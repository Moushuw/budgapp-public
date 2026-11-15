import { z } from "zod";
import { estMois, type Periode } from "@/domain/periode";

export const schemaPeriode: z.ZodType<Periode, z.ZodTypeDef, unknown> = z.object({
  type: z.enum(["MOIS", "ANNEE", "TOUT"]),
  mois: z.string().refine(estMois, "Mois invalide (AAAA-MM attendu)."),
});
