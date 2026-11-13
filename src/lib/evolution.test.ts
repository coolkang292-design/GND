import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ from: mocks.from }),
}));

import { getMyEvolutionStatus } from "./evolution";

function builder(rows: unknown[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const b: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "not"]) {
    b[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return b;
    };
  }
  b.limit = (...args: unknown[]) => {
    calls.push({ method: "limit", args });
    return Promise.resolve({ data: rows, error: null });
  };
  return { b, calls };
}

describe("getMyEvolutionStatus — 본인 기록만 읽는다", () => {
  /**
   * ⚠️ RLS는 크루 친구의 공개 세션도 읽게 열어 둔다. user_id 필터가 빠지면 친구의
   * 운동일이 내 진화 현황에 섞인다 (실측: 본인 64일인데 138세션이 읽혔다).
   */
  it("user_id로 거르고 완료·미삭제 세션만 본다", async () => {
    const { b, calls } = builder([]);
    mocks.from.mockReturnValue(b);

    await getMyEvolutionStatus({ userId: "me", totalXp: 0, currentStage: 1 });

    const eq = calls.filter((c) => c.method === "eq").map((c) => c.args);
    expect(eq).toContainEqual(["user_id", "me"]);
    expect(eq).toContainEqual(["status", "completed"]);
    expect(calls.find((c) => c.method === "is")?.args).toEqual(["deleted_at", null]);
  });

  it("같은 날 세션이 여러 개여도 운동일은 1일로 센다", async () => {
    const same = "2026-11-01T01:00:00Z";
    const { b } = builder([
      { completed_at: same, workout_exercises: [] },
      { completed_at: "2026-11-01T09:00:00Z", workout_exercises: [] },
    ]);
    mocks.from.mockReturnValue(b);

    const s = await getMyEvolutionStatus({ userId: "me", totalXp: 6000, currentStage: 3 });

    expect(s.conditions.find((c) => c.key === "days")?.current).toBe(1);
  });
});
