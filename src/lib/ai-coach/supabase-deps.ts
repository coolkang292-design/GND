import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { profileFromRow } from "@/lib/domain/training-profile";
import {
  EFFORT_LEVELS,
  SESSION_FLAGS,
  type AnalysisExercise,
  type EffortLevel,
  type HistorySession,
  type SessionFlag,
} from "@/lib/domain/workout-analysis";
import { HISTORY_SESSION_LIMIT } from "@/lib/domain/coach-config";
import {
  coachSessionRows,
  isIntervalBlockIndex,
  mergeRecentSessions,
} from "@/lib/domain/tabata";
import type { ExerciseType } from "@/lib/types";
import type { GenerateText } from "./deepseek";
import type { FeedbackDeps, FeedbackRow, SessionRow } from "./feedback-service";

/**
 * `FeedbackDeps`의 실제 Supabase 구현 (설계 2026-09-28 §4).
 *
 * ⚠️ **읽기는 사용자 권한(`user`), 쓰기는 서버 권한(`admin`)이다.**
 *    - 읽기를 사용자 클라이언트로 하는 이유: RLS가 남의 기록을 막는 두 번째 벽이 된다.
 *    - `workout_ai_feedback`은 클라이언트에 쓰기 권한을 안 줬다(0112) — 그래서 쓰기만 admin.
 *    - admin으로는 **이 사용자의 세션 id로만** 쓴다. 소유 확인은 서비스가 먼저 끝냈다.
 */

type SetRow = {
  set_number: number | null;
  weight_kg: number | string | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_meters: number | string | null;
  is_completed: boolean;
  effort_feedback: string | null;
  client_completed_at: string | null;
};

type ExerciseRow = {
  session_id?: string;
  exercise_name: string;
  exercise_type: ExerciseType;
  measure: "reps" | "time" | null;
  sort_order: number | null;
  workout_sets: SetRow[] | null;
};

const EXERCISE_SELECT =
  "session_id, exercise_name, exercise_type, measure, sort_order, " +
  "workout_sets(set_number, weight_kg, reps, duration_seconds, distance_meters, " +
  "is_completed, effort_feedback, client_completed_at)";

function toEffort(value: string | null): EffortLevel | null {
  return EFFORT_LEVELS.find((e) => e === value) ?? null;
}

export function toAnalysisExercise(row: ExerciseRow): AnalysisExercise {
  return {
    name: row.exercise_name,
    type: row.exercise_type,
    measure: row.measure,
    sets: (row.workout_sets ?? [])
      .slice()
      .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))
      .map((s) => ({
        weightKg: Number(s.weight_kg ?? 0),
        reps: s.reps ?? 0,
        durationSec: s.duration_seconds ?? 0,
        distanceM: Number(s.distance_meters ?? 0),
        done: s.is_completed,
        effort: toEffort(s.effort_feedback),
        clientCompletedAtMs: s.client_completed_at
          ? Date.parse(s.client_completed_at)
          : null,
      })),
  };
}

function bySortOrder(a: ExerciseRow, b: ExerciseRow) {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

export function createSupabaseFeedbackDeps(input: {
  userId: string;
  user: SupabaseClient;
  admin: SupabaseClient;
  generate: GenerateText;
}): FeedbackDeps {
  const { userId, user, admin } = input;
  return {
    userId,
    now: () => Date.now(),

    async readSession(sessionId) {
      const { data, error } = await user
        .from("workout_sessions")
        .select("id, user_id, status, deleted_at, duration_minutes")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return (data as SessionRow | null) ?? null;
    },

    async readFeedbackRow(sessionId) {
      const { data, error } = await user
        .from("workout_ai_feedback")
        .select(
          "session_id, user_id, status, attempt_count, metrics, feedback, " +
            "error_code, updated_at, viewed_at, model, generated_at",
        )
        .eq("session_id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return (data as FeedbackRow | null) ?? null;
    },

    async readProfile() {
      const { data, error } = await user
        .from("training_profiles")
        .select(
          "primary_goal, experience_level, sessions_per_week, session_minutes, " +
            "training_location, priority_body_parts, limitation_body_parts, " +
            "current_weight_kg, target_weight_kg",
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data ? profileFromRow(data as never) : null;
    },

    async readSessionExercises(sessionId) {
      // 인터벌 뒤 이어하기가 있는 세션이면 블록을 분석에서 뺀다 (2026-09-29,
      // `coachSessionRows` 주석). 그래서 세션의 인터벌 표시도 같이 읽는다.
      const [exercises, session] = await Promise.all([
        user.from("workout_exercises").select(EXERCISE_SELECT).eq("session_id", sessionId),
        user.from("workout_sessions").select("tabata_minutes").eq("id", sessionId).maybeSingle(),
      ]);
      if (exercises.error) throw exercises.error;
      if (session.error) throw session.error;
      const tabataMinutes =
        (session.data as { tabata_minutes: number | null } | null)?.tabata_minutes ?? null;
      return coachSessionRows(
        tabataMinutes,
        (exercises.data ?? []) as unknown as ExerciseRow[],
      )
        .sort(bySortOrder)
        .map(toAnalysisExercise);
    },

    async readHistory(excludeSessionId, sinceMs) {
      /*
        일반·인터벌 세션을 **따로** 조회한다 (2026-09-29, getPreviousExerciseRecords와
        같은 규칙). 인터벌 세션에서는 블록(0~3번)을 빼고 이어하기(4번~)만 쓴다 —
        블록의 반복은 라운드 수라 정상 기록을 가린다.
        블록만 있던 순수 인터벌 세션은 남는 종목이 없으므로 **통째로 뺀다** —
        예전과 같은 입력이 되게 한다(빈 세션이 끼면 빈도 계산이 달라진다).
      */
      type RecentSessionRow = {
        id: string;
        completed_at: string;
        tabata_minutes: number | null;
      };
      const recent = (interval: boolean) => {
        const query = user
          .from("workout_sessions")
          .select("id, completed_at, tabata_minutes")
          .eq("user_id", userId)
          .eq("status", "completed")
          .is("deleted_at", null)
          .neq("id", excludeSessionId)
          .gte("completed_at", new Date(sinceMs).toISOString());
        return (
          interval
            ? query.not("tabata_minutes", "is", null)
            : query.is("tabata_minutes", null)
        )
          .order("completed_at", { ascending: false })
          .limit(HISTORY_SESSION_LIMIT);
      };
      const [regular, interval] = await Promise.all([recent(false), recent(true)]);
      if (regular.error) throw regular.error;
      if (interval.error) throw interval.error;
      const rows = mergeRecentSessions(
        (regular.data ?? []) as RecentSessionRow[],
        (interval.data ?? []) as RecentSessionRow[],
      );
      if (rows.length === 0) return [];
      const tabataOf = new Map(rows.map((r) => [r.id, r.tabata_minutes]));

      const { data: exercises, error: exError } = await user
        .from("workout_exercises")
        .select(EXERCISE_SELECT)
        .in(
          "session_id",
          rows.map((r) => r.id),
        );
      if (exError) throw exError;

      const bySession = new Map<string, ExerciseRow[]>();
      for (const row of (exercises ?? []) as unknown as ExerciseRow[]) {
        if (isIntervalBlockIndex(tabataOf.get(row.session_id!), row.sort_order)) {
          continue;
        }
        const list = bySession.get(row.session_id!) ?? [];
        list.push(row);
        bySession.set(row.session_id!, list);
      }
      return rows
        .filter((r) => r.tabata_minutes === null || bySession.has(r.id))
        .map(
          (r): HistorySession => ({
            completedAtMs: Date.parse(r.completed_at),
            exercises: (bySession.get(r.id) ?? [])
              .sort(bySortOrder)
              .map(toAnalysisExercise),
          }),
        );
    },

    async readSessionFeedback(sessionId) {
      const { data, error } = await user
        .from("workout_session_feedback")
        .select("overall_effort, flags")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as { overall_effort: string | null; flags: string[] | null };
      return {
        effort: toEffort(row.overall_effort),
        flags: (row.flags ?? []).filter((f): f is SessionFlag =>
          (SESSION_FLAGS as readonly string[]).includes(f),
        ),
      };
    },

    async insertPending(row) {
      const { error } = await admin.from("workout_ai_feedback").insert({
        ...row,
        status: "pending",
        attempt_count: 1,
      });
      if (!error) return true;
      // 23505 = 누가 먼저 잡았다. 그 외 오류는 올려서 라우트가 500으로 답하게 한다
      if (error.code === "23505") return false;
      throw error;
    },

    async claimRetry(sessionId, fromAttempt, fromStatus) {
      const { data, error } = await admin
        .from("workout_ai_feedback")
        .update({
          status: "pending",
          attempt_count: fromAttempt + 1,
          error_code: null,
        })
        .eq("session_id", sessionId)
        .eq("user_id", userId)
        .eq("status", fromStatus)
        .eq("attempt_count", fromAttempt)
        .select("session_id");
      if (error) throw error;
      return (data ?? []).length === 1;
    },

    async finish(sessionId, patch) {
      const { error } = await admin
        .from("workout_ai_feedback")
        .update(patch)
        .eq("session_id", sessionId)
        .eq("user_id", userId);
      if (error) throw error;
    },

    async markViewed(sessionId) {
      await admin
        .from("workout_ai_feedback")
        .update({ viewed_at: new Date().toISOString() })
        .eq("session_id", sessionId)
        .eq("user_id", userId)
        .is("viewed_at", null);
    },

    generate: input.generate,
  };
}
