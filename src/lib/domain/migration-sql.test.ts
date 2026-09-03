import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 마이그레이션 SQL의 **눈으로 못 잡는 실수**를 잡는다 (2026-09-04).
 *
 * 왜 생겼나. 0102가 `/*`를 열고 `*` + `/`로 닫지 않은 채 사장님께 나갔다.
 * Run하면 `42601: unterminated /* comment`로 죽는데, 700줄짜리 파일이라
 * 눈으로는 안 보였고 **테스트도 빌드도 SQL은 안 읽는다.** 사용자가 Run을
 * 눌러야만 드러나는 자리였다.
 *
 * ⚠️ 이 파일이 SQL을 실행하지는 않는다. 문법 전체를 검사할 방법은 여기 없다 —
 *    "Run해 봐야 아는 것"을 조금이라도 줄이는 그물이다.
 */
const DIR = join(process.cwd(), "supabase/migrations");
const FILES = readdirSync(DIR).filter((name) => name.endsWith(".sql"));

/**
 * 작은따옴표 문자열을 지운 본문.
 *
 * ⚠️ 안 지우면 **cron 식이 오탐된다.** 0075·0076이 `'*``/30 * * * *'`를
 *    담고 있어서 닫는 구분자가 하나 더 있는 것처럼 보인다.
 */
function outsideStrings(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "''");
}

describe("마이그레이션 SQL 정합성", () => {
  it("파일이 하나라도 있다 — 경로가 어긋나면 이 묶음이 조용히 0건이 된다", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it.each(FILES)("%s — 블록 주석이 전부 닫혀 있다", (name) => {
    const body = outsideStrings(readFileSync(join(DIR, name), "utf8"));
    expect(
      body.split("/*").length - 1,
      `${name}: /* 와 */ 개수가 다르다 — Run하면 42601로 죽는다`,
    ).toBe(body.split("*/").length - 1);
  });

  it.each(FILES)("%s — $function$ 구분자가 짝을 이룬다", (name) => {
    const body = outsideStrings(readFileSync(join(DIR, name), "utf8"));
    // 함수 본문을 여는 것과 닫는 것 — 홀수면 본문이 안 끝난 것이다
    expect(
      (body.split("$function$").length - 1) % 2,
      `${name}: $function$ 구분자가 홀수다 — 본문이 안 닫혔다`,
    ).toBe(0);
  });

  it.each(FILES)("%s — begin이 있으면 commit도 있다", (name) => {
    const body = outsideStrings(readFileSync(join(DIR, name), "utf8"));
    /*
      ⚠️ plpgsql 본문 안의 `begin`은 트랜잭션이 아니다. 줄 맨 앞의 `begin;`만
         센다 — 파일 수준 트랜잭션은 들여쓰기 없이 쓰는 것이 이 저장소 규약이다.
    */
    const opens = (body.match(/^begin;$/gm) ?? []).length;
    const closes = (body.match(/^commit;$/gm) ?? []).length;
    expect(opens, `${name}: begin;/commit; 짝이 안 맞는다`).toBe(closes);
  });
});
