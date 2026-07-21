import { describe, expect, it } from "vitest";

import { BADGE_CATALOG, badgeShelf, earnedBadgeCount } from "./badges";

describe("badgeShelf", () => {
  it("카탈로그 순서를 그대로 유지한다", () => {
    expect(badgeShelf([]).map((b) => b.key)).toEqual(
      BADGE_CATALOG.map((b) => b.key),
    );
  });

  it("획득하지 않은 배지는 earnedAt이 null이다", () => {
    expect(badgeShelf([]).every((b) => b.earnedAt === null)).toBe(true);
  });

  it("획득한 배지에 획득 일시를 채운다", () => {
    const earnedAt = new Date("2026-07-21T10:00:00Z");
    const shelf = badgeShelf([{ badgeKey: "record_beaten_1", earnedAt }]);
    const first = shelf.find((b) => b.key === "record_beaten_1");
    expect(first?.earnedAt).toEqual(earnedAt);
    expect(shelf.find((b) => b.key === "record_beaten_5")?.earnedAt).toBeNull();
  });

  it("카탈로그에 없는 배지 키가 와도 깨지지 않는다", () => {
    const shelf = badgeShelf([
      { badgeKey: "unknown_badge", earnedAt: new Date("2026-07-21T10:00:00Z") },
    ]);
    expect(shelf).toHaveLength(BADGE_CATALOG.length);
    expect(shelf.every((b) => b.earnedAt === null)).toBe(true);
  });

  it("모든 배지에 이모지와 이름이 있다", () => {
    expect(
      badgeShelf([]).every((b) => b.emoji.length > 0 && b.name.length > 0),
    ).toBe(true);
  });
});

describe("earnedBadgeCount", () => {
  it("카탈로그에 있는 배지만 센다", () => {
    const earnedAt = new Date("2026-07-21T10:00:00Z");
    expect(
      earnedBadgeCount([
        { badgeKey: "record_beaten_1", earnedAt },
        { badgeKey: "unknown_badge", earnedAt },
      ]),
    ).toBe(1);
  });

  it("없으면 0", () => {
    expect(earnedBadgeCount([])).toBe(0);
  });
});
