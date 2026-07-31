import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDraft } from "./workout";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadDraft 예정표 버전 호환", () => {
  it("기존 version 1 임시 운동을 version 5로 보존한다", () => {
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
    expect(draft.version).toBe(5);
    expect(draft.scheduledPlanId).toBeNull();
    expect(draft.sourceSessionId).toBeNull();
    expect(draft.effortMessage).toBeNull();
    expect(draft.exercises[0].name).toBe("스쿼트");
  });

  it("기존 version 2 임시 운동을 version 5로 보존한다", () => {
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
    expect(draft.version).toBe(5);
    expect(draft.sourceSessionId).toBeNull();
    expect(draft.effortMessage).toBeNull();
    expect(draft.exercises[0].name).toBe("벤치프레스");
  });

  it("기존 version 3 임시 운동을 version 5로 보존한다", () => {
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
    expect(draft.version).toBe(5);
    expect(draft.scheduledPlanId).toBe("plan-1");
    expect(draft.sourceSessionId).toBeNull();
    expect(draft.exercises[0].name).toBe("데드리프트");
  });

  // 무동작 감지(2026-08-01) 도입 전 draft — 진행 중이던 운동이 날아가면 안 된다.
  it("기존 version 4 임시 운동을 무동작 필드만 채워 version 5로 올린다", () => {
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
    expect(draft.version).toBe(5);
    expect(draft.sessionId).toBe("session-1");
    expect(draft.startedAtMs).toBe(1_754_000_000_000);
    expect(draft.exercises[0].name).toBe("오버헤드 프레스");
    expect(draft.pausedSeconds).toBe(0);
    expect(draft.pausedAtMs).toBeNull();
    expect(draft.lastActivityMs).toBeNull();
    expect(draft.tabataMinutes).toBeNull();
  });

  it("version 5 임시 운동은 정지 상태를 그대로 복구한다", () => {
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
    expect(draft.pausedSeconds).toBe(120);
    expect(draft.pausedAtMs).toBe(1_754_000_600_000);
    expect(draft.lastActivityMs).toBe(1_754_000_300_000);
  });

  it("알 수 없는 버전은 안전하게 빈 임시 운동으로 초기화한다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ version: 99, exercises: [{ name: "위험" }] }),
    });

    expect(loadDraft("user-id").exercises).toEqual([]);
  });
});
