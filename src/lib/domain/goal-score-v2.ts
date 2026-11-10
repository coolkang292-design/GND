/**
 * GND 랭킹 v2 (`challenges.scoring_version = 2`) — 기본 점수 우선 + 동점자에게만 가산점.
 *
 * 순서가 전부다:
 *   ① 기본 점수(v1 `scoreParticipant`의 overall, 0.01점 단위)로 먼저 가른다.
 *   ② 기본 점수가 **같은 사람끼리만** 동점 그룹을 만든다. 혼자인 사람은 가산점 0.
 *   ③ 그룹 안에서 (설정 목표 수 → 운동 시간 → 운동 횟수) 순으로 **사전식** 비교한다.
 *   ④ 가산점은 0 이상 0.009 이하라서 0.01점의 기본 점수 차이를 절대 뒤집지 못한다.
 *
 * ⚠️ v1 `goal-score.ts`는 한 줄도 건드리지 않는다. 기본 점수는 `scoreParticipant`를 그대로 부른다 —
 *    점수 조립을 여기서 다시 하면 화면마다 숫자가 갈린다(goal-score.ts 주석 참조).
 * ⚠️ 모든 비교는 **정수**(마이크로점 · 센트 · 단위)로 한다. 부동소수 오차로 95.25 vs 95.2500001이
 *    다른 순위가 되는 걸 막는다.
 */
import {
  COMPLETED_GOAL_BONUS_MAX,
  completedGoalBonus,
  scoreParticipant,
  type GoalType,
  type ParticipantInput,
  type ScoredGoal,
} from "./goal-score";

/** 가산점 최대치(단위: 1e-6점). 0.01점 = 10,000단위보다 작아야 기본 점수 차이를 못 뒤집는다 */
export const TIE_BONUS_MAX_UNITS = 9000;
/** 센트 → 단위 환산 (1센트 = 0.01점 = 10,000단위) */
export const UNITS_PER_CENT = 10000;
export const UNITS_PER_POINT = 1_000_000;
export const SCORING_VERSION_V2 = 2;

export type ParticipantInputV2 = ParticipantInput & {
  /** 인증 완료 운동 세션 수 (`metricTotalsByUser`의 sessions) */
  workoutSessions: number;
  /** 인증 완료 운동 시간 합(분) (`metricTotalsByUser`의 minutes) */
  workoutMinutes: number;
  /** 모든 완료 세션에 시간 기록이 있나 — 하나라도 비면 false */
  minutesComplete: boolean;
};

/**
 * 동점용 설정 목표 수 — 목표 **종류**를 중복 없이 센다.
 * `cardio_days`는 유산소 칸에 딸려 오는 줄이라 뺀다(점수 평균에는 계속 들어간다).
 */
export function getConfiguredGoalCount(goals: readonly { type: GoalType }[]): number {
  return new Set(goals.map((g) => g.type).filter((t) => t !== "cardio_days")).size;
}

/** 반올림 전 점수 → 소수 둘째 자리 정수(센트). 마이크로점으로 먼저 굳혀 .5 경계의 부동소수 오차를 없앤다 */
export function toCents(raw: number): number {
  const micro = Math.round(raw * 1e6);
  return Math.floor((micro + 5000) / 10000);
}

/** 합이 total과 정확히 같도록 센트를 나눈다(최대 잔여분 배분) — 항목별 반올림 합이 0.01 어긋나는 걸 막는다 */
export function allocateCents(parts: readonly number[], totalCents: number): number[] {
  const floors = parts.map((p) => Math.floor(p * 100 + 1e-7));
  let rest = totalCents - floors.reduce((a, b) => a + b, 0);
  const order = parts
    .map((p, i) => ({ i, frac: p * 100 - Math.floor(p * 100 + 1e-7) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = [...floors];
  for (let k = 0; rest > 0 && order.length > 0; k = (k + 1) % order.length, rest--) out[order[k].i] += 1;
  return out;
}

export type GoalContributionV2 = {
  type: GoalType;
  target: number;
  actual: number;
  /** 0~1 (100% 상한) */
  rate: number;
  /** 종합 점수 기여분(점) = min(rate,1)×100 ÷ 목표 수 × 0.8 — 반올림하지 않은 값 */
  points: number;
  completed: boolean;
  /** 유산소 칸에 딸려 온 줄 — 설정 목표 수에는 안 센다 */
  auto: boolean;
};

export type TieBreakKind =
  | "none" // 동점 아님
  | "goals" // 설정 목표 수로 갈림
  | "minutes" // 운동 시간으로 갈림
  | "sessions" // 운동 횟수로 갈림
  | "all_equal"; // 전부 같다 → 공동

export type TieBreakInfo = {
  kind: TieBreakKind;
  /** 시간 기록이 비어 시간 비교를 건너뛰고 횟수로 넘어갔다 */
  minutesSkipped: boolean;
  /** 같은 동점 그룹 사람 */
  groupUserIds: string[];
};

export type ScoreBreakdown = {
  ruleVersion: 2;
  achievementRate: number; // 0~100
  achievementPoints: number; // 센트 배분 후 (점)
  participationRate: number; // 0~100
  participationPoints: number;
  completedGoalCount: number;
  completionBonus: number;
  baseScoreRaw: number;
  baseScoreCents: number;
  configuredGoalCount: number;
  workoutMinutes: number;
  workoutSessions: number;
  minutesComplete: boolean;
  goals: GoalContributionV2[];
};

export type RankedParticipantV2 = {
  userId: string;
  rank: number;
  /** 기본 점수(점, 소수 둘째 자리) */
  baseScore: number;
  tieGroupSize: number;
  tieBonusUnits: number;
  finalScoreUnits: number;
  /** 표시용 최종 점수(점) — 순위는 이 값이 아니라 정수 단위로 정해졌다 */
  finalScore: number;
  tieBreak: TieBreakInfo;
  breakdown: ScoreBreakdown;
};

export function buildScoreBreakdown(p: ParticipantInputV2): ScoreBreakdown {
  const s = scoreParticipant(p);
  const baseScoreCents = toCents(s.overall);
  const achievementPart = s.achievement * 0.8;
  const participationPart = s.participation * 0.2;
  const bonus = completedGoalBonus(s.completedGoalCount);
  const [a, pa, b] = allocateCents([achievementPart, participationPart, bonus], baseScoreCents);
  const n = p.goals.length;
  const goals: GoalContributionV2[] = p.goals.map((g: ScoredGoal) => {
    const rate = g.target > 0 ? Math.min(g.actual / g.target, 1) : 0;
    return {
      type: g.type,
      target: g.target,
      actual: g.actual,
      rate,
      points: n > 0 ? ((rate * 100) / n) * 0.8 : 0,
      completed: g.target > 0 && g.actual / g.target >= 1 - 1e-9,
      auto: g.type === "cardio_days",
    };
  });
  return {
    ruleVersion: 2,
    achievementRate: s.achievement,
    achievementPoints: a / 100,
    participationRate: s.participation,
    participationPoints: pa / 100,
    completedGoalCount: s.completedGoalCount,
    completionBonus: b / 100,
    baseScoreRaw: s.overall,
    baseScoreCents,
    configuredGoalCount: getConfiguredGoalCount(p.goals),
    workoutMinutes: p.workoutMinutes,
    workoutSessions: p.workoutSessions,
    minutesComplete: p.minutesComplete,
    goals,
  };
}

/** 동점 그룹 안의 비교 키. 시간은 그룹에 누락이 있으면 비교에서 뺀다 */
type Metrics = { goals: number; minutes: number; sessions: number };
const EPS = 1e-9;

export function compareTieBreakMetrics(a: Metrics, b: Metrics, useMinutes: boolean): number {
  if (a.goals !== b.goals) return b.goals - a.goals;
  if (useMinutes && Math.abs(a.minutes - b.minutes) > EPS) return b.minutes - a.minutes;
  return b.sessions - a.sessions;
}

/** 등급 수 K, 0부터 시작하는 등급 인덱스 i → 가산점 단위. K=1이면 0 */
export function calculateTieBonusUnits(levelCount: number, levelIndex: number): number {
  if (levelCount <= 1) return 0;
  return Math.round((TIE_BONUS_MAX_UNITS * (levelCount - 1 - levelIndex)) / (levelCount - 1));
}

/** 그룹에서 처음으로 값이 갈리는 기준 */
function decidingKind(ms: Metrics[], useMinutes: boolean): TieBreakKind {
  const differs = (f: (m: Metrics) => number) =>
    ms.some((m) => Math.abs(f(m) - f(ms[0])) > EPS);
  if (differs((m) => m.goals)) return "goals";
  if (useMinutes && differs((m) => m.minutes)) return "minutes";
  if (differs((m) => m.sessions)) return "sessions";
  return "all_equal";
}

export function rankParticipantsV2(list: readonly ParticipantInputV2[]): RankedParticipantV2[] {
  const items = list.map((p) => {
    const breakdown = buildScoreBreakdown(p);
    return { userId: p.userId, breakdown };
  });

  const groups = new Map<number, typeof items>();
  for (const it of items) {
    const g = groups.get(it.breakdown.baseScoreCents) ?? [];
    g.push(it);
    groups.set(it.breakdown.baseScoreCents, g);
  }

  const out: RankedParticipantV2[] = [];
  for (const [cents, members] of groups) {
    const metrics = (m: (typeof items)[number]): Metrics => ({
      goals: m.breakdown.configuredGoalCount,
      minutes: m.breakdown.workoutMinutes,
      sessions: m.breakdown.workoutSessions,
    });
    const tied = members.length >= 2;
    // 그룹 중 한 명이라도 시간 기록이 비면 아무도 시간으로 비교하지 않는다 — 불완전한 쪽이 억울하지 않게
    const useMinutes = members.every((m) => m.breakdown.minutesComplete);
    const sorted = [...members].sort(
      (a, b) =>
        compareTieBreakMetrics(metrics(a), metrics(b), useMinutes) || a.userId.localeCompare(b.userId),
    );
    // 등급: 비교가 0인 사람끼리 같은 등급
    const levelOf = new Map<string, number>();
    let level = 0;
    sorted.forEach((m, i) => {
      if (i > 0 && compareTieBreakMetrics(metrics(sorted[i - 1]), metrics(m), useMinutes) !== 0) level++;
      levelOf.set(m.userId, level);
    });
    const levelCount = level + 1;
    const kind: TieBreakKind = tied ? decidingKind(sorted.map(metrics), useMinutes) : "none";
    const info: TieBreakInfo = {
      kind,
      minutesSkipped: tied && !useMinutes,
      groupUserIds: sorted.map((m) => m.userId),
    };
    for (const m of sorted) {
      const tieBonusUnits = tied ? calculateTieBonusUnits(levelCount, levelOf.get(m.userId)!) : 0;
      const finalScoreUnits = cents * UNITS_PER_CENT + tieBonusUnits;
      out.push({
        userId: m.userId,
        rank: 0,
        baseScore: cents / 100,
        tieGroupSize: members.length,
        tieBonusUnits,
        finalScoreUnits,
        finalScore: finalScoreUnits / UNITS_PER_POINT,
        tieBreak: info,
        breakdown: m.breakdown,
      });
    }
  }

  out.sort((a, b) => b.finalScoreUnits - a.finalScoreUnits || a.userId.localeCompare(b.userId));
  let prevRank = 0;
  out.forEach((r, i) => {
    r.rank = i > 0 && out[i - 1].finalScoreUnits === r.finalScoreUnits ? prevRank : i + 1;
    prevRank = r.rank;
  });
  return out;
}

/** 순위표 한 줄 — 값 → 소수 둘째(일반) / 여섯째(가산점이 있는 동점자) 자리 */
export function formatScoreV2(r: Pick<RankedParticipantV2, "baseScore" | "tieBonusUnits" | "finalScore">): string {
  return r.tieBonusUnits > 0 ? r.finalScore.toFixed(6) : r.baseScore.toFixed(2);
}

/** 순위표 한 줄 꼬리표 — 동점 그룹에 있을 때만 (없으면 null) */
export function tieKindLabel(r: Pick<RankedParticipantV2, "tieBreak">): string | null {
  switch (r.tieBreak.kind) {
    case "goals":
      return "목표 수 우선으로 결정";
    case "minutes":
      return "운동 시간 우선으로 결정";
    case "sessions":
      return "운동 횟수 우선으로 결정";
    case "all_equal":
      return "모든 기준이 같아 공동 순위";
    default:
      return null;
  }
}

/**
 * 공유 문구 한 줄 — 동점 가산점을 **받은** 사람(=동점에서 앞선 쪽)만. 결정적이었던 기준 하나만 쓴다.
 * 내 숫자만 쓴다(다른 참가자의 상세 기록은 공유 문구에 넣지 않는다).
 */
export function tieBreakShareLine(r: RankedParticipantV2): string | null {
  if (r.tieBonusUnits <= 0) return null;
  const b = r.breakdown;
  switch (r.tieBreak.kind) {
    case "goals":
      return `동점 판정: 목표 ${b.configuredGoalCount}개 설정으로 앞섰어요`;
    case "minutes":
      return `동점 판정: 운동 ${Math.round(b.workoutMinutes)}분으로 앞섰어요`;
    case "sessions":
      return `동점 판정: 운동 ${b.workoutSessions}회로 앞섰어요`;
    default:
      return null;
  }
}

/** 주격 조사 — "나"는 "내가", 받침 있으면 "이", 없으면 "가". 여러 명이면 마지막 이름 기준 */
export function subjectOf(names: readonly string[]): string {
  const joined = names.join("·");
  const last = names[names.length - 1] ?? "";
  if (names.length === 1 && last === "나") return "내가";
  const code = last.charCodeAt(last.length - 1);
  const hangul = code >= 0xac00 && code <= 0xd7a3;
  const hasFinal = hangul ? (code - 0xac00) % 28 !== 0 : false;
  return `${joined}${hasFinal ? "이" : "가"}`;
}

export type TieBreakExplanation = {
  title: string;
  lines: string[];
};

/**
 * 동점 설명 — 화면이 문구를 직접 짓지 않는다. 수치는 모두 `breakdown`에서 온다.
 * 동점이 아니면 null (카드를 숨긴다). `nameOf`는 "나"/닉네임을 돌려준다.
 */
export function buildTieBreakExplanation(
  me: RankedParticipantV2,
  all: readonly RankedParticipantV2[],
  nameOf: (userId: string) => string,
): TieBreakExplanation | null {
  if (me.tieBreak.kind === "none") return null;
  const group = me.tieBreak.groupUserIds
    .map((id) => all.find((r) => r.userId === id))
    .filter((r): r is RankedParticipantV2 => r !== undefined);
  const base = `기본 점수는 ${me.baseScore.toFixed(2)}점으로 같았어요.`;
  const title = "동점이었지만, 여기서 승부가 갈렸어요";
  const list = (f: (r: RankedParticipantV2) => string) =>
    group.map((r) => `${nameOf(r.userId)} ${f(r)}`).join(", ");
  const skipped = me.tieBreak.minutesSkipped
    ? ["일부 운동 시간 기록을 확인할 수 없어, 다음 기준인 운동 횟수로 순위를 결정했어요."]
    : [];
  const winners = group.filter((r) => r.rank === Math.min(...group.map((g) => g.rank)));
  const winnerSubject = subjectOf(winners.map((r) => nameOf(r.userId)));
  switch (me.tieBreak.kind) {
    case "goals":
      return {
        title,
        lines: [
          base,
          `설정한 목표는 ${list((r) => `${r.breakdown.configuredGoalCount}개`)}예요.`,
          `더 많은 목표에 도전한 ${winnerSubject} 동점 판정에서 앞섰어요.`,
        ],
      };
    case "minutes":
      return {
        title,
        lines: [
          base,
          "설정한 목표 수는 같았어요.",
          `운동 시간은 ${list((r) => `${Math.round(r.breakdown.workoutMinutes)}분`)}이에요.`,
          `더 오래 운동한 ${winnerSubject} 앞섰어요.`,
        ],
      };
    case "sessions":
      return {
        title,
        lines: [
          base,
          ...skipped,
          me.tieBreak.minutesSkipped ? "설정한 목표 수는 같았어요." : "목표 수와 운동 시간까지 같았어요.",
          `운동 횟수는 ${list((r) => `${r.breakdown.workoutSessions}회`)}예요.`,
          `운동을 더 많이 완료한 ${winnerSubject} 앞섰어요.`,
        ],
      };
    case "all_equal":
      return {
        title,
        lines: [
          "기본 점수부터 목표 수, 운동 시간, 운동 횟수까지 모두 같아요.",
          `공동 ${me.rank}위예요.`,
        ],
      };
  }
}

export { COMPLETED_GOAL_BONUS_MAX };
