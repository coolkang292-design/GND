import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  /** PostgREST가 406을 돌려준 요청 (테이블 이름) — 브라우저 콘솔에 빨간 줄로 남는 것들 */
  notAcceptable: [] as string[],
}));

/**
 * PostgREST 쿼리 빌더 흉내 — **단건 조회의 HTTP 상태만큼은 실제와 같게** 한다.
 *
 * ⚠️ `.single()`은 `Accept: application/vnd.pgrst.object+json`을 보내고, 행이
 *    0개면 PostgREST가 **406**을 준다. supabase-js는 그걸 `error`로 돌려줄 뿐이라
 *    코드가 `data`만 보면 화면은 멀쩡한데 **브라우저 콘솔에는 `Failed to load
 *    resource: 406`이 찍힌다.** `.maybeSingle()`(GET)은 `application/json`으로 받아
 *    0행이 200 + `null`이다. 이 차이가 이 테스트가 지키는 전부다.
 */
function from(table: string) {
  const rows = mocks.rows[table] ?? [];
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    not: () => query,
    order: () => query,
    limit: () => query,
    single: async () => {
      if (rows.length !== 1) {
        mocks.notAcceptable.push(table);
        return { data: null, error: { code: "PGRST116" }, status: 406 };
      }
      return { data: rows[0], error: null, status: 200 };
    },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null, status: 200 }),
  };
  return query;
}

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ from }),
}));

import { getSuggestionFacts } from "./workout";

beforeEach(() => {
  mocks.rows = {};
  mocks.notAcceptable = [];
});

describe("getSuggestionFacts — 프로필이 아직 없는 신규 방문자", () => {
  /*
    2026-10-11: 새 익명 방문자가 `/record`(착지 경로)에 들어오면 온보딩 게이트가
    `/onboarding`으로 보내기 전에 이 함수가 한 번 돈다. 그때는 `profiles` 행이 아직
    없다(닉네임을 정해야 생긴다). `.single()`이던 시절 운영·개발 서버 콘솔에
    `Failed to load resource: 406`이 찍혔다 — Supabase edge 로그상 406은 전부
    `profiles?select=created_at&id=eq.<uid>` 이 한 요청이었다.

    0행은 이 함수가 원래 받아들이는 정상 상태다("1970-01-01"로 받는다).
    그러니 요청 자체가 실패로 보이면 안 된다.
  */
  it("프로필 0행이어도 406 요청을 만들지 않는다", async () => {
    const facts = await getSuggestionFacts("new-anon-user");

    expect(mocks.notAcceptable).toEqual([]);
    expect(facts).toEqual({
      didWorkoutToday: false,
      lastSessionWasInterval: false,
      signedUpDayKey: "1970-01-01",
    });
  });

  it("프로필이 있으면 가입일을 그대로 읽는다", async () => {
    mocks.rows.profiles = [{ created_at: "2026-10-01T03:00:00.000Z" }];

    const facts = await getSuggestionFacts("user-1");

    expect(mocks.notAcceptable).toEqual([]);
    expect(facts.signedUpDayKey).toMatch(/^2026-10-0[12]$/); // 실행 기기 타임존에 따라 1일 또는 2일
    expect(facts.signedUpDayKey).not.toBe("1970-01-01");
  });
});
