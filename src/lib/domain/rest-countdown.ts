import type { ExerciseType } from "@/lib/types";

export type RestCountdownBeep = {
  durationSeconds: number;
};

export type RestCountdownTogglePlan = {
  prepareAudio: boolean;
  timerAction: "start" | "cancel" | "keep";
};

// ── 휴식시간 수정 (2026-08-04) ──────────────────────────────────
//
// 운동 중에도 바꿀 수 있게 열면서, 설정값과 **이미 돌고 있는 휴식**이 함께
// 움직여야 한다 (사용자 결정). 둘이 따로 놀면 "10초 줄였다"가 두 가지 뜻이 된다.

/** 휴식 사전설정의 하한·상한과 증감 단위 */
export const MIN_REST_SECONDS = 10;
export const MAX_REST_SECONDS = 600;
export const REST_STEP_SECONDS = 10;

/** 설정값 증감 — 하한·상한에서 멈춘다 */
export function nextRestSeconds(current: number, delta: number): number {
  return Math.min(
    MAX_REST_SECONDS,
    Math.max(MIN_REST_SECONDS, current + delta),
  );
}

/**
 * 진행 중인 휴식의 종료 시각을 옮긴다.
 *
 * 줄일 때는 **최소 1초를 남긴다.** 0으로 만들면 버튼을 눌렀는데 휴식이 그냥
 * 끝나 버려서, 사용자에겐 "줄이기"가 아니라 "건너뛰기"로 보인다.
 * 늘리는 쪽은 상한을 두지 않는다 — 기존 `+30초`와 규칙을 맞춘다.
 */
export function adjustedRestEndsAtMs(input: {
  endsAtMs: number;
  deltaSeconds: number;
  nowMs: number;
}): number {
  return Math.max(
    input.nowMs + 1_000,
    input.endsAtMs + input.deltaSeconds * 1_000,
  );
}

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
