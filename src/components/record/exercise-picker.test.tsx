// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarSession } from "@/lib/workout";
import type { WorkoutRoutine } from "@/lib/routines";
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

function routine(name: string, ...exerciseNames: string[]): WorkoutRoutine {
  return {
    id: `r-${name}`,
    userId: "user-1",
    name,
    exercises: exerciseNames.map((exerciseName) => ({
      name: exerciseName,
      bodyPart: "가슴",
      exerciseType: "weight",
      measure: null,
      isCustom: false,
      sets: [{ weightKg: 60, reps: 10, distanceKm: 0, durationMin: 0 }],
    })),
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  };
}

function setup(
  over: {
    pastSessions?: CalendarSession[];
    routines?: WorkoutRoutine[];
    onPickRoutine?: (routine: WorkoutRoutine) => Promise<boolean>;
  } = {},
) {
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
      routines={over.routines}
      routinesLoading={false}
      onPickRoutine={
        over.routines
          ? (over.onPickRoutine ?? vi.fn().mockResolvedValue(true))
          : undefined
      }
      onRenameRoutine={vi.fn().mockResolvedValue(true)}
      onDeleteRoutine={vi.fn().mockResolvedValue(undefined)}
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

describe("ExercisePicker — 내 루틴 탭 (0056)", () => {
  it("루틴을 넘기지 않으면 탭 자체가 없다", () => {
    // 0056 적용 전에는 조회가 실패해 routines가 undefined로 남는다.
    // 그때 빈 탭이 뜨면 "기능이 고장난 것"처럼 보인다.
    const { queryByText } = setup();
    expect(queryByText("내 루틴")).toBeNull();
  });

  it("루틴을 넘기면 세 번째 탭이 생긴다", () => {
    const { getByText } = setup({ routines: [] });
    expect(getByText("운동 찾기")).toBeTruthy();
    expect(getByText("지난 기록")).toBeTruthy();
    expect(getByText("내 루틴")).toBeTruthy();
  });

  it("저장한 루틴이 없으면 저장 방법을 알려준다", () => {
    const { getByText } = setup({ routines: [] });
    fireEvent.click(getByText("내 루틴"));
    expect(getByText("아직 저장한 루틴이 없어요")).toBeTruthy();
  });

  it("루틴 이름·종목 수·구성을 보여준다", () => {
    const { getByText } = setup({
      routines: [routine("가슴날", "벤치프레스", "덤벨 플라이")],
    });
    fireEvent.click(getByText("내 루틴"));

    expect(getByText("2종목")).toBeTruthy();
    expect(getByText("벤치프레스 · 덤벨 플라이")).toBeTruthy();
  });

  it("불러오기를 누르면 그 루틴이 핸들러로 간다", () => {
    const onPickRoutine = vi.fn().mockResolvedValue(true);
    const { getByText } = setup({
      routines: [routine("가슴날", "벤치프레스")],
      onPickRoutine,
    });
    fireEvent.click(getByText("내 루틴"));
    fireEvent.click(getByText("불러오기"));

    expect(onPickRoutine).toHaveBeenCalledTimes(1);
    expect(onPickRoutine.mock.calls[0][0].name).toBe("가슴날");
  });

  it("이름 변경을 누르면 그 자리에서 편집할 수 있다", () => {
    const { getByText, getByLabelText, queryByLabelText } = setup({
      routines: [routine("가슴날", "벤치프레스")],
    });
    fireEvent.click(getByText("내 루틴"));

    expect(queryByLabelText("루틴 이름")).toBeNull();
    fireEvent.click(getByLabelText("가슴날 이름 변경"));
    expect((getByLabelText("루틴 이름") as HTMLInputElement).value).toBe(
      "가슴날",
    );
  });
});
