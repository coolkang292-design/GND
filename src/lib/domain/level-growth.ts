/**
 * '내 성장' v2.1 — 레벨 진입 기준선 대비 성장률 (순수 계산 · 읽기 전용).
 *
 * 원칙: **현재 레벨에 들어오기 직전의 나**와 비교한다.
 *   기준선 = 레벨 진입 전 60일 안, 같은 종목 최근 3개 운동일의 중앙값 (진입 후 고정)
 *   현재   = 현재 레벨에서 같은 종목 최근 3개 운동일의 중앙값
 *   성장률 = (현재 - 기준선) / 기준선 × 100
 *
 * 지표(종목마다 하나):
 *   w 중량+반복 → 추정 1RM = 무게 × (1 + 반복/30), 반복 1~30회 세트만
 *   r 맨몸 반복 → 하루 최대 반복 수
 *   t 시간 유지 → 하루 최장 시간(초)
 *
 * 넣지 않는 것 (0%가 아니라 "비교 불가"다):
 *   - 인터벌 블록(인터벌 세션의 sort_order 0~3). 그 `reps`는 라운드 수다 (tabata.ts)
 *   - 유산소(exercise_type = cardio). 오래 뛴 것이 세진 것은 아니다
 *   - 미완료 세트, 무게 0으로 적힌 중량 종목
 *
 * ⚠️ 이 값은 **아무것도 해금하지 않는다.** 진화는 서버가 XP로만 판정한다.
 *    성장률을 진화 조건으로 쓰게 되면 기준선 계산을 서버로 옮겨야 한다
 *    (지금은 클라이언트가 계산한 값을 freeze_level_baselines RPC가 받아 고정한다).
 */
import { isIntervalBlockIndex } from "./tabata";
import { DEFAULT_TIMEZONE, dayKey } from "./time";

/** 산식을 바꾸면 올린다 — 기준선 행의 고유키에 들어간다 */
export const METRIC_VERSION = "growth_v2.1";
export const BASELINE_WINDOW_DAYS = 60;
/** 기준선·현재값에 쓰는 운동일 수 */
export const SAMPLE_DAYS = 3;
/** 현재 레벨에서 이만큼 기록해야 확정 */
export const CONFIRM_DAYS = 3;
/** 종합 성장률을 확정하려면 확정 종목이 최소 이만큼 */
export const MIN_CONFIRMED_EXERCISES = 2;
/** 종합(중앙값)에 넣을 때만 적용하는 상·하한. 상세에는 실제 값을 보여 준다 */
export const GROWTH_CAP_PCT = 30;
export const E1RM_MIN_REPS = 1;
export const E1RM_MAX_REPS = 30;

const DAY_MS = 86_400_000;

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
