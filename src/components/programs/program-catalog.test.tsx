// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OFFICIAL_PROGRAMS } from "@/lib/domain/official-programs";
import { ProgramCatalog, ProgramDetail } from "./program-catalog";

afterEach(cleanup);

describe("ProgramCatalog", () => {
  it("대표 카드 한 장과 선택 가능한 프로그램 네 장을 보여준다", () => {
    const onPick = vi.fn();
    render(<ProgramCatalog programs={OFFICIAL_PROGRAMS} onPick={onPick} />);

    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(
      screen
        .getByText("시선이 머무는 어깨")
        .closest("button")
        ?.getAttribute("data-featured"),
    ).toBe("true");
    for (const title of [
      "옷태를 세우는 가슴",
      "소매를 채우는 팔",
      "실루엣을 완성하는 하체",
      "몸은 가볍게, 인상은 선명하게",
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }

    fireEvent.click(screen.getByText("소매를 채우는 팔"));
    expect(onPick).toHaveBeenCalledWith("arm-outline-6w");
  });

  it("이미지 로드 실패 뒤에도 카드의 텍스트와 선택 동작을 유지한다", () => {
    const onPick = vi.fn();
    const { container } = render(
      <ProgramCatalog programs={OFFICIAL_PROGRAMS} onPick={onPick} />,
    );

    const shoulderImage = container.querySelector(
      'img[src*="shoulder.webp"]',
    );
    expect(shoulderImage).not.toBeNull();
    fireEvent.error(shoulderImage!);

    expect(shoulderImage?.className).toContain("opacity-0");
    const shoulderButton = screen.getByRole("button", {
      name: /시선이 머무는 어깨/,
    });
    expect(shoulderButton).toBeTruthy();
    fireEvent.click(shoulderButton);
    expect(onPick).toHaveBeenCalledWith("shoulder-frame-6w");
  });
});

describe("ProgramDetail", () => {
  it("운동 구성과 자동 세팅을 먼저 설명하고 일정 CTA만 강조한다", () => {
    const onBack = vi.fn();
    const onSchedule = vi.fn();
    render(
      <ProgramDetail
        program={OFFICIAL_PROGRAMS[0]}
        onBack={onBack}
        onSchedule={onSchedule}
      />,
    );

    expect(screen.getByRole("heading", { name: "시선이 머무는 어깨" })).toBeTruthy();
    expect(screen.getByText("주 3회 · 6주 · 18회 · 회당 50–65분")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "이런 사람에게 맞아요" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "A회차 미리보기" })).toBeTruthy();
    expect(screen.getByText(/최근 기록을 바탕으로 8–10회/)).toBeTruthy();
    expect(screen.getByText(/통증이 느껴지면 운동을 중단/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "요일과 시간 정하기" }));
    expect(onSchedule).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: /프로그램 목록으로/ }),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("체지방 관리 프로그램은 식사와 일상 활동도 함께 안내한다", () => {
    render(
      <ProgramDetail
        program={OFFICIAL_PROGRAMS[4]}
        onBack={vi.fn()}
        onSchedule={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/운동만으로 감량을 보장하지 않으며 식사와 일상 활동량/),
    ).toBeTruthy();
  });
});
