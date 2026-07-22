import { describe, expect, it } from "vitest";
import { LEVEL_DEFS, getLevelFromTotalXp, getLevelProgress } from "./progression";

describe("LEVEL_DEFS", () => {
  it("35개, 오름차순 컷", () => {
    expect(LEVEL_DEFS).toHaveLength(35);
    expect(LEVEL_DEFS[0]).toMatchObject({ level: 1, requiredTotalXp: 0, stageName: "개노답" });
    expect(LEVEL_DEFS[34]).toMatchObject({ level: 35, requiredTotalXp: 26000, stageName: "전설이개" });
  });
});

describe("getLevelFromTotalXp", () => {
  it.each([
    [0, 1, "개노답"], [199, 1, "개노답"], [200, 2, "개노답"],
    [800, 5, "개노답"], [1000, 6, "눈떴개"], [2999, 10, "눈떴개"],
    [3000, 11, "일단하개"], [6000, 16, "물고가개"], [10000, 21, "미쳐보개"],
    [15000, 26, "판을짜개"], [21000, 31, "전설이개"], [26000, 35, "전설이개"],
    [99999, 35, "전설이개"],
  ])("%i XP → Lv.%i %s", (xp, level, stage) => {
    const d = getLevelFromTotalXp(xp);
    expect(d.level).toBe(level);
    expect(d.stageName).toBe(stage);
  });
  it("음수/NaN 예외", () => {
    expect(() => getLevelFromTotalXp(-1)).toThrow();
    expect(() => getLevelFromTotalXp(NaN)).toThrow();
  });
});

describe("getLevelProgress — 구간 기준", () => {
  it("Lv.4 구간(600~800) 740 XP → 70%", () => {
    const p = getLevelProgress(740);
    expect(p.currentLevel).toBe(4);
    expect(p.xpIntoLevel).toBe(140);
    expect(p.xpForLevel).toBe(200);
    expect(Math.round(p.percent)).toBe(70);
    expect(p.xpToNextLevel).toBe(60);
  });
  it("Lv.35는 100%·다음 없음", () => {
    const p = getLevelProgress(30000);
    expect(p.currentLevel).toBe(35);
    expect(p.percent).toBe(100);
    expect(p.nextLevelRequiredXp).toBeNull();
    expect(p.xpToNextLevel).toBe(0);
  });
});
