import {
  RARITY_RANK,
  TIER_RANK,
  type BadgeMetricKey,
  type BadgeMeta,
  type BadgeShelfItem,
  type EarnedBadge,
} from "@/lib/domain/badges";
import { LEVEL_DEFS } from "@/lib/domain/progression";

export const PROFILE_METRICS: readonly BadgeMetricKey[] = [
  "workout_count",
  "total_minutes",
  "streak_days",
  "weight_volume_kg",
  "cardio_distance_m",
  "record_beaten",
];

export const PROFILE_METRIC_LABEL: Record<BadgeMetricKey, string> = {
  workout_count: "운동 횟수",
  total_minutes: "누적 시간",
  streak_days: "연속 운동",
  weight_volume_kg: "운동 볼륨",
  cardio_distance_m: "이동 거리",
  record_beaten: "기록 갱신",
};

export type FeaturedBadge = {
  metricKey: BadgeMetricKey;
  badge: BadgeShelfItem | null;
};

/** 성취 종류마다 실제 획득한 최고 임계값 배지를 하나만 보여준다. */
export function selectFeaturedBadges(shelf: BadgeShelfItem[]): FeaturedBadge[] {
  return PROFILE_METRICS.map((metricKey) => {
    const owned = shelf
      .filter((badge) => badge.metricKey === metricKey && badge.earnedAt !== null)
      .sort((a, b) =>
        b.threshold - a.threshold ||
        RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] ||
        TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
        (b.earnedAt?.getTime() ?? 0) - (a.earnedAt?.getTime() ?? 0) ||
        a.key.localeCompare(b.key),
      );
    return { metricKey, badge: owned[0] ?? null };
  });
}

export function featuredBadgeCondition(badge: BadgeShelfItem): string {
  const value = badge.threshold;
  switch (badge.metricKey) {
    case "workout_count": return "운동 " + value.toLocaleString() + "회 달성";
    case "total_minutes": {
      const h = Math.floor(value / 60);
      const m = value % 60;
      return "누적 " + (h ? h + "시간" : "") + (m ? " " + m + "분" : "") + " 운동";
    }
    case "streak_days": return value.toLocaleString() + "일 연속 달성";
    case "weight_volume_kg": return "누적 " + (value / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 2 }) + "톤 볼륨";
    case "cardio_distance_m": return "누적 " + (value / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 2 }) + "km";
    case "record_beaten": return "기록 " + value.toLocaleString() + "회 갱신";
  }
}

export type AchievementEventType = "level" | "badge" | "joined";
export type AchievementEvent = {
  id: string;
  type: AchievementEventType;
  title: string;
  detail: string;
  at: Date;
  badgeKey?: string;
};

export type AchievementHistorySource = {
  joinedAt: Date | null;
  levelUps: { level: number; at: Date }[];
  badges: EarnedBadge[];
  catalog: BadgeMeta[];
};

function validDate(d: Date | null): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/** 실 DB 원장(RPC 레벨업 날짜 · 배지 원장 · 가입일)만 병합한다. 가짜 날짜를 만들지 않는다. */
export function buildAchievementHistory({
  joinedAt, levelUps, badges, catalog,
}: AchievementHistorySource): AchievementEvent[] {
  const names = new Map(catalog.map((b) => [b.key, b.name]));
  const events: AchievementEvent[] = [];

  for (const row of levelUps) {
    if (!validDate(row.at) || row.level < 2 || row.level > LEVEL_DEFS.length) continue;
    events.push({
      id: "level-" + row.level,
      type: "level",
      title: "Lv." + row.level + " 달성",
      detail: "레벨업 · " + LEVEL_DEFS[row.level - 1].stageName,
      at: row.at,
    });
  }
  for (const row of badges) {
    if (!validDate(row.earnedAt)) continue;
    events.push({
      id: "badge-" + row.badgeKey + "-" + row.periodKey,
      type: "badge",
      title: names.get(row.badgeKey) ?? "배지 획득",
      detail: "배지 획득",
      at: row.earnedAt,
      badgeKey: row.badgeKey,
    });
  }
  if (validDate(joinedAt)) {
    events.push({
      id: "joined",
      type: "joined",
      title: "GND 시작",
      detail: "가입 · GND와 함께한 첫날",
      at: joinedAt,
    });
  }

  const rank: Record<AchievementEventType, number> = { level: 0, badge: 1, joined: 2 };
  return events.sort(
    (a, b) => b.at.getTime() - a.at.getTime() ||
      rank[a.type] - rank[b.type] ||
      a.id.localeCompare(b.id),
  );
}

export function achievementKstDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const read = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return read("year") + "-" + read("month") + "-" + read("day");
}
