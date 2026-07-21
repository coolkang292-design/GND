import type { EarnedBadge } from "@/lib/domain/badges";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** 내 획득 배지 (0020) — RLS가 본인 행만 돌려준다 */
export async function getMyBadges(): Promise<EarnedBadge[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("user_badges")
    .select("badge_key, earned_at")
    .order("earned_at", { ascending: true });
  if (error) throw error;

  type Row = { badge_key: string; earned_at: string };

  return ((data ?? []) as Row[]).map((row) => ({
    badgeKey: row.badge_key,
    earnedAt: new Date(row.earned_at),
  }));
}
