import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import { getMyStageGrowth } from "./level-growth";

type Call = { method: string; args: unknown[] };
type Result = { data: unknown; error: unknown };

/** 호출 기록을 남기고, 끝 메서드에서 (그때까지의 호출을 보고) 결과를 정하는 체인 */
function builder(result: Result | ((calls: Call[]) => Result)) {
  const calls: Call[] = [];
  const b: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "is", "gt", "lte", "order"]) {
    b[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return b;
    };
  }
  b.limit = (...args: unknown[]) => {
    calls.push({ method: "limit", args });
    return Promise.resolve(typeof result === "function" ? result(calls) : result);
  };
  return { b, calls };
}

const ENTERED = "2026-11-01T00:00:00.000Z"; // 현재 단계(4단계 = Lv.16) 진입
const PREV_ENTERED = "2026-09-01T00:00:00.000Z"; // 이전 단계(Lv.11) 진입
const set = (kg: number) => ({ weight_kg: kg, reps: 10, duration_seconds: null, is_completed: true });
const session = (day: string, kg: number, name = "벤치") => ({
  completed_at: `${day}T00:00:00.000Z`,
  tabata_minutes: null,
  workout_exercises: [{ exercise_name: name, exercise_type: "weight", sort_order: 0, workout_sets: [set(kg)] }],
});
/** 진입 이하(기준선 쪽)에만 나오는 세션 */
const BEFORE = [session("2026-09-10", 55, "스쿼트"), session("2026-10-10", 60), session("2026-10-20", 58)];
/** 진입 후(현재 쪽)에만 나오는 세션 */
const AFTER = [session("2026-11-10", 66), session("2026-11-12", 70)];

const HISTORY = [
  { level: 16, entered_at: ENTERED },
  { level: 11, entered_at: PREV_ENTERED },
];

function wire(history: unknown, opts: { historyError?: unknown; sessionError?: "before" | "after" } = {}) {
  const sessionCalls: Call[][] = [];
  const hist = builder({ data: history, error: opts.historyError ?? null });
  mocks.from.mockImplementation((name: string) => {
    if (name === "user_level_history") return hist.b;
    if (name === "workout_sessions") {
      const t = builder((calls) => {
        const isBefore = calls.some((c) => c.method === "lte");
        if (opts.sessionError === (isBefore ? "before" : "after")) {
          return { data: null, error: { message: "sess-boom" } };
        }
        return { data: isBefore ? BEFORE : AFTER, error: null };
      });
      sessionCalls.push(t.calls);
      return t.b;
    }
    throw new Error(`예상 못한 테이블: ${name}`);
  });
  return { hist, sessionCalls };
}

beforeEach(() => {
  mocks.from.mockReset();
  mocks.rpc.mockReset();
});

describe("getMyStageGrowth", () => {
  it("1단계(Lv.1~5)는 비교할 이전 기록이 없어 no_baseline — 조회도 하지 않는다", async () => {
    wire(HISTORY);
    const r = await getMyStageGrowth({ userId: "me", level: 3 });
    expect(r).toEqual({ state: "no_baseline", level: 3, stageIndex: 1, stageName: "개노답" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("진입 이력을 본인 id로, 현재·이전 단계 첫 레벨만 읽는다 (Lv.18 → 16과 11)", async () => {
    const t = wire(HISTORY);
    await getMyStageGrowth({ userId: "me", level: 18 });
    expect(t.hist.calls).toContainEqual({ method: "eq", args: ["user_id", "me"] });
    expect(t.hist.calls).toContainEqual({ method: "in", args: ["level", [16, 11]] });
  });

  it("2단계(Lv.6)는 이전 단계 첫 레벨이 1이다", async () => {
    const t = wire([{ level: 6, entered_at: ENTERED }, { level: 1, entered_at: PREV_ENTERED }]);
    await getMyStageGrowth({ userId: "me", level: 7 });
    expect(t.hist.calls).toContainEqual({ method: "in", args: ["level", [6, 1]] });
  });

  it("현재 단계 진입 행이 없으면 no_baseline — 수치를 지어내지 않는다", async () => {
    const t = wire([{ level: 11, entered_at: PREV_ENTERED }]);
    const r = await getMyStageGrowth({ userId: "me", level: 18 });
    expect(r).toEqual({ state: "no_baseline", level: 18, stageIndex: 4, stageName: "꾸준러" });
    expect(t.sessionCalls).toHaveLength(0);
  });

  it("이력 조회가 실패하면 던진다 (조용히 no_baseline으로 넘기지 않는다)", async () => {
    wire(null, { historyError: { message: "boom" } });
    await expect(getMyStageGrowth({ userId: "me", level: 18 })).rejects.toEqual({ message: "boom" });
  });

  it("세션은 두 쿼리로 나눠 읽는다 — 둘 다 본인 id로 거르고 최신순 정렬 뒤 limit", async () => {
    const t = wire(HISTORY);
    await getMyStageGrowth({ userId: "me", level: 18 });
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
    // 기준선 쪽: 진입 시각 이하 (기간 제한 없음 — gt 조건이 없다)
    expect(before).toContainEqual({ method: "lte", args: ["completed_at", ENTERED] });
    expect(before.some((c) => c.method === "gt")).toBe(false);
    expect(before).toContainEqual({ method: "limit", args: [2000] });
    // 현재 쪽: 진입 시각 이후
    expect(after).toContainEqual({ method: "gt", args: ["completed_at", ENTERED] });
    expect(after).toContainEqual({ method: "limit", args: [1000] });
  });

  it("두 세션 쿼리 중 하나가 실패해도 던진다", async () => {
    wire(HISTORY, { sessionError: "before" });
    await expect(getMyStageGrowth({ userId: "me", level: 18 })).rejects.toEqual({ message: "sess-boom" });
    wire(HISTORY, { sessionError: "after" });
    await expect(getMyStageGrowth({ userId: "me", level: 18 })).rejects.toEqual({ message: "sess-boom" });
  });

  it("진입 이하 최고 기록(60)을 기준으로 현재 최고(70)와 비교한다 — +16.7%", async () => {
    wire(HISTORY);
    const r = await getMyStageGrowth({ userId: "me", level: 18 });
    if (r.state !== "ready") throw new Error("ready가 아니다");
    expect(r.stageIndex).toBe(4);
    expect(r.stageName).toBe("꾸준러");
    expect(r.enteredAt).toBe(ENTERED);
    expect(r.summary.growths).toHaveLength(1);
    expect(r.summary.growths[0].exerciseKey).toBe("벤치");
    expect(r.summary.growths[0].baselineBest.weight).toBe(60);
    expect(r.summary.growths[0].currentBest.weight).toBe(70);
    expect(r.summary.growths[0].growthPct).toBeCloseTo((70 / 60 - 1) * 100, 9);
    // 이전 단계(9/1 이후 ~ 11/1)에 한 종목: 벤치 (스쿼트는 9/10 → 포함) = 2
    expect(r.summary.previousStageExerciseCount).toBe(2);
  });

  it("이전 단계 진입 행이 없으면 previousStageExerciseCount는 null", async () => {
    wire([{ level: 16, entered_at: ENTERED }]);
    const r = await getMyStageGrowth({ userId: "me", level: 18 });
    if (r.state !== "ready") throw new Error("ready가 아니다");
    expect(r.summary.previousStageExerciseCount).toBeNull();
  });

  it("v2.1 객체(level_growth_baselines 테이블, freeze_level_baselines RPC)를 건드리지 않는다", async () => {
    wire(HISTORY);
    await getMyStageGrowth({ userId: "me", level: 18 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    const tables = mocks.from.mock.calls.map((c) => c[0]);
    expect(tables).not.toContain("level_growth_baselines");
    expect(new Set(tables)).toEqual(new Set(["user_level_history", "workout_sessions"]));
  });
});
