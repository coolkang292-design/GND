import { dayKey, weekRange } from "./time";

/**
 * One truthful win at workout completion, computed from already loaded sessions.
 * Do not invent personal progress when history is unavailable.
 * Week starts Monday in the user's record-screen timezone.
 */
export function achievementMomentLine(input: {
  previousCompletedAts: Date[] | null;
  completedAt: Date;
  timeZone: string;
}): string | null {
  const { previousCompletedAts, completedAt, timeZone } = input;
  if (previousCompletedAts === null || !Number.isFinite(completedAt.getTime())) return null;
  const current = weekRange(completedAt, timeZone);
  const previousStart = weekRange(new Date(current.start.getTime() - 1), timeZone).start;
  const completeDays = [...previousCompletedAts.filter((date) => Number.isFinite(date.getTime())), completedAt];
  const daysBetween = (start: Date, end: Date) =>
    new Set(
      completeDays
        .filter((date) => date >= start && date < end)
        .map((date) => dayKey(date, timeZone)),
    ).size;
  const thisWeekDays = daysBetween(current.start, current.end);
  const lastWeekDays = daysBetween(previousStart, current.start);
  if (thisWeekDays === 0) return null;
  if (thisWeekDays > lastWeekDays && lastWeekDays > 0) {
    return `지난주보다 ${thisWeekDays - lastWeekDays}일 더 운동했어요.`;
  }
  if (previousCompletedAts.length === 0) return "첫 운동을 해냈어요. 여기서 시작이에요.";
  return `이번 주 ${thisWeekDays}일째, 오늘도 해냈어요.`;
}

/**
 * The feed only lists group-visible completed sessions; private sessions must not deep-link.
 * `from=complete` tells the feed to title the pinned card "방금 끝낸 내 운동" instead of the
 * notification label (`feed/page.tsx`).
 */
export function completedWorkoutFeedPath(
  sessionId: string,
  visibility: string | null | undefined,
): string | null {
  return visibility === "group"
    ? `/feed?session=${encodeURIComponent(sessionId)}&from=complete`
    : null;
}

/**
 * 챌린지 사진 인증 대기인가 (2026-10-19 사용자 결정 — 시안
 * `docs/ux/workout-complete-ux-reference-20261019.svg` STATE 01 "인증 대기").
 *
 * 사진 필수 챌린지에 이번 운동이 **보탤 몫이 있는데** 아직 사진이 없으면 대기다.
 * 보탤 몫이 없으면 사진은 챌린지와 무관하므로 대기가 아니다.
 * ⚠️ 완료 화면의 "챌린지 목표에 쌓일 몫 / 쌓였어요" 카드와 **같은 조건**이어야 한다 —
 *    카드는 "위에서 인증 사진을 올려야 반영돼요"라고 하는데 버튼은 피드로 보내면 모순이다.
 */
export function isChallengeProofPending(input: {
  photoRequired: boolean;
  photoDone: boolean;
  gains: readonly { delta: number }[];
}): boolean {
  return input.photoRequired && !input.photoDone && input.gains.some((g) => g.delta > 0);
}

/** 인증 대기 중에는 피드로 보내지 않는다 — 사진을 올리면 다시 링크가 생긴다. */
export function feedPathAfterProof(
  feedPath: string | null,
  proofPending: boolean,
): string | null {
  return proofPending ? null : feedPath;
}
