import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 배지 키는 seed(지급·표시의 단일 원천)와 이미지 파일명이 반드시 같아야 한다.
 * 어긋나면 배지를 따도 화면엔 깨진 이미지가 뜬다 — 조용히 틀리는 버그다.
 *
 * 예전에는 TS 상수(BADGE_CATALOG)와 SQL의 키를 맞췄으나, 카탈로그가 DB로
 * 옮겨가면서 그 짝이 사라졌다. 이제 어긋날 수 있는 곳은 seed ↔ 이미지다.
 */
const SEED_PATH = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "0031_badge_point_schema.sql",
);
const BADGE_DIR = path.join(process.cwd(), "public", "badges");

/** seed VALUES의 첫 컬럼(badge_key)만 뽑는다 */
function seedKeys(sql: string): string[] {
  const body = sql.slice(sql.indexOf("insert into public.badge_definitions"));
  return [...body.matchAll(/^\s*\('([a-z0-9_]+)','/gm)].map((m) => m[1]);
}

describe("배지 키 ↔ 이미지 일치", () => {
  const keys = seedKeys(readFileSync(SEED_PATH, "utf8"));
  const files = readdirSync(BADGE_DIR)
    .filter((f) => f.endsWith(".png"))
    .map((f) => f.replace(/\.png$/, ""));

  it("seed에서 배지 키 30개를 찾아낸다", () => {
    // 정규식이 헛도는 채로 통과하지 않도록 개수를 먼저 고정한다
    expect(keys).toHaveLength(30);
  });

  it("모든 배지 키에 이미지가 있다", () => {
    expect(keys.filter((k) => !files.includes(k))).toEqual([]);
  });

  it("쓰이지 않는 이미지가 없다", () => {
    expect(files.filter((f) => !keys.includes(f))).toEqual([]);
  });
});
