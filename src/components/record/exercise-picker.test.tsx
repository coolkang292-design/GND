// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarSession } from "@/lib/workout";
import type { CatalogExercise } from "@/lib/types";
import { ExercisePicker } from "./exercise-picker";

// vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다 — 직접 부르지 않으면
// 이전 테스트의 시트가 살아남아 getAllBy*가 중복으로 잡힌다.
afterEach(cleanup);

function catalogItem(
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

function session(daysAgo: number, ...exerciseNames: string[]): CalendarSession {
  return {
    id: `s-${daysAgo}-${exerciseNames.join("-")}`,
    completedAt: new Date(Date.now() - daysAgo * 86_400_000),
    verification: "none",
    durationSeconds: 2_700,
    exerciseNames,
    recordNote: null,
    tabataMinutes: null,
  };
}

const CATALOG = [
  catalogItem("벤치프레스"),
  catalogItem("랫풀다운", { body_part: "등" }),
  catalogItem("스쿼트", { body_part: "하체" }),
  catalogItem("데드리프트", { body_part: "등" }),
  catalogItem("러닝", { body_part: "유산소", exercise_type: "cardio" }),
  catalogItem("플랭크", { body_part: "코어", exercise_type: "bodyweight" }),
];

/** 벤치 3회 · 랫풀 2회 · 스쿼트 2회 · 데드 1회 · 러닝 1회 · 플랭크 1회 */
const SESSIONS = [
  session(1, "벤치프레스", "랫풀다운", "스쿼트"),
  session(2, "벤치프레스", "랫풀다운"),
  session(3, "벤치프레스", "스쿼트", "데드리프트"),
  session(4, "러닝"),
  session(5, "플랭크"),
];

function setup(over: { pastSessions?: CalendarSession[] } = {}) {
  return render(
    <ExercisePicker
      open
      catalog={CATALOG}
      pastSessions={over.pastSessions ?? SESSIONS}
      pastLoading={false}
      onClose={vi.fn()}
      onPickMany={vi.fn()}
      onPickPast={vi.fn()}
      onCreateCustom={vi.fn()}
    />,
  );
}

describe("ExercisePicker", () => {
  it("운동 찾기와 지난 기록 탭을 함께 보여준다", () => {
    const html = renderToStaticMarkup(
      <ExercisePicker
        open
        catalog={[]}
        pastSessions={[session(1, "벤치프레스", "랫풀다운")]}
        pastLoading={false}
        onClose={vi.fn()}
        onPickMany={vi.fn()}
        onPickPast={vi.fn()}
        onCreateCustom={vi.fn()}
      />,
    );

    expect(html).toContain("운동 찾기");
    expect(html).toContain("지난 기록");
  });
});

describe("ExercisePicker — ⭐ 자주 한 운동 (2026-08-02)", () => {
  it("상위 5개를 횟수와 함께 보여준다", () => {
    // 개수를 센다. "섹션이 있다"만 보면 몇 개가 렌더되는지 모른다 —
    // 0044에서 화면을 안 보고 당한 것이 정확히 이 종류였다.
    const { getByText } = setup();

    // 빈도순 상위 5개만 — 6번째(플랭크)는 칩에 없다
    const chipRow = getByText("⭐ 자주 한 운동").parentElement
      ?.lastElementChild as HTMLElement;
    expect(chipRow.children).toHaveLength(5);
    expect(chipRow.textContent).toContain("벤치프레스");
    expect(chipRow.textContent).toContain("3회");
    expect(chipRow.textContent).not.toContain("플랭크");
  });

  it("검색어를 입력하면 칩 줄이 사라진다", () => {
    // 필터링과 싸우면 안 된다. 이 단언이 깨지면 검색 결과 위에
    // 관계없는 칩이 남아 있는 것이다.
    const { getByPlaceholderText, queryByText } = setup();

    expect(queryByText("⭐ 자주 한 운동")).toBeTruthy();
    fireEvent.change(getByPlaceholderText("🔍 운동 검색 (예: 스쿼트, 벤치)"), {
      target: { value: "스쿼" },
    });
    expect(queryByText("⭐ 자주 한 운동")).toBeNull();
  });

  it("부위 필터를 고르면 칩 줄이 사라진다", () => {
    const { getByRole, queryByText } = setup();

    fireEvent.click(getByRole("button", { name: "등" }));
    expect(queryByText("⭐ 자주 한 운동")).toBeNull();
  });

  it("칩을 누르면 카탈로그 항목과 똑같이 선택된다", () => {
    const { getByText, queryByText } = setup();

    const chipRow = getByText("⭐ 자주 한 운동").parentElement
      ?.lastElementChild as HTMLElement;
    fireEvent.click(chipRow.children[0]);

    expect(queryByText("선택한 1개 운동 추가")).toBeTruthy();
  });

  it("완료 기록이 없으면 영역 자체가 안 나온다", () => {
    const { queryByText } = setup({ pastSessions: [] });
    expect(queryByText("⭐ 자주 한 운동")).toBeNull();
  });

  it("90일보다 오래된 기록만 있으면 영역이 안 나온다", () => {
    const { queryByText } = setup({
      pastSessions: [session(120, "벤치프레스"), session(200, "스쿼트")],
    });
    expect(queryByText("⭐ 자주 한 운동")).toBeNull();
  });
});
