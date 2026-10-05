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
  // 그림은 운동 ID로 잇는다 — 운영 시드와 같은 ID를 써야 그림 테스트가 성립한다
  item("랫풀다운", { id: "5f00e9f0-8b12-4746-b59b-df6e7529f94f", body_part: "등" }),
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
    expect(getAllByText("＋ 담기").length).toBe(4);
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

    expect(getByText("✓ 담음")).toBeTruthy();
  });

  it("고를 때마다 하단 바의 개수가 오른다", () => {
    const { getByText } = setup();

    fireEvent.click(getByText("체스트프레스 머신"));
    expect(getByText("운동 1개 바로 추가")).toBeTruthy();
    fireEvent.click(getByText("인클라인 벤치프레스"));
    expect(getByText("운동 2개 바로 추가")).toBeTruthy();
  });

  it("다시 누르면 선택이 풀린다", () => {
    const { getByText, queryByText } = setup();
    fireEvent.click(getByText("체스트프레스 머신"));
    fireEvent.click(getByText("체스트프레스 머신"));

    expect(queryByText("✓ 담음")).toBeNull();
    expect(getByText("운동을 선택하세요")).toBeTruthy();
  });

  it("아무것도 안 골랐으면 두 버튼이 다 잠겨 있다", () => {
    const { getByText } = setup();
    expect((getByText("운동을 선택하세요") as HTMLButtonElement).disabled).toBe(true);
    expect((getByText("세트 조절") as HTMLButtonElement).disabled).toBe(true);
  });

  it("부위를 바꾸면 그 부위의 추천으로 갈린다", () => {
    const { getByText, queryByText, getAllByText } = setup();
    // 부위 버튼은 그리드의 것을 집는다 (카드 태그와 글자가 겹친다)
    fireEvent.click(getAllByText("코어")[0]);

    expect(getByText("플랭크")).toBeTruthy();
    expect(queryByText("체스트프레스 머신")).toBeNull();
  });

  it("'세트 조절'을 누르면 고른 개수만큼 3세트·10회·무게 운동 중 입력이 뜬다", () => {
    const { getByText, getAllByText } = setup();
    fireEvent.click(getByText("체스트프레스 머신"));
    fireEvent.click(getByText("인클라인 벤치프레스"));
    fireEvent.click(getByText("세트 조절"));

    expect(getByText("세트와 횟수 설정")).toBeTruthy();
    expect(getAllByText("3세트 · 10회 · 무게 운동 중 입력")).toHaveLength(2);
    expect(getByText("운동 2개 추가하기")).toBeTruthy();
  });

  it("시간형 종목은 '10회'가 아니라 '30초'다", () => {
    const { getByText, getAllByText } = setup();
    fireEvent.click(getAllByText("코어")[0]);
    fireEvent.click(getByText("플랭크"));
    fireEvent.click(getByText("세트 조절"));

    // ⚠️ 기본이 `1분`이던 시절엔 매달리기를 담자마자 못 채울 목표가 서 있었다
    expect(getByText("3세트 · 30초")).toBeTruthy();
  });

  it("한 행의 세트를 바꿔도 다른 행은 그대로다", () => {
    const { getByText, getAllByText, getByLabelText } = setup();
    fireEvent.click(getByText("체스트프레스 머신"));
    fireEvent.click(getByText("인클라인 벤치프레스"));
    fireEvent.click(getByText("세트 조절"));

    fireEvent.click(getAllByText("조절")[0]);
    fireEvent.click(getByLabelText("세트 늘리기"));

    expect(getByText("4세트 · 10회 · 무게 운동 중 입력")).toBeTruthy();
    expect(getAllByText("3세트 · 10회 · 무게 운동 중 입력")).toHaveLength(1);
  });

  it("추가하기를 누르면 정한 세트가 그대로 핸들러로 간다", () => {
    const onPickConfigured = vi.fn();
    const { getByText } = setup(onPickConfigured);
    fireEvent.click(getByText("체스트프레스 머신"));
    fireEvent.click(getByText("세트 조절"));
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
    fireEvent.click(getByText("세트 조절"));
    fireEvent.click(getByLabelText("고르던 화면으로 돌아가기"));

    expect(getByText("✓ 담음")).toBeTruthy();
    expect(getByText("운동 1개 바로 추가")).toBeTruthy();
  });

  // 사용자 결정 2026-10-05 — 세트 설정은 선택 단계다
  it("'바로 추가'는 설정 화면 없이 3세트·10회로 바로 담는다", () => {
    const onPickConfigured = vi.fn();
    const { getByText, queryByText } = setup(onPickConfigured);
    fireEvent.click(getByText("체스트프레스 머신"));
    fireEvent.click(getByText("운동 1개 바로 추가"));

    expect(queryByText("세트와 횟수 설정")).toBeNull();
    const picks: ConfiguredPick[] = onPickConfigured.mock.calls[0][0];
    expect(picks.map((p) => p.item.name)).toEqual(["체스트프레스 머신"]);
    expect(picks[0].sets).toHaveLength(3);
    expect(picks[0].sets.every((s) => s.reps === 10 && s.weightKg === 0)).toBe(true);
  });

  it("세트를 조절하고 뒤로 가서 '바로 추가'해도 조절한 값이 살아 있다", () => {
    const onPickConfigured = vi.fn();
    const { getByText, getByLabelText } = setup(onPickConfigured);
    fireEvent.click(getByText("체스트프레스 머신"));
    fireEvent.click(getByText("세트 조절"));
    fireEvent.click(getByText("조절"));
    fireEvent.click(getByLabelText("세트 늘리기"));
    fireEvent.click(getByLabelText("고르던 화면으로 돌아가기"));
    fireEvent.click(getByText("운동 1개 바로 추가"));

    const picks: ConfiguredPick[] = onPickConfigured.mock.calls[0][0];
    expect(picks[0].sets).toHaveLength(4);
  });
});

/*
  회귀 (2026-10-05 사용자 신고 "상황별·부위별 선택을 한 다음에 추가가 안 된다").

  추천과 검색이 선택 목록을 따로 들고 있어서, 추천에서 2개를 고르고 `운동 이름 검색`으로
  넘어가면 하단이 "운동을 선택하세요"(0개)가 되고 검색 화면의 추가 버튼은 그 2개를
  안 담았다. 개발 서버에서 재현했다.
*/
describe("추천과 검색은 선택 목록 하나를 쓴다 (2026-10-05)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("추천에서 고른 것이 검색 화면에서도 세어지고 ✓가 붙는다", () => {
    const { getByText } = setup();
    fireEvent.click(getByText("체스트프레스 머신"));
    fireEvent.click(getByText("인클라인 벤치프레스"));
    fireEvent.click(getByText("운동 이름 검색"));

    expect(getByText("운동 2개 바로 추가")).toBeTruthy();
    const row = getByText("체스트프레스 머신").closest("button")!;
    expect(row.getAttribute("aria-pressed")).toBe("true");
  });

  it("추천 2개 + 검색 1개를 한 번에 담는다", () => {
    const onPickConfigured = vi.fn();
    const { getByText } = setup(onPickConfigured);
    fireEvent.click(getByText("체스트프레스 머신"));
    fireEvent.click(getByText("인클라인 벤치프레스"));
    fireEvent.click(getByText("운동 이름 검색"));
    fireEvent.click(getByText("레그프레스"));
    fireEvent.click(getByText("운동 3개 바로 추가"));

    const picks: ConfiguredPick[] = onPickConfigured.mock.calls[0][0];
    expect(picks.map((p) => p.item.name).sort()).toEqual(
      ["레그프레스", "인클라인 벤치프레스", "체스트프레스 머신"].sort(),
    );
  });

  it("검색에서 들어간 세트 조절의 ←는 검색으로 돌아온다", () => {
    const { getByText, getByLabelText, getByPlaceholderText } = setup();
    fireEvent.click(getByText("운동 이름 검색"));
    fireEvent.click(getByText("레그프레스"));
    fireEvent.click(getByText("세트 조절"));
    fireEvent.click(getByLabelText("고르던 화면으로 돌아가기"));

    expect(getByPlaceholderText("🔍 운동 검색 (예: 스쿼트, 벤치)")).toBeTruthy();
  });

  function withClose(onClose: () => void) {
    return render(
      <ExercisePicker
        open
        initialMode="part"
        catalog={CATALOG}
        pastSessions={[]}
        pastLoading={false}
        onClose={onClose}
        onPickMany={vi.fn()}
        onPickConfigured={vi.fn()}
        onPickPast={vi.fn()}
        onCreateCustom={vi.fn()}
      />,
    );
  }

  it("고른 것이 있으면 시트 바깥을 눌러도 묻고, 취소하면 안 닫힌다", () => {
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { getByText, container } = withClose(onClose);
    const backdrop = container.querySelector("div.fixed.inset-0") as HTMLElement;

    fireEvent.click(getByText("체스트프레스 머신"));
    fireEvent.click(backdrop);
    expect(confirm).toHaveBeenCalledWith("고른 운동 1개를 담지 않고 닫을까요?");
    expect(onClose).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("아무것도 안 골랐으면 묻지 않고 닫는다", () => {
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, "confirm");
    const { container } = withClose(onClose);
    fireEvent.click(container.querySelector("div.fixed.inset-0") as HTMLElement);

    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/*
  회귀 (2026-10-05) — 375×667에서 첫 추천 카드가 스크롤 영역 309px 지점, 보이는
  높이는 280px였다. 상황을 골라도 ✓만 바뀌고 `＋ 담기`가 화면 밖이었다.
*/
describe("고른 상황·부위의 추천이 가려져 있으면 내려 준다 (2026-10-05)", () => {
  afterEach(() => vi.restoreAllMocks());

  function rect(top: number, bottom: number) {
    return { top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON() {} } as DOMRect;
  }

  /** 스크롤 영역 100~380, 추천 머리글 360, 첫 카드는 `firstCard` */
  function mount(firstCard: DOMRect) {
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    const at: { box?: Element; head?: Element } = {};
    // ⚠️ 요소 하나에 spyOn을 걸면 프로토타입 메서드가 통째로 바뀐다 —
    //    한 군데에서 요소별로 갈라 돌려준다
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        if (this === at.box) return rect(100, 380);
        if (this === at.head) return rect(360, 380);
        return firstCard;
      },
    );
    const utils = setup();
    const box = utils.getByText(/어디를 운동할까요/).parentElement as HTMLElement;
    const scrollTo = vi.fn();
    box.scrollTo = scrollTo as unknown as HTMLElement["scrollTo"];
    at.box = box;
    at.head = utils.getByText(/이 부위에 맞는 추천 운동/);
    return { ...utils, scrollTo };
  }

  it("첫 카드가 영역 밖이면 추천 머리글까지 스크롤한다", () => {
    const { getAllByText, scrollTo } = mount(rect(410, 480));
    fireEvent.click(getAllByText("등")[0]);

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.calls[0][0].top).toBe(256); // 0 + 360 - 100 - 4
  });

  it("이미 보이면 움직이지 않는다", () => {
    const { getAllByText, scrollTo } = mount(rect(200, 260));
    fireEvent.click(getAllByText("등")[0]);

    expect(scrollTo).not.toHaveBeenCalled();
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
        /*
          인터벌 칸은 **이걸 넘긴 화면에서만** 보인다 (2026-08-13).
          못 여는 화면(달력의 계획 만들기)에서 남겨 두면 추천 목록이 그냥 떠서
          담는 순간 3세트 10회짜리 일반 계획이 조용히 만들어진다.
        */
        onStartInterval={vi.fn()}
      />,
    );
  }

  it("상황 6개 중 챌린지를 뺀 5개가 나온다 (목표를 모를 때)", () => {
    const { getAllByText, queryByText } = situation(null);
    for (const label of [
      "처음 운동해요", // 그리드 칸 + 선택된 상황 칩 두 곳에 나온다
      "기구를 잘 몰라요",
      "전신 인터벌 할래요",
      "30분만 운동할래요",
      "유산소만 할래요",
    ]) {
      expect(getAllByText(label).length).toBeGreaterThan(0);
    }
    // ⚠️ 눌러도 빈 목록인 막다른 길을 주지 않는다
    expect(queryByText("챌린지 목표에 맞게")).toBeNull();
  });

  it("인터벌을 열 수 없는 화면에서는 그 칸이 없다", () => {
    // 사용자 지적 2026-08-13 — 달력 계획 만들기에서 골랐더니 일반 계획이 됐다
    const { queryByText } = render(
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
        challengeCategories={null}
      />,
    );

    expect(queryByText("전신 인터벌 할래요")).toBeNull();
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

  // 2026-08-06 결정 ④("검색 결과에는 썸네일을 안 넣는다")를 사용자 지시로 뒤집었다
  // (2026-10-05 — 운동 이름 앞에 그림). 연결표는 `exercise-images.data.json`(운동 ID → 파일).
  it("검색 결과 줄마다 그림 칸이 있다 — 그림이 있으면 그 그림, 없으면 빈 칸", () => {
    const { getByText } = search();
    const rowOf = (name: string) => getByText(name).closest("button")!;
    expect(
      decodeURIComponent(rowOf("랫풀다운").querySelector("img")?.getAttribute("src") ?? ""),
    ).toContain("/exercise-images/");
    // 그림 없는 운동은 부위 아이콘이 아니라 빈 칸이다 (사용자 결정 2026-10-05)
    const blank = rowOf("레그프레스");
    expect(blank.querySelector("img")).toBeNull();
    expect(blank.querySelector("[aria-hidden].h-12.w-12")).not.toBeNull();
  });
});

describe("2단계 (2026-10-05)", () => {
  function picker(over: Partial<Parameters<typeof ExercisePicker>[0]> = {}) {
    const onPickConfigured = vi.fn();
    const utils = render(
      <ExercisePicker
        open
        initialMode="search"
        catalog={CATALOG}
        pastSessions={[]}
        pastLoading={false}
        onClose={vi.fn()}
        onPickMany={vi.fn()}
        onPickConfigured={onPickConfigured}
        onPickPast={vi.fn()}
        onCreateCustom={vi.fn()}
        {...over}
      />,
    );
    return { ...utils, onPickConfigured };
  }

  it("바꾸기에서는 하나만 고른다 — 새로 고르면 앞의 것을 놓는다", () => {
    const { getByText, queryByText, onPickConfigured } = picker({
      replacing: "벤치프레스",
    });
    expect(getByText("'벤치프레스' 바꾸기")).toBeTruthy();

    fireEvent.click(getByText("레그프레스"));
    fireEvent.click(getByText("숄더프레스"));
    // 세트 수는 원래 것을 유지하므로 세트 조절이 없다
    expect(queryByText("세트 조절")).toBeNull();
    fireEvent.click(getByText("이 운동으로 바꾸기"));

    const picks: ConfiguredPick[] = onPickConfigured.mock.calls[0][0];
    expect(picks.map((p) => p.item.name)).toEqual(["숄더프레스"]);
  });

  it("바꾸기에서는 담거나 시작하는 입구를 숨긴다", () => {
    const { queryByText, getByLabelText } = picker({
      replacing: "벤치프레스",
      onPickPreset: vi.fn(),
      onOpenPrograms: vi.fn(),
      pastSessions: [
        {
          id: "s1",
          completedAt: new Date(),
          durationSeconds: 600,
          exerciseNames: ["레그프레스"],
          tabataMinutes: null,
        } as never,
      ],
    });
    expect(queryByText("추천 루틴")).toBeNull();
    fireEvent.click(getByLabelText("진입 화면으로 돌아가기"));
    expect(queryByText("프로그램으로 시작하기")).toBeNull();
    expect(queryByText("지난 운동")).toBeNull();
  });

  it("바꾸기가 아니면 여러 개를 고른다 (부정 확인)", () => {
    const { getByText } = picker();
    fireEvent.click(getByText("레그프레스"));
    fireEvent.click(getByText("숄더프레스"));
    expect(getByText("운동 2개 바로 추가")).toBeTruthy();
  });

  it("검색어를 치면 빠르게 찾기가 접히고, 지우면 다시 나온다", () => {
    const { getByPlaceholderText, queryByText } = picker();
    const input = getByPlaceholderText("🔍 운동 검색 (예: 스쿼트, 벤치)");
    expect(queryByText("빠르게 찾기")).toBeTruthy();

    fireEvent.change(input, { target: { value: "레그" } });
    expect(queryByText("빠르게 찾기")).toBeNull();
    expect(queryByText("상황별 추천")).toBeNull();

    fireEvent.change(input, { target: { value: "" } });
    expect(queryByText("빠르게 찾기")).toBeTruthy();
  });

  it("저장 중에는 두 버튼이 잠기고 '저장하는 중…'이다", () => {
    const { getByText, rerender } = picker();
    fireEvent.click(getByText("레그프레스"));
    rerender(
      <ExercisePicker
        open
        initialMode="search"
        catalog={CATALOG}
        pastSessions={[]}
        pastLoading={false}
        onClose={vi.fn()}
        onPickMany={vi.fn()}
        onPickConfigured={vi.fn()}
        onPickPast={vi.fn()}
        onCreateCustom={vi.fn()}
        busy
      />,
    );
    expect((getByText("저장하는 중…") as HTMLButtonElement).disabled).toBe(true);
    expect((getByText("세트 조절") as HTMLButtonElement).disabled).toBe(true);
  });

  it("담는 버튼과 설정 확정 버튼이 넘겨받은 문구를 쓴다", () => {
    const { getByText } = picker({
      addLabel: (n) => `8월 17일 계획에 ${n}개 담기`,
      confirmLabel: (n) => `8월 17일 계획에 ${n}개 담기`,
    });
    fireEvent.click(getByText("레그프레스"));
    expect(getByText("8월 17일 계획에 1개 담기")).toBeTruthy();
    fireEvent.click(getByText("세트 조절"));
    expect(getByText("8월 17일 계획에 1개 담기")).toBeTruthy();
  });
});
