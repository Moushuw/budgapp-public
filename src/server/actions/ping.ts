"use server";

import { z } from "zod";
import { defineAction } from "./define-action";

const schemaPing = z.object({
  message: z.string().min(1).max(200),
});

export const ping = defineAction(schemaPing, ({ message }) => {
  return Promise.resolve({ ok: true, data: { echo: message, recuLe: new Date().toISOString() } });
});
