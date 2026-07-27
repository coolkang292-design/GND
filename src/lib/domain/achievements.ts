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

/**
 * 남은 수치 표시용. toDisplayUnit과 달리 **올림**한다 —
 * 잠긴 배지의 남은 값이 반올림으로 "앞으로 0시간"처럼 뭉개지면
 * "다 왔다"로 오해되기 때문. 남은 게 조금이라도 있으면 최소 단위로 보인다.
 */
export function toRemainingDisplay(
  metricKey: BadgeMetricKey,
  raw: number,
): { amount: number; unit: string } {
  const ceil1 = (n: number) => Math.ceil(n * 10) / 10;
  switch (metricKey) {
    case "total_minutes":
      return { amount: Math.ceil(raw / 60), unit: "시간" };
    case "weight_volume_kg":
      return { amount: ceil1(raw / 1000), unit: "톤" };
    case "cardio_distance_m":
      return { amount: ceil1(raw / 1000), unit: "km" };
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
      const unlocked = rows.length > 0;
      const raw = metrics[m.metricKey] ?? 0;
      const target =
        m.repeatable && m.repeatStep
          ? nextRepeatTarget(raw, m.repeatStep)
          : m.threshold;
      // 획득한 1회성 배지는 완료로 고정한다. 불꽃(streak_days)처럼 지표가
      // 내려가도 "획득했는데 3/30일(10%)" 같은 모순된 행이 안 나오게.
      const current = unlocked && !m.repeatable ? target : raw;
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
        unlocked,
        count: rows.length,
      };
    });
}

/** 다음 목표: 미획득 1회성 중 진행률 최고, 동률이면 보상 큰 쪽. 없으면 null. */
export function selectNextGoal(items: Achievement[]): Achievement | null {
  const candidates = items.filter((a) => !a.unlocked && !a.repeatable);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, a) => {
    if (a.progress !== best.progress) return a.progress > best.progress ? a : best;
    return a.rewardPoint > best.rewardPoint ? a : best;
  });
}

export type CategoryCompletion = {
  metricKey: BadgeMetricKey;
  done: number;
  total: number;
  pct: number;
};

/** 카테고리(지표)별 완료율. 등장 순서 유지. */
export function categoryCompletion(items: Achievement[]): CategoryCompletion[] {
  const out: CategoryCompletion[] = [];
  for (const a of items) {
    let c = out.find((x) => x.metricKey === a.metricKey);
    if (!c) {
      c = { metricKey: a.metricKey, done: 0, total: 0, pct: 0 };
      out.push(c);
    }
    c.total += 1;
    if (a.unlocked) c.done += 1;
  }
  for (const c of out) c.pct = c.total === 0 ? 0 : Math.round((c.done / c.total) * 100);
  return out;
}

/** 전체 완료율. */
export function overallCompletion(items: Achievement[]): {
  done: number;
  total: number;
  pct: number;
} {
  const done = items.filter((a) => a.unlocked).length;
  const total = items.length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}
