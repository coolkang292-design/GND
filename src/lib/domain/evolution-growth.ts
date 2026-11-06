/**
 * 개인 운동능력 성장률 (읽기 전용 · 표시용).
 *
 * 원칙: 남과 비교하지 않는다. **자기 초기 기록 3회 vs 최근 기록 3회의 중앙값**을
 * 같은 종목끼리 비교한다. 종목별 성장률은 ±30%로 막아(한 종목이 점수를 끌어올리지
 * 못하게) 중앙값으로 합친다. 측정 가능한 종목이 2개 미만이면 `value = null`
 * ("측정 준비 중") — 0%라고 쓰지 않는다.
 *
 * 지표(종목마다 하나만 쓴다):
 *  - 중량+반복  → 추정 1RM = 중량 × (1 + 반복/30)  (하루 최고)
 *  - 시간(유지) → 하루 최장 유지 시간
 *  - 맨몸 반복  → 하루 최대 반복 수
 *  - 거리 기록은 같은 조건 비교가 어려워 이 버전에서는 제외한다.
 */
import type { ExerciseGrowth, GrowthSummary } from "./evolution";

export type GrowthSet = {
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
};

export type GrowthRecord = {
  exercise: string;
  /** 운동한 날 `YYYY-MM-DD`(KST) */
  day: string;
  sets: GrowthSet[];
};

export const GROWTH_CAP_PCT = 30;
/** 비교에 필요한 같은 종목 기록일 수 (초기 3 + 최근 3) */
export const MIN_DAYS_FOR_GROWTH = 6;
export const MIN_DAYS_FOR_BASELINE = 3;
/** 성장률로 합치려면 측정 가능한 종목이 최소 이만큼 있어야 한다 */
export const MIN_MEASURED_EXERCISES = 2;

type Kind = "w" | "t" | "r";

type Best = { weight: number | null; reps: number | null; seconds: number | null };

function dayMetric(
  sets: GrowthSet[],
): { kind: Kind; value: number; best: Best } | null {
  let e1 = 0;
  let dur = 0;
  let reps = 0;
  let bestW: Best = { weight: null, reps: null, seconds: null };
  let bestT: Best = { weight: null, reps: null, seconds: null };
  let bestR: Best = { weight: null, reps: null, seconds: null };
  for (const s of sets) {
    const w = s.weight_kg ?? 0;
    const r = s.reps ?? 0;
    const d = s.duration_seconds ?? 0;
    if (w > 0 && r > 0) {
      const v = w * (1 + r / 30);
      if (v > e1) {
        e1 = v;
        bestW = { weight: w, reps: r, seconds: null };
      }
    } else if (d > 0 && r <= 0) {
      if (d > dur) {
        dur = d;
        bestT = { weight: null, reps: null, seconds: d };
      }
    } else if (r > 0) {
      if (r > reps) {
        reps = r;
        bestR = { weight: null, reps: r, seconds: null };
      }
    }
  }
  if (e1 > 0) return { kind: "w", value: e1, best: bestW };
  if (dur > 0) return { kind: "t", value: dur, best: bestT };
  if (reps > 0) return { kind: "r", value: reps, best: bestR };
  return null;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function computeGrowth(records: GrowthRecord[]): GrowthSummary {
  // 종목+지표 종류 → 날짜 → 하루 값(같은 날 여러 번이면 최고)
  type Day = { value: number; best: Best };
  const byExercise = new Map<
    string,
    { name: string; kind: Kind; days: Map<string, Day> }
  >();
  for (const rec of records) {
    const m = dayMetric(rec.sets);
    if (!m) continue;
    const name = rec.exercise.trim();
    const key = `${name}::${m.kind}`;
    const entry = byExercise.get(key) ?? { name, kind: m.kind, days: new Map() };
    const prev = entry.days.get(rec.day);
    if (!prev || m.value > prev.value) entry.days.set(rec.day, { value: m.value, best: m.best });
    byExercise.set(key, entry);
  }

  let baselineCount = 0;
  const growths: number[] = [];
  const exercises: ExerciseGrowth[] = [];
  for (const { name, kind, days } of byExercise.values()) {
    if (days.size >= MIN_DAYS_FOR_BASELINE) baselineCount += 1;
    else continue;
    const ordered = [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const base = median(ordered.slice(0, 3).map((e) => e[1].value));
    const recent = median(ordered.slice(-3).map((e) => e[1].value));
    let growthPct: number | null = null;
    if (days.size >= MIN_DAYS_FOR_GROWTH && base > 0) {
      growthPct = ((recent - base) / base) * 100;
      growths.push(Math.max(-GROWTH_CAP_PCT, Math.min(GROWTH_CAP_PCT, growthPct)));
    }
    // "지금 내 수준" = 최근 3번 중 **가운데 기록**의 대표 세트. 성장률 계산에 쓰는 바로 그
    // 기록이라 지침(몇 kg 몇 번)이 숫자와 맞는다. 마지막 날을 쓰면 가벼운 날 기록이
    // 잡혀 목표와의 차이가 부풀려진다.
    const lastThree = ordered.slice(-3).sort((x, y) => x[1].value - y[1].value);
    const typical = lastThree[Math.floor(lastThree.length / 2)][1].best;
    exercises.push({
      exercise: name,
      kind,
      dayCount: days.size,
      base,
      recent,
      growthPct,
      last: typical,
    });
  }

  return {
    exercises,
    measuredCount: growths.length,
    baselineCount,
    value: growths.length >= MIN_MEASURED_EXERCISES ? median(growths) : null,
  };
}
