import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { dayKey } from "@/lib/domain/time";
import type { GoalType } from "@/lib/domain/goal-score";
import type { Challenge, UserGoal, WorkoutSet } from "@/lib/types";

// ── 목표 유형 메타 (§5) ──────────────────────────────────────────

export const GOAL_TYPE_META: Record<
  GoalType,
  { label: string; unit: string; defaultTarget: number }
> = {
  frequency: { label: "운동 횟수(일)", unit: "일", defaultTarget: 12 },
  distance: { label: "거리(km)", unit: "km", defaultTarget: 20 },
  duration: { label: "운동 시간(분)", unit: "분", defaultTarget: 600 },
  volume: { label: "웨이트 총볼륨(kg)", unit: "kg", defaultTarget: 5000 },
  reps: { label: "맨몸 총 횟수(회)", unit: "회", defaultTarget: 300 },
};

export type GoalDraft = { type: GoalType; target: number };

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
  workoutDays: number;
  distanceKm: number;
  durationMin: number;
  volumeKg: number;
  bodyweightReps: number;
};

const EMPTY_STATS: PeriodStats = {
  workoutDays: 0,
  distanceKm: 0,
  durationMin: 0,
  volumeKg: 0,
  bodyweightReps: 0,
};

/** 목표 유형별 실적 값 */
export function actualForGoal(stats: PeriodStats, type: GoalType): number {
  switch (type) {
    case "frequency":
      return stats.workoutDays;
    case "distance":
      return stats.distanceKm;
    case "duration":
      return stats.durationMin;
    case "volume":
      return stats.volumeKg;
    case "reps":
      return stats.bodyweightReps;
  }
}

/**
 * 크루원별 기간 실적 집계.
 * RLS가 읽게 해주는 세션(내 전부 + 크루 공개 완료분)만 반영된다 —
 * private 세션은 본인 점수에만 잡힌다(진행 중엔 내 것만 쓰므로 문제 없음).
 */
export async function getPeriodStatsByUser(
  groupId: string,
  startDate: string, // YYYY-MM-DD (포함)
  endDate: string, // YYYY-MM-DD (포함)
  timeZone: string,
): Promise<Map<string, PeriodStats>> {
  const supabase = getSupabaseBrowserClient();
  // tz 경계 여유를 두고 UTC로 넓게 가져온 뒤 dayKey로 정확히 거른다
  const fromIso = new Date(`${startDate}T00:00:00Z`);
  fromIso.setUTCDate(fromIso.getUTCDate() - 1);
  const toIso = new Date(`${endDate}T00:00:00Z`);
  toIso.setUTCDate(toIso.getUTCDate() + 2);

  const { data, error } = await supabase
    .from("workout_sessions")
    .select(
      "user_id, completed_at, duration_minutes, workout_exercises(exercise_type, workout_sets(weight_kg, reps, distance_meters, is_completed))",
    )
    .eq("group_id", groupId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .gte("completed_at", fromIso.toISOString())
    .lt("completed_at", toIso.toISOString());
  if (error) throw error;

  type Row = {
    user_id: string;
    completed_at: string;
    duration_minutes: number | null;
    workout_exercises:
      | {
          exercise_type: "weight" | "bodyweight" | "cardio";
          workout_sets:
            | Pick<
                WorkoutSet,
                "weight_kg" | "reps" | "distance_meters" | "is_completed"
              >[]
            | null;
        }[]
      | null;
  };

  const byUser = new Map<string, PeriodStats & { days: Set<string> }>();

  for (const row of (data ?? []) as Row[]) {
    const key = dayKey(new Date(row.completed_at), timeZone);
    if (key < startDate || key > endDate) continue; // 기간 밖 (tz 기준)

    const entry =
      byUser.get(row.user_id) ?? { ...EMPTY_STATS, days: new Set<string>() };
    entry.days.add(key);
    entry.durationMin += row.duration_minutes ?? 0;

    for (const ex of row.workout_exercises ?? []) {
      for (const s of ex.workout_sets ?? []) {
        if (!s.is_completed) continue;
        if (ex.exercise_type === "weight") {
          entry.volumeKg += Number(s.weight_kg ?? 0) * (s.reps ?? 0);
        } else if (ex.exercise_type === "bodyweight") {
          entry.bodyweightReps += s.reps ?? 0;
        } else {
          entry.distanceKm += Number(s.distance_meters ?? 0) / 1000;
        }
      }
    }
    byUser.set(row.user_id, entry);
  }

  const result = new Map<string, PeriodStats>();
  for (const [userId, entry] of byUser) {
    result.set(userId, {
      workoutDays: entry.days.size,
      distanceKm: entry.distanceKm,
      durationMin: entry.durationMin,
      volumeKg: entry.volumeKg,
      bodyweightReps: entry.bodyweightReps,
    });
  }
  return result;
}
