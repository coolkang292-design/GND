import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("GrowthHub avatar shop entry", () => {
  it("포인트 요약 바로 뒤에 상점 진입 카드가 정확히 한 번 온다", () => {
    const source = readFileSync(
      new URL("./growth-hub.tsx", import.meta.url),
      "utf8",
    );
    expect(source.match(/<AvatarShopEntry\s*\/>/g)).toHaveLength(1);
    expect(source).toMatch(
      /<PointSummary balance=\{balance\} streakDays=\{streakDays\} \/>\s*\{[^}]*isAvatarMockEnabled[^}]*&&\s*<AvatarShopEntry \/>\}/,
    );
  });
});
