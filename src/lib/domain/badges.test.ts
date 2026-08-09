import { describe, expect, it } from "vitest";
import {
  badgeShelf,
  compareBadgeShowcase,
  earnedBadgeCount,
  groupByMetric,
  RARITY_RANK,
  TIER_RANK,
  type BadgeMeta,
  type EarnedBadge,
} from "./badges";

const CATALOG: BadgeMeta[] = [
  { key: "workout_1", emoji: "🐣", name: "첫 발", description: "d1", tier: "bronze",
    rarity: "common", metricKey: "workout_count", threshold: 1, pointReward: 300, repeatable: false,
    repeatStep: null, sortOrder: 101 },
  { key: "workout_10", emoji: "🦴", name: "열 번", description: "d2", tier: "bronze",
    rarity: "common", metricKey: "workout_count", threshold: 10, pointReward: 300, repeatable: false,
    repeatStep: null, sortOrder: 102 },
  { key: "streak_5", emoji: "🔥", name: "불꽃 5일", description: "d3", tier: "bronze",
    rarity: "common", metricKey: "streak_days", threshold: 5, pointReward: 500, repeatable: true,
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

/**
 * 자랑할 순서 (2026-08-09 사용자 지시 "홈의 친구 항목에서 배지 퀄리티 좋은거
 * 먼저 보여주기").
 *
 * 홈 친구 행은 배지를 3장만 그린다. 예전에는 최신순으로 잘라서, 방금 딴
 * `first_workout` 같은 흔한 배지가 오래전에 딴 `legend`를 밀어냈다.
 */
describe("compareBadgeShowcase — 희귀도 → 티어 → 최신", () => {
  const old = new Date("2026-01-01T00:00:00Z");
  const recent = new Date("2026-08-09T00:00:00Z");

  const sortKeys = <T extends { key: string }>(
    items: (T & { rarity: BadgeMeta["rarity"]; tier: BadgeMeta["tier"]; earnedAt: Date })[],
  ) => [...items].sort(compareBadgeShowcase).map((i) => i.key);

  it("희귀도가 최신보다 우선한다 — 오래된 legend가 오늘 딴 common을 이긴다", () => {
    expect(
      sortKeys([
        { key: "흔한오늘", rarity: "common", tier: "legend", earnedAt: recent },
        { key: "희귀한옛날", rarity: "legend", tier: "bronze", earnedAt: old },
      ]),
    ).toEqual(["희귀한옛날", "흔한오늘"]);
  });

  it("희귀도가 같으면 티어로 가른다", () => {
    expect(
      sortKeys([
        { key: "은", rarity: "rare", tier: "silver", earnedAt: recent },
        { key: "금", rarity: "rare", tier: "gold", earnedAt: old },
      ]),
    ).toEqual(["금", "은"]);
  });

  it("등급이 완전히 같으면 최신이 앞", () => {
    expect(
      sortKeys([
        { key: "옛날", rarity: "rare", tier: "gold", earnedAt: old },
        { key: "최근", rarity: "rare", tier: "gold", earnedAt: recent },
      ]),
    ).toEqual(["최근", "옛날"]);
  });

  it("mythic이 가장 높고 common이 가장 낮다", () => {
    expect(
      sortKeys([
        { key: "common", rarity: "common", tier: "gold", earnedAt: recent },
        { key: "mythic", rarity: "mythic", tier: "bronze", earnedAt: old },
        { key: "epic", rarity: "epic", tier: "bronze", earnedAt: old },
        { key: "legend", rarity: "legend", tier: "bronze", earnedAt: old },
        { key: "rare", rarity: "rare", tier: "bronze", earnedAt: old },
      ]),
    ).toEqual(["mythic", "legend", "epic", "rare", "common"]);
  });

  /**
   * ⚠️ 3단이라 **완전 순서**여야 한다. 앞 둘만 쓰면 동급끼리 순서가 안 정해져
   * 재조회마다 다른 3장이 뜬다 — 화면이 이유 없이 덜컹거린다.
   */
  it("같은 입력은 언제나 같은 순서를 낸다", () => {
    const items = [
      { key: "a", rarity: "rare" as const, tier: "gold" as const, earnedAt: old },
      { key: "b", rarity: "rare" as const, tier: "gold" as const, earnedAt: recent },
      { key: "c", rarity: "epic" as const, tier: "bronze" as const, earnedAt: old },
    ];

    expect(sortKeys(items)).toEqual(sortKeys([...items].reverse()));
  });

  it("서열표가 타입의 값을 빠짐없이 덮는다", () => {
    // Record<...>라 빠뜨리면 타입 검사에서 걸리지만, 개수도 못 박아 둔다.
    expect(Object.keys(RARITY_RANK)).toHaveLength(5);
    expect(Object.keys(TIER_RANK)).toHaveLength(4);
  });
});
