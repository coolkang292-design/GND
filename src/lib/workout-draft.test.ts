import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDraft } from "./workout";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadDraft 예정표 버전 호환", () => {
  it("기존 version 1 임시 운동을 version 4로 보존한다", () => {
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
    expect(draft.version).toBe(4);
    expect(draft.scheduledPlanId).toBeNull();
    expect(draft.sourceSessionId).toBeNull();
    expect(draft.effortMessage).toBeNull();
    expect(draft.exercises[0].name).toBe("스쿼트");
  });

  it("기존 version 2 임시 운동을 version 4로 보존한다", () => {
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
    expect(draft.version).toBe(4);
    expect(draft.sourceSessionId).toBeNull();
    expect(draft.effortMessage).toBeNull();
    expect(draft.exercises[0].name).toBe("벤치프레스");
  });

  it("기존 version 3 임시 운동을 version 4로 보존한다", () => {
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
    expect(draft.version).toBe(4);
    expect(draft.scheduledPlanId).toBe("plan-1");
    expect(draft.sourceSessionId).toBeNull();
    expect(draft.exercises[0].name).toBe("데드리프트");
  });

  it("알 수 없는 버전은 안전하게 빈 임시 운동으로 초기화한다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ version: 99, exercises: [{ name: "위험" }] }),
    });

    expect(loadDraft("user-id").exercises).toEqual([]);
  });
});
