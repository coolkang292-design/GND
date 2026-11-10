/**
 * 챌린지 종합 순위의 **단일 입구** — `challenges.scoring_version`으로 v1/v2를 가른다.
 *
 * 순위를 매기는 화면(종료 결과 · 진행 중 실시간 랭킹 · 관리자 스냅샷)은 모두 여기를 지난다.
 * 화면마다 `rankParticipants`를 직접 부르면 같은 챌린지가 화면마다 다른 규칙으로 줄 서게 된다.
 *
 * ⚠️ 운동 횟수·시간은 `metricTotalsByUser`(종목별 랭킹과 같은 함수)에서 가져온다. 동점용으로
 *    따로 집계하지 않는다 — 사진 인증·삭제·기간 필터는 서버(`get_challenge_period_sessions`)가 이미 건다.
 */
import {
  metricTotalsByUser,
  minutesKnown,
  sessionsMissingMinutesByUser,
  type MetricRow,
} from "./challenge-metrics";
import { rankParticipants, type ParticipantInput, type RankedParticipant } from "./goal-score";
import {
  SCORING_VERSION_V2,
  rankParticipantsV2,
  type ParticipantInputV2,
  type RankedParticipantV2,
} from "./goal-score-v2";

/** v1 모양 그대로 + v2 상세. v1이면 `v2`는 null */
export type RankedEntry = RankedParticipant & { v2: RankedParticipantV2 | null };

export function isScoringV2(version: number | null | undefined): boolean {
  return version === SCORING_VERSION_V2;
}

export function rankForChallenge(input: {
  scoringVersion: number | null | undefined;
  inputs: readonly ParticipantInput[];
  rows: readonly MetricRow[];
  startDate: string;
  endDate: string;
  timeZone: string;
}): RankedEntry[] {
  const { scoringVersion, inputs, rows, startDate, endDate, timeZone } = input;
  if (!isScoringV2(scoringVersion)) {
    return rankParticipants([...inputs]).map((r) => ({ ...r, v2: null }));
  }

  const ids = inputs.map((p) => p.userId);
  const totals = metricTotalsByUser(rows, ids, startDate, endDate, timeZone);
  const missing = sessionsMissingMinutesByUser(rows, ids, startDate, endDate, timeZone);
  const known = minutesKnown(rows);
  const v2Inputs: ParticipantInputV2[] = inputs.map((p) => {
    const t = totals.get(p.userId);
    return {
      ...p,
      workoutSessions: t?.sessions ?? 0,
      workoutMinutes: t?.minutes ?? 0,
      // 0117 이전 응답(시간 키 없음)이거나 시간 없는 세션이 있으면 "시간을 믿을 수 없다"
      minutesComplete: known && (missing.get(p.userId) ?? 0) === 0,
    };
  });

  return rankParticipantsV2(v2Inputs).map((v) => ({
    userId: v.userId,
    rank: v.rank,
    achievement: v.breakdown.achievementRate,
    participation: v.breakdown.participationRate,
    // 표시용 `overall`은 기본 점수(소수 둘째 자리). 가산점은 `v2`에서 따로 읽는다.
    overall: v.baseScore,
    completedGoalCount: v.breakdown.completedGoalCount,
    v2: v,
  }));
}
