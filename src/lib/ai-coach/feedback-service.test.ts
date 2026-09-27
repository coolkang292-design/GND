import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "./deepseek";
import {
  requestWorkoutFeedback,
  type FeedbackDeps,
  type FeedbackRow,
} from "./feedback-service";
import type { TrainingProfile } from "@/lib/domain/training-profile";
import type { AnalysisExercise } from "@/lib/domain/workout-analysis";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = Date.parse("2026-09-28T12:00:00Z");

const PROFILE: TrainingProfile = {
  primaryGoal: "hypertrophy",
  experienceLevel: "intermediate",
  sessionsPerWeek: 4,
  sessionMinutes: 60,
  trainingLocation: "gym",
  priorityBodyParts: ["어깨"],
  limitationBodyParts: [],
  currentWeightKg: null,
  targetWeightKg: null,
};

const BENCH: AnalysisExercise = {
  name: "벤치프레스",
  type: "weight",
  measure: null,
  sets: [10, 10, 10].map((reps) => ({
    weightKg: 60,
    reps,
    durationSec: 0,
    distanceM: 0,
    done: true,
    effort: null,
    clientCompletedAtMs: null,
  })),
};

const MODEL_OUTPUT = JSON.stringify({
  summary: "첫 기록을 남겼어요.",
  primary_result: { type: "baseline", message: "x" },
  wins: [],
  cautions: [],
  next_actions: [],
  coach_message: "다음 운동부터 비교할 수 있어요.",
});

/** 메모리 속 DB — 행 선점(insert 충돌·조건부 update)을 실제 DB처럼 흉내 낸다 */
function makeDeps(overrides: Partial<FeedbackDeps> = {}) {
  const rows = new Map<string, FeedbackRow>();
  const sessions = new Map([
    [SESSION_A, { id: SESSION_A, user_id: USER_A, status: "completed", deleted_at: null, duration_minutes: 50 }],
    [SESSION_B, { id: SESSION_B, user_id: USER_B, status: "completed", deleted_at: null, duration_minutes: 40 }],
  ]);
  const generate = vi.fn(async () => ({ text: MODEL_OUTPUT, model: "deepseek-flash" }));
  const deps: FeedbackDeps = {
    userId: USER_A,
    now: () => NOW,
    readSession: vi.fn(async (id: string) => sessions.get(id) ?? null),
    readFeedbackRow: vi.fn(async (id: string) => rows.get(id) ?? null),
    readProfile: vi.fn(async () => PROFILE),
    readSessionExercises: vi.fn(async () => [BENCH]),
    readHistory: vi.fn(async () => []),
    readSessionFeedback: vi.fn(async () => ({ effort: "on_target" as const, flags: [] })),
    insertPending: vi.fn(async (row) => {
      if (rows.has(row.session_id)) return false;
      rows.set(row.session_id, {
        session_id: row.session_id,
        user_id: row.user_id,
        status: "pending",
        attempt_count: 1,
        metrics: {},
        feedback: null,
        error_code: null,
        updated_at: new Date(NOW).toISOString(),
        viewed_at: null,
      });
      return true;
    }),
    claimRetry: vi.fn(async (id, fromAttempt, fromStatus) => {
      const row = rows.get(id);
      if (!row || row.attempt_count !== fromAttempt || row.status !== fromStatus) {
        return false;
      }
      rows.set(id, { ...row, status: "pending", attempt_count: fromAttempt + 1 });
      return true;
    }),
    finish: vi.fn(async (id, patch) => {
      const row = rows.get(id)!;
      rows.set(id, { ...row, ...patch });
    }),
    markViewed: vi.fn(async (id) => {
      const row = rows.get(id)!;
      rows.set(id, { ...row, viewed_at: new Date(NOW).toISOString() });
    }),
    generate,
    ...overrides,
  };
  return { deps, rows, generate, sessions };
}

describe("requestWorkoutFeedback", () => {
  it("정상 흐름: 분석 → 생성 → 저장, 버전과 모델을 남긴다", async () => {
    const { deps, rows } = makeDeps();
    const result = await requestWorkoutFeedback(SESSION_A, deps);
    expect(result.httpStatus).toBe(200);
    expect(result.body).toMatchObject({ status: "completed" });
    const row = rows.get(SESSION_A)!;
    expect(row.status).toBe("completed");
    expect(row.model).toBe("deepseek-flash");
    expect(row.generated_at).toBeTruthy();
    expect(row.viewed_at).toBeTruthy();
    expect((row.metrics as { algorithmVersion: string }).algorithmVersion).toBe(
      "progression_v1",
    );
  });

  describe("F. 중복 호출", () => {
    it("같은 세션을 5번 불러도 AI는 한 번만 부른다", async () => {
      const { deps, generate } = makeDeps();
      for (let i = 0; i < 5; i++) {
        const result = await requestWorkoutFeedback(SESSION_A, deps);
        expect(result.body).toMatchObject({ status: "completed" });
      }
      expect(generate).toHaveBeenCalledTimes(1);
    });

    it("동시에 5번 들어와도 선점한 하나만 AI를 부른다", async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const { deps, generate } = makeDeps();
      deps.generate = vi.fn(async () => {
        await gate;
        return { text: MODEL_OUTPUT, model: "deepseek-flash" };
      });
      const calls = Array.from({ length: 5 }, () =>
        requestWorkoutFeedback(SESSION_A, deps),
      );
      await new Promise((r) => setTimeout(r, 0));
      release();
      const results = await Promise.all(calls);
      expect(deps.generate).toHaveBeenCalledTimes(1);
      expect(generate).not.toHaveBeenCalled();
      const statusOf = (r: (typeof results)[number]) =>
        "status" in r.body ? r.body.status : null;
      expect(results.filter((r) => statusOf(r) === "completed")).toHaveLength(1);
      expect(results.filter((r) => statusOf(r) === "pending")).toHaveLength(4);
    });
  });

  describe("G. 남의 세션", () => {
    it("B의 세션 id를 넣으면 404, B의 어떤 데이터도 읽지 않고 AI도 부르지 않는다", async () => {
      const { deps, generate } = makeDeps();
      const result = await requestWorkoutFeedback(SESSION_B, deps);
      expect(result.httpStatus).toBe(404);
      expect(result.body).toEqual({ error: "not_found" });
      expect(deps.readFeedbackRow).not.toHaveBeenCalled();
      expect(deps.readSessionExercises).not.toHaveBeenCalled();
      expect(deps.readHistory).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
    });

    it("없는 세션도 같은 404 — 존재 여부를 흘리지 않는다", async () => {
      const { deps } = makeDeps();
      const result = await requestWorkoutFeedback(
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        deps,
      );
      expect(result).toEqual({ httpStatus: 404, body: { error: "not_found" } });
    });

    it("UUID가 아니면 조회 전에 400", async () => {
      const { deps } = makeDeps();
      const result = await requestWorkoutFeedback("1; drop table", deps);
      expect(result.httpStatus).toBe(400);
      expect(deps.readSession).not.toHaveBeenCalled();
    });
  });

  describe("E. AI 장애", () => {
    it("실패로 기록하고 계산값은 남긴다 — 재시도 가능", async () => {
      const { deps, rows } = makeDeps({
        generate: vi.fn(async () => {
          throw new ProviderError("timeout");
        }),
      });
      const result = await requestWorkoutFeedback(SESSION_A, deps);
      expect(result.httpStatus).toBe(200);
      expect(result.body).toMatchObject({
        status: "failed",
        errorCode: "timeout",
        retryable: true,
      });
      expect((result.body as { metrics: unknown }).metrics).toBeTruthy();
      expect(rows.get(SESSION_A)).toMatchObject({ status: "failed", error_code: "timeout" });
    });

    it("다시 열기만 하면 AI를 또 부르지 않는다 — 명시적 재시도만", async () => {
      const failing = vi.fn(async () => {
        throw new ProviderError("provider_http_503");
      });
      const { deps } = makeDeps({ generate: failing });
      await requestWorkoutFeedback(SESSION_A, deps);
      await requestWorkoutFeedback(SESSION_A, deps);
      expect(failing).toHaveBeenCalledTimes(1);
      await requestWorkoutFeedback(SESSION_A, deps, { retry: true });
      expect(failing).toHaveBeenCalledTimes(2);
    });

    it("재시도는 3회에서 멈춘다 — 무한 재시도 금지", async () => {
      const failing = vi.fn(async () => {
        throw new ProviderError("timeout");
      });
      const { deps } = makeDeps({ generate: failing });
      await requestWorkoutFeedback(SESSION_A, deps);
      await requestWorkoutFeedback(SESSION_A, deps, { retry: true });
      const third = await requestWorkoutFeedback(SESSION_A, deps, { retry: true });
      expect(third.body).toMatchObject({ status: "failed", retryable: false });
      const fourth = await requestWorkoutFeedback(SESSION_A, deps, { retry: true });
      expect(fourth.body).toMatchObject({ status: "failed", retryable: false });
      expect(failing).toHaveBeenCalledTimes(3);
    });

    it("AI가 형식에 안 맞는 답을 주면 invalid_output", async () => {
      const { deps } = makeDeps({
        generate: vi.fn(async () => ({ text: '{"hello":1}', model: "m" })),
      });
      const result = await requestWorkoutFeedback(SESSION_A, deps);
      expect(result.body).toMatchObject({ status: "failed", errorCode: "invalid_output" });
    });

    it("재료 조회가 실패해도 행을 pending으로 버려두지 않는다", async () => {
      const { deps, rows } = makeDeps({
        readSessionExercises: vi.fn(async () => {
          throw new Error("db down");
        }),
      });
      const result = await requestWorkoutFeedback(SESSION_A, deps);
      expect(result.body).toMatchObject({ status: "failed", errorCode: "read_error" });
      expect(rows.get(SESSION_A)?.status).toBe("failed");
    });
  });

  it("목표 프로필이 없으면 AI를 부르지 않고 409 profile_required", async () => {
    const { deps, generate } = makeDeps({ readProfile: vi.fn(async () => null) });
    const result = await requestWorkoutFeedback(SESSION_A, deps);
    expect(result).toEqual({ httpStatus: 409, body: { error: "profile_required" } });
    expect(generate).not.toHaveBeenCalled();
    expect(deps.insertPending).not.toHaveBeenCalled();
  });

  it("완료되지 않은 세션은 409 not_completed", async () => {
    const { deps, sessions } = makeDeps();
    sessions.set(SESSION_A, { ...sessions.get(SESSION_A)!, status: "active" });
    const result = await requestWorkoutFeedback(SESSION_A, deps);
    expect(result).toEqual({ httpStatus: 409, body: { error: "not_completed" } });
  });

  it("생성 중이면 202로 기다리게 하고, 90초 넘게 멈춘 행은 다시 선점한다", async () => {
    const { deps, rows, generate } = makeDeps();
    rows.set(SESSION_A, {
      session_id: SESSION_A,
      user_id: USER_A,
      status: "pending",
      attempt_count: 1,
      metrics: {},
      feedback: null,
      error_code: null,
      updated_at: new Date(NOW - 10_000).toISOString(),
      viewed_at: null,
    });
    const waiting = await requestWorkoutFeedback(SESSION_A, deps);
    expect(waiting).toEqual({ httpStatus: 202, body: { status: "pending" } });
    expect(generate).not.toHaveBeenCalled();

    rows.set(SESSION_A, {
      ...rows.get(SESSION_A)!,
      updated_at: new Date(NOW - 120_000).toISOString(),
    });
    const resumed = await requestWorkoutFeedback(SESSION_A, deps);
    expect(resumed.body).toMatchObject({ status: "completed" });
    expect(rows.get(SESSION_A)?.attempt_count).toBe(2);
  });

  it("통증 신고는 AI 입력의 증량 차단으로 이어진다", async () => {
    const { deps, generate } = makeDeps({
      readSessionFeedback: vi.fn(async () => ({ effort: null, flags: ["pain" as const] })),
    });
    await requestWorkoutFeedback(SESSION_A, deps);
    const prompt = (generate.mock.calls[0] as unknown[])[0] as { user: string };
    expect(prompt.user).toContain('"progression_blocked":true');
    expect(prompt.user).not.toContain(USER_A);
    expect(prompt.user).not.toContain(SESSION_A);
  });
});
