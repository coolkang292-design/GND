import { describe, expect, it } from "vitest";
import {
  LEVEL_DEFS,
  getLevelFromTotalXp,
  getLevelProgress,
  getStageLevelProgress,
  getStageXpWidth,
  resolveLevelProgress,
} from "./progression";

const firstCut = (stage: number) => LEVEL_DEFS.find((d) => d.stageIndex === stage)!.requiredTotalXp;

describe("단계별 경험치 방식 — 단계 양", () => {
  it("단계 양 = 그 단계 첫 레벨 컷과 다음 단계 첫 레벨 컷의 차 (1000·2000·3000·4000·5000·6000, 7단계 5000)", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(getStageXpWidth)).toEqual([1000, 2000, 3000, 4000, 5000, 6000, 5000]);
  });
  it("없는 단계는 던진다", () => {
    expect(() => getStageXpWidth(0)).toThrow(RangeError);
    expect(() => getStageXpWidth(8)).toThrow(RangeError);
  });
});

describe("단계별 경험치 방식 — 레벨은 단계 안 경험치로 정한다", () => {
  it("3단계(양 3000, 한 레벨 600): 0→Lv.11, 600→12, 1800→14, 2400→15, 2999→15(아직 안 멈춤)", () => {
    const lv = (x: number) => getStageLevelProgress(3, x).currentLevel;
    expect([0, 599, 600, 1200, 1800, 2400, 2999].map(lv)).toEqual([11, 11, 12, 13, 14, 15, 15]);
    expect(getStageLevelProgress(3, 2999).capped).toBe(false);
  });

  it("단계 양을 채우면 단계 마지막 레벨에서 멈춘다(capped) — 더 쌓아도 다음 단계 레벨로 안 간다", () => {
    for (const xp of [3000, 3001, 9999]) {
      const p = getStageLevelProgress(3, xp);
      expect(p).toMatchObject({ currentLevel: 15, currentStageIndex: 3, capped: true, percent: 100, xpToNextLevel: 0 });
    }
  });

  it("막혀서 넘친 경험치가 레벨을 올리지 않는다: 옛 누적 방식이면 Lv.17이 될 값도 Lv.15", () => {
    const overflowed = firstCut(3) + 3900; // 누적 6900 = 옛 방식으로는 4단계 Lv.17 구간
    expect(getLevelFromTotalXp(overflowed).level).toBe(17); // 옛 방식(기준 확인용)
    expect(getStageLevelProgress(3, 3900).currentLevel).toBe(15); // 새 방식
  });

  it("전환 전후가 같아야 하는 구간: 단계 안 경험치가 양보다 작으면 옛 누적 방식과 같은 레벨·진행도", () => {
    for (const stage of [1, 2, 3, 4, 5, 6, 7]) {
      const width = getStageXpWidth(stage);
      const cut = firstCut(stage);
      for (const x of [0, 1, width / 5 - 1, width / 5, width / 2, width - 1]) {
        const legacy = getLevelProgress(cut + x);
        const next = getStageLevelProgress(stage, x);
        expect(next.currentLevel, `stage ${stage} x ${x}`).toBe(legacy.currentLevel);
        expect(next.currentStageIndex).toBe(legacy.currentStageIndex);
        expect(next.percent).toBeCloseTo(legacy.percent, 6);
      }
    }
  });

  it("7단계는 멈추지 않고 35레벨이 최고 레벨(다음 단계가 없다)", () => {
    expect(getStageLevelProgress(7, 4999).currentLevel).toBe(34);
    const top = getStageLevelProgress(7, 5000);
    expect(top).toMatchObject({ currentLevel: 35, nextLevelRequiredXp: null, capped: false });
    expect(getStageLevelProgress(7, 99999).currentLevel).toBe(35);
  });

  it("취소(음수)로 단계 경험치가 0 아래가 돼도 단계 첫 레벨 아래로 내려가지 않는다", () => {
    expect(getStageLevelProgress(4, -300)).toMatchObject({ currentLevel: 16, xpIntoLevel: 0, percent: 0 });
  });

  it("유한하지 않은 값은 던진다", () => {
    expect(() => getStageLevelProgress(3, Number.NaN)).toThrow();
  });
});

describe("레벨 표시 진입점 resolveLevelProgress", () => {
  it("서버 stage_xp가 null/없으면 지금과 똑같이 누적 경험치로 계산 — 전환 전에는 화면이 안 달라진다", () => {
    for (const total of [0, 3180, 4460, 10170, 26000]) {
      expect(resolveLevelProgress({ totalXp: total, stage: 3, stageXp: null })).toEqual(getLevelProgress(total));
      expect(resolveLevelProgress({ totalXp: total, stage: 3, stageXp: undefined })).toEqual(getLevelProgress(total));
    }
  });
  it("stage_xp가 있으면 서버가 인정한 단계 + 단계 경험치로 계산한다 (누적은 무시)", () => {
    const p = resolveLevelProgress({ totalXp: 99999, stage: 3, stageXp: 1250 });
    expect(p).toMatchObject({ currentLevel: 13, currentStageIndex: 3 });
  });
  it("단계가 이상하면(0·8·null) 새 방식으로 추측하지 않고 옛 방식으로 돌아간다", () => {
    for (const stage of [0, 8, null, undefined, 2.5]) {
      expect(resolveLevelProgress({ totalXp: 4460, stage: stage as number, stageXp: 100 })).toEqual(getLevelProgress(4460));
    }
  });
});
