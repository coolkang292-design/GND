import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";
import {
  plannedDaysForPeriod,
  rankParticipants,
  type GoalType,
  type RankedParticipant,
} from "@/lib/domain/goal-score";
import type { Challenge, UserGoal, WorkoutSet } from "@/lib/types";

// ── 목표 유형 메타 (§5) ──────────────────────────────────────────

export type GoalCategory = "weight" | "cardio" | "bodyweight";

export const GOAL_TYPE_META: Record<
  GoalType,
  { label: string; unit: string; defaultTarget: number; category: GoalCategory }
> = {
  weight_reps: { label: "웨이트 횟수", unit: "회", defaultTarget: 300, category: "weight" },
  weight_days: { label: "웨이트 운동일", unit: "일", defaultTarget: 12, category: "weight" },
  cardio_distance: { label: "유산소 거리", unit: "km", defaultTarget: 20, category: "cardio" },
  cardio_time: { label: "유산소 시간", unit: "분", defaultTarget: 600, category: "cardio" },
  bodyweight_reps: { label: "맨몸 횟수", unit: "회", defaultTarget: 300, category: "bodyweight" },
  bodyweight_time: { label: "맨몸 시간", unit: "분", defaultTarget: 100, category: "bodyweight" },
  bodyweight_days: { label: "맨몸 운동일", unit: "일", defaultTarget: 12, category: "bodyweight" },
  volume: { label: "웨이트 총볼륨", unit: "kg", defaultTarget: 5000, category: "weight" }, // 레거시
};

export type GoalDraft = {
  type: GoalType;
  target: number;
  /** *_days: 하루 최소 부위/종목 수 (기본 3) */
  qualifier?: number | null;
};

/** 목표 표시 라벨 (+조건) */
export function goalLabel(type: GoalType, qualifier?: number | null): string {
  const base = GOAL_TYPE_META[type].label;
  if (type === "weight_days") return `${base}(하루 ${qualifier ?? 1}부위+)`;
  if (type === "bodyweight_days") return `${base}(하루 ${qualifier ?? 1}종목+)`;
  return base;
}

// ── challenges CRUD ──────────────────────────────────────────────

/** 크루의 살아있는(취소 아닌) 최신 챌린지 */
export async function getCurrentChallenge(
  groupId: string,
): Promise<Challenge | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("group_id", groupId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createChallenge(input: {
  groupId: string;
  name: string;
  startDate: string;
  endDate: string;
}): Promise<Challenge> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("challenges")
    .insert({
      group_id: input.groupId,
      name: input.name.trim(),
      start_date: input.startDate,
      end_date: input.endDate,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** 챌린지의 전체 참가자 목표 (RLS: 크루원만) */
export async function getChallengeGoals(
  challengeId: string,
): Promise<UserGoal[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("user_goals")
    .select("*")
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** 내 KPI 저장 — setup 단계에서만 (RLS 강제). 기존 행 교체. */
export async function saveMyGoals(input: {
  userId: string;
  challengeId: string;
  groupId: string;
  goals: GoalDraft[];
  plannedDays: number;
}): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error: delError } = await supabase
    .from("user_goals")
    .delete()
    .eq("challenge_id", input.challengeId)
    .eq("user_id", input.userId);
  if (delError) throw delError;

  const { error } = await supabase.from("user_goals").insert(
    input.goals.map((g) => ({
      user_id: input.userId,
      challenge_id: input.challengeId,
      group_id: input.groupId,
      goal_type: g.type,
      target_value: g.target,
      unit: GOAL_TYPE_META[g.type].unit,
      planned_days: input.plannedDays,
      qualifier:
        g.type === "weight_days" || g.type === "bodyweight_days"
          ? (g.qualifier ?? 3)
          : null,
    })),
  );
  if (error) throw error;
}

/** 지난 챌린지 KPI 불러오기 (§5 loadPrevKPI) — 직전 챌린지의 내 목표 */
export async function getMyPreviousGoals(
  userId: string,
  groupId: string,
  excludeChallengeId: string | null,
): Promise<UserGoal[]> {
  const supabase = getSupabaseBrowserClient();
  let query = supabase
    .from("user_goals")
    .select("*")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (excludeChallengeId) {
    query = query.neq("challenge_id", excludeChallengeId);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];
  // 가장 최근 챌린지 한 건의 목표 묶음만
  const latestChallengeId = rows[0].challenge_id;
  return rows.filter((r) => r.challenge_id === latestChallengeId);
}

// ── 상태전이 RPC (§15) ───────────────────────────────────────────

export async function startChallenge(challengeId: string): Promise<Challenge> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("start_challenge", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
  return data as Challenge;
}

export async function cancelChallenge(
  challengeId: string,
): Promise<Challenge> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("cancel_challenge", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
  return data as Challenge;
}

/** 종료일 지난 active 챌린지를 ended로 확정 (결과는 저장 않고 계산) */
export async function finalizeChallenge(
  challengeId: string,
): Promise<Challenge> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("finalize_challenge", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
  return data as Challenge;
}

// ── 기간 실적 집계 (§7 실적 = 완료 세션에서 계산) ────────────────

export type PeriodStats = {
  workoutDays: number; // 아무 운동이든 한 날 수 (참여율용)
  weightReps: number;
  volumeKg: number; // 레거시 표시용
  cardioDistanceKm: number;
  cardioTimeMin: number;
  bodyweightReps: number;
  bodyweightTimeMin: number;
  /** 날짜별 웨이트 완료 부위 수 — weight_days 판정 */
  weightPartsByDay: Record<string, number>;
  /** 날짜별 맨몸 완료 종목 수 — bodyweight_days 판정 */
  bodyweightKindsByDay: Record<string, number>;
};

const EMPTY_STATS: PeriodStats = {
  workoutDays: 0,
  weightReps: 0,
  volumeKg: 0,
  cardioDistanceKm: 0,
  cardioTimeMin: 0,
  bodyweightReps: 0,
  bodyweightTimeMin: 0,
  weightPartsByDay: {},
  bodyweightKindsByDay: {},
};

/** foldPeriodStats 입력 — DB 조회를 정규화한 순수 표현 */
export type PeriodSessionRow = {
  userId: string;
  completedAt: string;
  exercises: {
    exerciseType: "weight" | "bodyweight" | "cardio";
    exerciseName: string;
    bodyPart: string | null;
    sets: {
      weightKg: number | null;
      reps: number | null;
      distanceMeters: number | null;
      durationSeconds: number | null;
      isCompleted: boolean;
    }[];
  }[];
};

/** 정규화 행 → 유저별 기간 실적 (순수·TDD 대상) */
export function foldPeriodStats(
  rows: PeriodSessionRow[],
  startDate: string,
  endDate: string,
  timeZone: string,
): Map<string, PeriodStats> {
  type Acc = PeriodStats & {
    days: Set<string>;
    weightParts: Map<string, Set<string>>;
    bodyweightKinds: Map<string, Set<string>>;
  };
  const byUser = new Map<string, Acc>();

  for (const row of rows) {
    const key = dayKey(new Date(row.completedAt), timeZone);
    if (key < startDate || key > endDate) continue;

    const entry: Acc = byUser.get(row.userId) ?? {
      ...EMPTY_STATS,
      weightPartsByDay: {},
      bodyweightKindsByDay: {},
      days: new Set<string>(),
      weightParts: new Map<string, Set<string>>(),
      bodyweightKinds: new Map<string, Set<string>>(),
    };
    entry.days.add(key);

    for (const ex of row.exercises) {
      let hasCompleted = false;
      for (const s of ex.sets) {
        if (!s.isCompleted) continue;
        hasCompleted = true;
        if (ex.exerciseType === "weight") {
          entry.volumeKg += Number(s.weightKg ?? 0) * (s.reps ?? 0);
          entry.weightReps += s.reps ?? 0;
        } else if (ex.exerciseType === "bodyweight") {
          entry.bodyweightReps += s.reps ?? 0;
          entry.bodyweightTimeMin += (s.durationSeconds ?? 0) / 60;
        } else {
          entry.cardioDistanceKm += Number(s.distanceMeters ?? 0) / 1000;
          entry.cardioTimeMin += (s.durationSeconds ?? 0) / 60;
        }
      }
      if (!hasCompleted) continue;
      if (ex.exerciseType === "weight") {
        const parts = entry.weightParts.get(key) ?? new Set<string>();
        parts.add(ex.bodyPart ?? ex.exerciseType);
        entry.weightParts.set(key, parts);
      } else if (ex.exerciseType === "bodyweight") {
        const kinds = entry.bodyweightKinds.get(key) ?? new Set<string>();
        kinds.add(ex.exerciseName);
        entry.bodyweightKinds.set(key, kinds);
      }
    }
    byUser.set(row.userId, entry);
  }

  const result = new Map<string, PeriodStats>();
  for (const [userId, e] of byUser) {
    const weightPartsByDay: Record<string, number> = {};
    for (const [day, parts] of e.weightParts) weightPartsByDay[day] = parts.size;
    const bodyweightKindsByDay: Record<string, number> = {};
    for (const [day, kinds] of e.bodyweightKinds) bodyweightKindsByDay[day] = kinds.size;
    result.set(userId, {
      workoutDays: e.days.size,
      weightReps: e.weightReps,
      volumeKg: e.volumeKg,
      cardioDistanceKm: e.cardioDistanceKm,
      cardioTimeMin: e.cardioTimeMin,
      bodyweightReps: e.bodyweightReps,
      bodyweightTimeMin: e.bodyweightTimeMin,
      weightPartsByDay,
      bodyweightKindsByDay,
    });
  }
  return result;
}

/** 목표 유형별 실적 값 (frequency는 qualifier=하루 최소 부위 수 조건) */
export function actualForGoal(
  stats: PeriodStats,
  type: GoalType,
  qualifier?: number | null,
): number {
  const daysAtLeast = (byDay: Record<string, number>) => {
    const min = qualifier ?? 1;
    return Object.values(byDay).filter((n) => n >= min).length;
  };
  switch (type) {
    case "weight_reps":
      return stats.weightReps;
    case "weight_days":
      return daysAtLeast(stats.weightPartsByDay);
    case "cardio_distance":
      return stats.cardioDistanceKm;
    case "cardio_time":
      return stats.cardioTimeMin;
    case "bodyweight_reps":
      return stats.bodyweightReps;
    case "bodyweight_time":
      return stats.bodyweightTimeMin;
    case "bodyweight_days":
      return daysAtLeast(stats.bodyweightKindsByDay);
    case "volume":
      return stats.volumeKg;
  }
}

/**
 * 크루원별 기간 실적 집계.
 * RLS가 읽게 해주는 세션(내 전부 + 크루 공개 완료분)만 반영된다 —
 * private 세션은 본인 점수에만 잡힌다(진행 중엔 내 것만 쓰므로 문제 없음).
 */
export async function getPeriodStatsByUser(
  groupId: string,
  startDate: string,
  endDate: string,
  timeZone: string,
): Promise<Map<string, PeriodStats>> {
  const supabase = getSupabaseBrowserClient();
  const fromIso = new Date(`${startDate}T00:00:00Z`);
  fromIso.setUTCDate(fromIso.getUTCDate() - 1);
  const toIso = new Date(`${endDate}T00:00:00Z`);
  toIso.setUTCDate(toIso.getUTCDate() + 2);

  const { data, error } = await supabase
    .from("workout_sessions")
    .select(
      "user_id, completed_at, workout_exercises(exercise_type, exercise_name, body_part, workout_sets(weight_kg, reps, distance_meters, duration_seconds, is_completed))",
    )
    .eq("group_id", groupId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .gte("completed_at", fromIso.toISOString())
    .lt("completed_at", toIso.toISOString());
  if (error) throw error;

  type DbRow = {
    user_id: string;
    completed_at: string;
    workout_exercises:
      | {
          exercise_type: "weight" | "bodyweight" | "cardio";
          exercise_name: string;
          body_part: string | null;
          workout_sets:
            | Pick<
                WorkoutSet,
                "weight_kg" | "reps" | "distance_meters" | "duration_seconds" | "is_completed"
              >[]
            | null;
        }[]
      | null;
  };

  const rows: PeriodSessionRow[] = ((data ?? []) as DbRow[]).map((r) => ({
    userId: r.user_id,
    completedAt: r.completed_at,
    exercises: (r.workout_exercises ?? []).map((ex) => ({
      exerciseType: ex.exercise_type,
      exerciseName: ex.exercise_name,
      bodyPart: ex.body_part,
      sets: (ex.workout_sets ?? []).map((s) => ({
        weightKg: s.weight_kg,
        reps: s.reps,
        distanceMeters: s.distance_meters,
        durationSeconds: s.duration_seconds,
        isCompleted: s.is_completed,
      })),
    })),
  }));

  return foldPeriodStats(rows, startDate, endDate, timeZone);
}

// ── 진행 중 챌린지 랭킹 스냅샷 (꾸준왕 성과 시트용) ────────────────

export type ChallengeRanking = { name: string; list: RankedParticipant[] };

function periodDaysCount(startDate: string, endDate: string): number {
  const toUtc = (v: string) => {
    const [y, m, d] = v.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(endDate) - toUtc(startDate)) / 86_400_000) + 1;
}

/** 진행 중(active) 챌린지의 현재 순위 — 없으면 null */
export async function getActiveChallengeRanking(
  groupId: string,
): Promise<ChallengeRanking | null> {
  const ch = await getCurrentChallenge(groupId);
  if (!ch || ch.status !== "active") return null;

  const [goals, stats] = await Promise.all([
    getChallengeGoals(ch.id),
    getPeriodStatsByUser(groupId, ch.start_date, ch.end_date, DEFAULT_TIMEZONE),
  ]);
  const days = periodDaysCount(ch.start_date, ch.end_date);
  const userIds = [...new Set(goals.map((g) => g.user_id))];

  const list = rankParticipants(
    userIds.map((uid) => {
      const userGoals = goals.filter((g) => g.user_id === uid);
      const s = stats.get(uid) ?? EMPTY_STATS;
      return {
        userId: uid,
        goals: userGoals.map((g) => ({
          type: g.goal_type,
          target: Number(g.target_value),
          actual: actualForGoal(s, g.goal_type, g.qualifier),
        })),
        workoutDays: s.workoutDays,
        plannedDays: plannedDaysForPeriod(userGoals[0]?.planned_days ?? 5, days),
        allGoalsCompletedAtMs: null,
      };
    }),
  );
  return { name: ch.name, list };
}
