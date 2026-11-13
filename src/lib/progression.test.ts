import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => mocks }));
vi.mock("@/lib/character-variant", () => ({
  getMyCharacterVariant: async () => "male", normalizeCharacterVariant: () => "male",
  getCharacterVariants: async () => new Map(), characterSrc: (path: string) => path,
}));
import { getProgressSummary, getCrewMemberProfile } from "./progression";

beforeEach(() => {
  mocks.from.mockReset(); mocks.rpc.mockReset();
  mocks.from.mockImplementation((table: string) => {
    const b: Record<string, unknown> = {};
    b.select = () => b; b.eq = () => b;
    b.maybeSingle = async () => ({ data: { total_xp: 10000, current_stage: 4, streak_shield_count: 0 }, error: null });
    b.then = (resolve: (v: unknown) => unknown) => resolve({ count: 0, error: null });
    if (!["user_progress", "xp_transactions"].includes(table)) throw new Error(table);
    return b;
  });
});
describe("실제 단계 표시 — XP 레벨과 분리", () => {
  it("본인 Lv.21·서버4단계면 꾸준러 이미지 유지", async () => {
    const result = await getProgressSummary();
    expect(result.currentLevel).toBe(21);
    expect(result.currentStage).toBe(4);
    expect(result.stageName).toBe("꾸준러");
    expect(result.characterPath).toBe("/characters/char-4.png");
  });
  it("크루원 Lv.21·서버4단계도 꾸준러로 표시", async () => {
    mocks.rpc.mockResolvedValue({ data: { totalXp: 10000, currentStage: 4 }, error: null });
    const result = await getCrewMemberProfile("crew");
    expect(result.currentLevel).toBe(21);
    expect(result.currentStage).toBe(4);
    expect(result.stageName).toBe("꾸준러");
    expect(result.characterPath).toBe("/characters/char-4.png");
  });
});
