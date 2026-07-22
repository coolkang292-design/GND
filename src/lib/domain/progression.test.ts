import { describe, expect, it } from "vitest";
import {
  LEVEL_DEFS,
  STAGE_DESCRIPTIONS,
  getLevelFromTotalXp,
  getLevelProgress,
  getStageGroups,
} from "./progression";

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

describe("getStageGroups — 성장 허브 7단계", () => {
  it("7칸, 각 5레벨 구간", () => {
    const groups = getStageGroups();
    expect(groups).toHaveLength(7);
    expect(groups[0]).toMatchObject({
      stageIndex: 1,
      stageName: "개노답",
      startLevel: 1,
      endLevel: 5,
      requiredTotalXp: 0,
      characterPath: "/characters/char-1.png",
    });
    expect(groups[6]).toMatchObject({
      stageIndex: 7,
      stageName: "전설이개",
      startLevel: 31,
      endLevel: 35,
      requiredTotalXp: 21000,
      characterPath: "/characters/char-7.png",
    });
  });

  it("구간이 끊김 없이 이어지고 해금 XP는 오름차순", () => {
    const groups = getStageGroups();
    groups.forEach((g, i) => {
      if (i === 0) return;
      expect(g.startLevel).toBe(groups[i - 1].endLevel + 1);
      expect(g.requiredTotalXp).toBeGreaterThan(groups[i - 1].requiredTotalXp);
    });
    expect(groups.flatMap((g) => g.endLevel - g.startLevel + 1)).toHaveLength(7);
    expect(groups[6].endLevel).toBe(LEVEL_DEFS.length);
  });

  it("단계 해금 XP는 그 단계 첫 레벨 컷과 같다", () => {
    for (const g of getStageGroups()) {
      expect(getLevelFromTotalXp(g.requiredTotalXp).level).toBe(g.startLevel);
      expect(getLevelFromTotalXp(g.requiredTotalXp).stageIndex).toBe(g.stageIndex);
    }
  });

  it("STAGE_DESCRIPTIONS 이름이 LEVEL_DEFS 단계명과 일치", () => {
    for (const g of getStageGroups()) {
      expect(STAGE_DESCRIPTIONS[g.stageIndex].name).toBe(g.stageName);
      expect(STAGE_DESCRIPTIONS[g.stageIndex].desc.length).toBeGreaterThan(0);
    }
  });
});
