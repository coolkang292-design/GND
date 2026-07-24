import { describe, expect, it } from "vitest";
import { isAlreadyCompletedFinishError } from "./workout";

// 회귀: 0 XP로 완료된 세션(당일 2번째·무효 운동)을 재종료하면 실 DB의
// complete_workout_v2가 `incomplete_xp_processing`(P0001)을 던진다.
// scripts/finish-repro.mjs 시나리오 2·3에서 status=400으로 재현됨.
// 이 오류는 종료 실패가 아니라 "이미 완료됨"으로 취급해야 한다.
describe("isAlreadyCompletedFinishError", () => {
  it("incomplete_xp_processing은 이미 완료로 간주한다", () => {
    expect(isAlreadyCompletedFinishError("incomplete_xp_processing")).toBe(true);
  });

  it("invalid_status:completed도 이미 완료로 간주한다", () => {
    expect(isAlreadyCompletedFinishError("invalid_status:completed")).toBe(true);
  });

  it("진짜 실패 오류는 그대로 통과시키지 않는다(재시도 대상)", () => {
    for (const msg of [
      "session_not_found",
      "not_authenticated",
      "invalid_status:cancelled",
      "네트워크 오류",
      "",
    ]) {
      expect(isAlreadyCompletedFinishError(msg)).toBe(false);
    }
  });
});
