import { formatSetAmount } from "./set-display";
import { amountFields, type AmountFieldKey } from "./set-input";
import type { ExerciseType } from "@/lib/types";

/**
 * 지난번 같은 번호 세트와 견주어 **"한 번 더"를 걸지** 정한다 (설계 2026-08-24 §3).
 *
 * 운동 중에는 지난번에 몇 kg 몇 회를 했는지 볼 길이 없었다. 오버레이의
 * `이전 기록 불러오기`는 `active`에 막혀 눌러도 아무 일이 없었다(그래서 걷어냈다).
 *
 * ⚠️ **표기 규칙을 새로 만들지 마라.** 지난번 값의 표기(`amountLabel`)는
 * `formatSetAmount()`(`set-display.ts`)가 짓는다 — 그 주석이 **"표기 규칙이 두
 * 벌이 되면 화면과 공유 텍스트의 수치가 갈라진다"**고 못박고 있다. 이 모듈이
 * 직접 짓는 문자열은 `cheer`·`message` 둘뿐이다.
 *
 * ⚠️ **유형 분기를 손으로 쓰지 마라.** 어떤 칸을 쓰는지는 `amountFields()`가
 * 정한다. 유산소·맨몸 시간 종목에 "한 번 더"는 뜻이 안 통한다 — `reps` 칸이
 * 없다는 사실로 자연히 걸러진다.
 */

/** 지난번 세트 한 줄 — `LocalSet`의 값 네 칸만 */
export type PreviousSet = {
  weightKg: number;
  reps: number;
  distanceKm: number;
  durationMin: number;
};

export type PreviousHint =
  | { kind: "first"; message: string }
  | {
      kind: "set";
      previous: PreviousSet;
      /** "60kg 8회" — `formatSetAmount()`가 지은 표기. 화면은 그대로 찍는다 */
      amountLabel: string;
      /** 도전 조건을 만족할 때만 채워진다 */
      challengeReps: number | null;
      /** 화이팅·안내 문구. 할 말이 없으면 빈 문자열이 아니라 `null` */
      cheer: string | null;
    };

const FIRST_RECORD_MESSAGE = "이 종목은 오늘이 첫 기록이에요";

/**
 * ⚠️ **문구는 여기 한 곳에만 있다.** 입력 화면과 휴식 화면이 같이 쓰므로,
 * 화면에 문자열을 박으면 두 화면이 갈라진다.
 */
function verdict(input: {
  hasReps: boolean;
  hasWeight: boolean;
  sameWeight: boolean;
  currentReps: number;
  previousReps: number;
  currentWeightKg: number;
  previousWeightKg: number;
}): { challengeReps: number | null; cheer: string | null } {
  // 무게가 다르면 횟수 이야기를 꺼내지 않는다.
  // ⚠️ 내린 경우를 빠뜨리면 60→50kg인 날에도 "올렸어요"가 뜬다.
  if (!input.sameWeight) {
    return {
      challengeReps: null,
      cheer:
        input.currentWeightKg > input.previousWeightKg
          ? "무게를 올렸어요 — 횟수는 무리하지 말고"
          : "무게를 낮췄어요 — 자세부터 챙겨요",
    };
  }
  // 횟수 칸이 없는 종목(유산소·맨몸 시간)에는 "한 번 더"가 뜻이 안 통한다.
  if (!input.hasReps || input.previousReps <= 0) {
    return { challengeReps: null, cheer: null };
  }
  /*
    ⚠️ **이미 지난번을 넘겼으면 도전을 걸지 마라** (2026-08-24 개발 서버에서 잡음).

    처음엔 무게만 같으면 무조건 `지난번보다 한 번 더 — 11회로`를 띄웠다. 그런데
    1세트에서 그 버튼을 눌러 11회로 만들고 그 값이 2세트에 퍼지면, 2세트에서는
    **이미 11회인데 "11회로" 버튼이 떠 있었다.** 눌러도 아무 일이 없는 버튼이다.
    단위 테스트로는 안 잡혔다 — 화면에서 실제로 눌러 봐야 보였다.
  */
  if (input.currentReps > input.previousReps) {
    const more = input.currentReps - input.previousReps;
    return { challengeReps: null, cheer: `지난번보다 ${more}회 더예요 👍` };
  }
  // 오늘 계획이 지난번보다 적다 — 일부러 낮춰 잡은 것이니 재촉하지 않는다
  if (input.currentReps < input.previousReps) {
    return { challengeReps: null, cheer: null };
  }
  const challengeReps = input.previousReps + 1;
  return {
    challengeReps,
    cheer: `🔥 지난번보다 한 번 더 — ${challengeReps}회로`,
  };
}

export function previousHintFor({
  previousSets,
  setIndex,
  current,
  exerciseType,
  measure,
}: {
  /**
   * 지난번 그 종목의 **완료 세트**들, 세트 번호 순서.
   * `null`·빈 배열이면 "지난 기록이 없다"로 다룬다.
   */
  previousSets: PreviousSet[] | null;
  /** 오늘 몇 번째 세트인가 (0부터) — 같은 번호끼리 견준다 */
  setIndex: number;
  current: Record<AmountFieldKey, number>;
  exerciseType: ExerciseType;
  measure: "reps" | "time" | null;
}): PreviousHint | null {
  // ⚠️ `fields`를 밖에서 받지 않는다 — 화면이 종목과 안 맞는 칸 목록을 넘길 수
  //    있고, 그러면 러닝에 "한 번 더"가 붙는다. 유형에서 한 번만 끌어낸다.
  const fields = amountFields(exerciseType, measure);
  if (!previousSets || previousSets.length === 0) {
    // 첫 기록 안내는 **1세트에만** 낸다. 3세트 내내 같은 말을 반복하면
    // 잔소리가 되고, 2세트째부터는 이미 오늘 기록이 생겨 사실도 아니다.
    return setIndex === 0
      ? { kind: "first", message: FIRST_RECORD_MESSAGE }
      : null;
  }

  const previous = previousSets[setIndex];
  // 지난번엔 2세트만 했는데 오늘 3세트째다 — 견줄 것이 없으면 아무것도 안 그린다
  if (!previous) return null;

  const hasReps = fields.some((field) => field.key === "reps");
  const hasWeight = fields.some((field) => field.key === "weightKg");

  // 무게 칸이 없는 종목(맨몸 횟수)은 무게 조건 없이 도전을 건다.
  // 시간·거리 종목은 `reps` 칸이 없으므로 여기서 자연히 걸러진다.
  const sameWeight = !hasWeight || current.weightKg === previous.weightKg;
  const { challengeReps, cheer } = verdict({
    hasReps,
    hasWeight,
    sameWeight,
    currentReps: current.reps,
    previousReps: previous.reps,
    currentWeightKg: current.weightKg,
    previousWeightKg: previous.weightKg,
  });

  return {
    kind: "set",
    previous,
    amountLabel: formatSetAmount({
      exerciseType,
      measure,
      weightKg: previous.weightKg,
      reps: previous.reps,
      distanceKm: previous.distanceKm,
      durationMin: previous.durationMin,
    }),
    challengeReps,
    cheer,
  };
}
