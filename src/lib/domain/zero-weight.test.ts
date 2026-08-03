import { describe, expect, it } from "vitest";
import { shouldAskBodyweight } from "@/lib/domain/zero-weight";

const BASE = {
  exerciseType: "weight" as const,
  weightKg: 0,
  reps: 10,
  willDone: true,
  alreadyAsked: false,
};

describe("shouldAskBodyweight — 0kg 웨이트 세트에 되묻기 (2026-08-04)", () => {
  it("0kg으로 완료하면 묻는다", () => {
    expect(shouldAskBodyweight(BASE)).toBe(true);
  });

  it("무게가 실려 있으면 안 묻는다", () => {
    expect(shouldAskBodyweight({ ...BASE, weightKg: 1 })).toBe(false);
    expect(shouldAskBodyweight({ ...BASE, weightKg: 60 })).toBe(false);
  });

  it("완료를 해제할 때는 안 묻는다", () => {
    expect(shouldAskBodyweight({ ...BASE, willDone: false })).toBe(false);
  });

  it("한 종목에 한 번만 묻는다", () => {
    // 5세트짜리에서 세트마다 뜨면 아무도 안 읽고 닫는다
    expect(shouldAskBodyweight({ ...BASE, alreadyAsked: true })).toBe(false);
  });

  it("맨몸·유산소 종목에는 안 묻는다", () => {
    expect(
      shouldAskBodyweight({ ...BASE, exerciseType: "bodyweight" }),
    ).toBe(false);
    expect(shouldAskBodyweight({ ...BASE, exerciseType: "cardio" })).toBe(false);
  });

  it("횟수가 0인 빈 세트에는 안 묻는다", () => {
    // newSet()이 weightKg:0·reps:0으로 시작한다 — 아무것도 안 적고 체크만 하면
    // 물어봐야 답할 게 없다
    expect(shouldAskBodyweight({ ...BASE, reps: 0 })).toBe(false);
  });
});
