import { describe, expect, it } from "vitest";
import { programSaveErrorText } from "./program-error-text";

describe("programSaveErrorText", () => {
  it("이미 찬 날짜는 어느 날인지 알려 준다", () => {
    expect(
      programSaveErrorText({
        message: "program_plan_date_taken:2026-08-14",
        code: "P0001",
      }),
    ).toBe("8월 14일에 이미 다른 계획이 있어요. 시작일이나 요일을 바꿔 주세요.");
  });

  it("진행 중인 프로그램이 있으면 그렇게 말한다", () => {
    expect(programSaveErrorText(new Error("program_already_active"))).toBe(
      "이미 진행 중인 프로그램이에요. 기존 프로그램을 마친 뒤에 등록할 수 있어요.",
    );
  });

  it("요일 선택이 잘못된 경우들을 한 문구로 모은다", () => {
    const expected = "서로 다른 요일 3개를 골라 주세요.";
    expect(programSaveErrorText(new Error("program_invalid_slots"))).toBe(expected);
    expect(
      programSaveErrorText(new Error("program_slot_weekday_duplicate")),
    ).toBe(expected);
    expect(programSaveErrorText(new Error("program_slots_count"))).toBe(expected);
  });

  it("같은 날 두 회차는 날짜 문제로 안내한다", () => {
    const expected = "같은 날에 두 회차를 넣을 수 없어요. 요일을 다시 골라 주세요.";
    expect(programSaveErrorText(new Error("program_plan_date_order"))).toBe(
      expected,
    );
    expect(
      programSaveErrorText(new Error("program_plan_date_duplicate:2026-08-14")),
    ).toBe(expected);
  });

  it("로그인이 풀린 경우를 구분한다", () => {
    expect(programSaveErrorText(new Error("not_authenticated"))).toBe(
      "로그인이 풀렸어요. 다시 로그인한 뒤 시도해 주세요.",
    );
  });

  /**
   * 이 테스트가 이 파일의 존재 이유다 — 모르는 오류를 **삼키지 않는다.**
   * 2026-08-12에 catch {}가 program_invalid_slots를 통째로 먹어서,
   * 연속 3일 등록이 왜 실패하는지 화면에도 콘솔에도 안 남았다.
   */
  it("모르는 오류는 원문을 붙여서 진단할 수 있게 남긴다", () => {
    const text = programSaveErrorText({
      message: "permission denied for table workout_plans",
      code: "42501",
    });
    expect(text).toContain("저장하지 못했어요. 일정은 그대로 두었어요.");
    expect(text).toContain("permission denied for table workout_plans");
    expect(text).toContain("42501");
  });

  it("문구가 없는 오류도 [object Object]로 새지 않는다", () => {
    const text = programSaveErrorText({});
    expect(text).toContain("저장하지 못했어요. 일정은 그대로 두었어요.");
    expect(text).not.toContain("[object Object]");
  });
});
