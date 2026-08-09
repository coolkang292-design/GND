/**
 * 배지 도메인 (설계 2026-07-27).
 *
 * 카탈로그는 **DB(`badge_definitions`)가 단일 원천**이다. 여기는 표시 계산만 한다.
 * 예전에는 카탈로그가 이 파일의 상수(3종)였으나, 30종으로 늘리면서 데이터로 뺐다.
 * 배지를 추가하는 일이 seed 한 줄이어야 하기 때문이다.
 */
export type BadgeTier = "bronze" | "silver" | "gold" | "legend";

export type BadgeRarity = "common" | "rare" | "epic" | "legend" | "mythic";

export type BadgeMetricKey =
  | "workout_count"
  | "total_minutes"
  | "streak_days"
  | "weight_volume_kg"
  | "cardio_distance_m"
  | "record_beaten";

export type BadgeMeta = {
  key: string;
  emoji: string;
  name: string;
  description: string;
  tier: BadgeTier;
  rarity: BadgeRarity;
  metricKey: BadgeMetricKey;
  /** 임계값. 시간=분, 볼륨=kg, 거리=m, 나머지=회/일 */
  threshold: number;
  pointReward: number;
  repeatable: boolean;
  repeatStep: number | null;
  sortOrder: number;
};

/** DB에서 읽어온 획득 배지. 반복 배지는 같은 key가 여러 행으로 온다. */
export type EarnedBadge = {
  badgeKey: string;
  /** 1회성은 'lifetime', 반복형은 달성한 날(KST 'YYYY-MM-DD') */
  periodKey: string;
  earnedAt: Date;
};

/** 진열대 한 칸 — earnedAt이 null이면 미획득(잠금) */
export type BadgeShelfItem = BadgeMeta & {
  earnedAt: Date | null;
  /** 획득 횟수. 반복 배지는 2 이상이 될 수 있다. */
  count: number;
};

export function badgeShelf(
  catalog: BadgeMeta[],
  earned: EarnedBadge[],
): BadgeShelfItem[] {
  const byKey = new Map<string, EarnedBadge[]>();
  for (const b of earned) {
    const list = byKey.get(b.badgeKey) ?? [];
    list.push(b);
    byKey.set(b.badgeKey, list);
  }

  return [...catalog]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((meta) => {
      const rows = byKey.get(meta.key) ?? [];
      // 대표 획득일은 가장 최근 것 — 반복 배지에서 "마지막으로 딴 날"이 자연스럽다
      const latest = rows.reduce<Date | null>(
        (acc, r) => (acc === null || r.earnedAt > acc ? r.earnedAt : acc),
        null,
      );
      return { ...meta, earnedAt: latest, count: rows.length };
    });
}

/** 획득한 배지 **종류** 수. 반복 배지를 여러 번 따도 1로 센다. */
export function earnedBadgeCount(
  catalog: BadgeMeta[],
  earned: EarnedBadge[],
): number {
  const keys = new Set(catalog.map((m) => m.key));
  return new Set(earned.map((b) => b.badgeKey).filter((k) => keys.has(k))).size;
}

// ── 자랑할 순서 (2026-08-09) ──────────────────────────────────

/**
 * 희귀도·티어의 **서열**. `BadgeRarity`·`BadgeTier`는 문자열이라 그대로는 못 비교한다.
 *
 * ⚠️ 타입에 값을 추가하면 여기도 추가해야 한다. `Record<...>`라 빠뜨리면
 * 타입 검사에서 걸린다 — 일부러 `Partial`로 두지 않았다.
 */
export const RARITY_RANK: Record<BadgeRarity, number> = {
  mythic: 5,
  legend: 4,
  epic: 3,
  rare: 2,
  common: 1,
};

export const TIER_RANK: Record<BadgeTier, number> = {
  legend: 4,
  gold: 3,
  silver: 2,
  bronze: 1,
};

export type BadgeShowcaseInput = {
  rarity: BadgeRarity;
  tier: BadgeTier;
  /** 이 배지를 딴 시각 — 등급이 같을 때의 마지막 기준 */
  earnedAt: Date;
};

/**
 * 홈 친구 목록에 **몇 장만 보여줄 때 무엇을 앞에 둘지** (2026-08-09 사용자 지시
 * "홈의 친구 항목에서 배지 퀄리티 좋은거 먼저 보여주기").
 *
 * 예전에는 `earnedAt` 최신순으로 앞 3장을 잘랐다. 그래서 방금 딴 `first_workout`
 * 같은 흔한 배지가 오래전에 딴 `legend`를 밀어냈다 — 자랑하려고 만든 자리인데
 * 자랑할 것이 안 보였다.
 *
 * 희귀도 → 티어 → 최신. **3단이라 완전 순서**다. 앞 둘만 쓰면 동급끼리 순서가
 * 안 정해져 재조회마다 다른 3장이 뜬다.
 */
export function compareBadgeShowcase(
  a: BadgeShowcaseInput,
  b: BadgeShowcaseInput,
): number {
  const rarity = RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity];
  if (rarity !== 0) return rarity;
  const tier = TIER_RANK[b.tier] - TIER_RANK[a.tier];
  if (tier !== 0) return tier;
  return b.earnedAt.getTime() - a.earnedAt.getTime();
}

export type BadgeGroup = {
  metricKey: BadgeMetricKey;
  items: BadgeShelfItem[];
};

/** 지표별 묶음. 배지 전체 화면이 섹션으로 나눠 그릴 때 쓴다. */
export function groupByMetric(shelf: BadgeShelfItem[]): BadgeGroup[] {
  const groups: BadgeGroup[] = [];
  for (const item of shelf) {
    const g = groups.find((x) => x.metricKey === item.metricKey);
    if (g) g.items.push(item);
    else groups.push({ metricKey: item.metricKey, items: [item] });
  }
  return groups;
}
