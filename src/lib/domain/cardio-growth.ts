/** 같은 시간의 거리 / 같은 속도의 지속 시간만 비교한다. 원본 기록은 바꾸지 않는다. */
export type CardioPerformance = {
  day: string;
  completedAtMs: number;
  distanceMeters: number;
  durationSeconds: number;
};
export type CardioComparison = "distance_at_same_time" | "time_at_same_speed";
export type CardioImprovement = {
  baseline: CardioPerformance;
  current: CardioPerformance;
  comparison: CardioComparison;
  growthPct: number;
};

export function compareCardioPerformances(
  before: readonly CardioPerformance[],
  after: readonly CardioPerformance[],
): { comparable: boolean; best: CardioImprovement | null } {
  const byDuration = new Map<number, CardioPerformance>();
  const bySpeed = new Map<number, CardioPerformance>();
  for (const p of before) {
    const previousDistance = byDuration.get(p.durationSeconds);
    if (!previousDistance || p.distanceMeters > previousDistance.distanceMeters ||
      (p.distanceMeters === previousDistance.distanceMeters && p.completedAtMs < previousDistance.completedAtMs)) {
      byDuration.set(p.durationSeconds, p);
    }
    const speed = p.distanceMeters / p.durationSeconds;
    const previousTime = bySpeed.get(speed);
    if (!previousTime || p.durationSeconds > previousTime.durationSeconds ||
      (p.durationSeconds === previousTime.durationSeconds && p.completedAtMs < previousTime.completedAtMs)) {
      bySpeed.set(speed, p);
    }
  }
  let comparable = false;
  let best: CardioImprovement | null = null;
  const consider = (baseline: CardioPerformance, current: CardioPerformance,
    comparison: CardioComparison, baselineValue: number, currentValue: number) => {
    comparable = true;
    const growthPct = ((currentValue - baselineValue) / baselineValue) * 100;
    if (growthPct <= 0) return;
    if (!best || growthPct > best.growthPct ||
      (growthPct === best.growthPct && current.completedAtMs < best.current.completedAtMs)) {
      best = { baseline, current, comparison, growthPct };
    }
  };
  for (const current of after) {
    const distanceBase = byDuration.get(current.durationSeconds);
    if (distanceBase) consider(distanceBase, current, "distance_at_same_time", distanceBase.distanceMeters, current.distanceMeters);
    const timeBase = bySpeed.get(current.distanceMeters / current.durationSeconds);
    // 같은 표시 속도가 아니라 원본 거리·시간의 비율이 같아야 한다.
    if (timeBase && timeBase.distanceMeters * current.durationSeconds === current.distanceMeters * timeBase.durationSeconds) {
      consider(timeBase, current, "time_at_same_speed", timeBase.durationSeconds, current.durationSeconds);
    }
  }
  return { comparable, best };
}
