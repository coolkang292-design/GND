// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { COMPLETION_HERO_IMAGES } from "@/lib/domain/workout-complete-message";
import {
  COMPLETION_HERO_LAST_KEY,
  pickNextCompletionHero,
} from "./completion-hero-pick";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("pickNextCompletionHero", () => {
  it("뽑은 번호를 기억해 두고, 다음번엔 같은 사진을 연달아 주지 않는다", () => {
    const first = pickNextCompletionHero(() => 0);
    expect(window.localStorage.getItem(COMPLETION_HERO_LAST_KEY)).toBe(String(first));
    // 같은 난수를 줘도 직전 번호는 피한다
    const second = pickNextCompletionHero(() => 0);
    expect(second).not.toBe(first);
  });

  it("여러 번 완료하면 여러 사진이 나온다 (무작위)", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) seen.add(pickNextCompletionHero());
    expect(seen.size).toBeGreaterThan(3);
    for (const index of seen) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(COMPLETION_HERO_IMAGES.length);
    }
  });

  it("기억된 값이 깨져 있어도 목록 안에서 고른다", () => {
    window.localStorage.setItem(COMPLETION_HERO_LAST_KEY, "not-a-number");
    const picked = pickNextCompletionHero(() => 0.5);
    expect(picked).toBeGreaterThanOrEqual(0);
    expect(picked).toBeLessThan(COMPLETION_HERO_IMAGES.length);
  });

  it("저장소가 막혀 있어도 죽지 않고 번호를 준다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const picked = pickNextCompletionHero(() => 0.3);
    expect(picked).toBeGreaterThanOrEqual(0);
    expect(picked).toBeLessThan(COMPLETION_HERO_IMAGES.length);
  });
});
