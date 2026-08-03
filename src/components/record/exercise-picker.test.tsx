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

describe("ExercisePicker — 목록 자체를 사용 횟수순으로 (사용자 요청 2026-08-02)", () => {
  /**
   * 목록 행의 운동명만 순서대로.
   *
   * ⚠️ ⭐칩도 aria-pressed 버튼이라 그냥 다 긁으면 칩이 먼저 잡힌다.
   * 목록 행만 `<span><span>이름</span><span>부위·유형</span></span>` 구조
   * (= span > span)를 가지므로 그걸로 갈라낸다.
   */
  function listedNames(container: HTMLElement): string[] {
    return [...container.querySelectorAll("button[aria-pressed]")]
      .map((row) => row.querySelector("span > span")?.textContent?.trim())
      .filter((name): name is string => Boolean(name));
  }

  it("많이 한 종목이 위로 온다 (카탈로그 입력 순서가 아니라)", () => {
    // CATALOG 순서는 벤치 → 랫풀 → 스쿼트 → 데드 → 러닝 → 플랭크.
    // SESSIONS는 벤치 3 · 랫풀 2 · 스쿼트 2 · 데드 1 · 러닝 1 · 플랭크 1.
    // 정렬이 빠지면 카탈로그 순서 그대로라 이 단언이 실패한다.
    const { container } = setup({
      pastSessions: [
        session(1, "플랭크"),
        session(2, "플랭크"),
        session(3, "플랭크"),
        session(1, "데드리프트"),
        session(2, "데드리프트"),
      ],
    });
    const names = listedNames(container);
    expect(names[0]).toBe("플랭크");
    expect(names[1]).toBe("데드리프트");
  });

  it("횟수를 함께 보여준다", () => {
    const { container } = setup();
    // 벤치프레스 3회 — 칩과 목록이 같은 수를 쓴다.
    // 유형이 별도 뱃지로 빠져서(2026-08-04) 텍스트가 여러 요소로 쪼개졌다.
    // 부위·유형·횟수를 한 줄로 이어 붙여서 본다.
    const meta = [...container.querySelectorAll("li, button span span")]
      .map((node) => node.textContent ?? "")
      .find((text) => text.includes("가슴") && text.includes("웨이트"));
    expect(meta).toContain("3회");
  });

  it("한 번도 안 한 종목은 횟수 없이 뒤에 남는다", () => {
    const { container, queryByText } = setup({
      pastSessions: [session(1, "러닝")],
    });
    expect(listedNames(container)[0]).toBe("러닝");
    // 플랭크는 기록이 없다 — '0회'라고 쓰지 않는다
    expect(queryByText(/0회/)).toBeNull();
  });

  it("기록이 하나도 없으면 카탈로그 순서 그대로다", () => {
    const { container } = setup({ pastSessions: [] });
    expect(listedNames(container)).toEqual([
      "벤치프레스",
      "랫풀다운",
      "스쿼트",
      "데드리프트",
      "러닝",
      "플랭크",
    ]);
  });

  it("부위 필터 안에서도 횟수순이다", () => {
    // 등 = 랫풀다운(카탈로그 먼저) · 데드리프트. 데드를 더 많이 했으면 데드가 위로.
    const { container, getByRole } = setup({
      pastSessions: [
        session(1, "데드리프트"),
        session(2, "데드리프트"),
        session(3, "랫풀다운"),
      ],
    });
    fireEvent.click(getByRole("button", { name: "등" }));
    expect(listedNames(container)).toEqual(["데드리프트", "랫풀다운"]);
  });
});

describe("ExercisePicker — 내 루틴 탭 (0056)", () => {
  it("루틴을 넘기지 않으면 탭 자체가 없다", () => {
    // 0056 적용 전에는 조회가 실패해 routines가 undefined로 남는다.
    // 그때 빈 탭이 뜨면 "기능이 고장난 것"처럼 보인다.
    const { queryByText } = setup();
    expect(queryByText("내 루틴")).toBeNull();
  });

  it("빈 배열과 '사용 불가'를 구별한다", () => {
    // 2026-08-02 개발 서버 확인에서 사용자가 잡은 것: 기록 페이지가 routines를
    // []로 초기화해 두는 바람에 0056 미적용 상태에서도 탭과 저장 버튼이
    // 멀쩡히 떴고, 누르면 Postgres 문구가 그대로 보였다.
    // []는 "루틴 0개"라는 정상 상태이고, 사용 불가는 undefined다.
    expect(setup({ routines: [] }).queryByText("내 루틴")).toBeTruthy();
    cleanup();
    expect(setup({ routines: undefined }).queryByText("내 루틴")).toBeNull();
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

describe("ExercisePicker — 종목 유형이 보인다 (2026-08-04)", () => {
  // 신고 0783ca35: '스쿼트'(웨이트)를 맨몸 스쿼트로 알고 기록해서 챌린지
  // 맨몸 실적이 100회 내내 0이었다. 유형이 안 보이면 같은 이름의 웨이트판과
  // 맨몸판을 구별할 방법이 없다.
  const AMBIGUOUS = [
    catalogItem("스쿼트", { body_part: "하체" }),
    catalogItem("맨몸 스쿼트", {
      body_part: "하체",
      exercise_type: "bodyweight",
      measure: "reps",
    }),
  ];

  it("⭐ 자주 한 운동 칩에 유형이 붙는다", () => {
    // 칩은 이름만 보여 줬다 — 목록 행에는 '하체 · 웨이트'가 있는데 칩에는
    // 없어서, 칩으로 담으면 유형을 볼 기회가 아예 없었다.
    const { getByText } = setup();

    const chipRow = getByText("⭐ 자주 한 운동").parentElement
      ?.lastElementChild as HTMLElement;
    expect(chipRow.textContent).toContain("웨이트");
  });

  it("같은 이름의 맨몸판이 있으면 검색 결과에 안내가 뜬다", () => {
    const { getByPlaceholderText, getByText } = render(
      <ExercisePicker
        open
        catalog={AMBIGUOUS}
        pastSessions={[]}
        pastLoading={false}
        onClose={vi.fn()}
        onPickMany={vi.fn()}
        onPickPast={vi.fn()}
        onCreateCustom={vi.fn()}
        routinesLoading={false}
        onRenameRoutine={vi.fn()}
        onDeleteRoutine={vi.fn()}
      />,
    );

    fireEvent.change(getByPlaceholderText("🔍 운동 검색 (예: 스쿼트, 벤치)"), {
      target: { value: "스쿼트" },
    });
    expect(getByText(/맨몸으로 한 운동은/)).toBeTruthy();
  });

  it("웨이트만 나오는 검색에는 안내를 띄우지 않는다", () => {
    // 늘 뜨면 아무도 안 읽는다. 실제로 헷갈릴 때만 뜬다.
    const { getByPlaceholderText, queryByText } = setup();

    fireEvent.change(getByPlaceholderText("🔍 운동 검색 (예: 스쿼트, 벤치)"), {
      target: { value: "벤치" },
    });
    expect(queryByText(/맨몸으로 한 운동은/)).toBeNull();
  });
});

describe("ExercisePicker — 챌린지에 안 잡히는 종목 안내 (2026-08-04)", () => {
  // 신고 0783ca35: 목표가 맨몸·유산소뿐인데 웨이트 스쿼트를 100회 기록했고,
  // 앱은 아무 말도 하지 않았다. 고르는 자리에서 말해 준다.
  const BODYWEIGHT_ONLY = new Set<"weight" | "cardio" | "bodyweight">([
    "bodyweight",
    "cardio",
  ]);

  function withChallenge(
    categories: ReadonlySet<"weight" | "cardio" | "bodyweight"> | null,
  ) {
    return render(
      <ExercisePicker
        open
        catalog={CATALOG}
        pastSessions={SESSIONS}
        pastLoading={false}
        onClose={vi.fn()}
        onPickMany={vi.fn()}
        onPickPast={vi.fn()}
        onCreateCustom={vi.fn()}
        routinesLoading={false}
        onRenameRoutine={vi.fn()}
        onDeleteRoutine={vi.fn()}
        challengeCategories={categories}
      />,
    );
  }

  it("목표에 없는 분류의 종목에 '챌린지 미반영'을 붙인다", () => {
    const { getAllByText } = withChallenge(BODYWEIGHT_ONLY);
    // 카탈로그의 웨이트 4종(벤치·랫풀·스쿼트·데드) — 맨몸/유산소는 안 붙는다
    expect(getAllByText("챌린지 미반영")).toHaveLength(4);
  });

  it("목표에 있는 분류에는 아무 표시도 안 붙는다", () => {
    const { queryByText } = withChallenge(
      new Set<"weight" | "cardio" | "bodyweight">([
        "weight",
        "bodyweight",
        "cardio",
      ]),
    );
    expect(queryByText("챌린지 미반영")).toBeNull();
  });

  it("챌린지를 모르면 경고하지 않는다", () => {
    // 확실할 때만 경고한다 — 멀쩡한 운동을 말리면 안 된다
    const { queryByText } = withChallenge(null);
    expect(queryByText("챌린지 미반영")).toBeNull();
  });

  it("안 잡히는 종목을 고르면 목표 분류를 알려주는 배너가 뜬다", () => {
    const { getAllByText, getByText, queryByText } =
      withChallenge(BODYWEIGHT_ONLY);

    expect(queryByText(/챌린지 성과에는 안 잡혀요/)).toBeNull();
    // 벤치프레스는 ⭐칩과 목록 행 양쪽에 있다 — 칩을 누른다
    fireEvent.click(getAllByText("벤치프레스")[0]);

    expect(getByText(/챌린지 성과에는 안 잡혀요/)).toBeTruthy();
    expect(getByText(/맨몸 · 유산소/)).toBeTruthy();
  });

  it("잡히는 종목만 고르면 배너가 안 뜬다", () => {
    const { getByText, queryByText } = withChallenge(BODYWEIGHT_ONLY);
    fireEvent.click(getByText("플랭크"));
    expect(queryByText(/챌린지 성과에는 안 잡혀요/)).toBeNull();
  });
});
