import type { BadgeMeta, EarnedBadge } from "@/lib/domain/badges";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** 배지 카탈로그 (0031). 전역 데이터라 누구나 읽는다. */
export async function getBadgeCatalog(): Promise<BadgeMeta[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("badge_definitions")
    .select(
      "badge_key, emoji, name, description, tier, metric_key, threshold, point_reward, repeatable, repeat_step, sort_order",
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
