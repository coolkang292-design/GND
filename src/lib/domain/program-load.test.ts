import { describe, expect, it } from "vitest";
import type { ExercisePrescription } from "./workout-plan";
import {
  initialProgramLoad,
  nextProgramLoad,
  programWeightGuide,
} from "./program-load";

const rx: ExercisePrescription = {
  repsMin: 8,
  repsMax: 10,
  targetRir: 2,
  restSeconds: 120,
  loadStepKg: 2.5,
};

/**
 * 프로그램 무게 추천 (설계 2026-08-12).
 *
 * ⚠️ **무게를 꾸며내지 않는다.** 기록이 없으면 0kg을 확정하지 않고 안내만 준다.
 * 0kg을 넣으면 사용자는 "앱이 정한 무게"로 읽고, 그 값으로 기록이 남는다.
 */
describe("initialProgramLoad — 최근 기록에서 시작 무게", () => {
  it("반복 범위를 채운 완료 세트의 무게를 쓴다", () => {
    expect(
      initialProgramLoad(rx, [
        { weightKg: 40, reps: 10, isCompleted: true },
        { weightKg: 45, reps: 6, isCompleted: true },
      ]),
    ).toMatchObject({ weightKg: 40, source: "history" });
  });

  it("범위를 채운 세트가 여럿이면 가장 무거운 것을 쓴다", () => {
    // 램프업(40→45→50)에서 45×8까지는 범위를 채웠다. 50×5는 못 채웠다.
    expect(
      initialProgramLoad(rx, [
        { weightKg: 40, reps: 10, isCompleted: true },
        { weightKg: 45, reps: 8, isCompleted: true },
        { weightKg: 50, reps: 5, isCompleted: true },
      ]),
    ).toMatchObject({ weightKg: 45, source: "history" });
  });

  it("상한을 넘긴 세트도 근거로 쓴다 — 가벼웠을 뿐 못 든 게 아니다", () => {
    expect(
      initialProgramLoad(rx, [{ weightKg: 30, reps: 15, isCompleted: true }]),
    ).toMatchObject({ weightKg: 30, source: "history" });
  });

  it("미완료 세트는 근거가 아니다", () => {
    expect(
      initialProgramLoad(rx, [
        { weightKg: 60, reps: 10, isCompleted: false },
        { weightKg: 40, reps: 9, isCompleted: true },
      ]),
    ).toMatchObject({ weightKg: 40, source: "history" });
  });

  it("하한 미달만 있으면 무게를 추측하지 않는다", () => {
    // 8회 미만만 있는 사람에게 그 무게를 그대로 주면 또 실패한다.
    expect(
      initialProgramLoad(rx, [{ weightKg: 60, reps: 3, isCompleted: true }]),
    ).toMatchObject({ weightKg: null, source: "first_set" });
  });

  it("맨몸처럼 무게 0인 기록은 근거로 쓰지 않는다", () => {
    expect(
      initialProgramLoad(rx, [{ weightKg: 0, reps: 12, isCompleted: true }]),
    ).toMatchObject({ weightKg: null, source: "first_set" });
  });

  it("기록이 없으면 무게를 추측하지 않고 반복 가이드를 준다", () => {
    const result = initialProgramLoad(rx, []);
    expect(result).toMatchObject({ weightKg: null, source: "first_set" });
    expect(result.guide).toContain("8~10회");
    expect(result.guide).toContain("2회 정도 더 할 수 있는 무게");
  });

  it("기록이 있어도 안내는 늘 따라온다 — 화면이 분기하지 않게", () => {
    const result = initialProgramLoad(rx, [
      { weightKg: 40, reps: 10, isCompleted: true },
    ]);
    expect(result.guide.length).toBeGreaterThan(0);
  });
});

describe("programWeightGuide — 처방 값을 그대로 읽는 안내", () => {
  it("반복 범위와 여유 횟수를 처방에서 만든다", () => {
    expect(programWeightGuide(rx)).toBe(
      "8~10회를 안정된 자세로 수행할 수 있는 무게를 선택하세요.\n" +
        "10회를 마치고도 2회 정도 더 할 수 있는 무게가 적당합니다.",
    );
  });

  it("다른 처방이면 숫자가 따라 바뀐다 — 문구를 박아두지 않았다", () => {
    expect(
      programWeightGuide({ ...rx, repsMin: 12, repsMax: 15, targetRir: 3 }),
    ).toBe(
      "12~15회를 안정된 자세로 수행할 수 있는 무게를 선택하세요.\n" +
        "15회를 마치고도 3회 정도 더 할 수 있는 무게가 적당합니다.",
    );
  });
});

/**
 * 다음 회차 권장 무게. **한 번에 한 단위만 올린다** — 두 단위를 올리면
 * 다음 회차에 반복 하한을 못 채우고, 그 실패가 그 다음 회차 추천까지 끌어내린다.
 */
describe("nextProgramLoad — 다음 회차 권장 무게", () => {
  it("모든 세트가 상한을 채우고 적당함이면 한 단위 올린다", () => {
    expect(nextProgramLoad(rx, 40, [10, 10, 10], "on_target")).toBe(42.5);
  });

  it("너무 가벼움이어도 한 단위까지만 올린다", () => {
    expect(nextProgramLoad(rx, 40, [10, 10, 10], "too_light")).toBe(42.5);
  });

  it("상한을 못 채웠으면 적당함이어도 그대로 둔다", () => {
    expect(nextProgramLoad(rx, 40, [10, 9, 8], "on_target")).toBe(40);
  });

  it("상한을 채웠어도 너무 무거움이면 올리지 않는다", () => {
    expect(nextProgramLoad(rx, 40, [10, 10, 10], "too_heavy")).toBe(37.5);
  });

  it("하한 미달 + 너무 무거움이면 한 단위 내린다", () => {
    expect(nextProgramLoad(rx, 40, [8, 7, 6], "too_heavy")).toBe(37.5);
    expect(nextProgramLoad(rx, 40, [8, 7, 6], "too_heavy")).toBeLessThanOrEqual(
      40,
    );
  });

  it("하한 미달이지만 적당함이면 그대로 둔다 — 내리지도 올리지도 않는다", () => {
    expect(nextProgramLoad(rx, 40, [8, 7, 6], "on_target")).toBe(40);
  });

  it("0kg 아래로 내려가지 않는다", () => {
    expect(nextProgramLoad(rx, 1, [4], "too_heavy")).toBe(0);
  });

  it("세트를 하나도 못 채웠으면 올리지 않는다", () => {
    expect(nextProgramLoad(rx, 40, [], "on_target")).toBe(40);
  });

  it("증량 단위는 처방을 따른다", () => {
    expect(
      nextProgramLoad({ ...rx, loadStepKg: 5 }, 60, [10, 10], "on_target"),
    ).toBe(65);
    expect(
      nextProgramLoad({ ...rx, loadStepKg: 1 }, 12, [10, 10], "on_target"),
    ).toBe(13);
  });
});
