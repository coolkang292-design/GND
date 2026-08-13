import {
  TABATA_EXERCISE_COUNT,
  TABATA_ROUND_SECONDS,
  type TabataMinutes,
} from "./tabata";

/**
 * 음원 위치 → **지금 무엇을 할 차례인가** (사용자 지시 2026-08-13).
 *
 * 인터벌은 근력과 달리 사용자가 횟수를 입력하지 않는다. 20초가 지나면 앱이
 * 스스로 다음 종목으로 넘어가고, 음원이 끝나면 스스로 종료한다. 그 판단을
 * 화면이 아니라 **여기 순수 함수**가 한다 — 화면에 두면 일시정지·복귀·재생
 * 위치 보정 때마다 계산이 갈라진다.
 *
 * ## 음원의 구조 (2026-08-13 실측)
 *
 * 한 블록 = **10초 준비 + 8라운드 × 30초 = 250초**. 4분 음원이 정확히
 * 250.02초다. 8·16분은 이 블록을 2·4번 이어 붙인 것이다.
 *
 * ⚠️ 8·16분 음원을 **다시 만들었다.** 예전 파일은 이음매마다 4.98초가 빠져
 *    있어서(495.06 / 985.14초) 두 번째 블록부터 화면이 음악보다 5초씩 앞서
 *    갔다. 16분이면 끝에서 15초가 어긋난다 — 화면은 푸시업인데 음악은 다른
 *    종목을 부르는 상태다. 지금은 이음매 손실이 11ms다.
 *
 * ⚠️ 그래서 이 함수는 **음원 파일 구조에 묶여 있다.** 음원을 바꾸면 여기
 *    상수도 같이 봐야 한다. `interval-cue.test.ts`가 파일 길이와 이 상수의
 *    관계를 단언한다.
 */

/** 블록 시작의 준비 구간 — 음원이 카운트다운을 부른다 */
export const INTERVAL_PREP_SECONDS = 10;

/** 한 라운드 안에서 몸을 쓰는 구간. 나머지가 휴식이다 */
export const INTERVAL_WORK_SECONDS = 20;

export const INTERVAL_REST_SECONDS =
  TABATA_ROUND_SECONDS - INTERVAL_WORK_SECONDS;

/** 한 블록의 라운드 수 — 4분 음원 하나가 이만큼이다 */
export const INTERVAL_ROUNDS_PER_BLOCK = 8;

/** 한 블록의 길이 (초) */
export const INTERVAL_BLOCK_SECONDS =
  INTERVAL_PREP_SECONDS + INTERVAL_ROUNDS_PER_BLOCK * TABATA_ROUND_SECONDS;

export type IntervalCue =
  | {
      phase: "prep";
      /** 준비가 끝나기까지 남은 초 (1~10) */
      secondsLeft: number;
      /** 준비가 끝나면 할 종목 */
      nextExerciseIndex: number;
      round: number;
      totalRounds: number;
    }
  | {
      phase: "work";
      secondsLeft: number;
      exerciseIndex: number;
      /** 다음 라운드의 종목. 마지막 라운드면 null */
      nextExerciseIndex: number | null;
      round: number;
      totalRounds: number;
    }
  | {
      phase: "rest";
      secondsLeft: number;
      /** 휴식이 끝나면 할 종목. 마지막 휴식이면 null */
      nextExerciseIndex: number | null;
      round: number;
      totalRounds: number;
    }
  | { phase: "done"; totalRounds: number };

/** 코스 전체의 라운드 수 — 4분 8라운드 · 8분 16 · 16분 32 */
export function intervalTotalRounds(minutes: TabataMinutes): number {
  return (minutes * 60) / TABATA_ROUND_SECONDS;
}

/** 음원 전체 길이 (초). 블록 수 × 250초 */
export function intervalTotalSeconds(minutes: TabataMinutes): number {
  return (minutes / 4) * INTERVAL_BLOCK_SECONDS;
}

/**
 * 라운드 번호(0부터) → 그 라운드에 할 종목의 자리.
 *
 * 4종목을 순서대로 돈다. 라운드 4는 다시 첫 종목이다.
 */
export function intervalExerciseIndexForRound(round: number): number {
  return round % TABATA_EXERCISE_COUNT;
}

/**
 * 음원의 현재 위치로 지금 할 일을 정한다.
 *
 * @param elapsedSeconds `audio.currentTime`. 음수나 NaN이면 0으로 본다 —
 *   재생이 아직 안 붙은 순간에도 화면이 "준비"를 그릴 수 있어야 한다.
 */
export function intervalCueAt(
  elapsedSeconds: number,
  minutes: TabataMinutes,
): IntervalCue {
  const totalRounds = intervalTotalRounds(minutes);
  const elapsed =
    Number.isFinite(elapsedSeconds) && elapsedSeconds > 0 ? elapsedSeconds : 0;

  if (elapsed >= intervalTotalSeconds(minutes)) {
    return { phase: "done", totalRounds };
  }

  const block = Math.floor(elapsed / INTERVAL_BLOCK_SECONDS);
  const withinBlock = elapsed - block * INTERVAL_BLOCK_SECONDS;

  if (withinBlock < INTERVAL_PREP_SECONDS) {
    const round = block * INTERVAL_ROUNDS_PER_BLOCK;
    return {
      phase: "prep",
      secondsLeft: Math.ceil(INTERVAL_PREP_SECONDS - withinBlock),
      nextExerciseIndex: intervalExerciseIndexForRound(round),
      round,
      totalRounds,
    };
  }

  const sinceRounds = withinBlock - INTERVAL_PREP_SECONDS;
  const roundInBlock = Math.floor(sinceRounds / TABATA_ROUND_SECONDS);
  const round = block * INTERVAL_ROUNDS_PER_BLOCK + roundInBlock;
  const withinRound = sinceRounds - roundInBlock * TABATA_ROUND_SECONDS;
  const isLastRound = round >= totalRounds - 1;
  const nextExerciseIndex = isLastRound
    ? null
    : intervalExerciseIndexForRound(round + 1);

  if (withinRound < INTERVAL_WORK_SECONDS) {
    return {
      phase: "work",
      secondsLeft: Math.ceil(INTERVAL_WORK_SECONDS - withinRound),
      exerciseIndex: intervalExerciseIndexForRound(round),
      nextExerciseIndex,
      round,
      totalRounds,
    };
  }

  return {
    phase: "rest",
    secondsLeft: Math.ceil(TABATA_ROUND_SECONDS - withinRound),
    nextExerciseIndex,
    round,
    totalRounds,
  };
}
