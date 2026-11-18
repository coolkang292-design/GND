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
import { loadChallengeScoreSnapshot } from "@/lib/challenge-workout-feedback";
import type { ChallengeScoreSnapshot } from "@/lib/domain/challenge-workout-impact";
import type { ActiveChallengeContext } from "@/lib/domain/challenge-confirmation";

vi.mock("@/lib/challenge-workout-feedback", () => ({ loadChallengeScoreSnapshot: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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
    userId?: string | null;
    onComplete?: () => Promise<void>;
    onClose?: () => void;
    onCancelWorkout?: () => Promise<void>;
    pastSessions?: CalendarSession[];
    initialPicked?: CatalogExercise[];
    initialMinutes?: TabataMinutes;
    followUpNames?: readonly string[];
    challengeContexts?: readonly ActiveChallengeContext[];
    onPlan?: (picked: CatalogExercise[], minutes: TabataMinutes) => Promise<boolean>;
    onSaveToday?: (picked: CatalogExercise[], minutes: TabataMinutes) => Promise<boolean>;
    onBegin?: (
      picked: CatalogExercise[],
      minutes: TabataMinutes,
    ) => Promise<boolean>;
  } = {},
) {
  return render(
    <TabataSheet
      open
      userId={over.userId}
      catalog={CATALOG}
      pastSessions={over.pastSessions ?? []}
      pastLoading={false}
      initialPicked={over.initialPicked}
      initialMinutes={over.initialMinutes}
      followUpNames={over.followUpNames}
      challengeContexts={over.challengeContexts}
      onPlan={over.onPlan}
      onSaveToday={over.onSaveToday}
      onClose={over.onClose ?? vi.fn()}
      onCreateCustom={vi.fn()}
      onBegin={over.onBegin ?? vi.fn()}
      onComplete={over.onComplete ?? vi.fn()}
      onCancelWorkout={over.onCancelWorkout ?? vi.fn()}
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

describe("TabataSheet — 지정 계정의 Dynamite 음원", () => {
  it("코스 변경은 대상 계정의 음원만 바꾸고 자동 재생하지 않는다", () => {
    vi.stubEnv("NEXT_PUBLIC_INTERVAL_DYNAMITE_USER_IDS", "user-a,user-b,user-c");
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const { container } = setup({ userId: "user-a", initialPicked: FOUR });
    expect(screen.getByText("배경음: Dynamite (Tabata)")).toBeTruthy();
    for (const minutes of [4, 8, 16]) {
      fireEvent.click(screen.getByRole("button", { name: `${minutes}분` }));
      expect(container.querySelector("audio")?.getAttribute("src")).toBe(
        "/audio/tabata-4min-dynamite-v1.mp3",
      );
    }
    expect(play).not.toHaveBeenCalled();
  });

  it("일반 계정은 기존 음원을 쓴다", () => {
    vi.stubEnv("NEXT_PUBLIC_INTERVAL_DYNAMITE_USER_IDS", "user-a,user-b,user-c");
    const { container } = setup({ userId: "other-user" });
    expect(container.querySelector("audio")?.getAttribute("src")).toBe(
      "/audio/tabata-4min-total-body-v3.mp3",
    );
    expect(screen.queryByText(/배경음:/)).toBeNull();
  });

  it("재생 위치로 운동·휴식을 표시하고 일시정지·재개·완료를 연결한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_INTERVAL_DYNAMITE_USER_IDS", "user-a");
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const paused = vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockReturnValue(false);
    const onComplete = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const { container } = setup({
      userId: "user-a", initialPicked: FOUR,
      onBegin: vi.fn().mockResolvedValue(true), onComplete, onClose,
    });
    fireEvent.click(screen.getByRole("button", { name: "전신 인터벌 시작" }));
    await waitFor(() => expect(screen.getByTestId("interval-session-overlay")).toBeTruthy());
    const audio = container.querySelector("audio")!;
    audio.currentTime = 13;
    fireEvent.timeUpdate(audio);
    expect(screen.getByTestId("interval-countdown").textContent).toBe("20");
    audio.currentTime = 33;
    fireEvent.timeUpdate(audio);
    expect(screen.getByTestId("interval-countdown").textContent).toBe("10");
    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    expect(pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("음악도 함께 멈췄어요");
    paused.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "이어서 하기" }));
    expect(play).toHaveBeenCalledTimes(2);
    fireEvent.ended(audio);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * 8·16분은 4분 파일 하나를 `audio.loop`로 돌린다 (2026-11-19). 이 테스트가 지키는 것:
   * ① 마지막 블록 전엔 loop가 켜져 있고 ② 파일이 되감기면 **다음 블록의 라운드**를 그리고
   * ③ 마지막 블록에서는 loop가 꺼져 끝에서 ended가 온다. ①~③ 중 하나라도 빠지면
   * 두 번째 블록의 화면이 첫 블록을 반복하거나, 끝에서 음악이 다시 시작된다.
   */
  it("8분: 파일이 되감기면 두 번째 블록의 라운드를 그리고, 마지막 블록은 loop를 끈다", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const { container } = setup({
      initialPicked: FOUR,
      initialMinutes: 8,
      onBegin: vi.fn().mockResolvedValue(true),
    });
    fireEvent.click(screen.getByRole("button", { name: "전신 인터벌 시작" }));
    await waitFor(() => expect(screen.getByTestId("interval-session-overlay")).toBeTruthy());
    const audio = container.querySelector("audio")!;

    // 첫 블록: 8라운드째, loop 켜짐
    expect(audio.loop).toBe(true);
    audio.currentTime = 240;
    fireEvent.timeUpdate(audio);
    expect(screen.getByTestId("interval-round").textContent).toBe("8라운드 / 16라운드");

    // 파일이 처음으로 되감김 → 두 번째 블록의 준비, 9라운드
    audio.currentTime = 0.4;
    fireEvent.timeUpdate(audio);
    expect(screen.getByTestId("interval-round").textContent).toBe("9라운드 / 16라운드");
    // 마지막 블록이므로 loop가 꺼진다
    expect(audio.loop).toBe(false);

    audio.currentTime = 13; // 두 번째 블록 첫 운동
    fireEvent.timeUpdate(audio);
    expect(screen.getByTestId("interval-countdown").textContent).toBe("20");
    expect(screen.getByTestId("interval-round").textContent).toBe("9라운드 / 16라운드");
  });

  it("16분: 블록이 3번 되감겨야 마지막 블록이고 그때 loop가 꺼진다", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const { container } = setup({
      initialPicked: FOUR,
      initialMinutes: 16,
      onBegin: vi.fn().mockResolvedValue(true),
    });
    fireEvent.click(screen.getByRole("button", { name: "전신 인터벌 시작" }));
    await waitFor(() => expect(screen.getByTestId("interval-session-overlay")).toBeTruthy());
    const audio = container.querySelector("audio")!;

    const wrap = (end = 249.9) => {
      audio.currentTime = end;
      fireEvent.timeUpdate(audio);
      audio.currentTime = 0.3;
      fireEvent.timeUpdate(audio);
    };
    wrap();
    expect(screen.getByTestId("interval-round").textContent).toBe("9라운드 / 32라운드");
    expect(audio.loop).toBe(true);
    wrap();
    expect(screen.getByTestId("interval-round").textContent).toBe("17라운드 / 32라운드");
    expect(audio.loop).toBe(true);
    wrap();
    expect(screen.getByTestId("interval-round").textContent).toBe("25라운드 / 32라운드");
    expect(audio.loop).toBe(false);
  });

  it("4분: 반복하지 않는다 (loop 꺼짐)", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const { container } = setup({
      initialPicked: FOUR,
      onBegin: vi.fn().mockResolvedValue(true),
    });
    fireEvent.click(screen.getByRole("button", { name: "전신 인터벌 시작" }));
    await waitFor(() => expect(screen.getByTestId("interval-session-overlay")).toBeTruthy());
    expect(container.querySelector("audio")!.loop).toBe(false);
  });

  it("중단 뒤 다시 시작하면 블록 번호가 0부터다 (되돌린 currentTime을 되감김으로 세지 않는다)", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = setup({
      initialPicked: FOUR,
      initialMinutes: 8,
      onBegin: vi.fn().mockResolvedValue(true),
      onCancelWorkout: vi.fn().mockResolvedValue(undefined),
    });
    fireEvent.click(screen.getByRole("button", { name: "전신 인터벌 시작" }));
    await waitFor(() => expect(screen.getByTestId("interval-session-overlay")).toBeTruthy());
    const audio = container.querySelector("audio")!;
    audio.currentTime = 100;
    fireEvent.timeUpdate(audio);
    fireEvent.click(screen.getByRole("button", { name: "중단하기" }));
    await waitFor(() => expect(screen.queryByTestId("interval-session-overlay")).toBeNull());
    audio.currentTime = 0;
    fireEvent.timeUpdate(audio); // 중단이 되돌린 값이 늦게 도착한 경우

    fireEvent.click(screen.getByRole("button", { name: "전신 인터벌 시작" }));
    await waitFor(() => expect(screen.getByTestId("interval-session-overlay")).toBeTruthy());
    audio.currentTime = 20;
    fireEvent.timeUpdate(audio);
    expect(screen.getByTestId("interval-round").textContent).toBe("1라운드 / 16라운드");
  });

  it("중단하면 음원을 멈추고 처음으로 되돌린다", async () => {
    vi.stubEnv("NEXT_PUBLIC_INTERVAL_DYNAMITE_USER_IDS", "user-a");
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onCancelWorkout = vi.fn().mockResolvedValue(undefined);
    const { container } = setup({
      userId: "user-a", initialPicked: FOUR,
      onBegin: vi.fn().mockResolvedValue(true), onCancelWorkout,
    });
    fireEvent.click(screen.getByRole("button", { name: "전신 인터벌 시작" }));
    await waitFor(() => expect(screen.getByTestId("interval-session-overlay")).toBeTruthy());
    const audio = container.querySelector("audio")!;
    audio.currentTime = 30;
    fireEvent.click(screen.getByRole("button", { name: "중단하기" }));
    await waitFor(() => expect(onCancelWorkout).toHaveBeenCalledTimes(1));
    expect(pause).toHaveBeenCalledTimes(1);
    expect(audio.currentTime).toBe(0);
    await waitFor(() => expect(screen.queryByTestId("interval-session-overlay")).toBeNull());
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
    // 인터벌은 코스가 세트를 정하므로 `세트 조절`이 없다 — 바로 담는다
    expect(screen.queryByText("세트 조절")).toBeNull();
    fireEvent.click(getByText("운동 1개 바로 추가"));

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
    fireEvent.click(getByText("운동 1개 바로 추가"));

    expect(getByText("+ 운동 고르기 (1/4)")).toBeTruthy();
  });

  it("4개를 넘겨 담아도 한도에서 잘린다", () => {
    const { getByText } = setup();

    // 목록이 바로 뜬다 — 맨몸만 올라와 있다
    fireEvent.click(getByText("+ 운동 고르기 (0/4)"));
    for (const name of FOUR.map((c) => c.name)) {
      fireEvent.click(getByText(name));
    }
    fireEvent.click(getByText("운동 4개 바로 추가"));

    expect(getByText("+ 운동 고르기 (4/4)")).toBeTruthy();
  });
});

describe("TabataSheet — 인터벌 뒤 이어하기 (2026-09-29)", () => {
  it("계획에 이어하기가 있으면 준비 화면에 이름과 안내를 보여 준다", () => {
    setup({
      initialPicked: FOUR,
      initialMinutes: 8,
      followUpNames: ["흉추 익스텐션", "도어웨이 가슴 스트레칭", "Wall Slide", "YTW"],
    });
    const box = screen.getByTestId("interval-follow-ups");
    expect(box.textContent).toContain("인터벌 뒤에 이어서");
    expect(box.textContent).toContain("흉추 익스텐션 · 도어웨이 가슴 스트레칭 · Wall Slide · YTW");
    expect(screen.getByText(/음원이 끝나면 이어서 4종목을 해요/)).toBeTruthy();
    expect(screen.queryByText(/자동으로 기록되고/)).toBeNull();
  });

  it("이어하기가 없으면 예전 안내 그대로", () => {
    setup({ initialPicked: FOUR, initialMinutes: 8 });
    expect(screen.queryByTestId("interval-follow-ups")).toBeNull();
    expect(screen.getByText(/자동으로 기록되고/)).toBeTruthy();
  });

  it("이어하기가 있어도 시작 조건은 인터벌 4개 그대로다", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const onBegin = vi.fn().mockResolvedValue(true);
    setup({ initialPicked: FOUR, initialMinutes: 8, followUpNames: ["흉추 익스텐션"], onBegin });
    fireEvent.click(screen.getByRole("button", { name: "전신 인터벌 시작" }));
    await waitFor(() => expect(onBegin).toHaveBeenCalledWith(FOUR, 8));
  });
});

/**
 * 챌린지 참가자는 인터벌을 **시작하기 전에** 예상 점수를 본다 (사용자 지시 2026-11-17).
 * 인터벌은 시트의 시작 버튼 하나로만 시작되므로 이 카드가 시작 전 유일한 확인 자리다.
 */
describe("TabataSheet — 시작 전 챌린지 예상 점수 (2026-11-17)", () => {
  const goal = { id: "g", user_id: "me", challenge_id: "c", goal_type: "bodyweight_reps", target_value: 100, planned_days: 2, qualifier: null, unit: "회" } as ChallengeScoreSnapshot["goals"][number];
  const context: ActiveChallengeContext = { id: "c", name: "함께 운동", startDate: "2000-01-01", endDate: "2999-12-31", photoRequired: false, goals: [goal], liveRanking: true };
  const snapshot = { challenge: { id: "c", name: "함께 운동", status: "active", myStatus: "joined", live_ranking: true, photo_required: false, scoring_version: 2, start_date: "2000-01-01", end_date: "2999-12-31" }, goals: [goal], participantIds: ["me", "other"], rows: [], timeZone: "Asia/Seoul" } as unknown as ChallengeScoreSnapshot;
  const headline = () => Number((document.body.textContent ?? "").match(/예상 \+([\d.]+)점/)?.[1]);

  it("시작 버튼 앞에 인터벌 예상 점수가 뜨고, 코스를 바꾸면 점수가 바뀐다", async () => {
    vi.mocked(loadChallengeScoreSnapshot).mockResolvedValue(snapshot);
    setup({ userId: "me", initialPicked: FOUR, initialMinutes: 4, challengeContexts: [context] });
    expect(await screen.findByText("이 인터벌을 마치면")).toBeTruthy();
    const p4 = headline();
    expect(p4).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "8분" }));
    await waitFor(() => expect(headline()).toBeGreaterThan(p4));
    expect(screen.getByRole("button", { name: "전신 인터벌 시작" })).toBeTruthy();
  });
  it("참여 중인 챌린지가 없으면 카드가 없다", () => {
    vi.mocked(loadChallengeScoreSnapshot).mockClear();
    setup({ userId: "me", initialPicked: FOUR, challengeContexts: [] });
    expect(screen.queryByText("이 인터벌을 마치면")).toBeNull();
    expect(loadChallengeScoreSnapshot).not.toHaveBeenCalled();
  });
  it("계획 저장 모드(달력)에서는 보여주지 않는다 — 시작하는 화면이 아니다", () => {
    vi.mocked(loadChallengeScoreSnapshot).mockResolvedValue(snapshot);
    setup({ userId: "me", initialPicked: FOUR, challengeContexts: [context], onPlan: vi.fn() });
    expect(screen.queryByText("이 인터벌을 마치면")).toBeNull();
  });
});

/**
 * 인터벌 시트의 "오늘 계획으로 저장" (사용자 지시 2026-11-17).
 * 종목을 바꾸고 시작하지 않고 닫으면 바꾼 구성이 사라졌다 — 시작과 따로 저장할 수 있어야 한다.
 */
describe("TabataSheet — 오늘 계획으로 저장 (2026-11-17)", () => {
  const SAVE = "오늘 계획으로 저장만 하기";

  it("저장 동작이 연결된 시트에만 버튼이 있다 — 달력 계획 모드·옛 호출에는 없다", () => {
    setup({ initialPicked: FOUR });
    expect(screen.queryByRole("button", { name: SAVE })).toBeNull(); // 옛 호출
    cleanup();
    setup({ initialPicked: FOUR, onSaveToday: vi.fn(), onPlan: vi.fn() });
    expect(screen.queryByRole("button", { name: SAVE })).toBeNull(); // 계획 모드는 이미 저장 버튼이다
    cleanup();
    setup({ initialPicked: FOUR, onSaveToday: vi.fn() });
    expect(screen.getByRole("button", { name: SAVE })).toBeTruthy();
  });

  it("4개를 다 고르기 전에는 잠겨 있다 — 인터벌은 4개가 한 구성이다", () => {
    setup({ initialPicked: FOUR.slice(0, 3), onSaveToday: vi.fn() });
    expect((screen.getByRole("button", { name: SAVE }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("누르면 고른 종목·코스로 저장을 부르고, 성공하면 시트를 닫는다 — 시작은 하지 않는다", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const onSaveToday = vi.fn().mockResolvedValue(true);
    const onBegin = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    setup({ initialPicked: FOUR, initialMinutes: 4, onSaveToday, onBegin, onClose });
    fireEvent.click(screen.getByRole("button", { name: "16분" }));
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => expect(onSaveToday).toHaveBeenCalledWith(FOUR, 16));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onBegin).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled(); // 부정 확인: 음원이 켜지지 않았다
  });

  it("저장에 실패하면 시트를 닫지 않는다 — 바꾼 구성을 잃지 않게", async () => {
    const onSaveToday = vi.fn().mockResolvedValue(false);
    const onClose = vi.fn();
    setup({ initialPicked: FOUR, onSaveToday, onClose });
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => expect(onSaveToday).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: SAVE })).toBeTruthy();
  });
});
