// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogExercise } from "@/lib/types";
import { ExercisePicker, type ConfiguredPick } from "./exercise-picker";

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

/** 가슴 추천 4종 + 다른 부위 + 시간형 하나 */
const CATALOG = [
  item("체스트프레스 머신"),
  item("인클라인 벤치프레스"),
  item("덤벨 플라이"),
  item("푸시업", { exercise_type: "bodyweight", measure: "reps" }),
  item("랫풀다운", { body_part: "등" }),
  item("레그프레스", { body_part: "하체" }),
  item("숄더프레스", { body_part: "어깨" }),
  item("플랭크", {
    body_part: "코어",
    exercise_type: "bodyweight",
    measure: "time",
  }),
];

function setup(onPickConfigured = vi.fn()) {
  const rendered = render(
    <ExercisePicker
      open
      initialMode="part"
      catalog={CATALOG}
      pastSessions={[]}
      pastLoading={false}
      onClose={vi.fn()}
      onPickMany={vi.fn()}
      onPickConfigured={onPickConfigured}
      onPickPast={vi.fn()}
      onCreateCustom={vi.fn()}
    />,
  );
  return { ...rendered, onPickConfigured };
}

describe("추천 흐름 — 부위 → 다중 선택 → 설정 → 추가 (2026-08-06)", () => {
  it("카드에 운동명·부위·한 줄 설명·추가 버튼이 모두 있다", () => {
    const { getByText, getAllByText } = setup();

    expect(getByText("체스트프레스 머신")).toBeTruthy();
    expect(getByText("기구가 움직임을 잡아줘서 처음 시작하기 쉬워요")).toBeTruthy();
    // 부위 태그(카드 안)와 부위 버튼(그리드)이 둘 다 '가슴'을 쓴다
    expect(getAllByText("가슴").length).toBeGreaterThan(1);
    expect(getAllByText("＋ 추가").length).toBe(4);
  });

  it("부위 6칸이 전부 그려진다 (가로 스크롤이 아니라 그리드)", () => {
    const { getAllByText } = setup();
    for (const part of ["가슴", "등", "하체", "어깨", "팔", "코어"]) {
      expect(getAllByText(part).length).toBeGreaterThan(0);
    }
  });

  it("추천에 없는 종목을 위해 검색으로 나가는 문이 있다", () => {
    const { getByText, getByPlaceholderText } = setup();
    fireEvent.click(getByText("운동 이름 검색"));
    expect(getByPlaceholderText("🔍 운동 검색 (예: 스쿼트, 벤치)")).toBeTruthy();
  });

  it("카드 몸통을 눌러도 선택된다 (버튼만이 아니라)", () => {
    const { getByText } = setup();
    fireEvent.click(getByText("체스트프레스 머신"));

    expect(getByText("✓ 추가됨")).toBeTruthy();
  });

  it("고를 때마다 하단 바의 개수가 오른다", () => {
    const { getByText, container } = setup();
    const count = () => container.querySelector(".text-accent")?.textContent;

    fireEvent.click(getByText("체스트프레스 머신"));
    expect(getByText("1개")).toBeTruthy();
    fireEvent.click(getByText("인클라인 벤치프레스"));
    expect(getByText("2개")).toBeTruthy();
    expect(count).toBeTruthy();
  });

  it("다시 누르면 선택이 풀린다", () => {
    const { getByText, queryByText } = setup();
    fireEvent.click(getByText("체스트프레스 머신"));
    fireEvent.click(getByText("체스트프레스 머신"));

    expect(queryByText("✓ 추가됨")).toBeNull();
    expect(getByText("0개")).toBeTruthy();
  });

  it("아무것도 안 골랐으면 '다음'이 잠겨 있다", () => {
    const { getByText } = setup();
    expect((getByText("다음") as HTMLButtonElement).disabled).toBe(true);
  });

  it("부위를 바꾸면 그 부위의 추천으로 갈린다", () => {
    const { getByText, queryByText, getAllByText } = setup();
    // 부위 버튼은 그리드의 것을 집는다 (카드 태그와 글자가 겹친다)
    fireEvent.click(getAllByText("코어")[0]);

    expect(getByText("플랭크")).toBeTruthy();
    expect(queryByText("체스트프레스 머신")).toBeNull();
  });

  it("'다음'을 누르면 고른 개수만큼 3세트·10회·무게 운동 중 입력이 뜬다", () => {
    const { getByText, getAllByText } = setup();
    fireEvent.click(getByText("체스트프레스 머신"));
    fireEvent.click(getByText("인클라인 벤치프레스"));
    fireEvent.click(getByText("다음"));

    expect(getByText("세트와 횟수 설정")).toBeTruthy();
    expect(getAllByText("3세트 · 10회 · 무게 운동 중 입력")).toHaveLength(2);
    expect(getByText("운동 2개 추가하기")).toBeTruthy();
  });

  it("시간형 종목은 '10회'가 아니라 '1분'이다", () => {
    const { getByText, getAllByText } = setup();
    fireEvent.click(getAllByText("코어")[0]);
    fireEvent.click(getByText("플랭크"));
    fireEvent.click(getByText("다음"));

    expect(getByText("3세트 · 1분")).toBeTruthy();
  });

  it("한 행의 세트를 바꿔도 다른 행은 그대로다", () => {
    const { getByText, getAllByText, getByLabelText } = setup();
    fireEvent.click(getByText("체스트프레스 머신"));
    fireEvent.click(getByText("인클라인 벤치프레스"));
    fireEvent.click(getByText("다음"));

    fireEvent.click(getAllByText("조절")[0]);
    fireEvent.click(getByLabelText("세트 늘리기"));

    expect(getByText("4세트 · 10회 · 무게 운동 중 입력")).toBeTruthy();
    expect(getAllByText("3세트 · 10회 · 무게 운동 중 입력")).toHaveLength(1);
  });

  it("추가하기를 누르면 정한 세트가 그대로 핸들러로 간다", () => {
    const onPickConfigured = vi.fn();
    const { getByText } = setup(onPickConfigured);
    fireEvent.click(getByText("체스트프레스 머신"));
    fireEvent.click(getByText("다음"));
    fireEvent.click(getByText("운동 1개 추가하기"));

    expect(onPickConfigured).toHaveBeenCalledTimes(1);
    const picks: ConfiguredPick[] = onPickConfigured.mock.calls[0][0];
    expect(picks).toHaveLength(1);
    expect(picks[0].item.name).toBe("체스트프레스 머신");
    expect(picks[0].sets).toHaveLength(3);
    expect(picks[0].sets.every((s) => s.reps === 10 && s.weightKg === 0)).toBe(true);
  });

  it("설정 화면에서 뒤로 가면 고른 것이 그대로 남아 있다", () => {
    const { getByText, getByLabelText } = setup();
    fireEvent.click(getByText("체스트프레스 머신"));
    fireEvent.click(getByText("다음"));
    fireEvent.click(getByLabelText("추천 운동으로 돌아가기"));

    expect(getByText("✓ 추가됨")).toBeTruthy();
    expect(getByText("1개")).toBeTruthy();
  });
});

describe("추천 흐름 — 카탈로그에 없는 이름 (실측 2026-08-06)", () => {
  it("시드에 없는 종목은 그냥 빠지고 나머지는 정상이다", () => {
    // 착수 실측에서 제안된 이름 8개 중 5개가 시드에 없었다.
    // 그래서 이름이 틀려도 화면이 깨지지 않고 한 줄이 덜 나온다.
    const { getByText, getAllByText, queryByText } = render(
      <ExercisePicker
        open
        initialMode="part"
        catalog={[item("랫풀다운", { body_part: "등" })]}
        pastSessions={[]}
        pastLoading={false}
        onClose={vi.fn()}
        onPickMany={vi.fn()}
        onPickConfigured={vi.fn()}
        onPickPast={vi.fn()}
        onCreateCustom={vi.fn()}
      />,
    );

    // 가슴 추천 4개가 카탈로그에 하나도 없으니 목록이 빈다 — 화면은 멀쩡하다
    expect(getByText(/추천할 운동을 찾지 못했어요/)).toBeTruthy();
    // 그리드는 그대로 있고, 등으로 옮기면 있는 것만 나온다
    fireEvent.click(getAllByText("등")[0]);
    expect(getByText("랫풀다운")).toBeTruthy();
    expect(queryByText("체스트프레스 머신")).toBeNull();
  });
});

describe("상황별 추천 (2026-08-06)", () => {
  function situation(
    challengeCategories: ReadonlySet<"weight" | "cardio" | "bodyweight"> | null = null,
  ) {
    return render(
      <ExercisePicker
        open
        initialMode="situation"
        catalog={CATALOG}
        pastSessions={[]}
        pastLoading={false}
        onClose={vi.fn()}
        onPickMany={vi.fn()}
        onPickConfigured={vi.fn()}
        onPickPast={vi.fn()}
        onCreateCustom={vi.fn()}
        challengeCategories={challengeCategories}
      />,
    );
  }

  it("상황 6개 중 챌린지를 뺀 5개가 나온다 (목표를 모를 때)", () => {
    const { getAllByText, queryByText } = situation(null);
    for (const label of [
      "처음 운동해요", // 그리드 칸 + 선택된 상황 칩 두 곳에 나온다
      "기구를 잘 몰라요",
      "집에서 할래요",
      "30분만 운동할래요",
      "유산소만 할래요",
    ]) {
      expect(getAllByText(label).length).toBeGreaterThan(0);
    }
    // ⚠️ 눌러도 빈 목록인 막다른 길을 주지 않는다
    expect(queryByText("챌린지 목표에 맞게")).toBeNull();
  });

  it("챌린지 목표를 알면 그 카드가 생긴다", () => {
    const { getByText } = situation(new Set(["weight"]));
    expect(getByText("챌린지 목표에 맞게")).toBeTruthy();
  });

  it("'처음 운동해요'의 추천이 부위별과 같은 문구를 쓴다", () => {
    const { getByText } = situation(null);
    expect(getByText("체스트프레스 머신")).toBeTruthy();
    expect(getByText("기구가 움직임을 잡아줘서 처음 시작하기 쉬워요")).toBeTruthy();
  });

  it("'처음 운동해요' 추천 4개에 서로 다른 썸네일이 나온다", () => {
    const { container } = situation(null);
    const thumbnails = Array.from(
      container.querySelectorAll<HTMLImageElement>("[data-exercise-thumbnail]"),
    );

    expect(thumbnails).toHaveLength(4);
    expect(
      thumbnails.map((image) => image.dataset.exerciseThumbnail),
    ).toEqual([
      "체스트프레스 머신",
      "랫풀다운",
      "레그프레스",
      "숄더프레스",
    ]);

    const expectedPaths = [
      "/exercise-thumbs/chest-press-machine.webp",
      "/exercise-thumbs/lat-pulldown.webp",
      "/exercise-thumbs/leg-press.webp",
      "/exercise-thumbs/shoulder-press.webp",
    ];
    thumbnails.forEach((image, index) => {
      const src = decodeURIComponent(image.getAttribute("src") ?? "");
      expect(src).toContain(expectedPaths[index]);
      expect(src).not.toContain(".webp.png");
    });
  });

  it("썸네일 하나가 실패해도 그 운동의 텍스트와 추가 버튼은 남는다", () => {
    const { container, getAllByText, getByText } = situation(null);
    const chestThumbnail = container.querySelector<HTMLImageElement>(
      '[data-exercise-thumbnail="체스트프레스 머신"]',
    );

    expect(chestThumbnail).toBeTruthy();
    fireEvent.error(chestThumbnail!);

    expect(
      container.querySelector('[data-exercise-thumbnail="체스트프레스 머신"]'),
    ).toBeNull();
    expect(getByText("체스트프레스 머신")).toBeTruthy();
    expect(getAllByText("＋ 추가")).toHaveLength(4);
  });

  it("상황을 바꾸면 목록이 갈린다", () => {
    const { getByText, queryByText } = situation(null);
    fireEvent.click(getByText("유산소만 할래요"));
    // 유산소 종목이 카탈로그에 없으니 빈 목록 — 머신 추천은 사라진다
    expect(queryByText("체스트프레스 머신")).toBeNull();
  });

  it("챌린지 목표가 맨몸이면 웨이트 종목은 빠진다", () => {
    const { getByText, queryByText } = situation(new Set(["bodyweight"]));
    fireEvent.click(getByText("챌린지 목표에 맞게"));

    expect(getByText("푸시업")).toBeTruthy();
    expect(queryByText("체스트프레스 머신")).toBeNull();
  });
});

describe("검색 모드 — 직접 만들기는 결과가 없을 때만 (사용자 지시 2026-08-06)", () => {
  function search() {
    return render(
      <ExercisePicker
        open
        initialMode="search"
        catalog={CATALOG}
        pastSessions={[]}
        pastLoading={false}
        onClose={vi.fn()}
        onPickMany={vi.fn()}
        onPickPast={vi.fn()}
        onCreateCustom={vi.fn()}
      />,
    );
  }

  it("기본 화면에는 '직접 만들기'가 없다", () => {
    const { queryByText } = search();
    expect(queryByText("＋ 직접 만들기")).toBeNull();
  });

  it("검색 결과가 0건일 때만 나온다", () => {
    const { getByPlaceholderText, getByText, queryByText } = search();
    const input = getByPlaceholderText("🔍 운동 검색 (예: 스쿼트, 벤치)");

    fireEvent.change(input, { target: { value: "ㅋㅋㅋ" } });
    expect(getByText("＋ 'ㅋㅋㅋ' 직접 만들기")).toBeTruthy();

    // 검색어를 지우면 다시 사라진다 (부정 확인)
    fireEvent.change(input, { target: { value: "" } });
    expect(queryByText(/직접 만들기/)).toBeNull();
  });

  it("맨몸 필터 칩은 그대로 살아 있다 (신고 0783ca35 회귀 방지)", () => {
    // 부위 그리드로 갈아치우면 이 칩이 사라져 2026-08-03 수정이 회귀한다.
    // ('맨몸'은 유형 뱃지로도 나오므로 **누를 수 있는 것**이 있는지를 본다)
    const { getAllByText } = search();
    const chip = getAllByText("맨몸").find((el) => el.tagName === "BUTTON");
    expect(chip).toBeTruthy();
  });

  it("검색 결과에는 썸네일을 안 넣는다", () => {
    const { container } = search();
    expect(container.querySelector("img")).toBeNull();
  });
});
