import { describe, expect, it } from "vitest";
import { errorText } from "./error-text";

/**
 * 2026-08-09 실측으로 생겼다. 운동 시작이 RLS로 막혔을 때 화면 토스트가
 * `오류: [object Object]`였다 — 실제 원인은 객체 안에 멀쩡히 들어 있었다:
 * `{ code: "42501", message: "permission denied for table workout_sessions" }`.
 *
 * ⚠️ 이 문구는 **버그 신고에도 그대로 실린다**(`bug_reports`). `[object Object]`가
 * 쌓이면 다음 사람이 원인을 못 찾는다.
 */
describe("errorText", () => {
  it("Supabase 오류 객체에서 메시지를 꺼낸다 — 이게 이 파일이 있는 이유다", () => {
    const e = {
      code: "42501",
      details: null,
      hint: null,
      message: "permission denied for table workout_sessions",
    };

    expect(errorText(e)).toBe(
      "permission denied for table workout_sessions (42501)",
    );
  });

  it("절대 [object Object]를 내지 않는다", () => {
    for (const e of [
      { message: "boom" },
      { code: "P0001" },
      { foo: "bar" },
      {},
      { message: "a", details: "b", hint: "c", code: "X" },
    ]) {
      expect(errorText(e)).not.toContain("[object Object]");
    }
  });

  it("Error는 message를 쓴다", () => {
    expect(errorText(new Error("session_not_found"))).toBe("session_not_found");
  });

  it("문자열은 그대로", () => {
    expect(errorText("active_session_exists")).toBe("active_session_exists");
  });

  it("details·hint도 함께 보여 준다", () => {
    expect(
      errorText({ message: "a", details: "b", hint: "c", code: "X" }),
    ).toBe("a · b · c (X)");
  });

  it("같은 말이 두 칸에 오면 한 번만 쓴다", () => {
    expect(errorText({ message: "같은말", details: "같은말" })).toBe("같은말");
  });

  it("코드만 있어도 그것을 남긴다", () => {
    expect(errorText({ code: "23505" })).toBe("(23505)");
  });

  it("모르는 모양이면 JSON으로라도 남긴다", () => {
    expect(errorText({ foo: "bar" })).toBe('{"foo":"bar"}');
  });

  it("순환 참조에도 던지지 않는다", () => {
    const e: Record<string, unknown> = {};
    e.self = e;

    expect(() => errorText(e)).not.toThrow();
  });

  it("메시지가 빈 Error도 무너지지 않는다", () => {
    expect(errorText(new Error(""))).not.toContain("[object Object]");
  });
});
