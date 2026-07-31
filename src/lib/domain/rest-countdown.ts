import type { ExerciseType } from "@/lib/types";

export type RestCountdownBeep = {
  durationSeconds: number;
};

export type RestCountdownTogglePlan = {
  prepareAudio: boolean;
  timerAction: "start" | "cancel" | "keep";
};

export function shouldStartRestCountdown(
  exerciseType: ExerciseType,
): boolean {
  return exerciseType === "weight" || exerciseType === "bodyweight";
}

export function getRestCountdownTogglePlan(
  exerciseType: ExerciseType,
  willDone: boolean,
): RestCountdownTogglePlan {
  if (!shouldStartRestCountdown(exerciseType)) {
    return { prepareAudio: false, timerAction: "keep" };
  }

  return willDone
    ? { prepareAudio: true, timerAction: "start" }
    : { prepareAudio: false, timerAction: "cancel" };
}

// 10초 예고 삠 + 5·4·3·2초 짧은 삠 + 1초 긴 삐임 (설계 2026-07-19, 10초 추가 2026-08-01).
// 범위를 바꿀 땐 여기만 수정.
const HEADS_UP_BEEP_AT_SECONDS = 10;
const HEADS_UP_BEEP_DURATION_SECONDS = 0.2;
const SHORT_BEEP_FROM_SECONDS = 5;
const SHORT_BEEP_UNTIL_SECONDS = 2;
const SHORT_BEEP_DURATION_SECONDS = 0.12;
const LONG_BEEP_AT_SECONDS = 1;
const LONG_BEEP_DURATION_SECONDS = 0.35;

export function getRestCountdownBeep(
  remainingSeconds: number | null,
): RestCountdownBeep | null {
  if (remainingSeconds === HEADS_UP_BEEP_AT_SECONDS) {
    return { durationSeconds: HEADS_UP_BEEP_DURATION_SECONDS };
  }

  if (
    remainingSeconds !== null &&
    remainingSeconds >= SHORT_BEEP_UNTIL_SECONDS &&
    remainingSeconds <= SHORT_BEEP_FROM_SECONDS
  ) {
    return { durationSeconds: SHORT_BEEP_DURATION_SECONDS };
  }

  if (remainingSeconds === LONG_BEEP_AT_SECONDS) {
    return { durationSeconds: LONG_BEEP_DURATION_SECONDS };
  }

  return null;
}

/**
 * 다른 앱을 쓰는 사이 휴식이 끝났을 때 복귀 시점에 낼 비프 (2026-08-01).
 *
 * 백그라운드에서는 브라우저가 타이머를 늦추므로 카운트다운이 여러 초를 건너뛰고
 * 0에 닿는다. 5·4·3·2·1 비프는 이미 지나간 뒤라 소리 없이 끝나 버린다.
 * 마지막 1초 비프를 아직 내지 않았다면 완료 시점에 긴 비프를 한 번 대신 낸다.
 */
export function getRestCompletionCatchUpBeep(
  playedFinalBeep: boolean,
): RestCountdownBeep | null {
  if (playedFinalBeep) return null;
  return { durationSeconds: LONG_BEEP_DURATION_SECONDS };
}
