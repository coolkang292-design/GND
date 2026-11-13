import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMyStageEvolutionStatus, refreshMyStageEvolution } from "./stage-evolution";
const rpc = vi.hoisted(() => vi.fn());
const settings = vi.hoisted(() => vi.fn());
vi.mock("./supabase/client", () => ({ getSupabaseBrowserClient: () => ({ rpc,
  from: () => ({ select: () => ({ eq: () => ({ single: settings }) }) }) }) }));
export const gateFixture = {
  mode: "gated", ruleVersion: "stage_growth_v1", currentStage: 4, currentLevel: 21,
  stageEnteredAt: "2026-08-01T00:00:00Z", nextStage: 5, state: "blocked", path: "growth",
  growthMetric: "top_n_zero_padded_mean", averageGrowthPct: 6, comparableCount: 3,
  requiredGrowthCount: 4, filledGrowthCount: 3,
  conditions: [
    { key: "xp", current: 21, required: 21, met: true },
    { key: "days", current: 60, required: 60, met: true },
    { key: "weeks", current: 24, required: 24, met: true },
    { key: "growth_count", current: 3, required: 4, met: false },
    { key: "growth_average", current: 6, required: 8, met: false },
  ],
  growthSummary: { growths: [], unmatched: [], comparableCount: 3, unchangedCount: 0, previousStageExerciseCount: 18 },
  selectedGrowths: [],
};
describe("서버 진화 RPC 호환", () => {
  beforeEach(() => { rpc.mockReset(); settings.mockReset(); settings.mockResolvedValue({ data: null, error: { code: "42P01" } }); });
  it("미설치 RPC만 legacy 호환으로 처리", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect(await getMyStageEvolutionStatus()).toBeNull();
  });
  it("권한/네트워크 오류를 XP 모드로 숨기지 않음", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(getMyStageEvolutionStatus()).rejects.toMatchObject({ code: "42501" });
  });
  it("설정이 ON인데 RPC가 없으면 XP 호환으로 되돌리지 않는다", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    settings.mockResolvedValue({ data: { enabled: true }, error: null });
    await expect(getMyStageEvolutionStatus()).rejects.toMatchObject({ code: "PGRST202" });
  });
  it("OFF 모드는 읽기만 하고 재판정하지 않음", async () => {
    rpc.mockResolvedValue({ data: { ...gateFixture, mode: "legacy_xp" }, error: null });
    expect((await refreshMyStageEvolution())?.mode).toBe("legacy_xp");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("ON에서 본인 재판정 한 번 후 서버 결과 반환", async () => {
    rpc.mockResolvedValueOnce({ data: gateFixture, error: null }).mockResolvedValueOnce({ data: gateFixture, error: null });
    expect((await refreshMyStageEvolution())?.currentStage).toBe(4);
    expect(rpc.mock.calls).toEqual([["get_my_stage_evolution_status"], ["refresh_my_stage_evolution"]]);
  });
  it("잘못된 서버 응답을 XP로 대체하지 않음", async () => {
    rpc.mockResolvedValue({ data: { ...gateFixture, currentStage: "4" }, error: null });
    await expect(getMyStageEvolutionStatus()).rejects.toThrow("invalid stage evolution");
  });
});
