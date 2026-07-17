/**
 * 다중·이종 목표 공정 랭킹 (§7 goal-score.ts — TDD 핵심).
 * kg·km·회를 전부 '내 목표 대비 %'로 정규화하고, 합이 아닌 평균으로
 * 개수 중립을 지키며, 각 목표 100% 상한으로 어뷰징을 억제한다.
 * overall = achievement×0.8 + participation×0.2.
 */

export type GoalType =
  | "weight_reps" // 웨이트 완료세트 총 반복
  | "weight_days" // 웨이트 운동일 (하루 N부위+)
  | "cardio_distance" // 유산소 거리 km
  | "cardio_time" // 유산소 지속 분
  | "bodyweight_reps" // 맨몸 횟수형 총 반복
  | "bodyweight_time" // 맨몸 시간형 지속 분
  | "bodyweight_days" // 맨몸 운동일 (하루 N종목+)
  | "volume"; // 레거시(웨이트 총볼륨) — 표시 전용

export type ScoredGoal = {
  type: GoalType;
  target: number;
  actual: number;
};

/** rate = 실적/목표. 목표 0 이하는 0 (0 나눗셈 방지) */
export function goalRate(target: number, actual: number): number {
  if (target <= 0) return 0;
  return actual / target;
}

/** 목표들의 % '평균' (합 아님), 각 목표 min(rate,1)×100 상한 */
export function achievementScore(goals: ScoredGoal[]): number {
  if (goals.length === 0) return 0;
  const sum = goals.reduce(
    (acc, g) => acc + Math.min(goalRate(g.target, g.actual), 1) * 100,
    0,
  );
  return sum / goals.length;
}

/** participation = min(실제 운동일/계획일, 1)×100 */
export function participationScore(
  workoutDays: number,
  plannedDays: number,
): number {
  if (plannedDays <= 0) return 0;
  return Math.min(workoutDays / plannedDays, 1) * 100;
}

export function overallScore(
  achievement: number,
  participation: number,
): number {
  return achievement * 0.8 + participation * 0.2;
}

/** 주 N일 계획 → 기간 전체 계획일 수 (반올림, 최소 1) */
export function plannedDaysForPeriod(
  weeklyDays: number,
  periodDays: number,
): number {
  return Math.max(1, Math.round((weeklyDays * periodDays) / 7));
}

export type ParticipantInput = {
  userId: string;
  goals: ScoredGoal[];
  workoutDays: number;
  plannedDays: number;
  /** 모든 목표를 처음 100% 달성한 순간(ms) — 동점 3차. 미달성이면 null */
  allGoalsCompletedAtMs?: number | null;
};

export type RankedParticipant = {
  userId: string;
  rank: number; // 완전 동점은 공동 순위, 다음 순위는 건너뜀
  achievement: number;
  participation: number;
  overall: number;
  completedGoalCount: number; // 100% 이상 달성한 목표 수
};

const EPSILON = 1e-9;

/**
 * 종합점수 내림차순 + 동점 규칙 (§7):
 * ① 평균 달성률 ② 참여율 ③ 먼저 전 목표 달성한 시각 ④ 완료 목표 수 ⑤ 공동
 */
export function rankParticipants(
  list: ParticipantInput[],
): RankedParticipant[] {
  const scored = list.map((p) => {
    const achievement = achievementScore(p.goals);
    const participation = participationScore(p.workoutDays, p.plannedDays);
    return {
      userId: p.userId,
      achievement,
      participation,
      overall: overallScore(achievement, participation),
      completedGoalCount: p.goals.filter(
        (g) => goalRate(g.target, g.actual) >= 1 - EPSILON,
      ).length,
      allGoalsCompletedAtMs: p.allGoalsCompletedAtMs ?? null,
    };
  });

  // 비교 사슬: 앞 기준이 사실상 같을 때만 다음 기준으로
  const compare = (a: (typeof scored)[number], b: (typeof scored)[number]) => {
    if (Math.abs(b.overall - a.overall) > EPSILON) return b.overall - a.overall;
    if (Math.abs(b.achievement - a.achievement) > EPSILON) {
      return b.achievement - a.achievement;
    }
    if (Math.abs(b.participation - a.participation) > EPSILON) {
      return b.participation - a.participation;
    }
    if (a.allGoalsCompletedAtMs !== b.allGoalsCompletedAtMs) {
      if (a.allGoalsCompletedAtMs === null) return 1; // 미달성은 뒤로
      if (b.allGoalsCompletedAtMs === null) return -1;
      return a.allGoalsCompletedAtMs - b.allGoalsCompletedAtMs; // 빠른 쪽 우선
    }
    return b.completedGoalCount - a.completedGoalCount;
  };

  const sorted = [...scored].sort(compare);

  return sorted.map((p, i) => {
    // 바로 앞과 완전 동점이면 같은 순위(공동), 아니면 위치+1
    const rank =
      i > 0 && compare(sorted[i - 1], p) === 0
        ? ((): number => {
            // 앞선 공동 그룹의 시작 순위를 찾는다
            let j = i;
            while (j > 0 && compare(sorted[j - 1], sorted[j]) === 0) j--;
            return j + 1;
          })()
        : i + 1;
    return {
      userId: p.userId,
      rank,
      achievement: p.achievement,
      participation: p.participation,
      overall: p.overall,
      completedGoalCount: p.completedGoalCount,
    };
  });
}

/** 시상대 등급 카피 (표시 전용, §6·§20) */
export function gndLabel(rank: number, total: number): string {
  if (rank === 1) return "GND 탈출!";
  if (total >= 2 && rank === total) return "GND 확정";
  return "GND 탈출중";
}
