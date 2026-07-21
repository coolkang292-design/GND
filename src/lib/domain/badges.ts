/**
 * 배지 카탈로그 (설계 2026-07-21).
 *
 * 여기는 **표시용 메타만** 갖는다. 취득 임계값은 SQL(0020의
 * mark_record_beaten)이 단일 원천이다. 양쪽에 규칙을 두면 어긋날 때
 * 조용히 틀리기 때문이다.
 *
 * 배지를 늘릴 땐 이 배열에 한 줄 + 마이그레이션에 취득 규칙 한 줄.
 */
export type BadgeMeta = {
  key: string;
  emoji: string;
  name: string;
  description: string;
};

export const BADGE_CATALOG: readonly BadgeMeta[] = [
  {
    key: "record_beaten_1",
    emoji: "🏅",
    name: "첫 기록 갱신",
    description: "지난 기록을 처음으로 넘었어요",
  },
  {
    key: "record_beaten_5",
    emoji: "💪",
    name: "기록 갱신 5회",
    description: "기록을 5번 갱신했어요",
  },
  {
    key: "record_beaten_10",
    emoji: "🔥",
    name: "기록 갱신 10회",
    description: "기록을 10번 갱신했어요",
  },
] as const;

/** DB에서 읽어온 내 획득 배지 */
export type EarnedBadge = {
  badgeKey: string;
  earnedAt: Date;
};

/** 진열대 한 칸 — earnedAt이 null이면 미획득(잠금) */
export type BadgeShelfItem = BadgeMeta & {
  earnedAt: Date | null;
};

export function badgeShelf(earned: EarnedBadge[]): BadgeShelfItem[] {
  const earnedAtByKey = new Map(earned.map((b) => [b.badgeKey, b.earnedAt]));
  return BADGE_CATALOG.map((meta) => ({
    ...meta,
    earnedAt: earnedAtByKey.get(meta.key) ?? null,
  }));
}

export function earnedBadgeCount(earned: EarnedBadge[]): number {
  const keys = new Set(BADGE_CATALOG.map((meta) => meta.key));
  const owned = new Set(
    earned.map((badge) => badge.badgeKey).filter((key) => keys.has(key)),
  );
  return owned.size;
}
