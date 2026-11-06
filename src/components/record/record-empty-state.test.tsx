// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordEmptyState } from "./record-empty-state";
import { dailyQuestCopy } from "@/lib/domain/daily-quest";

afterEach(cleanup);

const QUEST = dailyQuestCopy({ kind: "repeat", todayKey: "2026-11-06", streak: 24 });

function tiles(container: HTMLElement) {
  return [...container.querySelectorAll("button")]
    .filter((b) => b.className.includes("min-h-[92px]"))
    .map((b) => (b.textContent ?? "").trim());
}

describe("RecordEmptyState — 추천 배치 (시안 2026-11-06)", () => {
  it("퀘스트 문구가 없는 날에도 운동 계획 길이 있다 (제안 없는 날 카드는 없다)", () => {
    const { getByText, queryByText } = render(
      <RecordEmptyState hasHistory={false} onAdd={vi.fn()} onLoadRecent={vi.fn()} />,
    );
    // 퀘스트는 매일 생긴다 — 퀘스트 문구가 없는 날(계획이 이미 있거나 운동을 마친 날)에는
    // "제안 없는 날" 카드를 따로 그리지 않고 시작 타일만 그린다.
    expect(queryByText("오늘의 운동을 정해 볼까요?")).toBeNull();
    expect(getByText("운동 시작하기")).toBeTruthy();
    expect(getByText("운동 계획")).toBeTruthy();
  });

  it("이력이 없으면 '지난 운동' 타일이 아예 없다", () => {
    // ⚠️ 눌러도 빈 목록이 나오는 막다른 길을 주지 않는다.
    const { queryByText } = render(
      <RecordEmptyState hasHistory={false} onAdd={vi.fn()} onLoadRecent={vi.fn()} />,
    );
    expect(queryByText("지난 운동")).toBeNull();
  });

  it("타일이 서로 다른 핸들러로 간다", () => {
    const onAdd = vi.fn();
    const onLoadRecent = vi.fn();
    const onLoadRoutine = vi.fn();
    const onInterval = vi.fn();
    const { getByText } = render(
      <RecordEmptyState
        hasHistory
        onAdd={onAdd}
        onLoadRecent={onLoadRecent}
        onLoadRoutine={onLoadRoutine}
        routineCount={2}
        onApplySecondary={onInterval}
      />,
    );
    fireEvent.click(getByText("운동 계획"));
    fireEvent.click(getByText("지난 운동"));
    fireEvent.click(getByText("내 루틴"));
    fireEvent.click(getByText("4분 인터벌"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onLoadRecent).toHaveBeenCalledTimes(1);
    expect(onLoadRoutine).toHaveBeenCalledTimes(1);
    expect(onInterval).toHaveBeenCalledTimes(1);
  });

  it("옛 빈 상태 카드(그림·안내문·초보자 문구)와 볼륨·휴식·타바타 안내가 없다", () => {
    // 제거 검증 — 새 것이 있는지만이 아니라 옛 것이 **없어졌는지**를 본다.
    const { container } = render(
      <RecordEmptyState hasHistory onAdd={vi.fn()} onLoadRecent={vi.fn()} />,
    );
    const text = container.textContent ?? "";
    for (const gone of [
      "아직 추가된 운동이 없어요", "쉽게 기록할 수 있어요", "초보자도 쉽게 시작",
      "완료 볼륨", "이전 대비", "세트 사이 휴식", "전신 인터벌", "복구됩니다", "오늘의 운동을 정해 볼까요?",
    ]) {
      expect(text).not.toContain(gone);
    }
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelectorAll('[data-testid="record-start-card"]')).toHaveLength(1);
  });

  it("저장된 루틴이 있을 때만 '내 루틴' 타일이 나온다", () => {
    const none = render(
      <RecordEmptyState hasHistory onAdd={vi.fn()} onLoadRecent={vi.fn()} onLoadRoutine={vi.fn()} routineCount={0} />,
    );
    expect(none.queryByText("내 루틴")).toBeNull();
    none.unmount();
    const some = render(
      <RecordEmptyState hasHistory onAdd={vi.fn()} onLoadRecent={vi.fn()} onLoadRoutine={vi.fn()} routineCount={2} />,
    );
    expect(some.getByText("내 루틴")).toBeTruthy();
  });
});

describe("퀘스트 카드 — 한 줄 제목 · 칩 2개 · 버튼 1개", () => {
  function renderQuest(over: Partial<React.ComponentProps<typeof RecordEmptyState>> = {}) {
    return render(
      <RecordEmptyState
        hasHistory
        onAdd={vi.fn()}
        onLoadRecent={vi.fn()}
        onLoadRoutine={vi.fn()}
        routineCount={2}
        suggestionKind="repeat"
        quest={QUEST}
        onApplySuggestion={vi.fn()}
        onApplySecondary={vi.fn()}
        {...over}
      />,
    );
  }

  it("'오늘의 퀘스트가 도착했어요' · 한 줄 제목 · 설명 · 칩 2개", () => {
    const { getByTestId } = renderQuest();
    const card = getByTestId("daily-quest-card");
    expect(card.textContent).toContain("오늘의 퀘스트가 도착했어요");
    expect(card.querySelector("h2")?.textContent).toBe("이 퀘스트 하나면 오늘 운동 완료");
    expect(card.textContent).toContain("지난 운동을 바탕으로 추천했어요");
    expect([...card.querySelectorAll("li")].map((l) => l.textContent)).toEqual([
      "⚡ 최대 +160 XP",
      "🔥 25일 연속",
    ]);
  });

  it("주 버튼은 '퀘스트 확인하기' 하나 — 누르면 퀘스트를 담고 계획 화면으로 간다", () => {
    const onApply = vi.fn();
    renderQuest({ onApplySuggestion: onApply });
    const primary = screen.getAllByRole("button").filter((b) => b.getAttribute("data-priority") === "primary");
    expect(primary).toHaveLength(1);
    expect(primary[0].textContent).toBe("퀘스트 확인하기");
    fireEvent.click(primary[0]);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("'다른 방법으로 시작하기' 아래 타일 4개가 2×2로 순서대로: 지난 운동 · 4분 인터벌 · 운동 계획 · 내 루틴", () => {
    const { container } = renderQuest();
    expect(tiles(container)).toEqual([
      "지난 운동그대로 담기",
      "4분 인터벌바로 시작",
      "운동 계획새로 만들기",
      "내 루틴불러오기",
    ]);
    expect(container.querySelector(".grid-cols-2")).not.toBeNull();
  });

  it("퀘스트 버튼이 있으면 '운동 계획'은 보조 타일이다", () => {
    const { getByText } = renderQuest();
    expect(getByText("운동 계획").closest("button")!.getAttribute("data-priority")).toBe("secondary");
  });

  it("퀘스트 버튼이 없는 날은 '운동 계획' 타일이 주(라임 테두리)다", () => {
    const { getByText } = render(
      <RecordEmptyState hasHistory={false} onAdd={vi.fn()} onLoadRecent={vi.fn()} />,
    );
    expect(getByText("운동 계획").closest("button")!.getAttribute("data-priority")).toBe("primary");
  });

  it("걷기 퀘스트: 제목이 '오늘 걷기 완료'", () => {
    const walk = dailyQuestCopy({ kind: "walk", todayKey: "2026-11-06", streak: 0 });
    const { getByTestId } = renderQuest({ suggestionKind: "walk", quest: walk, hasHistory: false });
    expect(getByTestId("daily-quest-card").querySelector("h2")?.textContent).toBe(
      "이 퀘스트 하나면 오늘 걷기 완료",
    );
  });

  it("인터벌 퀘스트: 같은 '퀘스트 확인하기'이고 타일에 인터벌을 또 두지 않는다", () => {
    const interval = dailyQuestCopy({ kind: "interval", todayKey: "2026-11-06", streak: 2 });
    const { getByRole, queryByText } = renderQuest({ suggestionKind: "interval", quest: interval });
    expect(getByRole("button", { name: "퀘스트 확인하기" })).toBeTruthy();
    expect(queryByText("4분 인터벌")).toBeNull();
  });

  it("카드는 하나다 — 제안 카드가 따로 안 뜬다", () => {
    const { container } = renderQuest();
    expect(container.querySelectorAll('[data-testid="daily-quest-card"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="suggestion-card"]')).toHaveLength(0);
  });
});

/**
 * 2026-08-16 — 계획 없는 날 제안 (C2). 퀘스트 문구 없이 제안만 온 호출(옛 경로)도
 * 길이 끊기지 않는다.
 */
describe("제안만 있는 호출(퀘스트 문구 없음)", () => {
  it("걷기 제안이면 주 버튼과 철학문이 뜬다", () => {
    render(
      <RecordEmptyState
        hasHistory={false}
        onAdd={() => {}}
        onLoadRecent={() => {}}
        suggestionKind="walk"
        suggestionBody="오래 하는 것보다, 하루도 빼먹지 않는 게 중요해요"
        onApplySuggestion={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /10분 걷기 담기/ })).toBeTruthy();
    expect(screen.getByText(/빼먹지 않는 게 중요/)).toBeTruthy();
  });

  it("지난 운동 제안은 '지난번 그대로 담기'가 뜨고, 인터벌은 '바로 시작' 타일이다", () => {
    render(
      <RecordEmptyState
        hasHistory
        onAdd={() => {}}
        onLoadRecent={() => {}}
        suggestionKind="repeat"
        suggestionBody="지난번 그대로 담아 뒀어요"
        onApplySuggestion={() => {}}
        onApplySecondary={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /지난번 그대로 담기/ })).toBeTruthy();
    const interval = screen.getByText("4분 인터벌").closest("button")!;
    expect(interval.textContent).toContain("바로 시작");
    expect(interval.textContent).not.toContain("담기");
  });

  it("제안이 없으면 퀘스트·담기 버튼이 없다", () => {
    render(
      <RecordEmptyState
        hasHistory
        onAdd={() => {}}
        onLoadRecent={() => {}}
        suggestionKind={null}
        suggestionBody=""
        onApplySuggestion={() => {}}
      />,
    );
    for (const name of ["퀘스트 확인하기", "지난번 그대로 담기", "10분 걷기 담기", "4분 인터벌 시작"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });
});

describe("퀘스트 카드의 내 캐릭터 (시안 단계 — 기록 화면에는 아직 연결하지 않는다)", () => {
  it("heroImage가 있으면 카드 오른쪽에 캐릭터가 들어간다", () => {
    const { getByTestId } = render(
      <RecordEmptyState
        hasHistory
        onAdd={vi.fn()}
        onLoadRecent={vi.fn()}
        suggestionKind="repeat"
        quest={QUEST}
        heroImage="/characters/char-4.png"
        onApplySuggestion={vi.fn()}
      />,
    );
    const hero = getByTestId("quest-character");
    expect(hero.querySelector("img")).not.toBeNull();
    // 글자 영역을 좁혀 캐릭터와 겹치지 않게 한다
    expect(getByTestId("daily-quest-card").innerHTML).toContain("max-w-[64%]");
  });

  it("heroImage가 없으면 그림 없이 글자를 넓게 쓴다 (기록 화면의 현재 상태)", () => {
    const { container, getByTestId } = render(
      <RecordEmptyState
        hasHistory
        onAdd={vi.fn()}
        onLoadRecent={vi.fn()}
        suggestionKind="repeat"
        quest={QUEST}
        onApplySuggestion={vi.fn()}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(getByTestId("daily-quest-card").innerHTML).not.toContain("max-w-[64%]");
  });
});
