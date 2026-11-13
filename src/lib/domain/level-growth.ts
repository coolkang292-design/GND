/**
 * '내 성장' v3 — 단계 진입 시점까지의 종목별 최고 기록 대비 성장 기록 (순수 계산 · 읽기 전용).
 *
 * 단계(stage) = 레벨 5개 = 캐릭터 형태 하나. 진화는 새 단계에 들어갈 때 일어난다.
 *   기준선 = 단계 진입 시각 **이하**에 같은 종목에서 낸 최고 기록 (기간 제한·최소 일수 없음)
 *   현재   = 단계 진입 시각 **이후** 같은 종목 최고 기록
 *   현재 > 기준선일 때만 성장 기록: 성장률 = (현재 - 기준선) / 기준선 × 100
 *   같거나 낮으면 기록을 만들지 않고 "변함없음"으로만 센다. 진입 전 기록이 없던 종목은 "비교 불가"다.
 *   기준선은 단계 안에서 움직이지 않는다. 다음 단계에 들어가면 그 시점 최고 기록으로 다시 잡는다.
 *
 * 종합 %는 만들지 않는다 — 오른 종목만 골라 평균 내면 부풀려지기 때문이다.
 *
 * 지표(종목마다 하나):
 *   w 중량+반복 → 추정 1RM = 무게 × (1 + 반복/30), 반복 1~30회 세트만
 *   r 맨몸 반복 → 하루 최대 반복 수
 *   t 시간 유지 → 하루 최장 시간(초)
 *
 * 넣지 않는 것:
 *   - 인터벌 블록(인터벌 세션의 sort_order 0~3). 그 `reps`는 라운드 수다 (tabata.ts)
 *   - 유산소(exercise_type = cardio). 오래 뛴 것이 세진 것은 아니다
 *   - 미완료 세트, 무게 0으로 적힌 중량 종목
 *
 * ⚠️ 이 값은 **아무것도 해금하지 않는다.** 진화는 서버가 XP로만 판정한다.
 *    `previousStageExerciseCount`는 나중에 진화 조건에 쓸 자료로 계산만 해 둔다.
 */
import { isIntervalBlockIndex } from "./tabata";
import { DEFAULT_TIMEZONE, dayKey } from "./time";

export const E1RM_MIN_REPS = 1;
export const E1RM_MAX_REPS = 30;

export type MetricKind = "w" | "r" | "t";

export type RawSet = {
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  is_completed: boolean | null;
};
export type RawExercise = {
  exercise_name: string;
  exercise_type: string | null;
  sort_order: number | null;
  workout_sets: RawSet[] | null;
};
export type RawSession = {
  completed_at: string;
  tabata_minutes: number | null;
  workout_exercises: RawExercise[] | null;
};

export type BestSet = { weight: number | null; reps: number | null; seconds: number | null };
/** 하루의 대표 수행능력 */
export type DaySample = { day: string; value: number; best: BestSet };
/** 세션 하나에서 종목 하나가 낸 지표 */
export type MetricPoint = DaySample & {
  exerciseKey: string;
  kind: MetricKind;
  completedAtMs: number;
};

/** 한 종목에 지표가 둘 이상 잡히면 이 순서로 하나만 쓴다 */
const KIND_PRIORITY: MetricKind[] = ["w", "r", "t"];

function setMetric(
  s: RawSet,
  exerciseType: string | null,
): { kind: MetricKind; value: number; best: BestSet } | null {
  if (s.is_completed === false) return null;
  if (exerciseType === "cardio") return null;
  const w = Number(s.weight_kg ?? 0);
  const r = s.reps ?? 0;
  const d = s.duration_seconds ?? 0;
  if (w > 0) {
    if (r < E1RM_MIN_REPS || r > E1RM_MAX_REPS) return null;
    return { kind: "w", value: w * (1 + r / 30), best: { weight: w, reps: r, seconds: null } };
  }
  // 무게 0으로 적힌 중량 종목(밴드 등)은 부하를 몰라 비교할 수 없다
  if (exerciseType === "weight") return null;
  if (r > 0) return { kind: "r", value: r, best: { weight: null, reps: r, seconds: null } };
  if (d > 0) return { kind: "t", value: d, best: { weight: null, reps: null, seconds: d } };
  return null;
}

export function toMetricPoints(
  sessions: readonly RawSession[],
  timeZone: string = DEFAULT_TIMEZONE,
): MetricPoint[] {
  const points: MetricPoint[] = [];
  for (const s of sessions) {
    const at = Date.parse(s.completed_at);
    if (!Number.isFinite(at)) continue;
    const day = dayKey(new Date(at), timeZone);
    for (const ex of s.workout_exercises ?? []) {
      if (isIntervalBlockIndex(s.tabata_minutes, ex.sort_order)) continue;
      const exerciseKey = ex.exercise_name.trim();
      if (!exerciseKey) continue;
      const bestByKind = new Map<MetricKind, { value: number; best: BestSet }>();
      for (const set of ex.workout_sets ?? []) {
        const m = setMetric(set, ex.exercise_type);
        if (!m) continue;
        const prev = bestByKind.get(m.kind);
        if (!prev || m.value > prev.value) bestByKind.set(m.kind, { value: m.value, best: m.best });
      }
      const kind = KIND_PRIORITY.find((k) => bestByKind.has(k));
      if (!kind) continue;
      const top = bestByKind.get(kind) as { value: number; best: BestSet };
      points.push({ exerciseKey, kind, day, completedAtMs: at, value: top.value, best: top.best });
    }
  }
  return points;
}


export type GrowthRecord = {
  exerciseKey: string;
  kind: MetricKind;
  /** 기준 수행능력(지표 값) — 반올림하지 않는다 */
  baseline: number;
  baselineDay: string;
  baselineBest: BestSet;
  current: number;
  currentDay: string;
  currentBest: BestSet;
  /** 항상 0보다 크다. 반올림하지 않은 값 */
  growthPct: number;
};

export type StageGrowth = {
  /** 기준선을 넘은 종목, 성장률 큰 순 */
  growths: GrowthRecord[];
  /** 기준선과 현재 기록이 모두 있는데 넘지 못한 종목 수 */
  unchangedCount: number;
  /** 이번 단계에서 했지만 진입 전 기록이 없어 비교할 수 없는 종목 */
  unmatched: { exerciseKey: string; kind: MetricKind }[];
  /** 기준선과 현재 기록이 모두 있는 종목 수 */
  comparableCount: number;
  /** 이전 단계 구간에서 기록한 서로 다른 종목 수. 이전 단계 진입 시각이 없으면 null */
  previousStageExerciseCount: number | null;
};

type Best = { value: number; day: string; best: BestSet };

function better(prev: Best | undefined, p: MetricPoint): Best {
  // 같은 값이면 먼저 한 날을 유지한다
  return prev && prev.value >= p.value ? prev : { value: p.value, day: p.day, best: p.best };
}

export function computeStageGrowth(input: {
  points: readonly MetricPoint[];
  /** 현재 단계 첫 레벨의 진입 시각 (ms). 이 시각과 같은 순간까지는 기준선이다 */
  stageEnteredAtMs: number;
  /** 이전 단계 첫 레벨의 진입 시각. 없으면 null */
  previousStageEnteredAtMs: number | null;
}): StageGrowth {
  const { stageEnteredAtMs: entry, previousStageEnteredAtMs: prevEntry } = input;
  const base = new Map<string, Best & { exerciseKey: string; kind: MetricKind }>();
  const cur = new Map<string, Best & { exerciseKey: string; kind: MetricKind }>();
  const prevStage = new Set<string>();

  for (const p of input.points) {
    const key = `${p.exerciseKey}::${p.kind}`;
    const target = p.completedAtMs <= entry ? base : cur;
    target.set(key, { ...better(target.get(key), p), exerciseKey: p.exerciseKey, kind: p.kind });
    if (prevEntry !== null && p.completedAtMs > prevEntry && p.completedAtMs <= entry) {
      prevStage.add(key);
    }
  }

  const growths: GrowthRecord[] = [];
  const unmatched: StageGrowth["unmatched"] = [];
  let comparableCount = 0;
  for (const [key, c] of cur) {
    const b = base.get(key);
    if (!b) {
      unmatched.push({ exerciseKey: c.exerciseKey, kind: c.kind });
      continue;
    }
    comparableCount += 1;
    if (c.value > b.value && b.value > 0) {
      growths.push({
        exerciseKey: c.exerciseKey,
        kind: c.kind,
        baseline: b.value,
        baselineDay: b.day,
        baselineBest: b.best,
        current: c.value,
        currentDay: c.day,
        currentBest: c.best,
        growthPct: ((c.value - b.value) / b.value) * 100,
      });
    }
  }
  growths.sort((a, b) => b.growthPct - a.growthPct);

  return {
    growths,
    unchangedCount: comparableCount - growths.length,
    unmatched,
    comparableCount,
    previousStageExerciseCount: prevEntry === null ? null : prevStage.size,
  };
}
