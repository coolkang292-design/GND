import type { WorkoutXpResult } from "@/lib/workout";

/**
 * 운동 완료 후 보여줄 이벤트 큐(修正16).
 *
 * 한 화면에 모든 내용을 쏟지 않고 `xp → level_up → stage_up → reward` 순서로
 * 하나씩 넘긴다. 해당하는 것만 큐에 담기므로, XP만 받은 날은 1단계로 끝난다.
 */
export type XpEvent =
  | { type: "xp"; amount: number; breakdown: XpBreakdownLine[] }
  | { type: "level_up"; from: number; to: number }
  | { type: "stage_up"; from: number; to: number }
  | { type: "reward"; rewards: { key: string; label: string }[] }
  | { type: "point"; amount: number; multiplier: number; streakDays: number }
  | { type: "badge"; badges: { badgeKey: string; name: string; points: number }[] };

export interface XpBreakdownLine {
  label: string;
  amount: number;
}

const BREAKDOWN_LABELS: [keyof NonNullable<WorkoutXpResult["breakdown"]>, string][] = [
  ["baseXp", "운동 완료"],
  ["durationXp", "시간 보너스"],
  ["recordXp", "기록 완성"],
  ["photoXp", "인증 사진"],
  ["planXp", "계획 완료"],
];

/**
 * 결과 → 이벤트 배열. 모달을 띄우지 않아야 하면 빈 배열을 돌려준다.
 *
 * - `idempotentReplay`(중복 호출 재생)면 아무것도 보여주지 않는다.
 * - XP가 0이어도 레벨업·진화·보상이 있으면 그것만 보여준다(정상적으로는 없음).
 * - XP도 0이고 나머지도 없으면(하루 2번째 운동 등) 빈 배열 → 모달 없음.
 */
export function buildXpEvents(result: WorkoutXpResult): XpEvent[] {
  if (result.idempotentReplay) return [];

  const events: XpEvent[] = [];
  const amount = result.xpAwarded ?? 0;

  if (amount > 0) {
    const b = result.breakdown;
    events.push({
      type: "xp",
      amount,
      breakdown: b
        ? BREAKDOWN_LABELS.filter(([key]) => b[key] > 0).map(([key, label]) => ({
            label,
            amount: b[key],
          }))
        : [],
    });
  }

  const points = result.pointsAwarded ?? 0;
  if (points > 0) {
    events.push({
      type: "point",
      amount: points,
      multiplier: result.pointMultiplier ?? 1,
      streakDays: result.streakDays ?? 0,
    });
  }

  if (
    result.levelUp &&
    typeof result.previousLevel === "number" &&
    typeof result.newLevel === "number"
  ) {
    events.push({
      type: "level_up",
      from: result.previousLevel,
      to: result.newLevel,
    });
  }

  if (
    result.stageUp &&
    typeof result.previousStage === "number" &&
    typeof result.newStage === "number"
  ) {
    events.push({
      type: "stage_up",
      from: result.previousStage,
      to: result.newStage,
    });
  }

  if (result.unlockedRewards && result.unlockedRewards.length > 0) {
    events.push({ type: "reward", rewards: result.unlockedRewards });
  }

  if (result.newBadges && result.newBadges.length > 0) {
    events.push({
      type: "badge",
      badges: result.newBadges.map((b) => ({
        badgeKey: b.badgeKey,
        name: b.name,
        points: b.points,
      })),
    });
  }

  return events;
}
