import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getLevelProgress } from "@/lib/domain/progression";
import type { EarnedBadge } from "@/lib/domain/badges";

/** Asia/Seoul 기준 오늘(YYYY-MM-DD). */
function todayKst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export interface ProgressSummary {
  totalXp: number;
  currentLevel: number;
  currentStage: number;
  stageName: string;
  characterPath: string;
  nextLevelRequiredXp: number | null;
  xpToNextLevel: number;
  levelProgressPercent: number;
  streakShieldCount: number;
  hasReceivedTodayWorkoutXp: boolean;
}

/** 홈·내 정보 공용 요약. RLS로 본인 행만 조회. error는 throw, data null은 신규(0 XP). */
export async function getProgressSummary(): Promise<ProgressSummary> {
  const supabase = getSupabaseBrowserClient();
  const [{ data, error }, todayXp] = await Promise.all([
    supabase
      .from("user_progress")
      .select("total_xp, current_stage, streak_shield_count")
      .maybeSingle(),
    supabase
      .from("xp_transactions")
      .select("id", { count: "exact", head: true })
      .eq("reason", "workout_completed")
      .eq("effective_date", todayKst()),
  ]);
  if (error) throw error;
  if (todayXp.error) throw todayXp.error;

  const totalXp = data?.total_xp ?? 0; // data null = 신규 사용자
  const p = getLevelProgress(totalXp);
  return {
    totalXp,
    currentLevel: p.currentLevel,
    currentStage: p.currentStageIndex,
    stageName: p.stageName,
    characterPath: p.characterPath,
    nextLevelRequiredXp: p.nextLevelRequiredXp,
    xpToNextLevel: p.xpToNextLevel,
    levelProgressPercent: p.percent,
    streakShieldCount: data?.streak_shield_count ?? 0,
    hasReceivedTodayWorkoutXp: (todayXp.count ?? 0) > 0,
  };
}

export interface XpTransactionRow {
  id: string;
  amount: number;
  reason: string;
  metadata: Record<string, number | boolean>;
  createdAt: string;
}

/** 내 정보 XP 획득 내역 최근 20건. error는 throw. */
export async function getRecentXpTransactions(): Promise<XpTransactionRow[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("xp_transactions")
    .select("id, amount, reason, metadata, created_at")
    .eq("transaction_type", "earn")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    amount: r.amount,
    reason: r.reason,
    metadata: r.metadata as Record<string, number | boolean>,
    createdAt: r.created_at,
  }));
}

export interface LevelReward {
  level: number;
  rewardKey: string | null;
  rewardLabel: string | null;
  rewardStatus: "active" | "coming_soon" | "data_only";
}

/** 레벨별 보상 정의(라벨·상태). coming_soon은 UI에서 "준비 중" 표시. */
export async function getLevelRewards(): Promise<LevelReward[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("level_definitions")
    .select("level, reward_key, reward_label, reward_status")
    .order("level", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    level: r.level,
    rewardKey: r.reward_key,
    rewardLabel: r.reward_label,
    rewardStatus: r.reward_status,
  }));
}

/** 해금된 unlock_key 집합. error는 throw. */
export async function getMyUnlocks(): Promise<Set<string>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("user_unlocks").select("unlock_key");
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.unlock_key));
}

export interface CrewMemberProfile {
  totalXp: number;
  currentLevel: number;
  currentStage: number;
  stageName: string;
  characterPath: string;
  nextLevelRequiredXp: number | null;
  xpToNextLevel: number;
  levelProgressPercent: number;
  badges: EarnedBadge[];
}

type CrewProfileRow = {
  totalXp?: number;
  currentLevel?: number;
  currentStage?: number;
  badges?: { badgeKey: string; earnedAt: string }[];
};

/**
 * 크루원 한 명의 레벨·배지 (0026 정의자 RPC).
 * 크루가 아니면 RPC가 'not_crew'를 raise한다 — 호출부가 문구를 고른다.
 *
 * 레벨·단계는 RPC가 준 캐시값 대신 total_xp로 다시 계산한다. 내 정보 화면
 * (getProgressSummary)과 같은 함수를 써야 두 화면의 숫자가 어긋나지 않는다.
 */
export async function getCrewMemberProfile(
  targetId: string,
): Promise<CrewMemberProfile> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_crew_member_profile", {
    p_target_id: targetId,
  });
  if (error) throw error;

  const row = (data ?? {}) as CrewProfileRow;
  const totalXp = row.totalXp ?? 0;
  const p = getLevelProgress(totalXp);
  return {
    totalXp,
    currentLevel: p.currentLevel,
    currentStage: p.currentStageIndex,
    stageName: p.stageName,
    characterPath: p.characterPath,
    nextLevelRequiredXp: p.nextLevelRequiredXp,
    xpToNextLevel: p.xpToNextLevel,
    levelProgressPercent: p.percent,
    badges: (row.badges ?? []).map((b) => ({
      badgeKey: b.badgeKey,
      earnedAt: new Date(b.earnedAt),
    })),
  };
}
