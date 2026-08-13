// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderStreak, headerStreakText } from "./header-streak";

/** 2026-08-13(목) 21:00 KST */
const NOW = new Date("2026-08-13T12:00:00Z");
const at = (day: string) => new Date(`${day}T12:00:00Z`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("headerStreakText — 헤더 한 줄", () => {
  it("연속이 있으면 일수와 오늘 여부를 함께 적는다", () => {
    expect(headerStreakText(8, true)).toBe("8일 연속 · 오늘 완료");
  });

  /**
   * ⚠️ **`오늘 아직`이 이 줄의 쓸모 전부다.** 숫자만 있으면 오늘 것이 이미 반영된
   * 줄 안다 — 스트릭은 오늘 안 하면 끊기는 값이다.
   */
  it("오늘 안 했으면 그렇게 말한다", () => {
    expect(headerStreakText(8, false)).toBe("8일 연속 · 오늘 아직");
  });

  /** ⚠️ `0일 연속`은 끊긴 상태를 성적처럼 말하는 것이다 */
  it("0일이면 숫자를 적지 않는다", () => {
    expect(headerStreakText(0, false)).toBe("운동을 시작하면 불꽃이 켜져요");
    expect(headerStreakText(0, false)).not.toContain("0일");
  });
});

describe("HeaderStreak", () => {
  it("완료 기록에서 연속 일수를 세어 적는다", () => {
    render(
      <HeaderStreak
        completedAts={[at("2026-08-11"), at("2026-08-12"), at("2026-08-13")]}
        todayDone
      />,
    );
    expect(screen.getByText("3일 연속 · 오늘 완료")).toBeTruthy();
  });

  /**
   * ⚠️ 오늘 여부는 **홈이 판정한 값**을 그대로 쓴다. 여기서 다시 판정하면 같은
   * 화면에서 헤더와 콕 버튼이 서로 다른 "오늘"을 쓸 수 있다.
   */
  it("오늘 여부는 받은 값을 따른다", () => {
    render(
      <HeaderStreak
        completedAts={[at("2026-08-11"), at("2026-08-12")]}
        todayDone={false}
      />,
    );
    expect(screen.getByText(/오늘 아직/)).toBeTruthy();
  });

  /** 조회 전에 글자가 나타났다 바뀌면 헤더가 튄다 */
  it("조회 전에는 글자 없이 높이만 잡는다", () => {
    const { container } = render(
      <HeaderStreak completedAts={null} todayDone={false} />,
    );
    expect(container.textContent).toBe("");
    expect(container.querySelector("p")).toBeTruthy();
  });

  it("기록이 없으면 시작을 권한다", () => {
    render(<HeaderStreak completedAts={[]} todayDone={false} />);
    expect(screen.getByText("운동을 시작하면 불꽃이 켜져요")).toBeTruthy();
  });
});
