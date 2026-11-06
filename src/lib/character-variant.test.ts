import { describe, expect, it } from "vitest";
import { characterSrc, normalizeCharacterVariant } from "./character-variant";
import { defaultCharacterSrc } from "@/components/character-image";

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

  it("단계 범위(1~7) 밖이면 여성 경로로 바꾸지 않는다 — 없는 이미지를 부르지 않는다", () => {
    expect(characterSrc("/characters/char-0.png", "female")).toBe("/characters/char-0.png");
    expect(characterSrc("/characters/char-8.png", "female")).toBe("/characters/char-8.png");
    expect(characterSrc("/characters/char-7.png", "female")).toBe("/characters/female/char-7.png");
  });

  it("로딩 실패 폴백 경로는 기본(남성) 경로다", () => {
    expect(defaultCharacterSrc("/characters/female/char-4.png")).toBe("/characters/char-4.png");
    expect(defaultCharacterSrc("/characters/char-4.png")).toBe("/characters/char-4.png");
  });
});
