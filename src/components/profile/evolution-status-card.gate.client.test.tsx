// @vitest-environment jsdom
// 프로필 시트처럼 서버 판정(gateStatus)을 넘기지 않는 호출처에서도 서버 규칙이 켜져 있으면 서버 카드를 보여야 한다.
// (2026-11-13: 시트가 서버 규칙 ON 상태에서도 옛 +2.5%/+8.0% 카드를 보여 주던 문제)
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StageGateStatus } from "@/lib/domain/evolution-gate";

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  legacy: vi.fn(),
}));

vi.mock("@/lib/stage-evolution", () => ({
  getMyStageEvolutionStatus: mocks.getStatus,
  refreshMyStageEvolution: vi.fn(),
}));
vi.mock("@/lib/evolution", () => ({ getMyEvolutionStatus: mocks.legacy }));
vi.mock("@/lib/flags", () => ({ GROWTH_V2: false }));

import { EvolutionStatusCard } from "./evolution-status-card";

const gated: StageGateStatus = {
  mode: "gated", ruleVersion: "stage_growth_v1", currentStage: 4, currentLevel: 19,
  stageEnteredAt: "2026-10-07T22:14:37Z", nextStage: 5, state: "blocked", path: "growth",
  growthMetric: "top_n_zero_padded_mean", averageGrowthPct: 15.9, comparableCount: 16,
  requiredGrowthCount: 4, filledGrowthCount: 4,
  conditions: [
    { key: "xp", current: 19, required: 21, met: false },
    { key: "days", current: 71, required: 60, met: true },
    { key: "growth_average", current: 15.9, required: 5, met: true },
  ],
  growthSummary: null, selectedGrowths: [],
};
const base = { userId: "me", totalXp: 9000, currentStage: 4 };

beforeEach(() => {
  mocks.getStatus.mockReset();
  mocks.legacy.mockReset();
  mocks.legacy.mockResolvedValue({ currentStage: 4, nextStage: 5, level: 19, allMet: false, conditions: [] });
});
afterEach(() => cleanup());

describe("EvolutionStatusCard — gateStatus를 넘기지 않는 호출처(프로필 시트)", () => {
  it("서버 규칙이 켜져 있으면 서버 카드를 보이고 옛 계산은 하지 않는다", async () => {
    mocks.getStatus.mockResolvedValue(gated);
    render(<EvolutionStatusCard {...base} />);
    await waitFor(() => expect(screen.getByTestId("server-evolution-status")).toBeDefined());
    expect(screen.getByText("+15.9%")).toBeDefined();
    expect(screen.getByText("목표 +5%")).toBeDefined();
    expect(mocks.legacy).not.toHaveBeenCalled();
  });

  it("서버 판정을 불러오는 동안은 옛 카드를 먼저 보이지 않는다(스켈레톤)", async () => {
    let release: (v: StageGateStatus) => void = () => {};
    mocks.getStatus.mockReturnValue(new Promise<StageGateStatus>(res => { release = res; }));
    const { container } = render(<EvolutionStatusCard {...base} />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(mocks.legacy).not.toHaveBeenCalled();
    release(gated);
    await waitFor(() => expect(screen.getByTestId("server-evolution-status")).toBeDefined());
  });

  it("서버가 설치되지 않았거나 꺼져 있으면(null) 그때만 옛 카드로 물러난다", async () => {
    mocks.getStatus.mockResolvedValue(null);
    render(<EvolutionStatusCard {...base} />);
    await waitFor(() => expect(mocks.legacy).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("server-evolution-status")).toBeNull();
  });

  it("legacy_xp 응답도 옛 카드로 물러난다", async () => {
    mocks.getStatus.mockResolvedValue({ ...gated, mode: "legacy_xp" });
    render(<EvolutionStatusCard {...base} />);
    await waitFor(() => expect(mocks.legacy).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("server-evolution-status")).toBeNull();
  });

  it("서버 판정 조회가 실패하면 옛 수치로 대신하지 않고 불러오지 못했다고 알린다", async () => {
    mocks.getStatus.mockRejectedValue(new Error("boom"));
    render(<EvolutionStatusCard {...base} />);
    await waitFor(() => expect(screen.getByText(/진화 현황을 불러오지 못했어요/)).toBeDefined());
    expect(mocks.legacy).not.toHaveBeenCalled();
  });

  it("호출처가 gateStatus를 이미 넘겼으면 스스로 다시 조회하지 않는다(성장 허브)", async () => {
    render(<EvolutionStatusCard {...base} gateStatus={gated} />);
    expect(screen.getByTestId("server-evolution-status")).toBeDefined();
    expect(mocks.getStatus).not.toHaveBeenCalled();
    expect(mocks.legacy).not.toHaveBeenCalled();
  });

  it("호출처가 gateStatus=null(서버 미설치)을 넘기면 조회 없이 옛 카드", async () => {
    render(<EvolutionStatusCard {...base} gateStatus={null} />);
    await waitFor(() => expect(mocks.legacy).toHaveBeenCalledTimes(1));
    expect(mocks.getStatus).not.toHaveBeenCalled();
  });
});
