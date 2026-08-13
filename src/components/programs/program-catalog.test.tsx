// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INTERVAL_PROGRAM,
  OFFICIAL_PROGRAMS,
  STRENGTH_PROGRAMS,
} from "@/lib/domain/official-programs";
import {
  IntervalProgramDetail,
  ProgramCatalog,
  ProgramDetail,
} from "./program-catalog";

afterEach(cleanup);

describe("ProgramCatalog", () => {
  it("대표 카드 한 장과 나머지 프로그램을 격자로 보여준다", () => {
    const onPick = vi.fn();
    render(<ProgramCatalog programs={OFFICIAL_PROGRAMS} onPick={onPick} />);

    expect(screen.getAllByRole("button")).toHaveLength(6);
    expect(
      screen
        .getByText("시선이 머무는 어깨")
        .closest("button")
        ?.getAttribute("data-featured"),
    ).toBe("true");
    expect(screen.getByTestId("program-cover-featured").className).toContain(
      "aspect-[16/9]",
    );
    expect(screen.getAllByTestId("program-cover-compact")).toHaveLength(5);
    for (const cover of screen.getAllByTestId("program-cover-compact")) {
      expect(cover.className).toContain("aspect-[4/3]");
    }
    for (const title of [
      "티셔츠 핏을 살리는 가슴",
      "반팔이 달라지는 팔",
      "몸의 기반을 만드는 하체",
      "살은 빼고, 몸은 선명하게",
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }

    fireEvent.click(screen.getByText("반팔이 달라지는 팔"));
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

  it("목록에서 운동 추가로 돌아갈 수 있다", () => {
    // 사용자 지적 2026-08-12 — 상세에는 뒤로 가기가 있는데 목록에는 없어서
    // 여기까지 들어오면 탭바로만 빠져나갈 수 있었다
    render(<ProgramCatalog programs={OFFICIAL_PROGRAMS} onPick={vi.fn()} />);

    const back = screen.getByRole("link", { name: /운동 추가로/ });
    expect(back.getAttribute("href")).toBe("/record");
  });

  it("인터벌을 6번째 카드로 세운다", () => {
    // 사용자 지시 2026-08-12 — 인터벌은 '프로그램으로 시작하기' 안의 **프로그램**이다
    const onPick = vi.fn();
    render(<ProgramCatalog programs={OFFICIAL_PROGRAMS} onPick={onPick} />);

    expect(screen.getAllByRole("button")).toHaveLength(6);
    expect(screen.getAllByTestId("program-cover-compact")).toHaveLength(5);
    fireEvent.click(screen.getByText(INTERVAL_PROGRAM.eyebrow));
    expect(onPick).toHaveBeenCalledWith("interval-burn-6w");
  });
});

describe("IntervalProgramDetail — 종목 설명 (2026-08-13)", () => {
  it("종목을 누르면 그 자리에서 설명이 펼쳐진다", () => {
    // 사용자 지적 2026-08-13 — 안내 26종을 썼는데 화면에 연결이 안 돼 있었다
    render(
      <IntervalProgramDetail
        program={INTERVAL_PROGRAM}
        onBack={vi.fn()}
        onSchedule={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("interval-exercise-guide")).toBeNull();
    const trigger = screen.getByRole("button", { name: "맨몸 스쿼트 설명 보기" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const guide = screen.getByTestId("interval-exercise-guide");
    for (const label of ["시작 자세", "동작", "호흡", "흔한 실수", "주의"]) {
      expect(guide.textContent).toContain(label);
    }
    expect(guide.textContent).toContain("엉덩이를 뒤로");

    fireEvent.click(trigger);
    expect(screen.queryByTestId("interval-exercise-guide")).toBeNull();
  });

  it("난이도를 바꾸면 그 난이도의 종목 설명이 열린다", () => {
    render(
      <IntervalProgramDetail
        program={INTERVAL_PROGRAM}
        onBack={vi.fn()}
        onSchedule={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "높음" }));
    fireEvent.click(screen.getAllByRole("button", { name: "버피 설명 보기" })[0]);
    expect(
      screen.getByTestId("interval-exercise-guide").textContent,
    ).toContain("다리를 뒤로 뻗었다");
  });

  it("9조합 36칸이 전부 안내를 갖고 있다", () => {
    // 안내가 없으면 버튼이 아니라 그냥 글자로 그린다 — 눌러도 안 열리는
    // 자리를 만들지 않기 위해서다. 하나라도 빠지면 여기서 드러난다.
    const view = render(
      <IntervalProgramDetail
        program={INTERVAL_PROGRAM}
        onBack={vi.fn()}
        onSchedule={vi.fn()}
      />,
    );
    for (const label of ["입문", "보통", "높음"]) {
      fireEvent.click(screen.getByRole("tab", { name: label }));
      const cells = screen.getAllByTestId("interval-exercise");
      expect(cells).toHaveLength(12);
      for (const cell of cells) {
        expect(cell.querySelector("button")).not.toBeNull();
      }
    }
    view.unmount();
  });
});
describe("ProgramDetail", () => {
  it("운동 구성과 자동 세팅을 먼저 설명하고 일정 CTA만 강조한다", () => {
    const onBack = vi.fn();
    const onSchedule = vi.fn();
    render(
      <ProgramDetail
        program={STRENGTH_PROGRAMS[0]}
        onBack={onBack}
        onSchedule={onSchedule}
      />,
    );

    expect(screen.getByRole("heading", { name: "시선이 머무는 어깨" })).toBeTruthy();
    expect(screen.getByText("총 18회 · 회당 50–65분")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "이런 사람에게 맞아요" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "회차별 상세" })).toBeTruthy();
    expect(screen.getByText(/최근 기록을 바탕으로 8–10회/)).toBeTruthy();
    expect(screen.getByText(/통증이 느껴지면 운동을 중단/)).toBeTruthy();
    expect(screen.getAllByTestId("program-stat")).toHaveLength(4);
    expect(screen.getByText("운동 · 세트")).toBeTruthy();
    expect(screen.getByText("반복")).toBeTruthy();
    expect(screen.getByText("세트 사이 휴식")).toBeTruthy();
    expect(screen.getAllByTestId("exercise-preview-row")).toHaveLength(
      STRENGTH_PROGRAMS[0].sessions[0].exercises.length,
    );
    expect(screen.getByTestId("program-audience").getAttribute("data-tone")).toBe(
      "highlight",
    );
    expect(screen.getByTestId("program-automation").getAttribute("data-tone")).toBe(
      "accent",
    );
    expect(screen.getByRole("note")).toBeTruthy();

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
        program={STRENGTH_PROGRAMS[4]}
        onBack={vi.fn()}
        onSchedule={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/운동만으로 감량을 보장하지 않으며 식사와 일상 활동량/),
    ).toBeTruthy();
  });

  it("운동명을 누르면 짧은 운동 설명을 같은 표 안에서 펼친다", () => {
    render(
      <ProgramDetail
        program={STRENGTH_PROGRAMS[0]}
        onBack={vi.fn()}
        onSchedule={vi.fn()}
      />,
    );

    const description =
      "바벨을 등에 메고 앉았다 일어나 하체 전체의 힘을 기르는 운동이에요.";
    const trigger = screen.getByRole("button", {
      name: "바벨 백스쿼트 설명 보기",
    });

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(description)).toBeNull();

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(description)).toBeTruthy();

    fireEvent.click(trigger);
    expect(screen.queryByText(description)).toBeNull();
  });

  it("6주 전체 반복 구조와 A·B·C 회차별 운동표를 전환해 보여준다", () => {
    render(
      <ProgramDetail
        program={STRENGTH_PROGRAMS[0]}
        onBack={vi.fn()}
        onSchedule={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "A·B·C 세 회차를 6주 동안 반복해요" }),
    ).toBeTruthy();
    expect(screen.getAllByTestId("program-roadmap-week")).toHaveLength(6);
    expect(screen.getAllByText("A · B · C")).toHaveLength(6);

    const aTab = screen.getByRole("tab", { name: "A회 · 밀고 세우기" });
    const bTab = screen.getByRole("tab", { name: "B회 · 등판과 뒤쪽 어깨" });
    const cTab = screen.getByRole("tab", { name: "C회 · 옆선과 전신 균형" });
    expect(aTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("바벨 백스쿼트")).toBeTruthy();
    expect(screen.getAllByText("초보·경험 3세트").length).toBeGreaterThan(0);

    fireEvent.click(bTab);
    expect(bTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("루마니안 데드리프트")).toBeTruthy();
    expect(screen.queryByText("바벨 백스쿼트")).toBeNull();

    fireEvent.click(cTab);
    expect(cTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("덤벨 레터럴 레이즈")).toBeTruthy();
    expect(screen.getByText("초보 3세트 · 경험 4세트")).toBeTruthy();
  });

  it("프로그램 5종의 A·B·C 운동 모두 설명을 열 수 있다", () => {
    for (const program of STRENGTH_PROGRAMS) {
      const view = render(
        <ProgramDetail
          program={program}
          onBack={vi.fn()}
          onSchedule={vi.fn()}
        />,
      );

      for (const session of program.sessions) {
        fireEvent.click(
          screen.getByRole("tab", {
            name: `${session.key}회 · ${session.title}`,
          }),
        );

        for (const exercise of session.exercises) {
          const trigger = screen.getByRole("button", {
            name: `${exercise.exerciseName} 설명 보기`,
          });
          fireEvent.click(trigger);
          expect(
            screen.getByTestId("exercise-preview-description").textContent?.trim()
              .length,
          ).toBeGreaterThan(10);
          fireEvent.click(trigger);
        }
      }
      view.unmount();
    }
  }, 15_000);
});
