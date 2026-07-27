import { describe, expect, it } from "vitest";
import {
  badgeShelf,
  earnedBadgeCount,
  groupByMetric,
  type BadgeMeta,
  type EarnedBadge,
} from "./badges";

const CATALOG: BadgeMeta[] = [
  { key: "workout_1", emoji: "🐣", name: "첫 발", description: "d1", tier: "bronze",
    metricKey: "workout_count", threshold: 1, pointReward: 300, repeatable: false,
    repeatStep: null, sortOrder: 101 },
  { key: "workout_10", emoji: "🦴", name: "열 번", description: "d2", tier: "bronze",
    metricKey: "workout_count", threshold: 10, pointReward: 300, repeatable: false,
    repeatStep: null, sortOrder: 102 },
  { key: "streak_5", emoji: "🔥", name: "불꽃 5일", description: "d3", tier: "bronze",
    metricKey: "streak_days", threshold: 5, pointReward: 500, repeatable: true,
    repeatStep: 5, sortOrder: 301 },
];

function earned(key: string, periodKey: string, day: string): EarnedBadge {
  return { badgeKey: key, periodKey, earnedAt: new Date(day) };
}

describe("badgeShelf", () => {
  it("카탈로그 순서를 지키고 미획득은 earnedAt이 null이다", () => {
    const shelf = badgeShelf(CATALOG, [earned("workout_1", "lifetime", "2026-07-20")]);
    expect(shelf.map((s) => s.key)).toEqual(["workout_1", "workout_10", "streak_5"]);
    expect(shelf[0].earnedAt).not.toBeNull();
    expect(shelf[1].earnedAt).toBeNull();
  });

  it("정렬은 sortOrder를 따른다 — 입력 순서와 무관하다", () => {
    const shuffled = [CATALOG[2], CATALOG[0], CATALOG[1]];
    expect(badgeShelf(shuffled, []).map((s) => s.key)).toEqual([
      "workout_1",
      "workout_10",
      "streak_5",
    ]);
  });

  it("반복 배지는 획득 횟수를 센다", () => {
    const shelf = badgeShelf(CATALOG, [
      earned("streak_5", "2026-07-10", "2026-07-10"),
      earned("streak_5", "2026-07-20", "2026-07-20"),
      earned("streak_5", "2026-07-25", "2026-07-25"),
    ]);
    const streak = shelf.find((s) => s.key === "streak_5")!;
    expect(streak.count).toBe(3);
    // 대표 획득일은 가장 최근 것 — "마지막으로 딴 날"이 자연스럽다
    expect(streak.earnedAt?.toISOString().slice(0, 10)).toBe("2026-07-25");
  });

  it("1회성 배지의 count는 획득 시 1, 미획득 시 0", () => {
    const shelf = badgeShelf(CATALOG, [earned("workout_1", "lifetime", "2026-07-20")]);
    expect(shelf.find((s) => s.key === "workout_1")!.count).toBe(1);
    expect(shelf.find((s) => s.key === "workout_10")!.count).toBe(0);
  });

  it("카탈로그에 없는 배지 키는 무시한다", () => {
    const shelf = badgeShelf(CATALOG, [earned("future_badge", "lifetime", "2026-07-20")]);
    expect(shelf).toHaveLength(CATALOG.length);
    expect(shelf.every((s) => s.earnedAt === null)).toBe(true);
  });
});

describe("earnedBadgeCount", () => {
  it("반복 배지를 여러 번 따도 종류 수로 센다", () => {
    const n = earnedBadgeCount(CATALOG, [
      earned("workout_1", "lifetime", "2026-07-20"),
      earned("streak_5", "2026-07-10", "2026-07-10"),
      earned("streak_5", "2026-07-20", "2026-07-20"),
    ]);
    expect(n).toBe(2);
  });

  it("카탈로그 밖의 키는 세지 않는다", () => {
    expect(earnedBadgeCount(CATALOG, [earned("nope", "lifetime", "2026-07-20")])).toBe(0);
  });

  it("없으면 0", () => {
    expect(earnedBadgeCount(CATALOG, [])).toBe(0);
  });
});

describe("groupByMetric", () => {
  it("지표별로 묶고 카탈로그 순서를 유지한다", () => {
    const groups = groupByMetric(badgeShelf(CATALOG, []));
    expect(groups.map((g) => g.metricKey)).toEqual(["workout_count", "streak_days"]);
    expect(groups[0].items.map((i) => i.key)).toEqual(["workout_1", "workout_10"]);
  });

  it("빈 진열대는 빈 배열", () => {
    expect(groupByMetric([])).toEqual([]);
  });
});
