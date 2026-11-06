import { describe, expect, it } from "vitest";
import { characterSrc, normalizeCharacterVariant } from "./character-variant";

describe("characterSrc", () => {
  it("female이면 female 폴더로 바꾼다", () => {
    expect(characterSrc("/characters/char-3.png", "female")).toBe(
      "/characters/female/char-3.png",
    );
  });
  it("male이면 그대로 둔다", () => {
    expect(characterSrc("/characters/char-3.png", "male")).toBe(
      "/characters/char-3.png",
    );
  });
  it("모르는 경로는 건드리지 않는다", () => {
    expect(characterSrc("/characters/fallback.png", "female")).toBe(
      "/characters/fallback.png",
    );
  });
  it("알 수 없는 값은 male", () => {
    expect(normalizeCharacterVariant(null)).toBe("male");
    expect(normalizeCharacterVariant("x")).toBe("male");
    expect(normalizeCharacterVariant("female")).toBe("female");
  });
});
