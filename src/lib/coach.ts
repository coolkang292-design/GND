/**
 * AI 코치 V1 — 브라우저 쪽 입출력 (0112, 설계 2026-09-28).
 *
 * ⚠️ 저장은 **insert → 충돌이면 update**다. upsert를 쓰지 않는 이유: PostgREST
 *    upsert는 `on conflict do update set <보낸 모든 칸>`이라 `session_id`·`user_id`
 *    update 권한까지 요구한다. 그 권한을 열면 내 체감 행을 남의 세션 id로 옮겨
 *    그 자리를 선점할 수 있다. 그래서 0112는 두 칸의 update를 주지 않았다.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CoachFeedback } from "@/lib/domain/coach-feedback";
import {
  profileFromRow,
  profileToRow,
  type TrainingProfile,
} from "@/lib/domain/training-profile";
import {
  EFFORT_LEVELS,
  SESSION_FLAGS,
  type EffortLevel,
  type SessionFlag,
  type WorkoutAnalysis,
} from "@/lib/domain/workout-analysis";

const PROFILE_COLUMNS =
  "primary_goal, experience_level, sessions_per_week, session_minutes, " +
  "training_location, priority_body_parts, limitation_body_parts, " +
  "current_weight_kg, target_weight_kg";

export async function loadTrainingProfile(
  userId: string,
): Promise<TrainingProfile | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("training_profiles")
    .select(PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? profileFromRow(data as never) : null;
}

export async function saveTrainingProfile(
  userId: string,
  profile: TrainingProfile,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const row = profileToRow(profile);
  const { error } = await supabase
    .from("training_profiles")
    .insert({ user_id: userId, ...row });
  if (!error) return;
  if (error.code !== "23505") throw error;
  const { error: updateError } = await supabase
    .from("training_profiles")
    .update(row)
    .eq("user_id", userId);
  if (updateError) throw updateError;
}

export type SessionFeedbackInput = {
  effort: EffortLevel | null;
  flags: SessionFlag[];
};

export async function loadSessionFeedback(
  sessionId: string,
): Promise<SessionFeedbackInput | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_session_feedback")
    .select("overall_effort, flags")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    effort: EFFORT_LEVELS.find((e) => e === data.overall_effort) ?? null,
    flags: ((data.flags as string[] | null) ?? []).filter(
      (f): f is SessionFlag => (SESSION_FLAGS as readonly string[]).includes(f),
    ),
  };
}

export async function saveSessionFeedback(
  userId: string,
  sessionId: string,
  input: SessionFeedbackInput,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const values = { overall_effort: input.effort, flags: input.flags };
  const { error } = await supabase
    .from("workout_session_feedback")
    .insert({ session_id: sessionId, user_id: userId, ...values });
  if (!error) return;
  if (error.code !== "23505") throw error;
  const { error: updateError } = await supabase
    .from("workout_session_feedback")
    .update(values)
    .eq("session_id", sessionId);
  if (updateError) throw updateError;
}

export type CoachResponse =
  | { status: "completed"; metrics: WorkoutAnalysis; feedback: CoachFeedback }
  | { status: "pending" }
  | {
      status: "failed";
      metrics: WorkoutAnalysis | null;
      errorCode: string;
      retryable: boolean;
    }
  | { status: "profile_required" }
  | { status: "error"; errorCode: string };

/** `/api/workout-feedback` 호출. **던지지 않는다** — 실패도 화면이 그릴 값이다 */
export async function requestCoachFeedback(
  sessionId: string,
  retry = false,
): Promise<CoachResponse> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const response = await fetch("/api/workout-feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ sessionId, retry }),
    });
    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    if (!body) return { status: "error", errorCode: `http_${response.status}` };
    if (body.error === "profile_required") return { status: "profile_required" };
    if (typeof body.error === "string") {
      return { status: "error", errorCode: body.error };
    }
    if (
      body.status === "completed" ||
      body.status === "pending" ||
      body.status === "failed"
    ) {
      return body as CoachResponse;
    }
    return { status: "error", errorCode: "bad_response" };
  } catch {
    return { status: "error", errorCode: "network_error" };
  }
}
