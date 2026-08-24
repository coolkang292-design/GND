import { describe, expect, it } from "vitest";

import { previousHintFor } from "./previous-set";

/**
 * 지난번 같은 번호 세트와 견주어 "한 번 더"를 걸지 정한다 (설계 2026-08-24 §3).
 *
 * ⚠️ 이 모듈은 **표기 문자열을 만들지 않는다.** `formatSetAmount()`
 * (`set-display.ts`)가 네 유형을 이미 다 처리하고, 그 주석이 표기 규칙을 두 벌로
 * 두지 말라고 못박고 있다. 여기서 나가는 문자열은 `cheer`·`message`뿐이다.
 */

/** 종목 유형 — `previousHintFor`가 이걸로 `amountFields()`를 부른다 */
const WEIGHT = { exerciseType: "weight", measure: null } as const;
const BODY_REPS = { exerciseType: "bodyweight", measure: "reps" } as const;
const BODY_TIME = { exerciseType: "bodyweight", measure: "time" } as const;
const CARDIO = { exerciseType: "cardio", measure: null } as const;

function prev(
  partial: Partial<{
    weightKg: number;
    reps: number;
    distanceKm: number;
    durationMin: number;
  }> = {},
) {
  return {
    weightKg: 60,
    reps: 10,
    distanceKm: 0,
    durationMin: 0,
    ...partial,
  };
}

function now(
  partial: Partial<Record<"weightKg" | "reps" | "distanceKm" | "durationMin", number>> = {},
) {
  return { weightKg: 60, reps: 10, distanceKm: 0, durationMin: 0, ...partial };
}

describe("previousHintFor — 지난번과 견주기", () => {
  it("무게가 같으면 지난번보다 한 번 더를 건다", () => {
    const hint = previousHintFor({
      previousSets: [prev({ reps: 10 })],
      setIndex: 0,
      current: now({ weightKg: 60 }),
      ...WEIGHT,
    });

    expect(hint).toMatchObject({ kind: "set", challengeReps: 11 });
    expect(hint?.kind === "set" && hint.cheer).toContain("한 번 더");
  });

  it("무게를 올린 날에는 횟수 도전을 걸지 않는다 — 둘을 한꺼번에 올리라는 뜻이 된다", () => {
    const hint = previousHintFor({
      previousSets: [prev({ weightKg: 60 })],
      setIndex: 0,
      current: now({ weightKg: 70 }),
      ...WEIGHT,
    });

    expect(hint).toMatchObject({ kind: "set", challengeReps: null });
    expect(hint?.kind === "set" && hint.cheer).toContain("올렸어요");
  });

  it("무게를 내렸으면 '올렸어요'가 아니라 '낮췄어요'다 — 화면이 거짓말하면 안 된다", () => {
    const hint = previousHintFor({
      previousSets: [prev({ weightKg: 60 })],
      setIndex: 0,
      current: now({ weightKg: 50 }),
      ...WEIGHT,
    });

    expect(hint).toMatchObject({ kind: "set", challengeReps: null });
    expect(hint?.kind === "set" && hint.cheer).toContain("낮췄어요");
    expect(hint?.kind === "set" && hint.cheer).not.toContain("올렸어요");
  });

  it("맨몸 횟수 종목은 무게 조건 없이 도전을 건다", () => {
    const hint = previousHintFor({
      previousSets: [prev({ weightKg: 0, reps: 12 })],
      setIndex: 0,
      current: now({ weightKg: 0, reps: 12 }),
      ...BODY_REPS,
    });

    expect(hint).toMatchObject({ kind: "set", challengeReps: 13 });
  });

  it("맨몸 시간 종목에는 '한 번 더'가 없다 — 뜻이 안 통한다", () => {
    // ⚠️ 지난번 `reps`를 **일부러 0이 아니게** 둔다. 0으로 두면 `reps > 0` 가드에
    //    먼저 걸려, 유형 판정(`hasReps`)을 없애도 이 테스트가 통과해 버린다
    //    (2026-08-24 변이 확인에서 실제로 그랬다).
    const hint = previousHintFor({
      previousSets: [prev({ reps: 30, durationMin: 1 })],
      setIndex: 0,
      current: now({ durationMin: 1 }),
      ...BODY_TIME,
    });

    expect(hint).toMatchObject({ kind: "set", challengeReps: null });
    expect(hint?.kind === "set" && hint.cheer).toBeNull();
  });

  it("유산소에는 '한 번 더'가 없다", () => {
    const hint = previousHintFor({
      // 지난번 reps를 0이 아니게 둔다 — 위 테스트와 같은 이유다
      previousSets: [prev({ reps: 30, distanceKm: 3.2, durationMin: 25 })],
      setIndex: 0,
      current: now({ distanceKm: 3.2, durationMin: 25 }),
      ...CARDIO,
    });

    expect(hint).toMatchObject({ kind: "set", challengeReps: null });
    expect(hint?.kind === "set" && hint.cheer).toBeNull();
  });

  it("지난번에 그 번호 세트가 없으면 아무것도 그리지 않는다", () => {
    // 지난번엔 2세트만 했는데 오늘 3세트째다.
    expect(
      previousHintFor({
        previousSets: [prev(), prev()],
        setIndex: 2,
        current: now(),
        ...WEIGHT,
      }),
    ).toBeNull();
  });

  it("지난번 횟수가 0이면 도전을 걸지 않는다 — 기록이 사실상 없는 것이다", () => {
    const hint = previousHintFor({
      previousSets: [prev({ reps: 0 })],
      setIndex: 0,
      current: now(),
      ...WEIGHT,
    });

    expect(hint).toMatchObject({ kind: "set", challengeReps: null });
  });

  it("지난 기록이 없으면 1세트에서만 '첫 기록' 안내를 낸다", () => {
    const hint = previousHintFor({
      previousSets: null,
      setIndex: 0,
      current: now(),
      ...WEIGHT,
    });

    expect(hint?.kind).toBe("first");
    expect(hint?.kind === "first" && hint.message).toContain("첫 기록");
  });

  it("지난 기록이 없어도 2세트부터는 안내를 반복하지 않는다 — 잔소리가 된다", () => {
    expect(
      previousHintFor({
        previousSets: null,
        setIndex: 1,
        current: now(),
        ...WEIGHT,
      }),
    ).toBeNull();
  });

  it("빈 배열도 '기록 없음'과 같게 다룬다", () => {
    expect(
      previousHintFor({
        previousSets: [],
        setIndex: 0,
        current: now(),
        ...WEIGHT,
      })?.kind,
    ).toBe("first");
  });

  it("표기는 formatSetAmount 규칙 그대로다 — 여기서 새 규칙을 만들지 않는다", () => {
    expect(
      previousHintFor({
        previousSets: [prev({ weightKg: 62.5, reps: 8 })],
        setIndex: 0,
        current: now({ weightKg: 62.5 }),
        ...WEIGHT,
      }),
    ).toMatchObject({ amountLabel: "62.5kg 8회" });

    expect(
      previousHintFor({
        previousSets: [prev({ reps: 30, distanceKm: 3.2, durationMin: 25 })],
        setIndex: 0,
        current: now({ distanceKm: 3.2, durationMin: 25 }),
        ...CARDIO,
      }),
    ).toMatchObject({ amountLabel: "3.2km 25분" });

    expect(
      previousHintFor({
        previousSets: [prev({ reps: 30, durationMin: 1 })],
        setIndex: 0,
        current: now({ durationMin: 1 }),
        ...BODY_TIME,
      }),
    ).toMatchObject({ amountLabel: "1분" });
  });

  it("지난번 값은 숫자 그대로도 넘긴다", () => {
    const hint = previousHintFor({
      previousSets: [prev({ weightKg: 62.5, reps: 8 })],
      setIndex: 0,
      current: now({ weightKg: 62.5 }),
      ...WEIGHT,
    });

    expect(hint?.kind === "set" && hint.previous).toEqual({
      weightKg: 62.5,
      reps: 8,
      distanceKm: 0,
      durationMin: 0,
    });
  });

  it("같은 번호 세트끼리 견준다 — 2세트는 지난번 2세트와", () => {
    const hint = previousHintFor({
      previousSets: [prev({ reps: 12 }), prev({ reps: 8 })],
      setIndex: 1,
      current: now({ reps: 8 }),
      ...WEIGHT,
    });

    // 지난번 2세트가 8회였으므로 도전은 9회다. 1세트(12회)를 보면 13이 나온다.
    expect(hint).toMatchObject({ kind: "set", challengeReps: 9 });
  });

  /*
    ⚠️ 아래 세 건은 **개발 서버에서 눈으로 잡은 버그**의 회귀 테스트다
    (2026-08-24). 처음엔 무게만 같으면 무조건 도전을 걸어서, 1세트에서
    `한 번 더`로 11회를 만들고 그 값이 2세트에 퍼지면 2세트에서 **이미 11회인데
    "11회로" 버튼**이 떠 있었다. 눌러도 아무 일 없는 버튼이다.
  */
  it("이미 지난번을 넘겼으면 도전 대신 칭찬한다 — 죽은 버튼을 만들지 않는다", () => {
    const hint = previousHintFor({
      previousSets: [prev({ reps: 10 })],
      setIndex: 0,
      current: now({ reps: 11 }),
      ...WEIGHT,
    });

    expect(hint).toMatchObject({ kind: "set", challengeReps: null });
    expect(hint?.kind === "set" && hint.cheer).toContain("1회 더예요");
  });

  it("두 회 넘겼으면 그만큼 말한다", () => {
    const hint = previousHintFor({
      previousSets: [prev({ reps: 10 })],
      setIndex: 0,
      current: now({ reps: 12 }),
      ...WEIGHT,
    });

    expect(hint?.kind === "set" && hint.cheer).toContain("2회 더예요");
  });

  it("오늘 계획이 지난번보다 적으면 재촉하지 않는다", () => {
    // 일부러 낮춰 잡은 것이다. 여기에 "11회로"를 들이밀면 무례하다.
    const hint = previousHintFor({
      previousSets: [prev({ reps: 10 })],
      setIndex: 0,
      current: now({ reps: 6 }),
      ...WEIGHT,
    });

    expect(hint).toMatchObject({ kind: "set", challengeReps: null, cheer: null });
  });
});
