import type { BadgeMetricKey, BadgeRarity } from "./badges";

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
