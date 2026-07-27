import type { BadgeMeta, BadgeRarity, EarnedBadge } from "@/lib/domain/badges";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** 배지 카탈로그 (0031). 전역 데이터라 누구나 읽는다. */
export async function getBadgeCatalog(): Promise<BadgeMeta[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("badge_definitions")
    .select(
      "badge_key, emoji, name, description, tier, rarity, metric_key, threshold, point_reward, repeatable, repeat_step, sort_order",
    )
    .eq("status", "active")
    .order("sort_order", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((r) => ({
    key: r.badge_key,
    emoji: r.emoji,
    name: r.name,
    description: r.description,
    tier: r.tier,
    rarity: r.rarity,
    metricKey: r.metric_key,
    threshold: Number(r.threshold),
    pointReward: r.point_reward,
    repeatable: r.repeatable,
    repeatStep: r.repeat_step === null ? null : Number(r.repeat_step),
    sortOrder: r.sort_order,
  }));
}

/** 내 획득 배지 — RLS가 본인 행만 돌려준다. 반복 배지는 여러 행으로 온다. */
export async function getMyBadges(): Promise<EarnedBadge[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("user_badges")
    .select("badge_key, period_key, earned_at")
    .order("earned_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    badgeKey: row.badge_key,
    periodKey: row.period_key,
    earnedAt: new Date(row.earned_at),
  }));
}

import type { BadgeMetricKey } from "@/lib/domain/badges";

/** 배지 진행 지표 6종 (0036 RPC). 진행바·다음 목표 계산의 원천. */
export async function getMyBadgeMetrics(): Promise<Record<BadgeMetricKey, number>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_my_badge_metrics");
  if (error) throw error;
  const m = (data ?? {}) as Record<string, number | string>;
  const num = (k: string) => Number(m[k] ?? 0);
  return {
    workout_count: num("workout_count"),
    total_minutes: num("total_minutes"),
    streak_days: num("streak_days"),
    weight_volume_kg: num("weight_volume_kg"),
    cardio_distance_m: num("cardio_distance_m"),
    record_beaten: num("record_beaten"),
  };
}
