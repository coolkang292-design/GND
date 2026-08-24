// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogExercise } from "@/lib/types";
import type { CalendarSession } from "@/lib/workout";
import type { TabataMinutes } from "@/lib/domain/tabata";
import { TabataSheet } from "./tabata-sheet";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

/**
 * 인터벌 고르기 화면은 **맨몸 종목만** 보여 준다 (사용자 지시 2026-08-13).
 *
 * 그래서 시드에도 맨몸을 넣는다. 마지막 두 개(`플랭크` · `체스트프레스 머신`)는
 * **걸러지는지 확인하는 용도**다 — 시간형은 기록이 횟수로 저장돼서 어긋나고,
 * 머신은 인터벌에서 쓸 수 없다.
 */
const CATALOG = [
  item("푸시업", { exercise_type: "bodyweight", measure: "reps" }),
  item("맨몸 스쿼트", {
    exercise_type: "bodyweight",
    measure: "reps",
    body_part: "하체",
  }),
  item("버피", { exercise_type: "bodyweight", measure: "reps", body_part: "코어" }),
  item("점핑잭", {
    exercise_type: "bodyweight",
    measure: "reps",
    body_part: "하체",
  }),
  item("플랭크", { exercise_type: "bodyweight", measure: "time", body_part: "코어" }),
  item("체스트프레스 머신"),
];

const FOUR = CATALOG.filter(
  (c) => c.exercise_type === "bodyweight" && c.measure !== "time",
).slice(0, 4);

function setup(
  over: {
    pastSessions?: CalendarSession[];
    initialPicked?: CatalogExercise[];
    initialMinutes?: TabataMinutes;
    onBegin?: (
      picked: CatalogExercise[],
      minutes: TabataMinutes,
    ) => Promise<boolean>;
  } = {},
) {
  return render(
    <TabataSheet
      open
      catalog={CATALOG}
      pastSessions={over.pastSessions ?? []}
      pastLoading={false}
      initialPicked={over.initialPicked}
      initialMinutes={over.initialMinutes}
      onClose={vi.fn()}
      onCreateCustom={vi.fn()}
      onBegin={over.onBegin ?? vi.fn()}
      onComplete={vi.fn()}
      onCancelWorkout={vi.fn()}
    />,
  );
}

/**
 * 예정표에서 연 인터벌도 **고르는 화면으로 연다** (사용자 지시 2026-08-25).
 *
 * 2026-08-13에는 계획에서 열면 마운트 직후 자동 재생(`autoStart`)했다. 계획이
 * 종목과 코스를 이미 들고 있으니 고를 것이 없다고 봤는데, **오늘 몇 분을 할지는
 * 그날 정하는 값**이었다. 계획을 짤 때와 실제로 몸을 쓰는 때의 컨디션이 다르다.
 *
 * ⚠️ 이 테스트가 지키는 것은 "안 시작한다"는 **부정**이다. `autoStart`가 다시
 *    들어오면 `onBegin`과 `play`가 눌리지 않았는데도 불린다.
 */
describe("TabataSheet — 예정표에서 열어도 바로 시작하지 않는다 (2026-08-25)", () => {
  it("계획한 코스를 고른 채 setup으로 열고, 음원도 세션도 건드리지 않는다", () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue();
    const onBegin = vi.fn().mockResolvedValue(true);
    setup({ initialPicked: FOUR, initialMinutes: 8, onBegin });

    expect(screen.getByText("오늘 할 시간")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "8분" }).getAttribute("aria-pressed"),
    ).toBe("true");
    // 고르는 화면이다 — 하는 화면(전체화면 오버레이)의 버튼은 아직 없다
    expect(screen.queryByRole("button", { name: "중단하기" })).toBeNull();
    expect(onBegin).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it("계획한 8분 대신 16분을 골라 시작할 수 있다", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const onBegin = vi.fn().mockResolvedValue(true);
    setup({ initialPicked: FOUR, initialMinutes: 8, onBegin });

    fireEvent.click(screen.getByRole("button", { name: "16분" }));
    fireEvent.click(screen.getByRole("button", { name: "전신 인터벌 시작" }));

    await waitFor(() => expect(onBegin).toHaveBeenCalledWith(FOUR, 16));
  });
});

describe("TabataSheet — 운동 고르기 배선 (2026-08-06)", () => {
  it("전신 인터벌의 시간·리듬·시작 행동을 한 언어로 안내한다", () => {
    setup({ initialPicked: FOUR });

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

  it("진행 중단 확인도 전신 인터벌 명칭으로 안내한다", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    setup({
      initialPicked: FOUR,
      onBegin: vi.fn().mockResolvedValue(true),
    });

    fireEvent.click(screen.getByRole("button", { name: "전신 인터벌 시작" }));
    fireEvent.click(await screen.findByRole("button", { name: "중단하기" }));

    expect(confirm).toHaveBeenCalledWith(
      "전신 인터벌을 중단할까요? 운동은 기록되지 않아요.",
    );
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
    // 목록이 바로 뜬다 (2026-08-13) — 추천으로 가려면 허브로 한 번 돌아간다
    fireEvent.click(screen.getByLabelText("진입 화면으로 돌아가기"));
    fireEvent.click(getByText("운동 직접 고르기"));
    fireEvent.click(getByText(/부위별 추천/));
    // 가슴 추천 넷 중 **맨몸은 푸시업뿐**이다 — 나머지는 걸러진다
    // (인터벌 고르기 화면은 맨몸만 보여 준다, 2026-08-13)
    fireEvent.click(getByText("푸시업"));
    fireEvent.click(getByText("다음"));
    fireEvent.click(getByText("운동 1개 추가하기"));

    expect(getByText("+ 운동 고르기 (1/4)")).toBeTruthy();
    expect(getAllByText("푸시업")).not.toHaveLength(0);
  });

  it("검색으로 고른 운동도 같은 자리에 담긴다", () => {
    const { getByText, getByPlaceholderText } = setup();

    // `+ 운동 고르기`가 **바로 목록**을 연다 (사용자 지적 2026-08-13) —
    // 예전에는 허브가 한 번 더 떠서 같은 화면이 반복되는 것으로 보였다
    fireEvent.click(getByText("+ 운동 고르기 (0/4)"));
    fireEvent.change(getByPlaceholderText(/검색/), {
      target: { value: "버피" },
    });
    fireEvent.click(getByText("버피"));
    fireEvent.click(getByText("선택한 1개 운동 추가"));

    expect(getByText("+ 운동 고르기 (1/4)")).toBeTruthy();
  });

  it("4개를 넘겨 담아도 한도에서 잘린다", () => {
    const { getByText } = setup();

    // 목록이 바로 뜬다 — 맨몸만 올라와 있다
    fireEvent.click(getByText("+ 운동 고르기 (0/4)"));
    for (const name of FOUR.map((c) => c.name)) {
      fireEvent.click(getByText(name));
    }
    fireEvent.click(getByText("선택한 4개 운동 추가"));

    expect(getByText("+ 운동 고르기 (4/4)")).toBeTruthy();
  });
});
