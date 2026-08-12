import { describe, expect, it } from "vitest";
import type { ExercisePrescription } from "./workout-plan";
import {
  applyProgramLoadIfUnchanged,
  initialProgramLoad,
  nextProgramLoad,
  programWeightGuide,
  repRangeLabel,
  restClock,
  restSecondsForExercise,
  shouldDeferAutoFinishForEffort,
  shouldAskEffort,
} from "./program-load";

const rx: ExercisePrescription = {
  repsMin: 8,
  repsMax: 10,
  targetRir: 2,
  restSeconds: 120,
  loadStepKg: 2.5,
};

describe("applyProgramLoadIfUnchanged — 늦은 자동 추천이 사용자 입력을 덮지 않는다", () => {
  it("조회 시작 뒤 사용자가 무게를 바꾸면 현재 값을 보존한다", () => {
    expect(applyProgramLoadIfUnchanged(25, 0, 40)).toBe(25);
  });

  it("사용자가 건드리지 않았을 때만 추천 무게를 채운다", () => {
    expect(applyProgramLoadIfUnchanged(0, 0, 40)).toBe(40);
  });
});

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

/**
 * 종목별 휴식 (계획 2026-08-12 Task 4).
 *
 * ⚠️ 복합 운동 120~150초, 고립 75초처럼 **종목마다 다르다.** 전역 휴식 설정을
 *    그대로 쓰면 프로그램이 정한 회복 시간이 통째로 무시된다.
 */
describe("restSecondsForExercise — 처방이 전역 설정을 이긴다", () => {
  it("처방이 있으면 그 휴식을 쓴다", () => {
    expect(restSecondsForExercise(rx, 90)).toBe(120);
  });

  it("처방이 없으면 전역 휴식을 쓴다", () => {
    expect(restSecondsForExercise(undefined, 90)).toBe(90);
  });

  it("처방 휴식이 0 이하로 새어 들어오면 전역 설정으로 되돌린다", () => {
    // 휴식 0초는 타이머가 곧바로 끝나 "휴식이 없는" 것처럼 보인다.
    expect(restSecondsForExercise({ ...rx, restSeconds: 0 }, 90)).toBe(90);
    expect(restSecondsForExercise({ ...rx, restSeconds: -5 }, 90)).toBe(90);
  });

  it("종목마다 다른 값을 각각 돌려준다", () => {
    expect(restSecondsForExercise({ ...rx, restSeconds: 150 }, 90)).toBe(150);
    expect(restSecondsForExercise({ ...rx, restSeconds: 75 }, 90)).toBe(75);
  });
});

describe("restClock — 휴식 표기", () => {
  it("초를 분:초로 적는다", () => {
    expect(restClock(120)).toBe("2:00");
    expect(restClock(75)).toBe("1:15");
    expect(restClock(90)).toBe("1:30");
  });

  it("한 자리 초는 0을 채운다", () => {
    expect(restClock(61)).toBe("1:01");
  });

  it("음수는 0:00으로 막는다", () => {
    expect(restClock(-10)).toBe("0:00");
  });
});

describe("repRangeLabel — 목표 반복 범위", () => {
  it("처방의 하한과 상한을 그대로 읽는다", () => {
    expect(repRangeLabel(rx)).toBe("8~10회");
    expect(repRangeLabel({ ...rx, repsMin: 12, repsMax: 15 })).toBe("12~15회");
  });

  it("하한과 상한이 같으면 한 번만 적는다", () => {
    expect(repRangeLabel({ ...rx, repsMin: 5, repsMax: 5 })).toBe("5회");
  });
});

/**
 * 노력 피드백을 언제 묻는가 (계획 2026-08-12 Task 5).
 *
 * ⚠️ **첫 세트와 마지막 세트에만.** 세트마다 물으면 세트 사이 흐름이 끊기고,
 *    사용자는 아무 버튼이나 눌러 치워 버린다 — 그러면 다음 회차 추천이 거짓이 된다.
 */
describe("shouldAskEffort — 첫·마지막 세트에만 묻는다", () => {
  const base = {
    hasPrescription: true,
    setCount: 3,
    willDone: true,
    alreadyAnswered: false,
  };

  it("첫 세트를 마치면 묻는다", () => {
    expect(shouldAskEffort({ ...base, setIndex: 0 })).toBe(true);
  });

  it("마지막 세트를 마치면 묻는다", () => {
    expect(shouldAskEffort({ ...base, setIndex: 2 })).toBe(true);
  });

  it("중간 세트에는 묻지 않는다", () => {
    expect(shouldAskEffort({ ...base, setIndex: 1 })).toBe(false);
  });

  it("세트가 하나뿐이면 한 번만 해당된다", () => {
    expect(shouldAskEffort({ ...base, setIndex: 0, setCount: 1 })).toBe(true);
  });

  it("처방 없는 일반 운동에는 묻지 않는다", () => {
    expect(
      shouldAskEffort({ ...base, setIndex: 0, hasPrescription: false }),
    ).toBe(false);
  });

  it("이미 답한 세트에는 다시 묻지 않는다", () => {
    expect(shouldAskEffort({ ...base, setIndex: 0, alreadyAnswered: true })).toBe(
      false,
    );
  });

  it("완료를 되돌리는 중이면 묻지 않는다", () => {
    // 체크를 푸는 동작인데 시트가 뜨면 사용자는 무엇에 답하는지 알 수 없다.
    expect(shouldAskEffort({ ...base, setIndex: 0, willDone: false })).toBe(
      false,
    );
  });

  it("범위를 벗어난 인덱스는 묻지 않는다 — 방어", () => {
    expect(shouldAskEffort({ ...base, setIndex: 9 })).toBe(false);
    expect(shouldAskEffort({ ...base, setIndex: -1 })).toBe(false);
    expect(shouldAskEffort({ ...base, setIndex: 0, setCount: 0 })).toBe(false);
  });
});

describe("shouldDeferAutoFinishForEffort — 마지막 답변을 기다린다", () => {
  it("모든 세트가 끝났고 피드백을 물을 때만 자동 종료를 미룬다", () => {
    expect(
      shouldDeferAutoFinishForEffort({
        pendingSetCountAfter: 0,
        willAskEffort: true,
      }),
    ).toBe(true);
  });

  it("남은 세트가 있거나 피드백 대상이 아니면 미루지 않는다", () => {
    expect(
      shouldDeferAutoFinishForEffort({
        pendingSetCountAfter: 1,
        willAskEffort: true,
      }),
    ).toBe(false);
    expect(
      shouldDeferAutoFinishForEffort({
        pendingSetCountAfter: 0,
        willAskEffort: false,
      }),
    ).toBe(false);
  });

  /**
   * ⚠️ 이 단언이 회귀 방지선이다 (2026-08-12 코드 리뷰에서 잡음).
   *
   * 화면은 이 함수의 결과를 `effortAsk.resumeAutoFinish`에 담아 두고, 시트를
   * 닫을 때 **그 값으로만** 자동 종료를 되살린다. 한때 "이 종목의 마지막
   * 세트인가"로 되살렸는데, 공식 프로그램은 한 회차에 종목이 4~6개라
   * **첫 종목을 끝낸 것만으로** 3초 뒤 "이대로 완료할까요?"가 떴다.
   *
   * 남은 세트가 하나라도 있으면 무슨 일이 있어도 false여야 한다.
   */
  it("남은 세트가 하나라도 있으면 절대 미루지 않는다 — 회귀 방지", () => {
    for (const pendingSetCountAfter of [1, 2, 3, 5, 12, 17]) {
      expect(
        shouldDeferAutoFinishForEffort({
          pendingSetCountAfter,
          willAskEffort: true,
        }),
        `남은 ${pendingSetCountAfter}세트`,
      ).toBe(false);
    }
  });
});

/**
 * A: 마지막 세트 체감을 다음 회차 시작 무게에 **실제로 반영한다** (2026-08-12).
 *
 * 그 전에는 `effort_feedback`을 저장만 하고 아무도 읽지 않았다. 시트는
 * "다음 회차 권장 무게에 반영돼요"라고 말하는데 반영되는 곳이 없었다 —
 * 문구가 기능보다 앞서 있었다.
 */
describe("initialProgramLoad — 지난 체감을 반영한다", () => {
  it("상한을 채우고 적당함이었으면 한 단위 올려서 시작한다", () => {
    expect(
      initialProgramLoad(rx, [
        { weightKg: 40, reps: 10, isCompleted: true },
        { weightKg: 40, reps: 10, isCompleted: true },
        { weightKg: 40, reps: 10, isCompleted: true, effortFeedback: "on_target" },
      ]),
    ).toMatchObject({ weightKg: 42.5, source: "history" });
  });

  it("너무 무거움이었으면 내려서 시작한다", () => {
    expect(
      initialProgramLoad(rx, [
        { weightKg: 40, reps: 9, isCompleted: true },
        { weightKg: 40, reps: 8, isCompleted: true, effortFeedback: "too_heavy" },
      ]),
    ).toMatchObject({ weightKg: 37.5, source: "history" });
  });

  it("상한을 못 채웠으면 적당함이어도 그대로 시작한다", () => {
    expect(
      initialProgramLoad(rx, [
        { weightKg: 40, reps: 9, isCompleted: true },
        { weightKg: 40, reps: 8, isCompleted: true, effortFeedback: "on_target" },
      ]),
    ).toMatchObject({ weightKg: 40, source: "history" });
  });

  it("체감이 없으면 예전처럼 가장 무거운 성공 무게 그대로다", () => {
    expect(
      initialProgramLoad(rx, [
        { weightKg: 40, reps: 10, isCompleted: true },
        { weightKg: 45, reps: 10, isCompleted: true },
      ]),
    ).toMatchObject({ weightKg: 45, source: "history" });
  });

  it("체감이 있어도 0kg 아래로는 내려가지 않는다", () => {
    expect(
      initialProgramLoad(rx, [
        { weightKg: 1, reps: 8, isCompleted: true, effortFeedback: "too_heavy" },
      ]),
    ).toMatchObject({ weightKg: 0, source: "history" });
  });

  it("미완료 세트의 체감은 근거로 쓰지 않는다", () => {
    // 들다 만 세트의 체감으로 다음 회차를 올리면 실패가 증량이 된다.
    expect(
      initialProgramLoad(rx, [
        { weightKg: 40, reps: 10, isCompleted: true },
        { weightKg: 60, reps: 2, isCompleted: false, effortFeedback: "too_light" },
      ]),
    ).toMatchObject({ weightKg: 40, source: "history" });
  });
});
