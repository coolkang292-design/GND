import { describe, expect, it } from "vitest";
import { planSaveErrorText } from "./plan-save-error";

describe("planSaveErrorText", () => {
  /*
    0101을 Run하기 전 잠깐 생기는 상태다 — 새 앱은 같은 날 두 번째 계획을
    만들려 하는데 DB에는 아직 `unique (user_id, plan_date)`가 살아 있다.
    이때 나오는 것이 23505다. 그냥 "저장하지 못했어요"로 뭉개면 사용자도
    다음 사람도 왜 안 되는지 모른다.
  */
  it("하루 1계획 제약(23505)을 사람 말로 바꾼다", () => {
    expect(planSaveErrorText({ code: "23505", message: "duplicate key" })).toBe(
      "그날은 아직 계획을 하나만 담을 수 있어요. 잠시 뒤 다시 시도해 주세요.",
    );
  });

  it("제약 이름으로만 알 수 있는 경우도 잡는다", () => {
    expect(
      planSaveErrorText({
        message:
          'duplicate key value violates unique constraint "workout_plans_user_id_plan_date_key"',
      }),
    ).toBe("그날은 아직 계획을 하나만 담을 수 있어요. 잠시 뒤 다시 시도해 주세요.");
  });

  it("옮기기가 막힌 경우를 따로 알린다", () => {
    expect(planSaveErrorText({ message: "plan_date_taken" })).toBe(
      "그 날짜에 이미 계획이 있어요.",
    );
  });

  it("그 밖의 오류는 기본 문구로 돌려준다", () => {
    expect(planSaveErrorText(new Error("network down"))).toBe(
      "운동 계획을 저장하지 못했어요",
    );
  });

  it("기본 문구를 바꿔 쓸 수 있다", () => {
    expect(planSaveErrorText(new Error("nope"), "인터벌 계획을 저장하지 못했어요")).toBe(
      "인터벌 계획을 저장하지 못했어요",
    );
  });

  /*
    ⚠️ 23505가 아닌데 문구를 붙이면 거짓말이 된다. 우연히 "unique"라는 낱말이
       들어간 다른 오류를 이 문구로 덮지 않는지 본다.
  */
  it("unique라는 낱말만으로는 하루 1계획이라고 하지 않는다", () => {
    expect(
      planSaveErrorText({ message: "unique index build failed" }),
    ).toBe("운동 계획을 저장하지 못했어요");
  });
});
