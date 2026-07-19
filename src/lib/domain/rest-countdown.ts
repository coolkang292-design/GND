export type RestCountdownBeep = {
  durationSeconds: number;
};

export function getRestCountdownBeep(
  remainingSeconds: number | null,
): RestCountdownBeep | null {
  if (remainingSeconds === 3 || remainingSeconds === 2) {
    return { durationSeconds: 0.12 };
  }

  if (remainingSeconds === 1) {
    return { durationSeconds: 0.35 };
  }

  return null;
}
