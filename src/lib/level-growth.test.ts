import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import { getMyLevelGrowth } from "./level-growth";

type Call = { method: string; args: unknown[] };
type Result = { data: unknown; error: unknown };

/** 호출 기록을 남기고, 끝 메서드에서 (그때까지의 호출을 보고) 결과를 정하는 체인 */
function builder(result: Result | ((calls: Call[]) => Result)) {
  const calls: Call[] = [];
  const b: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "gt", "lte", "order"]) {
    b[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return b;
    };
  }
  for (const end of ["limit", "maybeSingle"]) {
    b[end] = (...args: unknown[]) => {
      calls.push({ method: end, args });
      return Promise.resolve(typeof result === "function" ? result(calls) : result);
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
/** 진입 전(기준선 쪽)에만 나오는 세션 */
const BEFORE = [session("2026-10-10", 60), session("2026-10-20", 60), session("2026-11-01", 60)];
/** 진입 후(현재 쪽)에만 나오는 세션 */
const AFTER = [session("2026-11-10", 66)];

const BASELINE_SAMPLES = [
  { day: "2026-10-10", value: 100, best: { weight: 75, reps: 10, seconds: null } },
  { day: "2026-10-20", value: 100, best: { weight: 75, reps: 10, seconds: null } },
  { day: "2026-11-01", value: 100, best: { weight: 75, reps: 10, seconds: null } },
];

function wire(entry: unknown, baselines: unknown[] = [], opts: { entryError?: unknown } = {}) {
  const sessionCalls: Call[][] = [];
  const tables = {
    user_level_history: builder({ data: entry, error: opts.entryError ?? null }),
    level_growth_baselines: builder({ data: baselines, error: null }),
  };
  mocks.from.mockImplementation((name: string) => {
    if (name === "workout_sessions") {
      // 진입 전 쪽(lte가 걸린 쿼리)과 진입 후 쪽(lte 없음)을 다른 결과로 돌려준다.
      const t = builder((calls) => ({
        data: calls.some((c) => c.method === "lte") ? BEFORE : AFTER,
        error: null,
      }));
      sessionCalls.push(t.calls);
      return t.b;
    }
    return tables[name as keyof typeof tables].b;
  });
  mocks.rpc.mockResolvedValue({ data: 1, error: null });
  return { tables, sessionCalls };
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

  it("진입 이력은 본인 id와 그 레벨로 읽는다", async () => {
    const t = wire({ level: 19, entered_at: ENTERED, baseline_frozen_at: null });
    await getMyLevelGrowth({ userId: "me", level: 19 });
    expect(t.tables.user_level_history.calls).toContainEqual({ method: "eq", args: ["user_id", "me"] });
    expect(t.tables.user_level_history.calls).toContainEqual({ method: "eq", args: ["level", 19] });
  });

  it("진입 이력 조회가 실패하면 던진다 (조용히 no_entry로 넘기지 않는다)", async () => {
    wire(null, [], { entryError: { message: "boom" } });
    await expect(getMyLevelGrowth({ userId: "me", level: 19 })).rejects.toEqual({ message: "boom" });
  });

  it("세션은 두 쿼리로 나눠 읽는다 — 둘 다 본인 id로 거르고 최신순 정렬 뒤 limit", async () => {
    const t = wire({ level: 19, entered_at: ENTERED, baseline_frozen_at: null });
    await getMyLevelGrowth({ userId: "me", level: 19 });
    expect(t.sessionCalls).toHaveLength(2);
    const before = t.sessionCalls.find((c) => c.some((x) => x.method === "lte"))!;
    const after = t.sessionCalls.find((c) => !c.some((x) => x.method === "lte"))!;
    expect(before).toBeDefined();
    expect(after).toBeDefined();

    for (const calls of [before, after]) {
      expect(calls).toContainEqual({ method: "eq", args: ["user_id", "me"] });
      expect(calls).toContainEqual({ method: "eq", args: ["status", "completed"] });
      expect(calls).toContainEqual({ method: "is", args: ["deleted_at", null] });
      expect(calls).toContainEqual({ method: "order", args: ["completed_at", { ascending: false }] });
      // order는 limit보다 먼저여야 한다 (정렬 뒤에 자른다)
      const names = calls.map((c) => c.method);
      expect(names.indexOf("order")).toBeLessThan(names.indexOf("limit"));
    }
    // 기준선 쪽: 진입 60일 전 ~ 진입 시각
    expect(before).toContainEqual({ method: "gt", args: ["completed_at", "2026-09-10T00:00:00.000Z"] });
    expect(before).toContainEqual({ method: "lte", args: ["completed_at", ENTERED] });
    // 현재 쪽: 진입 시각 이후
    expect(after).toContainEqual({ method: "gt", args: ["completed_at", ENTERED] });
  });

  it("진입 전 쿼리에만 나오는 세션으로 기준선을 계산한다", async () => {
    wire({ level: 19, entered_at: ENTERED, baseline_frozen_at: null });
    const r = await getMyLevelGrowth({ userId: "me", level: 19 });
    if (r.state !== "ready") throw new Error("ready가 아니다");
    expect(r.summary.exercises[0].baseline).toBe(80);
    expect(r.summary.exercises[0].baselineSamples).toHaveLength(3);
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
    for (const s of args.p_rows[0].samples) {
      expect(Object.keys(s).sort()).toEqual(["best", "day", "value"]);
    }
    if (r.state !== "ready") throw new Error("ready가 아니다");
    expect(r.summary.exercises[0].growthPct).toBeCloseTo(10, 6);
  });

  it("이미 고정됐으면 저장된 기준선을 쓰고 다시 고정하지 않는다", async () => {
    // 저장된 기준이 100이면 (지금 기록으로 다시 계산한 80이 아니라) 100과 비교해야 한다
    const t = wire({ level: 19, entered_at: ENTERED, baseline_frozen_at: "2026-11-09T01:00:00.000Z" }, [
      { exercise_key: "벤치", metric_type: "w", baseline_value: 100, samples: BASELINE_SAMPLES },
    ]);
    const r = await getMyLevelGrowth({ userId: "me", level: 19 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    const calls = t.tables.level_growth_baselines.calls;
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "me"] });
    expect(calls).toContainEqual({ method: "eq", args: ["target_level", 19] });
    expect(calls).toContainEqual({ method: "eq", args: ["metric_version", "growth_v2.1"] });
    if (r.state !== "ready") throw new Error("ready가 아니다");
    expect(r.summary.exercises[0].baseline).toBe(100);
    expect(r.summary.exercises[0].baselineSamples).toEqual(BASELINE_SAMPLES);
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
