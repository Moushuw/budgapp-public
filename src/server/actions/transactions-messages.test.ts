import { describe, expect, it } from "vitest";
import type { ObjetCourse } from "@/server/repositories/course-virement";
import { MESSAGE_VIREMENT_COURSE, messageCourse, type PorteeCourse } from "./transactions-messages";

const ATTENDUS: Record<ObjetCourse, Record<PorteeCourse, string>> = {
  LIGNE: {
    UNITAIRE:
      "Cette transaction vient d'être liée, modifiée ou supprimée par ailleurs (deux onglets ouverts ?). Rien n'a été modifié.",
    MASSE:
      "Une transaction de la sélection vient d'être liée, modifiée ou supprimée par ailleurs (deux onglets ouverts ?). Rien n'a été modifié.",
  },
  AUTRE_COTE: {
    UNITAIRE:
      "L'autre côté vient d'être lié, modifié ou supprimé par ailleurs (deux onglets ouverts ?). Rien n'a été modifié.",
    MASSE:
      "L'autre côté d'un virement de la sélection vient d'être lié, modifié ou supprimé par ailleurs (deux onglets ouverts ?). Rien n'a été modifié.",
  },
  LIGNE_OU_AUTRE_COTE: {
    UNITAIRE:
      "Cette transaction ou l'autre côté de son virement a changé entre-temps (deux onglets ouverts ?). Rien n'a été modifié.",
    MASSE:
      "Une transaction de la sélection, ou l'autre côté d'un de ses virements, a changé entre-temps (deux onglets ouverts ?). Rien n'a été modifié.",
  },
};

const OBJETS: readonly ObjetCourse[] = ["LIGNE", "AUTRE_COTE", "LIGNE_OU_AUTRE_COTE"];
const PORTEES: readonly PorteeCourse[] = ["UNITAIRE", "MASSE"];
const TOUS = OBJETS.flatMap((objet) => PORTEES.map((portee) => messageCourse(objet, portee)));

describe("messageCourse", () => {
  it("MC1 — AUTRE_COTE unitaire est le message historique", () => {
    expect(messageCourse("AUTRE_COTE", "UNITAIRE")).toBe(MESSAGE_VIREMENT_COURSE);
    expect(MESSAGE_VIREMENT_COURSE).toBe(ATTENDUS.AUTRE_COTE.UNITAIRE);
  });
  it.each(OBJETS.flatMap((objet) => PORTEES.map((portee) => [objet, portee] as const)))(
    "MC2 — %s, %s : texte exact",
    (objet, portee) => {
      expect(messageCourse(objet, portee)).toBe(ATTENDUS[objet][portee]);
    },
  );
  it("MC3 — quand la ligne a bougé, on ne parle pas de l'autre côté", () => {
    expect(messageCourse("LIGNE", "UNITAIRE")).not.toContain("autre côté");
    expect(messageCourse("LIGNE", "MASSE")).not.toContain("autre côté");
  });
  it("MC4 — six messages distincts, qui finissent par la même phrase", () => {
    expect(new Set(TOUS).size).toBe(6);
    for (const message of TOUS) {
      expect(message.endsWith("Rien n'a été modifié.")).toBe(true);
    }
  });
});
