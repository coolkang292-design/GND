// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogExercise } from "@/lib/types";
import type { CalendarSession } from "@/lib/workout";
import { TabataSheet } from "./tabata-sheet";

afterEach(cleanup);

function item(
  name: string,
  over: Partial<CatalogExercise> = {},
): CatalogExercise {
  return {
    id: `cat-${name}`,
    name,
    body_part: "가슴",
    exercise_type: "weight",
    measure: null,
    is_custom: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

/** 가슴 추천 4종 — 부위별 추천 목록이 그대로 뜨려면 시드 이름과 같아야 한다 */
const CATALOG = [
  item("체스트프레스 머신"),
  item("인클라인 벤치프레스"),
  item("덤벨 플라이"),
  item("푸시업", { exercise_type: "bodyweight", measure: "reps" }),
];

function setup(
  over: {
    pastSessions?: CalendarSession[];
    initialPicked?: CatalogExercise[];
  } = {},
) {
  return render(
    <TabataSheet
      open
      catalog={CATALOG}
      pastSessions={over.pastSessions ?? []}
      pastLoading={false}
      initialPicked={over.initialPicked}
      onClose={vi.fn()}
      onCreateCustom={vi.fn()}
      onBegin={vi.fn()}
      onComplete={vi.fn()}
      onCancelWorkout={vi.fn()}
    />,
  );
}

describe("TabataSheet — 운동 고르기 배선 (2026-08-06)", () => {
  it("전신 인터벌의 시간·리듬·시작 행동을 한 언어로 안내한다", () => {
    setup({ initialPicked: CATALOG });

    expect(
      screen.getByRole("heading", { name: /4분부터 시작하는 전신 인터벌/ }),
    ).toBeTruthy();
    expect(
      screen.getByText("음악에 맞춰 20초 운동 · 10초 휴식"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "전신 인터벌 시작" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(screen.queryByText(/타바타 —/)).toBeNull();
  });

  /*
    회귀: 피커의 추천 경로는 `onPickConfigured`로 결과를 돌려주는데, 그게
    **옵셔널 prop**이라 안 넘겨도 타입 검사가 통과한다. 안 넘기면 피커의
    `confirmSetup`이 조용히 `return`해서, 추천으로 4개를 고르고 '추가하기'를
    눌러도 아무 일도 일어나지 않았다(오류도 없었다). 개발 서버에서 잡았다.

    이 테스트는 **시트 → 피커 → 시트**를 한 번에 지난다. 피커만 따로 보는
    테스트(recommended-flow)는 이 구멍을 구조적으로 못 본다 — 거기서는
    `onPickConfigured`를 항상 넘기기 때문이다.
  */
  it("추천으로 고른 운동이 구성 목록에 담긴다", () => {
    const { getByText, getAllByText } = setup();

    fireEvent.click(getByText("+ 운동 고르기 (0/4)"));
    fireEvent.click(getByText(/부위별 추천/));
    fireEvent.click(getByText("체스트프레스 머신"));
    fireEvent.click(getByText("덤벨 플라이"));
    fireEvent.click(getByText("다음"));
    fireEvent.click(getByText("운동 2개 추가하기"));

    expect(getByText("+ 운동 고르기 (2/4)")).toBeTruthy();
    expect(getAllByText("체스트프레스 머신")).not.toHaveLength(0);
    expect(getAllByText("덤벨 플라이")).not.toHaveLength(0);
  });

  it("검색으로 고른 운동도 같은 자리에 담긴다", () => {
    const { getByText, getByPlaceholderText } = setup();

    fireEvent.click(getByText("+ 운동 고르기 (0/4)"));
    fireEvent.click(getByText(/운동 이름 검색/));
    fireEvent.change(getByPlaceholderText(/검색/), {
      target: { value: "덤벨 플라이" },
    });
    fireEvent.click(getByText("덤벨 플라이"));
    fireEvent.click(getByText("선택한 1개 운동 추가"));

    expect(getByText("+ 운동 고르기 (1/4)")).toBeTruthy();
  });

  it("4개를 넘겨 담아도 한도에서 잘린다", () => {
    const { getByText } = setup();

    fireEvent.click(getByText("+ 운동 고르기 (0/4)"));
    fireEvent.click(getByText(/부위별 추천/));
    for (const name of CATALOG.map((c) => c.name)) {
      fireEvent.click(getByText(name));
    }
    fireEvent.click(getByText("다음"));
    fireEvent.click(getByText("운동 4개 추가하기"));

    expect(getByText("+ 운동 고르기 (4/4)")).toBeTruthy();
  });
});
