// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExerciseGuide } from "@/lib/domain/exercise-guides";
import { ExerciseGuideSheet } from "./exercise-guide-sheet";

// vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다 (CLAUDE.md §함정)
afterEach(cleanup);

const guideWithoutSource: ExerciseGuide = {
  exerciseName: "숄더프레스",
  setup: ["등을 지지대에 붙이고 손목을 세워요"],
  movement: ["손잡이를 머리 위로 밀고 천천히 내려요"],
  breathing: "밀며 내쉬고 내리며 들이마셔요",
  mistakes: ["허리를 과하게 꺾지 않아요"],
  caution: "어깨 앞쪽이 찝히면 중단해요",
};

const guideWithSource: ExerciseGuide = {
  ...guideWithoutSource,
  source: {
    provider: "네이버 지식백과",
    url: "https://terms.naver.com/entry.naver?docId=2099791&cid=51030&categoryId=51030",
    checkedAt: "2026-08-12",
  },
};

describe("ExerciseGuideSheet — GND 안내를 먼저 보여준다", () => {
  it("다섯 영역과 각 내용을 그린다", () => {
    render(<ExerciseGuideSheet guide={guideWithoutSource} onClose={vi.fn()} />);

    for (const heading of [
      "시작 자세",
      "동작",
      "호흡",
      "자주 하는 실수",
      "주의",
    ]) {
      expect(screen.getByText(heading), heading).toBeTruthy();
    }
    expect(screen.getByText("등을 지지대에 붙이고 손목을 세워요")).toBeTruthy();
    expect(screen.getByText("밀며 내쉬고 내리며 들이마셔요")).toBeTruthy();
    expect(screen.getByText("어깨 앞쪽이 찝히면 중단해요")).toBeTruthy();
  });

  it("제목에 운동 이름이 들어간다", () => {
    render(<ExerciseGuideSheet guide={guideWithoutSource} onClose={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: /숄더프레스/ }),
    ).toBeTruthy();
  });

  it("접근성 있는 대화상자다", () => {
    render(<ExerciseGuideSheet guide={guideWithoutSource} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("통증이 있으면 멈추라는 공통 안내를 늘 함께 붙인다", () => {
    render(<ExerciseGuideSheet guide={guideWithoutSource} onClose={vi.fn()} />);

    expect(screen.getByText(/통증·저림·어지럼/)).toBeTruthy();
  });
});

describe("ExerciseGuideSheet — 외부 원문 링크", () => {
  it("출처가 있을 때만 원문 링크를 낸다", () => {
    render(<ExerciseGuideSheet guide={guideWithSource} onClose={vi.fn()} />);

    const link = screen.getByRole("link", {
      name: /네이버 지식백과에서 자세히 보기/,
    });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(link.getAttribute("href")).toBe(guideWithSource.source!.url);
  });

  it("출처가 없으면 링크를 아예 그리지 않는다 — 깨진 링크를 만들지 않는다", () => {
    render(<ExerciseGuideSheet guide={guideWithoutSource} onClose={vi.fn()} />);

    expect(screen.queryByRole("link")).toBeNull();
  });

  it("출처가 없어도 안내와 닫기는 정상이다", () => {
    const onClose = vi.fn();
    render(<ExerciseGuideSheet guide={guideWithoutSource} onClose={onClose} />);

    const close = screen.getByRole("button", { name: "안내 닫기" });
    expect((close as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("계약을 어긴 출처는 링크로 만들지 않는다 — https·네이버가 아니면 무시", () => {
    // 잘못된 값이 데이터로 새어 들어와도 화면이 그걸 눌리게 하면 안 된다.
    render(
      <ExerciseGuideSheet
        guide={{
          ...guideWithoutSource,
          source: {
            provider: "네이버 지식백과",
            url: "http://example.com/a",
            checkedAt: "2026-08-12",
          },
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("ExerciseGuideSheet — 닫기", () => {
  it("Esc로 닫힌다", () => {
    const onClose = vi.fn();
    render(<ExerciseGuideSheet guide={guideWithoutSource} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
