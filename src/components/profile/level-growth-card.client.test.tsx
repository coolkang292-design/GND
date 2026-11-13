// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getMyLevelGrowth: vi.fn() }));
vi.mock("@/lib/level-growth", () => ({ getMyLevelGrowth: mocks.getMyLevelGrowth }));

import { LevelGrowthCard } from "./level-growth-card";

beforeEach(() => mocks.getMyLevelGrowth.mockReset());
afterEach(() => cleanup());

describe("LevelGrowthCard", () => {
  it("불러오는 동안 자리표시, 끝나면 결과", async () => {
    mocks.getMyLevelGrowth.mockResolvedValue({ state: "no_entry", level: 5 });
    const { container } = render(<LevelGrowthCard userId="me" level={5} />);
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    await waitFor(() => expect(screen.getByText("측정 준비 중")).toBeDefined());
    expect(container.querySelector("[aria-busy='true']")).toBeNull();
    expect(mocks.getMyLevelGrowth).toHaveBeenCalledWith({ userId: "me", level: 5 });
  });

  it("조회가 실패하면 안내 문구를 보여 준다", async () => {
    mocks.getMyLevelGrowth.mockRejectedValueOnce(new Error("boom"));
    render(<LevelGrowthCard userId="me" level={5} />);
    await waitFor(() => expect(screen.getByText(/내 성장을 불러오지 못했어요/)).toBeDefined());
    expect(mocks.getMyLevelGrowth).toHaveBeenCalledTimes(1);
  });

  it("레벨이 바뀌면 옛 실패가 남지 않고 새 결과를 보여 준다", async () => {
    mocks.getMyLevelGrowth.mockRejectedValueOnce(new Error("boom"));
    const { rerender } = render(<LevelGrowthCard userId="me" level={5} />);
    await waitFor(() => expect(screen.getByText(/내 성장을 불러오지 못했어요/)).toBeDefined());

    mocks.getMyLevelGrowth.mockResolvedValueOnce({ state: "no_entry", level: 6 });
    rerender(<LevelGrowthCard userId="me" level={6} />);
    await waitFor(() => expect(screen.getByText("측정 준비 중")).toBeDefined());
    expect(screen.queryByText(/내 성장을 불러오지 못했어요/)).toBeNull();
  });
});
