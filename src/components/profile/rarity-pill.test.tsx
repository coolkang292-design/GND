import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RarityPill } from "./rarity-pill";

describe("RarityPill", () => {
  it("희귀도 라벨을 대문자로 보여준다", () => {
    expect(renderToStaticMarkup(<RarityPill rarity="epic" />)).toContain("EPIC");
    expect(renderToStaticMarkup(<RarityPill rarity="mythic" />)).toContain("MYTHIC");
  });
});
