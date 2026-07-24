/** 챌린지 시간 관련 순수 함수. */

/** 오늘~종료일 남은 일수(오늘 포함). 종료일이 지났으면 0. */
export function challengeDaysLeft(
  todayKey: string,
  endDateKey: string,
): number {
  const toUtc = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const diff =
    Math.round((toUtc(endDateKey) - toUtc(todayKey)) / 86_400_000) + 1;
  return Math.max(0, diff);
}
