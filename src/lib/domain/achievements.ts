import type { BadgeMeta, BadgeMetricKey, BadgeRarity, EarnedBadge } from "./badges";

export const RARITY_META: Record<
  BadgeRarity,
  { label: string; order: number }
> = {
  common: { label: "COMMON", order: 1 },
  rare: { label: "RARE", order: 2 },
  epic: { label: "EPIC", order: 3 },
  legend: { label: "LEGEND", order: 4 },
  mythic: { label: "MYTHIC", order: 5 },
};

/** 원시 지표값 → 화면 단위. 시간=정수, 톤·km=소수1, 나머지=원값. */
export function toDisplayUnit(
  metricKey: BadgeMetricKey,
  raw: number,
): { amount: number; unit: string } {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  switch (metricKey) {
    case "total_minutes":
      return { amount: Math.round(raw / 60), unit: "시간" };
    case "weight_volume_kg":
      return { amount: round1(raw / 1000), unit: "톤" };
    case "cardio_distance_m":
      return { amount: round1(raw / 1000), unit: "km" };
    case "streak_days":
      return { amount: raw, unit: "일" };
    case "workout_count":
    case "record_beaten":
    default:
      return { amount: raw, unit: "회" };
  }
}

export type Achievement = {
  key: string;
  title: string;
  description: string;
  emoji: string;
  metricKey: BadgeMetricKey;
  rarity: BadgeRarity;
  rewardPoint: number;
  repeatable: boolean;
  currentValue: number;
  targetValue: number;
  progress: number; // 0..1
  remainingValue: number;
  unlocked: boolean;
  count: number; // 반복 획득 횟수
};

function nextRepeatTarget(current: number, step: number): number {
  return (Math.floor(current / step) + 1) * step;
}

/** 카탈로그 + 획득 + 현재 지표 → 퀘스트 모델. sortOrder 순. */
export function buildAchievements(
  catalog: BadgeMeta[],
  earned: EarnedBadge[],
  metrics: Record<BadgeMetricKey, number>,
): Achievement[] {
  const earnedByKey = new Map<string, EarnedBadge[]>();
  for (const e of earned) {
    const list = earnedByKey.get(e.badgeKey) ?? [];
    list.push(e);
    earnedByKey.set(e.badgeKey, list);
  }

  return [...catalog]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => {
      const rows = earnedByKey.get(m.key) ?? [];
      const current = metrics[m.metricKey] ?? 0;
      const target =
        m.repeatable && m.repeatStep
          ? nextRepeatTarget(current, m.repeatStep)
          : m.threshold;
      const remaining = Math.max(0, target - current);
      const progress = target <= 0 ? 0 : Math.min(1, current / target);
      return {
        key: m.key,
        title: m.name,
        description: m.description,
        emoji: m.emoji,
        metricKey: m.metricKey,
        rarity: m.rarity,
        rewardPoint: m.pointReward,
        repeatable: m.repeatable,
        currentValue: current,
        targetValue: target,
        progress,
        remainingValue: remaining,
        unlocked: rows.length > 0,
        count: rows.length,
      };
    });
}
