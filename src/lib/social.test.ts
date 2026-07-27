import { describe, expect, it } from "vitest";
import { toSocialError } from "./social";

/**
 * toSocialError는 SOCIAL_ERROR_CODES를 순서대로 훑으며 message.includes(code)로
 * 고른다. 배열이 커질수록 "먼저 나온 짧은 코드가 나중 코드의 부분문자열이라
 * 엉뚱한 게 먼저 잡히는" 사고가 나기 쉬운 구조다. 0038이 7개를 더했으므로
 * 새 코드가 제 이름으로 잡히는지 여기서 못 박는다.
 */
describe("toSocialError — 0038 크루 연결 에러 코드", () => {
  const codes = [
    "self_request",
    "already_crew",
    "request_exists",
    "target_not_found",
    "not_addressee",
    "not_pending",
    "not_requester",
    "not_crew",
  ] as const;

  it.each(codes)("%s 는 자기 이름으로 잡힌다", (code) => {
    expect(toSocialError({ message: code }).code).toBe(code);
  });

  it("모르는 메시지는 code가 null이다", () => {
    expect(toSocialError({ message: "42501: permission denied" }).code).toBe(
      null,
    );
  });

  it("기존 코드가 새 코드에 밀리지 않는다", () => {
    expect(toSocialError({ message: "self_poke" }).code).toBe("self_poke");
    expect(toSocialError({ message: "session_not_found" }).code).toBe(
      "session_not_found",
    );
  });
});
