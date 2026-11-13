import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import { getMyLevelGrowth } from "./level-growth";

type Call = { method: string; args: unknown[] };

/** 어떤 메서드로 끝나든 같은 결과를 주는 체인 */
function builder(result: unknown) {
  const calls: Call[] = [];
  const b: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "gt"]) {
    b[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return b;
    };
  }
  for (const end of ["limit", "maybeSingle"]) {
    b[end] = (...args: unknown[]) => {
      calls.push({ method: end, args });
      return Promise.resolve({ data: result, error: null });
    };
  }
  return { b, calls };
}

const ENTERED = "2026-11-09T00:00:00.000Z";
const set = (kg: number) => ({ weight_kg: kg, reps: 10, duration_seconds: null, is_completed: true });
const session = (day: string, kg: number) => ({
  completed_at: `${day}T00:00:00.000Z`,
  tabata_minutes: null,
  workout_exercises: [
    { exercise_name: "벤치", exercise_type: "weight", sort_order: 0, workout_sets: [set(kg)] },
  ],
});
const SESSIONS = [
  session("2026-10-10", 60),
  session("2026-10-20", 60),
  session("2026-11-01", 60),
  session("2026-11-10", 66),
];

function wire(entry: unknown, baselines: unknown[] = []) {
  const tables: Record<string, ReturnType<typeof builder>> = {
    user_level_history: builder(entry),
    workout_sessions: builder(SESSIONS),
    level_growth_baselines: builder(baselines),
  };
  mocks.from.mockImplementation((name: string) => tables[name].b);
  mocks.rpc.mockResolvedValue({ data: 1, error: null });
  return tables;
}

beforeEach(() => {
  mocks.from.mockReset();
  mocks.rpc.mockReset();
});

describe("getMyLevelGrowth", () => {
  it("레벨 진입 이력이 없으면 no_entry — 수치를 지어내지 않는다", async () => {
    wire(null);
    const r = await getMyLevelGrowth({ userId: "me", level: 19 });
    expect(r).toEqual({ state: "no_entry", level: 19 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("세션은 반드시 본인 id로 거르고, 진입 60일 전부터만 읽는다", async () => {
    const t = wire({ level: 19, entered_at: ENTERED, baseline_frozen_at: null });
    await getMyLevelGrowth({ userId: "me", level: 19 });
    const calls = t.workout_sessions.calls;
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "me"] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "completed"] });
    expect(calls).toContainEqual({ method: "is", args: ["deleted_at", null] });
    expect(calls).toContainEqual({ method: "gt", args: ["completed_at", "2026-09-10T00:00:00.000Z"] });
  });

  it("아직 고정 전이면 계산한 기준선을 RPC로 한 번 고정한다", async () => {
    wire({ level: 19, entered_at: ENTERED, baseline_frozen_at: null });
    const r = await getMyLevelGrowth({ userId: "me", level: 19 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const [name, args] = mocks.rpc.mock.calls[0];
    expect(name).toBe("freeze_level_baselines");
    expect(args.p_level).toBe(19);
    expect(args.p_metric_version).toBe("growth_v2.1");
    expect(args.p_rows).toHaveLength(1);
    expect(args.p_rows[0]).toMatchObject({ exercise_key: "벤치", metric_type: "w", baseline_value: 80 });
    expect(args.p_rows[0].samples).toHaveLength(3);
    if (r.state !== "ready") throw new Error("ready가 아니다");
    expect(r.summary.exercises[0].growthPct).toBeCloseTo(10, 6);
  });

  it("이미 고정됐으면 저장된 기준선을 쓰고 다시 고정하지 않는다", async () => {
    // 저장된 기준이 100이면 (지금 기록으로 다시 계산한 80이 아니라) 100과 비교해야 한다
    wire({ level: 19, entered_at: ENTERED, baseline_frozen_at: "2026-11-09T01:00:00.000Z" }, [
      { exercise_key: "벤치", metric_type: "w", baseline_value: 100, samples: [] },
    ]);
    const r = await getMyLevelGrowth({ userId: "me", level: 19 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    if (r.state !== "ready") throw new Error("ready가 아니다");
    expect(r.summary.exercises[0].baseline).toBe(100);
    expect(r.summary.exercises[0].growthPct).toBeCloseTo(-12, 6); // 88 vs 100
  });

  it("고정 RPC가 실패해도 화면은 계산값으로 그린다", async () => {
    wire({ level: 19, entered_at: ENTERED, baseline_frozen_at: null });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const r = await getMyLevelGrowth({ userId: "me", level: 19 });
    expect(r.state).toBe("ready");
  });

  it("고정 RPC가 예외로 거부돼도 화면은 계산값으로 그린다", async () => {
    wire({ level: 19, entered_at: ENTERED, baseline_frozen_at: null });
    mocks.rpc.mockRejectedValue(new Error("network"));
    const r = await getMyLevelGrowth({ userId: "me", level: 19 });
    expect(r.state).toBe("ready");
  });
});
