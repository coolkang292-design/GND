import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDraft } from "./workout";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadDraft 예정표 버전 호환", () => {
  it("기존 version 1 임시 운동을 version 6으로 보존한다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () =>
        JSON.stringify({
          version: 1,
          sessionId: null,
          startedAtMs: null,
          restSeconds: 90,
          exercises: [{ key: "legacy-exercise", name: "스쿼트", sets: [] }],
        }),
    });

    const draft = loadDraft("user-id");
    expect(draft.version).toBe(6);
    expect(draft.scheduledPlanId).toBeNull();
    expect(draft.sourceSessionId).toBeNull();
    expect(draft.effortMessage).toBeNull();
    expect(draft.exercises[0].name).toBe("스쿼트");
  });

  it("기존 version 2 임시 운동을 version 6으로 보존한다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () =>
        JSON.stringify({
          version: 2,
          sessionId: null,
          startedAtMs: null,
          scheduledPlanId: null,
          restSeconds: 90,
          exercises: [{ key: "old-exercise", name: "벤치프레스", sets: [] }],
        }),
    });

    const draft = loadDraft("user-id");
    expect(draft.version).toBe(6);
    expect(draft.sourceSessionId).toBeNull();
    expect(draft.effortMessage).toBeNull();
    expect(draft.exercises[0].name).toBe("벤치프레스");
  });

  it("기존 version 3 임시 운동을 version 6으로 보존한다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () =>
        JSON.stringify({
          version: 3,
          sessionId: null,
          startedAtMs: null,
          scheduledPlanId: "plan-1",
          effortMessage: null,
          restSeconds: 90,
          exercises: [{ key: "v3-exercise", name: "데드리프트", sets: [] }],
        }),
    });

    const draft = loadDraft("user-id");
    expect(draft.version).toBe(6);
    expect(draft.scheduledPlanId).toBe("plan-1");
    expect(draft.sourceSessionId).toBeNull();
    expect(draft.exercises[0].name).toBe("데드리프트");
  });

  // 무동작 감지(2026-08-01) 도입 전 draft — 진행 중이던 운동이 날아가면 안 된다.
  it("기존 version 4 임시 운동을 무동작 필드만 채워 version 6으로 올린다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () =>
        JSON.stringify({
          version: 4,
          sessionId: "session-1",
          startedAtMs: 1_754_000_000_000,
          scheduledPlanId: null,
          sourceSessionId: null,
          effortMessage: null,
          restSeconds: 90,
          exercises: [{ key: "v4-exercise", name: "오버헤드 프레스", sets: [] }],
        }),
    });

    const draft = loadDraft("user-id");
    expect(draft.version).toBe(6);
    expect(draft.sessionId).toBe("session-1");
    expect(draft.startedAtMs).toBe(1_754_000_000_000);
    expect(draft.exercises[0].name).toBe("오버헤드 프레스");
    expect(draft.pausedSeconds).toBe(0);
    expect(draft.pausedAtMs).toBeNull();
    expect(draft.lastActivityMs).toBeNull();
    expect(draft.tabataMinutes).toBeNull();
  });

  it("version 5 임시 운동을 프로그램 필드만 채워 version 6으로 올린다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () =>
        JSON.stringify({
          version: 5,
          sessionId: "session-2",
          startedAtMs: 1_754_000_000_000,
          scheduledPlanId: null,
          sourceSessionId: null,
          effortMessage: null,
          restSeconds: 90,
          exercises: [{ key: "v5-exercise", name: "스쿼트", sets: [] }],
          pausedSeconds: 120,
          pausedAtMs: 1_754_000_600_000,
          lastActivityMs: 1_754_000_300_000,
          tabataMinutes: null,
        }),
    });

    const draft = loadDraft("user-id");
    expect(draft.version).toBe(6);
    // 진행 중이던 운동이 날아가면 안 된다 — 정지 상태는 그대로 살린다
    expect(draft.pausedSeconds).toBe(120);
    expect(draft.pausedAtMs).toBe(1_754_000_600_000);
    expect(draft.lastActivityMs).toBe(1_754_000_300_000);
    // 새로 생기는 프로그램 필드는 비어 있어야 한다
    expect(draft.program).toBeNull();
  });

  it("알 수 없는 버전은 안전하게 빈 임시 운동으로 초기화한다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ version: 99, exercises: [{ name: "위험" }] }),
    });

    expect(loadDraft("user-id").exercises).toEqual([]);
  });
});

/**
 * 프로그램 운동 (0067) — 진행률과 다음 회차 추천의 재료가 draft에 실린다.
 *
 * ⚠️ 새로고침·앱 재시작에도 살아남아야 한다. 여기서 잃으면 마지막 세트 피드백이
 *    저장되지 않고, 다음 회차 추천이 조용히 처음으로 돌아간다.
 */
describe("loadDraft 프로그램 운동 (version 6)", () => {
  it("프로그램 메타·처방·세트 피드백을 그대로 복구한다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () =>
        JSON.stringify({
          version: 6,
          sessionId: "session-3",
          startedAtMs: 1_754_000_000_000,
          scheduledPlanId: "plan-9",
          sourceSessionId: null,
          effortMessage: null,
          restSeconds: 90,
          exercises: [
            {
              key: "v6-exercise",
              name: "숄더프레스",
              sets: [
                {
                  key: "s1",
                  weightKg: 40,
                  reps: 10,
                  distanceKm: 0,
                  durationMin: 0,
                  done: true,
                  effortFeedback: "on_target",
                },
              ],
              prescription: {
                repsMin: 8,
                repsMax: 10,
                targetRir: 2,
                restSeconds: 120,
                loadStepKg: 2.5,
              },
            },
          ],
          pausedSeconds: 0,
          pausedAtMs: null,
          lastActivityMs: null,
          tabataMinutes: null,
          program: {
            enrollmentId: "11111111-1111-4111-8111-111111111111",
            week: 2,
            session: 1,
            templateVersion: 1,
          },
        }),
    });

    const draft = loadDraft("user-id");
    expect(draft.version).toBe(6);
    expect(draft.program).toEqual({
      enrollmentId: "11111111-1111-4111-8111-111111111111",
      week: 2,
      session: 1,
      templateVersion: 1,
    });
    expect(draft.exercises[0].prescription?.restSeconds).toBe(120);
    expect(draft.exercises[0].sets[0].effortFeedback).toBe("on_target");
  });

  it("일반 운동 draft는 program이 null이고 처방이 없다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () =>
        JSON.stringify({
          version: 6,
          sessionId: null,
          startedAtMs: null,
          scheduledPlanId: null,
          sourceSessionId: null,
          effortMessage: null,
          restSeconds: 90,
          exercises: [
            {
              key: "plain",
              name: "스쿼트",
              sets: [
                {
                  key: "s1",
                  weightKg: 0,
                  reps: 0,
                  distanceKm: 0,
                  durationMin: 0,
                  done: false,
                  effortFeedback: null,
                },
              ],
            },
          ],
          pausedSeconds: 0,
          pausedAtMs: null,
          lastActivityMs: null,
          tabataMinutes: null,
          program: null,
        }),
    });

    const draft = loadDraft("user-id");
    expect(draft.program).toBeNull();
    expect(draft.exercises[0].prescription).toBeUndefined();
    expect(draft.exercises[0].sets[0].effortFeedback).toBeNull();
  });
});

describe("emptyDraft·newSet 기본값", () => {
  it("새 세션은 program null, 세트 피드백 null로 시작한다", async () => {
    const { emptyDraft, newSet } = await import("./workout");
    expect(emptyDraft().version).toBe(6);
    expect(emptyDraft().program).toBeNull();
    expect(newSet().effortFeedback).toBeNull();
  });
});
