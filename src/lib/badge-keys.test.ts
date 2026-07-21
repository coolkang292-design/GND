import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { BADGE_CATALOG } from "@/lib/domain/badges";

/**
 * 배지 키는 TS 카탈로그(표시)와 SQL(지급)이 반드시 같아야 한다. 어긋나면
 * 배지가 지급돼도 화면엔 영원히 미획득으로 보이는, 조용히 틀리는 버그가 된다.
 * 임계값은 SQL이 단일 원천이므로 여기서 검사하지 않는다 — 키만 맞춘다.
 */
const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "0020_badges.sql",
);

/** mark_record_beaten의 지급 VALUES 목록에서 ('키', 임계값) 쌍의 키만 뽑는다 */
function badgeKeysInMigration(sql: string): string[] {
  return [...sql.matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*\d+\s*\)/g)].map(
    (match) => match[1],
  );
}

describe("배지 키 TS↔SQL 일치", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("마이그레이션에서 지급 키를 찾아낸다", () => {
    // 정규식이 헛도는 채로 통과하지 않도록 먼저 고정한다.
    expect(badgeKeysInMigration(sql).length).toBeGreaterThan(0);
  });

  it("SQL이 지급하는 키와 카탈로그 키가 같다", () => {
    expect([...badgeKeysInMigration(sql)].sort()).toEqual(
      BADGE_CATALOG.map((badge) => badge.key).sort(),
    );
  });
});
