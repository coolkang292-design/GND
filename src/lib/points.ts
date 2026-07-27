import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export interface Wallet {
  balance: number;
  lifetimeEarned: number;
}

/** 내 지갑 (0031). 행이 없으면 0 P인 신규 사용자. */
export async function getMyWallet(): Promise<Wallet> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("user_wallet")
    .select("balance, lifetime_earned")
    .maybeSingle();
  if (error) throw error;
  return {
    balance: data?.balance ?? 0,
    lifetimeEarned: data?.lifetime_earned ?? 0,
  };
}

export interface PointTransactionRow {
  id: string;
  amount: number;
  reason: string;
  multiplier: number | null;
  createdAt: string;
}

/** 최근 포인트 내역 20건. 회수(refund)만 빼고 보여준다. */
export async function getRecentPointTransactions(): Promise<PointTransactionRow[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("point_transactions")
    .select("id, amount, reason, multiplier, created_at")
    .neq("transaction_type", "refund")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    amount: r.amount,
    reason: r.reason,
    multiplier: r.multiplier === null ? null : Number(r.multiplier),
    createdAt: r.created_at,
  }));
}
