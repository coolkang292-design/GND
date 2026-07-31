import { describe, expect, it } from "vitest";
import { todaysWorkoutLookupIds } from "./crew-poke";

/**
 * 2026-07-31 실사고 재현.
 *
 * 홈 크루 카드가 "오늘 운동한 사람"을 조회할 때 **크루 목록만** 넘겼다.
 * 0039부터 `getCrewProfiles`가 본인을 뺀 목록을 돌려주는데 그걸 그대로 쓴
 * 것이다. 내 id가 조회 대상에 없으니 `workedOut.has(userId)`가 영원히 false가
 * 되고, 콕 버튼은 오늘 운동을 마쳐도 흐릿한 채였다.
 *
 * 서버 게이트(0028)는 멀쩡했다. 화면이 자기 상태를 못 읽은 것이다.
 */
describe("todaysWorkoutLookupIds", () => {
  it("내 id를 반드시 포함한다 — 이게 없으면 콕이 영원히 안 눌린다", () => {
    expect(todaysWorkoutLookupIds("me", ["a", "b"])).toEqual(["me", "a", "b"]);
  });

  it("크루가 없어도 내 id는 조회한다", () => {
    expect(todaysWorkoutLookupIds("me", [])).toEqual(["me"]);
  });

  it("크루 목록에 내가 섞여 들어와도 중복으로 넣지 않는다", () => {
    expect(todaysWorkoutLookupIds("me", ["a", "me", "b"])).toEqual([
      "me",
      "a",
      "b",
    ]);
  });

  it("로그인 전이면 크루만 조회한다", () => {
    expect(todaysWorkoutLookupIds(null, ["a", "b"])).toEqual(["a", "b"]);
  });

  it("아무것도 없으면 빈 배열 — 조회 자체를 건너뛰게 한다", () => {
    expect(todaysWorkoutLookupIds(null, [])).toEqual([]);
  });
});
