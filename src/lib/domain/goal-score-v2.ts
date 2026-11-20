/**
 * GND 랭킹 v2 (`challenges.scoring_version = 2`) — 기본 점수 우선 + 동점자에게만 가산점.
 *
 * 순서가 전부다:
 *   ① 기본 점수(v1 `scoreParticipant`의 overall, 0.01점 단위)로 먼저 가른다.
 *   ② 기본 점수가 **같은 사람끼리만** 동점 그룹을 만든다. 혼자인 사람은 가산점 0.
 *   ③ 그룹 안에서 (운동한 날 수 → 운동 횟수 → 운동 시간) 순으로 **사전식** 비교한다.
 *      꾸준함을 먼저 본다(사용자 결정 2026-11-16). 설정 목표 수는 이미 완료 보너스로 점수에 들어가
 *      있어 동점 기준에서 뺐다. 순서를 바꾸면 `TIE_BREAK_RULE_TEXT`·`challenge-rules-copy.ts`도 같이.
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

/**
 * 동점 순서를 사람 말로 — `compareTieBreakMetrics`와 **같은 순서**다. 화면 안내(우승 안내 등)가
 * 이 상수를 읽는다. 순서를 바꾸면 비교 함수와 이 문구를 같이 바꾼다(테스트가 묶는다).
 */
export const TIE_BREAK_RULE_TEXT = "운동한 날 수 → 운동 횟수 → 운동 시간";

/**
 * 활동 점수 환산 비율 (사용자 결정 2026-11-16): **1일 = 1점 · 1회 = 1점 · 60분 = 1점**.
 *
 * 총점 = 기본 점수(목표 달성 + 참여율 + 완료 보너스, 만점에서 멈춘다) + 활동 점수(계속 오른다).
 * 목표를 다 채운 뒤에도 운동할수록 점수가 오르게 하려는 장치다. 목표와 무관한 **실제 운동량**이라
 * 목표를 낮게 거는 이득이 없다.
 *
 * ⚠️ 비율을 바꾸면 화면 문구(`challenge-rules-copy.ts`의 `ACTIVITY_RULE_TEXT`)도 이 상수에서 읽어 따라온다.
 * ⚠️ 운동한 날은 참여율(20%)에도 들어 있다. 이중 반영이지만 의도다(꾸준함을 두 번 보상).
 */
export const ACTIVITY_POINT_PER_DAY = 1;
export const ACTIVITY_POINT_PER_SESSION = 1;
export const ACTIVITY_MINUTES_PER_POINT = 60;

/** 화면용 환산 비율 한 줄 — 상수에서 만든다(비율을 바꾸면 문구가 따라온다) */
export const ACTIVITY_RULE_TEXT = `운동한 날 1일에 ${ACTIVITY_POINT_PER_DAY}점 · 운동 1회에 ${ACTIVITY_POINT_PER_SESSION}점 · 운동 ${ACTIVITY_MINUTES_PER_POINT}분에 1점`;

export type ActivityPoints = {
  /** 점수(점, 소수 둘째 자리) */
  days: number;
  sessions: number;
  minutes: number;
  total: number;
  /** 합계(센트, 정수) — 순위 비교는 이 값으로 한다 */
  cents: number;
};

const nonNegative = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** 운동한 날·횟수·시간 → 활동 점수. 비교는 정수(센트)로 한다 */
export function calculateActivityPoints(a: { days: number; sessions: number; minutes: number }): ActivityPoints {
  const daysCents = Math.round(nonNegative(a.days) * ACTIVITY_POINT_PER_DAY * 100);
  const sessionsCents = Math.round(nonNegative(a.sessions) * ACTIVITY_POINT_PER_SESSION * 100);
  const minutesCents = toCents(nonNegative(a.minutes) / ACTIVITY_MINUTES_PER_POINT);
  const cents = daysCents + sessionsCents + minutesCents;
  return {
    days: daysCents / 100,
    sessions: sessionsCents / 100,
    minutes: minutesCents / 100,
    total: cents / 100,
    cents,
  };
}

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
  | "days" // 운동한 날 수로 갈림
  | "sessions" // 운동 횟수로 갈림
  | "minutes" // 운동 시간으로 갈림
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
  /** 기본 점수(센트) — 목표 달성 + 참여율 + 완료 보너스. 만점에서 멈춘다 */
  baseScoreCents: number;
  /** 활동 점수 — 운동한 날·횟수·시간 환산 */
  activity: ActivityPoints;
  /** 총점(센트) = 기본 + 활동. 순위는 이 값으로 정해진다 */
  totalScoreCents: number;
  configuredGoalCount: number;
  /** 챌린지 기간에 운동한 날 수 — 계획일을 넘긴 날도 센다(참여율과 달리 100%에서 막지 않는다) */
  workoutDays: number;
  /**
   * 계획한 운동일 수 — 참여 점수의 분모 (2026-11-20). 화면이 "실제 17일 / 계획 13일"을 말하려면
   * 필요하다. 참여율(`participationRate`)은 100%에서 멈추므로 거기서 거꾸로 계산하면 17일이 13일로 보인다.
   */
  plannedDays: number;
  workoutMinutes: number;
  workoutSessions: number;
  minutesComplete: boolean;
  goals: GoalContributionV2[];
};

export type RankedParticipantV2 = {
  userId: string;
  rank: number;
  /** 기본 점수(점, 소수 둘째 자리) — 목표 달성 + 참여율 + 완료 보너스 */
  baseScore: number;
  /** 활동 점수(점) — 운동한 날·횟수·시간 환산 */
  activityScore: number;
  /** 총점(점, 소수 둘째 자리) = 기본 + 활동. 순위의 기준 */
  totalScore: number;
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
  const activity = calculateActivityPoints({
    days: p.workoutDays,
    sessions: p.workoutSessions,
    minutes: p.workoutMinutes,
  });
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
    activity,
    totalScoreCents: baseScoreCents + activity.cents,
    configuredGoalCount: getConfiguredGoalCount(p.goals),
    workoutDays: p.workoutDays,
    plannedDays: p.plannedDays,
    workoutMinutes: p.workoutMinutes,
    workoutSessions: p.workoutSessions,
    minutesComplete: p.minutesComplete,
    goals,
  };
}

/** 동점 그룹 안의 비교 키. 시간은 그룹에 누락이 있으면 비교에서 뺀다 */
type Metrics = { days: number; sessions: number; minutes: number };
const EPS = 1e-9;

/** 운동한 날 수 → 운동 횟수 → 운동 시간 (`TIE_BREAK_RULE_TEXT`와 같은 순서). 음수 = a가 앞 */
export function compareTieBreakMetrics(a: Metrics, b: Metrics, useMinutes: boolean): number {
  if (a.days !== b.days) return b.days - a.days;
  if (a.sessions !== b.sessions) return b.sessions - a.sessions;
  if (useMinutes && Math.abs(a.minutes - b.minutes) > EPS) return b.minutes - a.minutes;
  return 0;
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
  if (differs((m) => m.days)) return "days";
  if (differs((m) => m.sessions)) return "sessions";
  if (useMinutes && differs((m) => m.minutes)) return "minutes";
  return "all_equal";
}

export function rankParticipantsV2(list: readonly ParticipantInputV2[]): RankedParticipantV2[] {
  const items = list.map((p) => {
    const breakdown = buildScoreBreakdown(p);
    return { userId: p.userId, breakdown };
  });

  const groups = new Map<number, typeof items>();
  for (const it of items) {
    // 총점(기본 + 활동)이 같은 사람끼리만 동점 그룹이다
    const g = groups.get(it.breakdown.totalScoreCents) ?? [];
    g.push(it);
    groups.set(it.breakdown.totalScoreCents, g);
  }

  const out: RankedParticipantV2[] = [];
  for (const [cents, members] of groups) {
    const metrics = (m: (typeof items)[number]): Metrics => ({
      days: m.breakdown.workoutDays,
      sessions: m.breakdown.workoutSessions,
      minutes: m.breakdown.workoutMinutes,
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
        baseScore: m.breakdown.baseScoreCents / 100,
        activityScore: m.breakdown.activity.total,
        totalScore: cents / 100,
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
export function formatScoreV2(r: Pick<RankedParticipantV2, "totalScore" | "tieBonusUnits" | "finalScore">): string {
  return r.tieBonusUnits > 0 ? r.finalScore.toFixed(6) : r.totalScore.toFixed(2);
}

/** 순위표 한 줄 꼬리표 — 동점 그룹에 있을 때만 (없으면 null) */
export function tieKindLabel(r: Pick<RankedParticipantV2, "tieBreak">): string | null {
  switch (r.tieBreak.kind) {
    case "days":
      return "운동한 날 수 우선으로 결정";
    case "sessions":
      return "운동 횟수 우선으로 결정";
    case "minutes":
      return "운동 시간 우선으로 결정";
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
    case "days":
      return `동점 판정: 운동한 날 ${b.workoutDays}일로 앞섰어요`;
    case "sessions":
      return `동점 판정: 운동 ${b.workoutSessions}회로 앞섰어요`;
    case "minutes":
      return `동점 판정: 운동 ${Math.round(b.workoutMinutes)}분으로 앞섰어요`;
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
  const base = `총점은 ${me.totalScore.toFixed(2)}점으로 같았어요.`;
  const title = "동점이었지만, 여기서 승부가 갈렸어요";
  const list = (f: (r: RankedParticipantV2) => string) =>
    group.map((r) => `${nameOf(r.userId)} ${f(r)}`).join(", ");
  const winners = group.filter((r) => r.rank === Math.min(...group.map((g) => g.rank)));
  const winnerSubject = subjectOf(winners.map((r) => nameOf(r.userId)));
  switch (me.tieBreak.kind) {
    case "days":
      return {
        title,
        lines: [
          base,
          `운동한 날은 ${list((r) => `${r.breakdown.workoutDays}일`)}이에요.`,
          `더 꾸준히 운동한 ${winnerSubject} 동점 판정에서 앞섰어요.`,
        ],
      };
    case "sessions":
      return {
        title,
        lines: [
          base,
          "운동한 날 수는 같았어요.",
          `운동 횟수는 ${list((r) => `${r.breakdown.workoutSessions}회`)}예요.`,
          `운동을 더 많이 완료한 ${winnerSubject} 앞섰어요.`,
        ],
      };
    case "minutes":
      return {
        title,
        lines: [
          base,
          "운동한 날 수와 운동 횟수는 같았어요.",
          `운동 시간은 ${list((r) => `${Math.round(r.breakdown.workoutMinutes)}분`)}이에요.`,
          `더 오래 운동한 ${winnerSubject} 앞섰어요.`,
        ],
      };
    case "all_equal":
      return {
        title,
        lines: [
          "총점부터 운동한 날 수, 운동 횟수, 운동 시간까지 모두 같아요.",
          ...(me.tieBreak.minutesSkipped
            ? ["일부 운동 시간 기록을 확인할 수 없어 운동 시간은 비교하지 못했어요."]
            : []),
          `공동 ${me.rank}위예요.`,
        ],
      };
  }
}

export { COMPLETED_GOAL_BONUS_MAX };
