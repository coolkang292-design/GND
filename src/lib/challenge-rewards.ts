/**
 * 결과 화면 레벨·보상 칸 재료 — 본인 XP·포인트·배지 장부 (2026-10-07).
 *
 * RLS가 본인 행만 준다(`*_own_select` 정책 — 0020·0022·0031, `getRecentXpTransactions`·
 * `getMyBadges`와 같은 전제). 남의 보상은 보지 않는다.
 * 시작 하루 전부터 **지금까지** 받는다 — 종료 뒤에 쌓인 XP를 빼야 종료 시점 레벨이 나온다.
 * 기간 판정(사용자 시간대)은 `periodRewards`가 한다.
 */
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LedgerRow } from "@/lib/domain/challenge-report";
import { addDaysToDateKey } from "@/lib/domain/workout-plan";

export type MyRewardLedgers = {
  currentTotalXp: number;
  xpRows: LedgerRow[];
  pointRows: LedgerRow[];
  badgeEarnedAts: string[];
};

type RawLedger = { amount: number; transaction_type: string; created_at: string };

const toLedger = (r: RawLedger): LedgerRow => ({
  amount: r.amount,
  transactionType: r.transaction_type,
  createdAt: r.created_at,
});

export async function getMyRewardLedgers(startDate: string): Promise<MyRewardLedgers> {
  const supabase = getSupabaseBrowserClient();
  const since = `${addDaysToDateKey(startDate, -1)}T00:00:00Z`;
  const [progress, xp, pt, badges] = await Promise.all([
    supabase.from("user_progress").select("total_xp").maybeSingle(),
    supabase
      .from("xp_transactions")
      .select("amount, transaction_type, created_at")
      .gte("created_at", since),
    supabase
      .from("point_transactions")
      .select("amount, transaction_type, created_at")
      .gte("created_at", since),
    supabase.from("user_badges").select("earned_at").gte("earned_at", since),
  ]);
  if (progress.error) throw progress.error;
  if (xp.error) throw xp.error;
  if (pt.error) throw pt.error;
  if (badges.error) throw badges.error;
  return {
    currentTotalXp: progress.data?.total_xp ?? 0, // 행 없음 = 신규(0 XP), getProgressSummary와 같다
    xpRows: ((xp.data ?? []) as RawLedger[]).map(toLedger),
    pointRows: ((pt.data ?? []) as RawLedger[]).map(toLedger),
    badgeEarnedAts: (badges.data ?? []).map((b) => String(b.earned_at)),
  };
}
