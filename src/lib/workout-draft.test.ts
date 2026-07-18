import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDraft } from "./workout";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadDraft 예정표 버전 호환", () => {
  it("기존 version 1 임시 운동을 version 2로 보존한다", () => {
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
    expect(draft.version).toBe(2);
    expect(draft.scheduledPlanId).toBeNull();
    expect(draft.exercises[0].name).toBe("스쿼트");
  });

  it("알 수 없는 버전은 안전하게 빈 임시 운동으로 초기화한다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ version: 99, exercises: [{ name: "위험" }] }),
    });

    expect(loadDraft("user-id").exercises).toEqual([]);
  });
});
