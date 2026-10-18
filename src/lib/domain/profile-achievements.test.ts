import { describe, expect, it } from "vitest";
import { badgeShelf, type BadgeMeta, type EarnedBadge } from "@/lib/domain/badges";
import {
  achievementKstDay, buildAchievementHistory, featuredBadgeCondition, selectFeaturedBadges,
} from "./profile-achievements";

const base: BadgeMeta = {
  key: "workout_1", emoji: "", name: "첫 운동", description: "",
  tier: "bronze", rarity: "common", metricKey: "workout_count",
  threshold: 1, pointReward: 0, repeatable: false, repeatStep: null, sortOrder: 1,
};
const catalog: BadgeMeta[] = [
  base,
  { ...base, key: "workout_10", name: "10회", threshold: 10, tier: "silver" },
  { ...base, key: "workout_50", name: "50회", threshold: 50, tier: "gold" },
  { ...base, key: "streak_5", name: "5일", metricKey: "streak_days", threshold: 5 },
];
const earned: EarnedBadge[] = [
  { badgeKey: "workout_1", periodKey: "lifetime", earnedAt: new Date("2026-09-01T01:00:00Z") },
  { badgeKey: "workout_10", periodKey: "lifetime", earnedAt: new Date("2026-09-02T01:00:00Z") },
  { badgeKey: "streak_5", periodKey: "2026-09-10", earnedAt: new Date("2026-09-10T01:00:00Z") },
  { badgeKey: "streak_5", periodKey: "2026-09-15", earnedAt: new Date("2026-09-15T01:00:00Z") },
];

describe("대표 배지", () => {
  it("최신 획득이 아니라 카테고리별 최고 임계값을 선택하고 빈 칸도 유지한다", () => {
    const six = selectFeaturedBadges(badgeShelf(catalog, earned));
    expect(six).toHaveLength(6);
    expect(six[0].badge?.key).toBe("workout_10");
    expect(six[1].badge).toBeNull();
    expect(six[2].badge?.key).toBe("streak_5");
    expect(six[3].badge).toBeNull();
  });
  it("미획득 고등급을 표시하지 않는다", () => {
    expect(selectFeaturedBadges(badgeShelf(catalog, earned))[0].badge?.key).not.toBe("workout_50");
  });
  it("반복 배지 정보와 정확한 분 단위를 유지한다", () => {
    expect(selectFeaturedBadges(badgeShelf(catalog, earned))[2].badge?.count).toBe(2);
    const duration = { ...badgeShelf(catalog, earned)[0], metricKey: "total_minutes" as const, threshold: 500 };
    expect(featuredBadgeCondition(duration)).toBe("누적 8시간 20분 운동");
  });
});

describe("통합 성취 이력", () => {
  const entries = buildAchievementHistory({
    joinedAt: new Date("2026-07-19T15:10:00Z"),
    levelUps: [{ level: 9, at: new Date("2026-10-06T01:10:00Z") },
      { level: 8, at: new Date("2026-10-02T03:00:00Z") }],
    badges: earned, catalog,
  });
  it("레벨업·반복 배지·가입 기록을 중복 삭제 없이 최신순으로 병합한다", () => {
    expect(entries[0].title).toBe("Lv.9 달성");
    expect(entries.filter((e) => e.id.startsWith("badge-streak_5-"))).toHaveLength(2);
    expect(entries[entries.length - 1].type).toBe("joined");
    expect(entries).toHaveLength(7);
  });
  it("임의의 레벨업 날짜나 미획득 배지를 만들지 않는다", () => {
    expect(entries.some((e) => e.title === "50회")).toBe(false);
    expect(entries.some((e) => e.title === "Lv.7 달성")).toBe(false);
  });
  it("한국시간 날짜 기준이 UTC 자정과 달라도 맞다", () => {
    expect(achievementKstDay(new Date("2026-10-18T16:30:00Z"))).toBe("2026-10-19");
  });
  it("기록이 없으면 빈 배열이다", () => {
    expect(buildAchievementHistory({ joinedAt: null, levelUps: [], badges: [], catalog: [] })).toEqual([]);
  });
});
