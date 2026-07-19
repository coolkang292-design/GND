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

export function getRestCountdownBeep(
  remainingSeconds: number | null,
): RestCountdownBeep | null {
  if (
    remainingSeconds !== null &&
    remainingSeconds >= 2 &&
    remainingSeconds <= 5
  ) {
    return { durationSeconds: 0.12 };
  }

  if (remainingSeconds === 1) {
    return { durationSeconds: 0.35 };
  }

  return null;
}
