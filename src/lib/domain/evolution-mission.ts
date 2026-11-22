/**
 * 진화 미션 — 챌린지가 없는 날, 기록 화면에서 "다음 진화까지 무엇을 얼마나 해야 하는지"를
 * 말해 주고 오늘 할 운동을 제안한다 (사용자 지시 2026-11-22).
 *
 * I/O 없음. **판정(met·state)은 서버 값을 그대로 쓴다** — 여기서는 서버가 준 상태와
 * 내 기준선(`stage_growth_baselines`, 진화 순간 고정된 종목별 최고 기록)으로
 * (1) 아직 못 채운 조건 목록과 (2) "벤치프레스 60kg×8 → 62.5kg×8" 같은 오늘의 목표를 만든다.
 *
 * ⚠️ 성장은 "과거의 나"와의 비교다. 목표 무게·횟수는 기준선 기록에서 계산한다.
 *    남의 평균이나 절대 기준을 쓰지 않는다.
 *
 * ⚠️ 서버 점수는 상위 N개 종목의 성장률 **평균**(부족분 0)이다. 그래서 N개 종목이 각각
 *    목표 평균%만큼 오르면 정확히 목표를 채운다 — 그 값을 종목별 목표로 쓴다.
 */
import type { StageGateStatus } from "./evolution-gate";
import { buildEvolutionCardModel, type CardRow } from "./evolution-card-model";
import type { BestSet, MetricKind } from "./level-growth";
import { getStageGroups } from "./progression";

/** 기준선 테이블 한 행(`stage_growth_baselines`)을 화면용으로 읽은 것 */
export type BaselineEntry = {
  exerciseKey: string;
  kind: MetricKind;
  points: { value: number; day: string; completedAtMs: number; best: BestSet }[];
};

/** 오늘 목록에 담을 세트 목표 — 담는 쪽(기록 화면)이 `LocalSet`으로 바꾼다 */
export type MissionSetTarget = {
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceKm: number | null;
};

export type MissionExercise = {
  exerciseKey: string;
  kind: MetricKind;
  /** 지금 기준 (진화 때 고정된 내 최고 기록) */
  fromText: string;
  /** 오늘 넘을 목표 */
  toText: string;
  /** 기준 기록을 세트 값으로 (워밍업 세트용) */
  from: MissionSetTarget;
  /** 이 종목에 걸린 목표 성장률(%) */
  goalPct: number;
  target: MissionSetTarget;
};

export type EvolutionMission = {
  nextStage: number;
  nextStageName: string;
  headline: string;
  /** 아직 못 채운 조건 (서버 판정 기준, 쉬운 말 힌트 포함) */
  rows: CardRow[];
  /** 오늘 할 운동 제안 — 비어 있을 수 있다(기준선 없음 · 이미 채움) */
  exercises: MissionExercise[];
  /** 성장 조건이 요구하는 종목 수 / 이미 채운 수 (모르면 null) */
  growthRequired: number | null;
  growthFilled: number;
  /** 성장 조건이 요구하는 평균 성장률(%) (모르면 null) */
  goalPct: number | null;
  /** 오늘 운동을 마치면 진화 판정이 도는 상태인가 */
  ready: boolean;
};

const MAX_TODAY = 3;

const r1 = (n: number) => Number(n.toFixed(1));
const fmtKg = (kg: number) => (Number.isInteger(kg) ? String(kg) : kg.toFixed(1));
/** 2.5kg·1.25kg 원판을 쓰므로 0.5kg 단위로 올림 */
const ceilHalf = (kg: number) => Math.ceil(kg * 2 - 1e-9) / 2;
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

function dayNumber(todayKey: string): number {
  const [y, m, d] = todayKey.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** 한 종목의 기준 기록(가장 높은 지표)을 고른다. 유산소는 가장 최근 수행을 기준으로 한다 */
function bestPoint(entry: BaselineEntry) {
  if (entry.points.length === 0) return null;
  if (entry.kind === "c") {
    return [...entry.points].sort((a, b) => b.completedAtMs - a.completedAtMs)[0];
  }
  return [...entry.points].sort((a, b) => b.value - a.value || a.completedAtMs - b.completedAtMs)[0];
}

/**
 * 한 종목의 오늘 목표. 기준 기록에서 `goalPct`% 넘는 지점을 계산한다.
 * 못 만들면(기록 값이 비었다) `null` — 화면에 억지 숫자를 내지 않는다.
 */
export function buildExerciseTarget(entry: BaselineEntry, goalPct: number): MissionExercise | null {
  const p = bestPoint(entry);
  if (!p || !(goalPct > 0)) return null;
  const b = p.best;
  const mult = 1 + goalPct / 100;
  const base = { exerciseKey: entry.exerciseKey, kind: entry.kind, goalPct: r1(goalPct) };

  if (entry.kind === "w") {
    const w = b.weight, r = b.reps;
    if (!isNum(w) || !isNum(r) || w <= 0 || r <= 0) return null;
    const goalValue = p.value * mult;
    // 같은 횟수로 더 무겁게 — 목표 값을 넘는 가장 가벼운 0.5kg 단위
    let toW = ceilHalf(goalValue / (1 + r / 30));
    if (toW <= w) toW = w + 0.5;
    return {
      ...base,
      fromText: `${fmtKg(w)}kg ${r}번`,
      toText: `${fmtKg(toW)}kg ${r}번`,
      from: { weightKg: w, reps: r, durationSec: null, distanceKm: null },
      target: { weightKg: toW, reps: r, durationSec: null, distanceKm: null },
    };
  }
  if (entry.kind === "r") {
    const r = b.reps;
    if (!isNum(r) || r <= 0) return null;
    const to = Math.max(r + 1, Math.ceil(p.value * mult));
    return { ...base, fromText: `${r}번`, toText: `${to}번`, from: { weightKg: null, reps: r, durationSec: null, distanceKm: null }, target: { weightKg: null, reps: to, durationSec: null, distanceKm: null } };
  }
  if (entry.kind === "t") {
    const s = b.seconds;
    if (!isNum(s) || s <= 0) return null;
    const to = Math.max(s + 1, Math.ceil(p.value * mult));
    return { ...base, fromText: `${s}초`, toText: `${to}초`, from: { weightKg: null, reps: null, durationSec: s, distanceKm: null }, target: { weightKg: null, reps: null, durationSec: to, distanceKm: null } };
  }
  // 유산소 — 같은 시간에 더 멀리
  const sec = b.seconds, dist = b.distanceMeters;
  if (!isNum(sec) || !isNum(dist) || sec <= 0 || dist <= 0) return null;
  const toKm = Math.ceil((dist * mult) / 10) / 100; // 10m 단위 올림 → km
  const min = Math.round(sec / 60);
  return {
    ...base,
    fromText: `${min}분 ${r1(dist / 1000)}km`,
    toText: `${min}분 ${toKm}km`,
    from: { weightKg: null, reps: null, durationSec: sec, distanceKm: r1(dist / 1000) },
    target: { weightKg: null, reps: null, durationSec: sec, distanceKm: toKm },
  };
}

/**
 * 오늘 제안할 종목 고르기 — 이미 목표 성장률을 넘긴 종목은 뺀다. 목표에 가장 가까운(이미
 * 조금이라도 오른) 종목을 먼저, 그다음은 최근에 한 종목 순. 같은 날에는 같은 결과이고
 * 날이 바뀌면 다음 종목으로 돌아간다(매일 같은 것만 권하면 나머지는 영영 안 오른다).
 */
function pickToday(
  status: StageGateStatus,
  baselines: BaselineEntry[],
  goalPct: number,
  todayKey: string,
): MissionExercise[] {
  const growthByKey = new Map<string, number>();
  for (const g of status.growthSummary?.growths ?? []) {
    growthByKey.set(`${g.exerciseKey}|${g.kind}`, g.growthPct);
  }
  type Cand = { entry: BaselineEntry; pct: number; recent: number };
  const cands: Cand[] = [];
  for (const entry of baselines) {
    const pct = growthByKey.get(`${entry.exerciseKey}|${entry.kind}`) ?? 0;
    if (pct >= goalPct) continue; // 이미 채운 종목
    const p = bestPoint(entry);
    if (!p) continue;
    cands.push({ entry, pct, recent: p.completedAtMs });
  }
  cands.sort(
    (a, b) => b.pct - a.pct || b.recent - a.recent || a.entry.exerciseKey.localeCompare(b.entry.exerciseKey),
  );
  if (cands.length === 0) return [];

  const pages = Math.ceil(cands.length / MAX_TODAY);
  const start = (dayNumber(todayKey) % pages) * MAX_TODAY;
  const out: MissionExercise[] = [];
  for (const c of cands.slice(start).concat(cands.slice(0, start))) {
    if (out.length >= MAX_TODAY) break;
    const ex = buildExerciseTarget(c.entry, goalPct);
    if (ex) out.push(ex);
  }
  return out;
}

/**
 * 서버 상태 + 내 기준선 → 오늘의 진화 미션.
 * 보여 줄 것이 없으면(`max_stage`·`error`) `null`이다 — 거짓 숫자를 만들지 않는다.
 */
export function buildEvolutionMission(input: {
  status: StageGateStatus;
  baselines: BaselineEntry[];
  /** 오늘 `YYYY-MM-DD` (Asia/Seoul) */
  todayKey: string;
}): EvolutionMission | null {
  const { status, baselines, todayKey } = input;
  if (status.state === "max_stage" || status.state === "error" || status.nextStage === null) return null;

  const nextStage = status.nextStage;
  const nextStageName = getStageGroups()[nextStage - 1]?.stageName ?? `${nextStage}단계`;
  const model = buildEvolutionCardModel(status);

  const avgCond = status.conditions.find((c) => c.key === "growth_average");
  const goalPct = avgCond && isNum(avgCond.required) ? avgCond.required : null;
  const ready = status.state === "eligible";

  // 성장 조건이 이미 채워졌거나 서버가 아직 기준을 못 줬으면 종목 제안은 하지 않는다
  const growthMet = status.conditions.filter((c) => c.key.startsWith("growth_")).every((c) => c.met);
  const exercises =
    !ready && goalPct !== null && !growthMet && status.state !== "needs_baseline"
      ? pickToday(status, baselines, goalPct, todayKey)
      : [];

  const headline = ready
    ? `${nextStageName} 진화 조건을 모두 채웠어요`
    : status.state === "needs_baseline"
      ? `${nextStageName}까지 · 성장 비교 기준을 모으는 중이에요`
      : `${nextStageName}까지 조건 ${model.total}개 중 ${model.metCount}개 채웠어요`;

  return {
    nextStage,
    nextStageName,
    headline,
    rows: model.rows,
    exercises,
    growthRequired: status.requiredGrowthCount,
    growthFilled: status.filledGrowthCount,
    goalPct,
    ready,
  };
}
