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

// 5·4·3·2초 짧은 삠 + 1초 긴 삐임 (설계 2026-07-19). 범위를 바꿀 땐 여기만 수정.
const SHORT_BEEP_FROM_SECONDS = 5;
const SHORT_BEEP_UNTIL_SECONDS = 2;
const SHORT_BEEP_DURATION_SECONDS = 0.12;
const LONG_BEEP_AT_SECONDS = 1;
const LONG_BEEP_DURATION_SECONDS = 0.35;

export function getRestCountdownBeep(
  remainingSeconds: number | null,
): RestCountdownBeep | null {
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
