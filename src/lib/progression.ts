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

/**
 * 내 정보 XP 획득 내역 최근 20건. error는 throw.
 *
 * 회수(reverse)만 뺀다. 정정 거래(admin_adjustment)는 보여줘야 한다 —
 * 안 보이면 누적 XP만 조용히 늘어나 사용자가 이유를 알 수 없다.
 */
export async function getRecentXpTransactions(): Promise<XpTransactionRow[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("xp_transactions")
    .select("id, amount, reason, metadata, created_at")
    .neq("transaction_type", "reverse")
    .gt("amount", 0)
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
  /**
   * 0081부터. **0080 이전 서버에서는 전부 비어 있다** — 마이그레이션을 Run 하기
   * 전에 배포돼도 화면이 안 깨지도록 옵셔널이 아니라 **빈 값**으로 채운다.
   * (`joinedAt: null` · `levelUps: []` · 누적 0)
   */
  joinedAt: Date | null;
  levelUps: { level: number; at: Date }[];
  workoutCount: number;
  totalMinutes: number;
  workoutDays: number;
  distanceMeters: number;
  /**
   * 0085부터. 0084 이전 서버에서는 **없다** — 마이그레이션 Run 전에 배포돼도
   * 화면이 안 깨지도록 `null`로 채운다 (`joinedAt`과 같은 규약).
   */
  bio: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
}

type CrewProfileRow = {
  totalXp?: number;
  currentLevel?: number;
  currentStage?: number;
  badges?: { badgeKey: string; periodKey: string; earnedAt: string }[];
  // 0081
  joinedAt?: string | null;
  levelUps?: { level: number; at: string }[];
  workoutCount?: number;
  totalMinutes?: number;
  workoutDays?: number;
  /** numeric은 supabase-js가 문자열로 줄 수 있다 — Number()로 통과시킨다 */
  distanceMeters?: number | string;
  // 0085
  bio?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
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
      periodKey: b.periodKey,
      earnedAt: new Date(b.earnedAt),
    })),
    // ⚠️ 0081 이전 서버는 이 키들을 안 준다. `?? 기본값`을 떼지 마라 —
    //    마이그레이션 Run 전에 배포되면 시트가 NaN·Invalid Date를 그린다.
    joinedAt: row.joinedAt ? new Date(row.joinedAt) : null,
    levelUps: (row.levelUps ?? []).map((l) => ({
      level: l.level,
      at: new Date(l.at),
    })),
    workoutCount: row.workoutCount ?? 0,
    totalMinutes: row.totalMinutes ?? 0,
    workoutDays: row.workoutDays ?? 0,
    distanceMeters: Number(row.distanceMeters ?? 0),
    // ⚠️ 0085 이전 서버는 이 키들을 안 준다. `?? null`을 떼지 마라.
    bio: row.bio ?? null,
    instagramUrl: row.instagramUrl ?? null,
    youtubeUrl: row.youtubeUrl ?? null,
  };
}
