/**
 * 운동 직후 AI 피드백 — 서버 흐름 (설계 2026-09-28 §4, 명령문 §24).
 *
 * I/O는 전부 `deps`로 받는다. 라우트(`app/api/workout-feedback`)가 Supabase·
 * DeepSeek을 꽂고, 테스트는 메모리 가짜를 꽂는다.
 *
 * ⚠️⚠️ **운동 완료와 묶지 않는다.** 이 흐름은 `complete_workout_v2`가 끝난 **뒤**
 *    완료 화면이 따로 부른다. 여기서 무엇이 실패해도 운동·XP·배지는 이미 끝나 있다.
 *
 * ⚠️ 소유 확인은 `session.user_id === userId`로 **직접** 한다. RLS만 믿으면 안 된다 —
 *    `sessions_select_own_or_crew`라서 크루의 완료 세션도 읽힌다.
 *
 * ⚠️ 중복 방지의 진짜 방어선은 DB다(`workout_ai_feedback.session_id` PK).
 *    처음은 insert 충돌로, 재시도는 `attempt_count`를 조건으로 건 update로 선점한다.
 */

import {
  ALGORITHM_VERSION,
  HISTORY_WEEKS,
  MAX_FEEDBACK_ATTEMPTS,
  PENDING_STALE_MS,
  PROMPT_VERSION,
} from "@/lib/domain/coach-config";
import {
  buildCoachInput,
  coachSystemPrompt,
  coachUserPrompt,
  parseModelJson,
  sanitizeCoachFeedback,
  type CoachFeedback,
} from "@/lib/domain/coach-feedback";
import type { TrainingProfile } from "@/lib/domain/training-profile";
import {
  analyzeWorkout,
  type AnalysisExercise,
  type EffortLevel,
  type HistorySession,
  type SessionFlag,
  type WorkoutAnalysis,
} from "@/lib/domain/workout-analysis";
import { ProviderError, type GenerateText } from "./deepseek";

export type SessionRow = {
  id: string;
  user_id: string;
  status: string;
  deleted_at: string | null;
  duration_minutes: number | null;
};

export type FeedbackRow = {
  session_id: string;
  user_id: string;
  status: "pending" | "completed" | "failed";
  attempt_count: number;
  metrics: unknown;
  feedback: unknown;
  error_code: string | null;
  updated_at: string;
  viewed_at: string | null;
  model?: string | null;
  generated_at?: string | null;
};

export type FinishPatch = {
  status: "completed" | "failed";
  metrics: unknown;
  feedback: CoachFeedback | null;
  model: string | null;
  error_code: string | null;
  generated_at: string | null;
  viewed_at: string | null;
};

export type FeedbackDeps = {
  userId: string;
  now: () => number;
  readSession: (sessionId: string) => Promise<SessionRow | null>;
  readFeedbackRow: (sessionId: string) => Promise<FeedbackRow | null>;
  readProfile: () => Promise<TrainingProfile | null>;
  readSessionExercises: (sessionId: string) => Promise<AnalysisExercise[]>;
  /** 오늘 세션을 뺀 과거 완료 세션, **최신순** */
  readHistory: (excludeSessionId: string, sinceMs: number) => Promise<HistorySession[]>;
  readSessionFeedback: (
    sessionId: string,
  ) => Promise<{ effort: EffortLevel | null; flags: SessionFlag[] } | null>;
  /** 새 pending 행. 이미 있으면(누가 먼저 잡았으면) `false` */
  insertPending: (row: {
    session_id: string;
    user_id: string;
    prompt_version: string;
    algorithm_version: string;
  }) => Promise<boolean>;
  /** `attempt_count`와 상태가 그대로일 때만 pending으로 되돌리고 +1. 아니면 `false` */
  claimRetry: (
    sessionId: string,
    fromAttempt: number,
    fromStatus: "failed" | "pending",
  ) => Promise<boolean>;
  finish: (sessionId: string, patch: FinishPatch) => Promise<void>;
  markViewed: (sessionId: string) => Promise<void>;
  generate: GenerateText;
};

export type FeedbackBody =
  | { status: "completed"; metrics: WorkoutAnalysis; feedback: CoachFeedback }
  | { status: "pending" }
  | {
      status: "failed";
      metrics: WorkoutAnalysis | null;
      errorCode: string;
      retryable: boolean;
    }
  | { error: "bad_request" | "not_found" | "not_completed" | "profile_required" };

export type FeedbackResult = { httpStatus: number; body: FeedbackBody };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isAnalysis(value: unknown): value is WorkoutAnalysis {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as WorkoutAnalysis).exercises)
  );
}

function failedBody(row: FeedbackRow): FeedbackResult {
  return {
    httpStatus: 200,
    body: {
      status: "failed",
      metrics: isAnalysis(row.metrics) ? row.metrics : null,
      errorCode: row.error_code ?? "unknown",
      retryable: row.attempt_count < MAX_FEEDBACK_ATTEMPTS,
    },
  };
}

export async function requestWorkoutFeedback(
  sessionId: string,
  deps: FeedbackDeps,
  options: { retry?: boolean } = {},
): Promise<FeedbackResult> {
  if (!UUID_RE.test(sessionId)) {
    return { httpStatus: 400, body: { error: "bad_request" } };
  }

  const session = await deps.readSession(sessionId);
  // 남의 세션과 없는 세션을 **같은 답**으로 — 존재 여부를 흘리지 않는다
  if (!session || session.user_id !== deps.userId) {
    return { httpStatus: 404, body: { error: "not_found" } };
  }
  if (session.status !== "completed" || session.deleted_at) {
    return { httpStatus: 409, body: { error: "not_completed" } };
  }

  const existing = await deps.readFeedbackRow(sessionId);
  if (existing?.status === "completed" && isAnalysis(existing.metrics)) {
    if (!existing.viewed_at) await deps.markViewed(sessionId).catch(() => {});
    return {
      httpStatus: 200,
      body: {
        status: "completed",
        metrics: existing.metrics,
        feedback: existing.feedback as CoachFeedback,
      },
    };
  }
  if (existing?.status === "pending") {
    const age = deps.now() - Date.parse(existing.updated_at);
    if (age < PENDING_STALE_MS) {
      return { httpStatus: 202, body: { status: "pending" } };
    }
  }
  if (existing) {
    const exhausted = existing.attempt_count >= MAX_FEEDBACK_ATTEMPTS;
    // 실패 행은 **명시적 재시도**일 때만 다시 부른다 — 화면을 다시 여는 것만으로 AI를 부르지 않는다
    if (existing.status === "failed" && (!options.retry || exhausted)) {
      return failedBody(existing);
    }
    if (existing.status === "pending" && exhausted) {
      return failedBody({ ...existing, error_code: existing.error_code ?? "stale" });
    }
  }

  const profile = await deps.readProfile();
  if (!profile) return { httpStatus: 409, body: { error: "profile_required" } };

  const claimed = existing
    ? await deps.claimRetry(
        sessionId,
        existing.attempt_count,
        existing.status as "failed" | "pending",
      )
    : await deps.insertPending({
        session_id: sessionId,
        user_id: deps.userId,
        prompt_version: PROMPT_VERSION,
        algorithm_version: ALGORITHM_VERSION,
      });
  if (!claimed) return { httpStatus: 202, body: { status: "pending" } };
  const attempt = existing ? existing.attempt_count + 1 : 1;

  const fail = async (
    errorCode: string,
    metrics: WorkoutAnalysis | null,
  ): Promise<FeedbackResult> => {
    await deps.finish(sessionId, {
      status: "failed",
      metrics: metrics ?? {},
      feedback: null,
      model: null,
      error_code: errorCode,
      generated_at: null,
      viewed_at: null,
    });
    return {
      httpStatus: 200,
      body: {
        status: "failed",
        metrics,
        errorCode,
        retryable: attempt < MAX_FEEDBACK_ATTEMPTS,
      },
    };
  };

  let analysis: WorkoutAnalysis;
  try {
    const sinceMs = deps.now() - HISTORY_WEEKS * 7 * 86_400_000;
    const [exercises, history, sessionFeedback] = await Promise.all([
      deps.readSessionExercises(sessionId),
      deps.readHistory(sessionId, sinceMs),
      deps.readSessionFeedback(sessionId),
    ]);
    analysis = analyzeWorkout({
      session: { durationMinutes: session.duration_minutes, exercises },
      history,
      goal: profile.primaryGoal,
      sessionEffort: sessionFeedback?.effort ?? null,
      flags: sessionFeedback?.flags ?? [],
    });
  } catch {
    return fail("read_error", null);
  }

  let generated: { text: string; model: string };
  try {
    const input = buildCoachInput(analysis, profile);
    generated = await deps.generate({
      system: coachSystemPrompt(),
      user: coachUserPrompt(input),
    });
  } catch (error) {
    return fail(error instanceof ProviderError ? error.code : "provider_error", analysis);
  }

  const feedback = sanitizeCoachFeedback(parseModelJson(generated.text), analysis);
  if (!feedback) return fail("invalid_output", analysis);

  const nowIso = new Date(deps.now()).toISOString();
  await deps.finish(sessionId, {
    status: "completed",
    metrics: analysis,
    feedback,
    model: generated.model,
    error_code: null,
    generated_at: nowIso,
    viewed_at: nowIso,
  });
  return {
    httpStatus: 200,
    body: { status: "completed", metrics: analysis, feedback },
  };
}
