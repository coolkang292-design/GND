import { describe, expect, it } from "vitest";
import {
  buildAchievements,
  categoryCompletion,
  overallCompletion,
  RARITY_META,
  selectNextGoal,
  toDisplayUnit,
  toRemainingDisplay,
} from "./achievements";
import type { BadgeMeta, EarnedBadge } from "./badges";

function meta(over: Partial<BadgeMeta> = {}): BadgeMeta {
  return {
    key: "workout_10", emoji: "🦴", name: "열 번 찍었개",
    description: "운동 10회 달성", tier: "bronze", rarity: "common",
    metricKey: "workout_count", threshold: 10, pointReward: 300,
    repeatable: false, repeatStep: null, sortOrder: 102, ...over,
  };
}

describe("RARITY_META", () => {
  it("5단계 모두 라벨·순서를 갖는다", () => {
    expect(RARITY_META.common.label).toBe("COMMON");
    expect(RARITY_META.mythic.label).toBe("MYTHIC");
    expect(RARITY_META.epic.order).toBeGreaterThan(RARITY_META.rare.order);
  });
});

describe("toDisplayUnit", () => {
  it("분을 시간으로", () => {
    expect(toDisplayUnit("total_minutes", 2520)).toEqual({ amount: 42, unit: "시간" });
  });
  it("kg을 톤으로(소수1)", () => {
    expect(toDisplayUnit("weight_volume_kg", 18300)).toEqual({ amount: 18.3, unit: "톤" });
  });
  it("m를 km로(소수1)", () => {
    expect(toDisplayUnit("cardio_distance_m", 83000)).toEqual({ amount: 83, unit: "km" });
  });
  it("운동수·기록은 회, 불꽃은 일", () => {
    expect(toDisplayUnit("workout_count", 7)).toEqual({ amount: 7, unit: "회" });
    expect(toDisplayUnit("record_beaten", 3)).toEqual({ amount: 3, unit: "회" });
    expect(toDisplayUnit("streak_days", 4)).toEqual({ amount: 4, unit: "일" });
  });
});

describe("toRemainingDisplay", () => {
  it("남은 값이 0보다 크면 0으로 뭉개지 않는다(올림)", () => {
    expect(toRemainingDisplay("total_minutes", 10)).toEqual({ amount: 1, unit: "시간" });
    expect(toRemainingDisplay("cardio_distance_m", 40)).toEqual({ amount: 0.1, unit: "km" });
    expect(toRemainingDisplay("weight_volume_kg", 40)).toEqual({ amount: 0.1, unit: "톤" });
  });
  it("회·일은 그대로", () => {
    expect(toRemainingDisplay("workout_count", 3)).toEqual({ amount: 3, unit: "회" });
    expect(toRemainingDisplay("streak_days", 4)).toEqual({ amount: 4, unit: "일" });
  });
});

describe("buildAchievements", () => {
  const metrics = {
    workout_count: 7, total_minutes: 0, streak_days: 7,
    weight_volume_kg: 0, cardio_distance_m: 0, record_beaten: 0,
  };

  it("미획득 1회성: 현재/목표/진행/남은/잠김을 채운다", () => {
    const [a] = buildAchievements([meta()], [], metrics);
    expect(a.currentValue).toBe(7);
    expect(a.targetValue).toBe(10);
    expect(a.progress).toBeCloseTo(0.7);
    expect(a.remainingValue).toBe(3);
    expect(a.unlocked).toBe(false);
  });

  it("획득한 1회성: 진행 1·남은 0·unlocked", () => {
    const earned: EarnedBadge[] = [
      { badgeKey: "workout_10", periodKey: "lifetime", earnedAt: new Date("2026-07-20") },
    ];
    const [a] = buildAchievements([meta()], earned, { ...metrics, workout_count: 12 });
    expect(a.unlocked).toBe(true);
    expect(a.progress).toBe(1);
    expect(a.remainingValue).toBe(0);
  });

  it("획득한 1회성은 지표가 내려가도 완료로 고정한다(불꽃 리셋)", () => {
    const earned: EarnedBadge[] = [
      { badgeKey: "streak_best_30", periodKey: "lifetime", earnedAt: new Date("2026-07-01") },
    ];
    // 사슬이 끊겨 현재 불꽃은 3일이지만, 한 번 딴 30일 배지는 완료여야 한다.
    const [a] = buildAchievements(
      [meta({ key: "streak_best_30", metricKey: "streak_days", threshold: 30 })],
      earned,
      { ...metrics, streak_days: 3 },
    );
    expect(a.unlocked).toBe(true);
    expect(a.progress).toBe(1);
    expect(a.remainingValue).toBe(0);
    expect(a.currentValue).toBe(30); // "3 / 30일"이 아니라 "30 / 30일"
  });

  it("반복 배지: 목표는 다음 배수, 남은 수치도 그 기준", () => {
    const [a] = buildAchievements(
      [meta({ key: "streak_5", metricKey: "streak_days", threshold: 5, repeatable: true, repeatStep: 5 })],
      [],
      { ...metrics, streak_days: 7 },
    );
    expect(a.targetValue).toBe(10);
    expect(a.remainingValue).toBe(3);
  });
});

describe("selectNextGoal", () => {
  const base = { workout_count: 0, total_minutes: 0, streak_days: 0, weight_volume_kg: 0, cardio_distance_m: 0, record_beaten: 0 };

  it("미획득 1회성 중 진행률 최고를 뽑는다", () => {
    const cat = [
      meta({ key: "workout_10", threshold: 10 }),
      meta({ key: "workout_30", threshold: 30 }),
    ];
    const goal = selectNextGoal(buildAchievements(cat, [], { ...base, workout_count: 8 }));
    expect(goal?.key).toBe("workout_10"); // 8/10 > 8/30
  });

  it("동률이면 보상이 큰 쪽", () => {
    const cat = [
      meta({ key: "a", threshold: 10, pointReward: 300 }),
      meta({ key: "b", threshold: 10, pointReward: 800 }),
    ];
    const goal = selectNextGoal(buildAchievements(cat, [], { ...base, workout_count: 5 }));
    expect(goal?.key).toBe("b");
  });

  it("반복 배지는 다음 목표로 뽑지 않는다", () => {
    const cat = [meta({ key: "streak_5", metricKey: "streak_days", threshold: 5, repeatable: true, repeatStep: 5 })];
    expect(selectNextGoal(buildAchievements(cat, [], { ...base, streak_days: 3 }))).toBeNull();
  });
});

describe("완료율", () => {
  const base = { total_minutes: 0, streak_days: 0, weight_volume_kg: 0, cardio_distance_m: 0, record_beaten: 0 };
  const cat = [meta({ key: "workout_10", threshold: 10 }), meta({ key: "workout_30", threshold: 30 })];
  const earned = [{ badgeKey: "workout_10", periodKey: "lifetime", earnedAt: new Date() }];

  it("카테고리 완료율", () => {
    const c = categoryCompletion(buildAchievements(cat, earned, { ...base, workout_count: 12 }));
    expect(c[0]).toEqual({ metricKey: "workout_count", done: 1, total: 2, pct: 50 });
  });

  it("전체 완료율", () => {
    const o = overallCompletion(buildAchievements(cat, earned, { ...base, workout_count: 12 }));
    expect(o).toEqual({ done: 1, total: 2, pct: 50 });
  });
});

describe("획득일 (2026-08-14)", () => {
  const metrics = {
    workout_count: 12, total_minutes: 0, streak_days: 10,
    weight_volume_kg: 0, cardio_distance_m: 0, record_beaten: 0,
  };

  /**
   * ⚠️⚠️ `user_badges.earned_at`은 DB에 있고 `badges.ts:37`이 앱까지 실어 오는데,
   * 화면이 한 번도 안 그렸다 — `badge-showcase.tsx`는 **정렬에만** 썼고
   * `badge-sheet.tsx`는 아예 안 썼다. **배지가 수집물인데 수집 기록이 없었다.**
   */
  it("획득한 배지는 earnedAt을 갖는다", () => {
    const [a] = buildAchievements(
      [meta()],
      [
        {
          badgeKey: "workout_10",
          periodKey: "lifetime",
          earnedAt: new Date("2026-07-20T01:00:00Z"),
        },
      ],
      metrics,
    );
    expect(a.earnedAt?.toISOString()).toBe("2026-07-20T01:00:00.000Z");
  });

  it("미획득 배지는 null이다", () => {
    const [a] = buildAchievements([meta()], [], { ...metrics, workout_count: 0 });
    expect(a.earnedAt).toBeNull();
  });

  /**
   * 반복 배지는 같은 key가 여러 행으로 온다(`EarnedBadge` 주석).
   * 화면에 적을 것은 **마지막으로 딴 날**이다 — "언제 땄나"의 답으로
   * 첫 회를 보여주면 최근에 또 딴 사실이 안 보인다.
   */
  it("반복 배지는 마지막으로 딴 날을 쓴다", () => {
    const [a] = buildAchievements(
      [
        meta({
          key: "streak_5",
          metricKey: "streak_days",
          threshold: 5,
          repeatable: true,
          repeatStep: 5,
        }),
      ],
      [
        { badgeKey: "streak_5", periodKey: "2026-07-20", earnedAt: new Date("2026-07-20T01:00:00Z") },
        { badgeKey: "streak_5", periodKey: "2026-07-25", earnedAt: new Date("2026-07-25T01:00:00Z") },
      ],
      metrics,
    );
    expect(a.earnedAt?.toISOString()).toBe("2026-07-25T01:00:00.000Z");
  });
});
