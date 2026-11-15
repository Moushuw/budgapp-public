import { describe, expect, it } from "vitest";
import { positionDesToasts, REQUETE_BUREAU } from "./position-des-toasts";

describe("positionDesToasts", () => {
  it("PT1 — bas à gauche en bureau, haut-centre en dessous", () => {
    expect(positionDesToasts(true)).toBe("bottom-left");
    expect(positionDesToasts(false)).toBe("top-center");
  });

  it("PT2 — la requête de bureau", () => {
    expect(REQUETE_BUREAU).toBe("(min-width: 768px)");
  });
});
