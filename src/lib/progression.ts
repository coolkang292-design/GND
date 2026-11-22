import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getStageGroups, resolveLevelProgress } from "@/lib/domain/progression";
import type { EarnedBadge } from "@/lib/domain/badges";
import {
  characterSrc,
  getCharacterVariants,
  getMyCharacterVariant,
  normalizeCharacterVariant,
  type CharacterVariant,
} from "@/lib/character-variant";

/** Asia/Seoul 기준 오늘(YYYY-MM-DD). */
function todayKst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function actualStage(index: number) {
  const stage = getStageGroups()[index - 1];
  if (!stage || stage.stageIndex !== index) throw new Error("invalid progression stage");
  return stage;
}

export interface ProgressSummary {
  totalXp: number;
  currentLevel: number;
  currentStage: number;
  stageName: string;
  /** `character_variant`이 반영된 최종 경로 (female이면 /characters/female/…) */
  characterPath: string;
  characterVariant: CharacterVariant;
  nextLevelRequiredXp: number | null;
  xpToNextLevel: number;
  levelProgressPercent: number;
  /**
   * 단계 경험치를 다 채워 레벨이 단계 마지막 레벨에서 멈춘 상태 (단계별 경험치 방식, 2026-11-22).
   * 진화 조건을 채워야 다음 레벨로 간다 — 화면은 "최고 레벨"이 아니라 진화 안내를 말한다.
   */
  levelCapped?: boolean;
  streakShieldCount: number;
  hasReceivedTodayWorkoutXp: boolean;
}

async function getMyVariantSafe(): Promise<CharacterVariant> {
  try {
    return normalizeCharacterVariant(await getMyCharacterVariant());
  } catch {
    return "male";
  }
}

/** 홈·내 정보 공용 요약. RLS로 본인 행만 조회. error는 throw, data null은 신규(0 XP). */
export async function getProgressSummary(): Promise<ProgressSummary> {
  const supabase = getSupabaseBrowserClient();
  const [{ data, error }, todayXp, variant] = await Promise.all([
    supabase
      .from("user_progress")
      .select("total_xp, current_stage, stage_xp, streak_shield_count")
      .maybeSingle(),
    supabase
      .from("xp_transactions")
      .select("id", { count: "exact", head: true })
      .eq("reason", "workout_completed")
      .eq("effective_date", todayKst()),
    getMyVariantSafe(),
  ]);
  if (error) throw error;
  if (todayXp.error) throw todayXp.error;

  const totalXp = data?.total_xp ?? 0; // data null = 신규 사용자
  // 서버 `stage_xp`가 null이면 지금처럼 누적 경험치로, 있으면 단계 안 경험치로 레벨을 정한다
  const p = resolveLevelProgress({
    totalXp,
    stage: data?.current_stage ?? null,
    stageXp: data?.stage_xp ?? null,
  });
  const stage = actualStage(data?.current_stage ?? p.currentStageIndex);
  return {
    totalXp,
    currentLevel: p.currentLevel,
    currentStage: stage.stageIndex,
    stageName: stage.stageName,
    characterPath: characterSrc(stage.characterPath, variant),
    characterVariant: variant,
    nextLevelRequiredXp: p.nextLevelRequiredXp,
    xpToNextLevel: p.xpToNextLevel,
    levelProgressPercent: p.percent,
    levelCapped: p.capped === true,
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
  /** 이 사람의 캐릭터 외형 — 프로필 얼굴 아바타 경로를 고른다 */
  characterVariant: CharacterVariant;
  nextLevelRequiredXp: number | null;
  xpToNextLevel: number;
  levelProgressPercent: number;
  /** 단계 경험치를 다 채워 레벨이 멈춘 상태 (서버가 `stageXp`를 줄 때만 true가 될 수 있다) */
  levelCapped?: boolean;
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
  /** 단계별 경험치 방식부터. 없으면(`undefined`/`null`) 옛 방식(누적 경험치)으로 그린다 */
  stageXp?: number | null;
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
 * 레벨은 XP로 계산하고 캐릭터 단계는 서버의 실제 단계를 따른다.
 * 단계가 진화 대기 중이면 XP만으로 이미 진화한 모습을 표시하지 않는다.
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
  const variant = (await getCharacterVariants([targetId])).get(targetId) ?? "male";
  const totalXp = row.totalXp ?? 0;
  const p = resolveLevelProgress({
    totalXp,
    stage: row.currentStage ?? null,
    stageXp: row.stageXp ?? null,
  });
  const stage = actualStage(row.currentStage ?? p.currentStageIndex);
  return {
    totalXp,
    currentLevel: p.currentLevel,
    currentStage: stage.stageIndex,
    stageName: stage.stageName,
    characterPath: characterSrc(stage.characterPath, variant),
    characterVariant: variant,
    nextLevelRequiredXp: p.nextLevelRequiredXp,
    xpToNextLevel: p.xpToNextLevel,
    levelProgressPercent: p.percent,
    levelCapped: p.capped === true,
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
