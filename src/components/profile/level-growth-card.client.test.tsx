// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getMyStageGrowth: vi.fn() }));
vi.mock("@/lib/level-growth", () => ({ getMyStageGrowth: mocks.getMyStageGrowth }));

import { LevelGrowthCard } from "./level-growth-card";

const NO_BASE = { state: "no_baseline", level: 3, stageIndex: 1, stageName: "개노답" };
const growth = (name: string, pct: number) => ({
  exerciseKey: name,
  kind: "w",
  baseline: 80,
  baselineDay: "2026-10-16",
  baselineBest: { weight: 60, reps: 10, seconds: null },
  current: 88,
  currentDay: "2026-11-13",
  currentBest: { weight: 66, reps: 10, seconds: null },
  growthPct: pct,
});
const ready = (growths: unknown[]) => ({
  state: "ready",
  level: 17,
  stageIndex: 4,
  stageName: "꾸준러",
  enteredAt: "2026-11-01T00:00:00Z",
  summary: {
    growths,
    unchangedCount: 0,
    unmatched: [],
    comparableCount: growths.length,
    previousStageExerciseCount: 2,
  },
});

beforeEach(() => mocks.getMyStageGrowth.mockReset());
afterEach(() => cleanup());

describe("LevelGrowthCard", () => {
  it("불러오는 동안 자리표시, 끝나면 결과", async () => {
    mocks.getMyStageGrowth.mockResolvedValue(NO_BASE);
    const { container } = render(<LevelGrowthCard userId="me" level={3} />);
    expect(container.querySelector('[aria-busy="true"][aria-label="내 성장"]')).not.toBeNull();
    await waitFor(() => expect(screen.getByText("측정 준비 중")).toBeDefined());
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(mocks.getMyStageGrowth).toHaveBeenCalledWith({ userId: "me", level: 3 });
  });

  it("성공하면 성장 기록을 그리고, 토글을 눌러 나머지를 펼친다", async () => {
    mocks.getMyStageGrowth.mockResolvedValue(
      ready([growth("A", 40), growth("B", 30), growth("C", 20), growth("D", 10)]),
    );
    render(<LevelGrowthCard userId="me" level={17} />);
    await waitFor(() => expect(screen.getByText("내 성장 · 4단계 꾸준러")).toBeDefined());
    expect(screen.getAllByTestId("growth-record")).toHaveLength(3);
    const toggle = screen.getByTestId("growth-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByTestId("growth-record")).toHaveLength(4);
  });

  it("조회가 실패하면 안내 문구를 보여 준다", async () => {
    mocks.getMyStageGrowth.mockRejectedValueOnce(new Error("boom"));
    render(<LevelGrowthCard userId="me" level={17} />);
    await waitFor(() => expect(screen.getByText(/내 성장을 불러오지 못했어요/)).toBeDefined());
    expect(screen.getByLabelText("내 성장")).toBeDefined();
    expect(mocks.getMyStageGrowth).toHaveBeenCalledTimes(1);
  });

  it("레벨이 바뀌면 옛 실패가 남지 않고 새 결과를 보여 준다", async () => {
    mocks.getMyStageGrowth.mockRejectedValueOnce(new Error("boom"));
    const { rerender } = render(<LevelGrowthCard userId="me" level={17} />);
    await waitFor(() => expect(screen.getByText(/내 성장을 불러오지 못했어요/)).toBeDefined());

    mocks.getMyStageGrowth.mockResolvedValueOnce(NO_BASE);
    rerender(<LevelGrowthCard userId="me" level={3} />);
    await waitFor(() => expect(screen.getByText("측정 준비 중")).toBeDefined());
    expect(screen.queryByText(/내 성장을 불러오지 못했어요/)).toBeNull();
    expect(mocks.getMyStageGrowth).toHaveBeenLastCalledWith({ userId: "me", level: 3 });
  });
});
