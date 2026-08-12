// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { amountFields } from "@/lib/domain/set-input";
import type { ExercisePrescription } from "@/lib/domain/workout-plan";
import { ActiveSessionOverlay } from "./active-session-overlay";

afterEach(cleanup);

/**
 * ② 운동 중 큰 팝업 — 사용자 목업 기준 재구성 (2026-08-04).
 *
 * 두 상태가 **번갈아** 뜬다: `● 지금 운동 중`(세트 하나 입력) ↔ `● 휴식 중`
 * (남은 시간 + 다음 운동). 처음엔 종목 카드를 크게 띄웠는데 목업은 **세트 하나**를
 * 보여주고 휴식도 별도 화면이다.
 *
 * ⚠️ 탭바는 덮지 않는다(사용자 결정) — 달력·피드로 바로 갈 수 있어야 한다.
 */
const base = {
  open: true,
  elapsedLabel: "24:18",
  paused: false,
  busy: false,
  onMinimize: vi.fn(),
  onCancel: vi.fn(),
  onFinish: vi.fn(),
  // 기본은 없음 — 넘기지 않으면 자세 안내 버튼이 안 나오는 것이 기본 동작이다.
  // (`Partial<typeof inputProps>` 헬퍼가 이 키를 알아야 테스트에서 덮어쓸 수 있다)
  onOpenGuide: undefined as ((name: string) => void) | undefined,
  // 프로그램 처방 — 기본은 없음(일반 운동)
  prescription: undefined as ExercisePrescription | undefined,
  onChangeAmount: vi.fn(),
  onCompleteSet: vi.fn(),
  onLoadLast: vi.fn(),
  canReplaceExercise: true,
  onReplaceExercise: vi.fn(),
  onSkipExercise: vi.fn(),
  onAdjustRest: vi.fn(),
  onPickRestPreset: vi.fn(),
  onStartNext: vi.fn(),
  isLastPendingSet: false,
  // ⚠️ `completionMessage.cheer`와 **다른 문자열**이어야 한다. 둘이 같으면
  //    "완료 응원과 마지막 세트 응원은 다르다" 단언이 통과해도 의미가 없다.
  lastSetMessage: "지금 그만둬도 아무도 모릅니다. 근데 본인이 알죠.",
  completionMessage: { headline: "다 했어요", cheer: "응원" },
  // 3 / 8 완료 = 37% — 사용자 목업의 숫자를 그대로 쓴다 (2026-08-07)
  progress: { completed: 3, total: 8, percent: 37 },
  setProgress: { done: 3, total: 4, remaining: 1 },
};

const inputProps = {
  ...base,
  mode: "input" as const,
  exerciseName: "데드리프트",
  setPosition: { index: 0, total: 5 },
  fields: amountFields("weight", null),
  values: { weightKg: 40, reps: 11, distanceKm: 0, durationMin: 0 },
  restSeconds: 60,
  restPresetSeconds: 60,
  nextUp: null,
};

const restProps = {
  ...base,
  mode: "rest" as const,
  exerciseName: "데드리프트",
  setPosition: { index: 0, total: 5 },
  fields: amountFields("weight", null),
  values: { weightKg: 40, reps: 11, distanceKm: 0, durationMin: 0 },
  restSeconds: 50,
  restPresetSeconds: 60,
  nextUp: { exerciseName: "레그프레스", amount: "260kg 15회" } as {
    exerciseName: string;
    amount: string;
  } | null,
};

const renderInput = (o: Partial<typeof inputProps> = {}) =>
  render(<ActiveSessionOverlay {...inputProps} {...o} />);
const renderRest = (o: Partial<typeof restProps> = {}) =>
  render(<ActiveSessionOverlay {...restProps} {...o} />);

describe("ActiveSessionOverlay — 운동 중(입력) 화면", () => {
  it("열려 있지 않으면 아무것도 그리지 않는다", () => {
    renderInput({ open: false });
    expect(screen.queryByText("데드리프트")).toBeNull();
  });

  it("상태 배지·종목명·운동 시간을 보여준다", () => {
    renderInput();

    expect(screen.getByText(/지금 운동 중/)).toBeTruthy();
    expect(screen.getByText("데드리프트")).toBeTruthy();
    expect(screen.getByText(/24:18/)).toBeTruthy();
  });

  it("현재 세트 위치를 보여준다", () => {
    renderInput({ setPosition: { index: 2, total: 5 } });

    expect(screen.getByText(/3\s*\/\s*5/)).toBeTruthy();
  });

  it("웨이트는 무게와 횟수 칸을 그린다", () => {
    renderInput();

    expect(screen.getByText("무게")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
    expect(screen.getByText("횟수")).toBeTruthy();
    expect(screen.getByText("11")).toBeTruthy();
  });

  it("유산소는 같은 틀에 거리·시간 칸으로 바뀐다", () => {
    renderInput({
      fields: amountFields("cardio", null),
      values: { weightKg: 0, reps: 0, distanceKm: 3.5, durationMin: 25 },
    });

    expect(screen.getByText("거리")).toBeTruthy();
    expect(screen.getByText("3.5")).toBeTruthy();
    expect(screen.getByText("시간")).toBeTruthy();
    expect(screen.queryByText("무게")).toBeNull();
  });

  it("맨몸 시간형은 시간 한 칸만 그린다", () => {
    renderInput({
      fields: amountFields("bodyweight", "time"),
      values: { weightKg: 0, reps: 0, distanceKm: 0, durationMin: 2 },
    });

    expect(screen.getByText("시간")).toBeTruthy();
    expect(screen.queryByText("횟수")).toBeNull();
  });

  it("– / + 는 그 칸의 기본 증감만큼 바꾼다", () => {
    const onChangeAmount = vi.fn();
    renderInput({ onChangeAmount });

    fireEvent.click(screen.getByRole("button", { name: "무게 늘리기" }));
    expect(onChangeAmount).toHaveBeenCalledWith("weightKg", 42.5);

    fireEvent.click(screen.getByRole("button", { name: "무게 줄이기" }));
    expect(onChangeAmount).toHaveBeenCalledWith("weightKg", 37.5);
  });

  it("빠른 조절 칩은 그 값만큼 바꾼다", () => {
    const onChangeAmount = vi.fn();
    renderInput({ onChangeAmount });

    fireEvent.click(screen.getByRole("button", { name: "무게 +1" }));
    expect(onChangeAmount).toHaveBeenCalledWith("weightKg", 41);
  });

  it("0 아래로는 내려가지 않는다", () => {
    const onChangeAmount = vi.fn();
    renderInput({
      onChangeAmount,
      values: { weightKg: 1, reps: 0, distanceKm: 0, durationMin: 0 },
    });

    fireEvent.click(screen.getByRole("button", { name: "무게 줄이기" }));
    expect(onChangeAmount).toHaveBeenCalledWith("weightKg", 0);
  });

  it("운동 완료 버튼이 세트를 기록한다", () => {
    const onCompleteSet = vi.fn();
    renderInput({ onCompleteSet });

    fireEvent.click(screen.getByRole("button", { name: /운동 완료/ }));
    expect(onCompleteSet).toHaveBeenCalled();
  });

  it("이전 기록 불러오기가 있다", () => {
    const onLoadLast = vi.fn();
    renderInput({ onLoadLast });

    fireEvent.click(screen.getByRole("button", { name: /이전 기록 불러오기/ }));
    expect(onLoadLast).toHaveBeenCalled();
  });

  it("휴식 화면의 것들은 그리지 않는다", () => {
    renderInput();

    expect(screen.queryByText(/휴식 중/)).toBeNull();
    expect(screen.queryByText(/다음 운동 시작/)).toBeNull();
  });
});

describe("ActiveSessionOverlay — 휴식 중 화면", () => {
  it("휴식 배지와 '무엇을 하던 중인지'를 보여준다", () => {
    /*
      2026-08-07에 바뀐 요구다. 예전에는 `데드리프트 완료` 헤드라인이 상단을
      차지했는데, 사용자가 **그 자리를 진행률에 내주라고** 지시했다. 종목명은
      세트 진행 카드로 옮겼다 — 없어진 게 아니라 자리를 바꾼 것이다.
    */
    renderRest();

    expect(screen.getByText(/휴식 중/)).toBeTruthy();
    expect(screen.getByText("데드리프트")).toBeTruthy();
    expect(screen.queryByText("데드리프트 완료")).toBeNull();
  });

  it("남은 시간을 분:초로 크게 보여준다", () => {
    renderRest({ restSeconds: 50 });

    expect(screen.getByText("00:50")).toBeTruthy();
  });

  it("– / + 로 10초씩 조절한다", () => {
    const onAdjustRest = vi.fn();
    renderRest({ onAdjustRest });

    fireEvent.click(screen.getByRole("button", { name: "휴식 10초 줄이기" }));
    expect(onAdjustRest).toHaveBeenCalledWith(-10);

    fireEvent.click(screen.getByRole("button", { name: "휴식 10초 늘리기" }));
    expect(onAdjustRest).toHaveBeenCalledWith(10);
  });

  it("프리셋 칩 다섯 개를 보여주고 지금 값을 표시한다", () => {
    renderRest({ restPresetSeconds: 60 });

    for (const label of ["30초", "45초", "1분", "1분 30초", "2분"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(
      screen.getByRole("button", { name: "1분" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("프리셋을 누르면 그 초를 올려 보낸다", () => {
    const onPickRestPreset = vi.fn();
    renderRest({ onPickRestPreset });

    fireEvent.click(screen.getByRole("button", { name: "1분 30초" }));
    expect(onPickRestPreset).toHaveBeenCalledWith(90);
  });

  it("다음 운동과 그 수량을 보여준다", () => {
    renderRest();

    // "다음 운동 시작" 버튼과 겹치므로 라벨은 정확히 일치로 잡는다
    expect(screen.getByText("다음 운동")).toBeTruthy();
    expect(screen.getByText("레그프레스")).toBeTruthy();
    expect(screen.getByText(/260kg 15회/)).toBeTruthy();
  });

  it("다음 운동 시작 버튼이 휴식을 끝낸다", () => {
    const onStartNext = vi.fn();
    renderRest({ onStartNext });

    fireEvent.click(screen.getByRole("button", { name: /다음 운동 시작/ }));
    expect(onStartNext).toHaveBeenCalled();
  });

  it("남은 세트가 없으면 마무리를 안내한다 — 빈 칸을 남기지 않는다", () => {
    renderRest({ nextUp: null });

    expect(screen.getByText(/마지막 세트|다 했어요/)).toBeTruthy();
  });

  it("입력 화면의 것들은 그리지 않는다", () => {
    renderRest();

    expect(screen.queryByText(/지금 운동 중/)).toBeNull();
    expect(screen.queryByRole("button", { name: /운동 완료/ })).toBeNull();
  });
});

describe("ActiveSessionOverlay — 공통", () => {
  it("최소화는 종료가 아니다", () => {
    const onMinimize = vi.fn();
    const onFinish = vi.fn();
    renderInput({ onMinimize, onFinish });

    fireEvent.click(screen.getByRole("button", { name: /최소화/ }));
    expect(onMinimize).toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("취소는 최소화와 다른 버튼이다", () => {
    const onCancel = vi.fn();
    renderInput({ onCancel });

    fireEvent.click(screen.getByRole("button", { name: /^취소$/ }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("무동작 정지 중이면 알린다", () => {
    renderInput({ paused: true });

    expect(screen.getByText(/정지/)).toBeTruthy();
  });

  it("탭바를 덮지 않는다 — 화면 전체가 아니라 탭바 위까지만 (사용자 결정)", () => {
    const { container } = renderInput();
    const overlay = container.firstElementChild as HTMLElement;

    expect(overlay.className).toContain("inset-x-0");
    expect(overlay.className).not.toContain("inset-0");
  });

  it("휴식 바·피커·정지 모달이 위에 뜨도록 z-20에 머문다", () => {
    const { container } = renderInput();

    expect(container.querySelector(".z-20")).toBeTruthy();
  });
});

/**
 * 운동 중 종목 손보기 (2026-08-09 사용자 지시 "운동 중 운동 교체 혹은 취소 하기").
 *
 * ⚠️ **여기가 유일한 경로다.** 오버레이가 열려 있으면 `ExerciseCard`가 렌더되지
 * 않아(`record/page.tsx`의 `{!overlayOpen && exerciseCards}`) 종목 삭제·순서
 * 변경이 전부 닫힌다. 이 버튼들을 지우면 운동 중에는 아무것도 못 바꾸는
 * 상태로 되돌아간다.
 */
describe("ActiveSessionOverlay — 운동 중 종목 바꾸기·건너뛰기", () => {
  it("입력 화면에 두 버튼이 있다", () => {
    renderInput();

    expect(screen.getByRole("button", { name: /운동 바꾸기/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /이 종목 빼기/ })).toBeTruthy();
  });

  it("바꾸기를 누르면 부모에게 알린다 — 부모가 피커를 연다", () => {
    const onReplaceExercise = vi.fn();
    renderInput({ onReplaceExercise });

    fireEvent.click(screen.getByRole("button", { name: /운동 바꾸기/ }));

    expect(onReplaceExercise).toHaveBeenCalled();
  });

  it("건너뛰기를 누르면 부모에게 알린다", () => {
    const onSkipExercise = vi.fn();
    renderInput({ onSkipExercise });

    fireEvent.click(screen.getByRole("button", { name: /이 종목 빼기/ }));

    expect(onSkipExercise).toHaveBeenCalled();
  });

  /**
   * 완료한 세트가 있는 종목을 바꾸면 그 기록이 **다른 운동 것으로 둔갑한다.**
   * 누를 수 없는 버튼을 그려 놓고 토스트로 알리는 것은 화면이 거짓말을 하는 것이라
   * (이 저장소 규약) 아예 안 그린다.
   */
  it("완료한 세트가 있으면 바꾸기 버튼이 없다 — 건너뛰기는 남는다", () => {
    renderInput({ canReplaceExercise: false });

    expect(screen.queryByRole("button", { name: /운동 바꾸기/ })).toBeNull();
    expect(screen.getByRole("button", { name: /이 종목 빼기/ })).toBeTruthy();
  });

  it("휴식 화면에는 두 버튼이 없다 — 지금 하는 종목이 없다", () => {
    renderRest();

    expect(screen.queryByRole("button", { name: /운동 바꾸기/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /이 종목 빼기/ })).toBeNull();
  });
});

/**
 * 설치형 앱의 안전 영역 (2026-08-09, 사용자 신고 "실 서버에 접어 두기 기능 작동 안함").
 *
 * `layout.tsx`가 `viewportFit: "cover"`이고 매니페스트가 `display: standalone`이라
 * **폰에 설치하면 페이지가 상태바 밑까지 그려진다.** 오버레이는 `top-0`에 붙고
 * 첫 줄이 `▾ 최소화`·`취소`인데, 예전 여백은 `pt-3`(12px)뿐이라 32px짜리 두 버튼이
 * 통째로 상태바 아래(iOS 44~59px)에 깔려 **탭이 시스템 UI로 갔다.**
 *
 * ⚠️ jsdom은 실제 inset 값을 모른다 — 그래서 **`env()`를 쓰고 있는지**를 문자열로
 * 단언한다. 이 단언이 약해 보여도, `pt-3`으로 되돌리는 순간 실패한다. 그게 목적이다.
 */
describe("ActiveSessionOverlay — 설치형 앱 안전 영역", () => {
  it("위쪽 여백이 상태바를 피한다 (env(safe-area-inset-top))", () => {
    const { container } = renderInput();
    const overlay = container.firstElementChild as HTMLElement;

    expect(overlay.style.paddingTop).toContain("env(safe-area-inset-top)");
  });

  it("고정 여백만으로 위쪽을 띄우지 않는다 — Tailwind pt-*로 되돌리면 실패한다", () => {
    const { container } = renderInput();
    const overlay = container.firstElementChild as HTMLElement;

    expect(overlay.className).not.toMatch(/\bpt-\d/);
  });

  it("빠져나가는 두 문은 터치 타깃 44px(h-11)을 지킨다", () => {
    renderInput();

    // 오버레이를 벗어나는 길은 이 둘뿐이다. 화면 맨 위라 상태바에 가장 가깝다.
    const minimize = screen.getByRole("button", { name: /최소화/ });
    const cancel = screen.getByRole("button", { name: "취소" });

    expect(minimize.className).toContain("h-11");
    expect(cancel.className).toContain("h-11");
  });
});

/**
 * 마지막 세트 안내 + 완료 축하 (2026-08-04, 사용자 요청).
 *
 * "마지막 세트를 할 때 오늘 계획한 운동을 완료했다는 안내와 응원 메시지를
 * 보여주고, 마지막 운동을 완료하면 자연스럽게 다음 화면으로 넘어가게."
 *
 * ⚠️ 자동으로 종료하지는 않는다 — 운동 종료는 XP·기록을 확정하는 되돌리기 어려운
 * 동작이라, **주 버튼을 종료로 바꿔** 자연스럽게 흐르게 하되 누르는 건 사용자다.
 */
describe("ActiveSessionOverlay — 마지막 세트와 마무리", () => {
  it("입력 화면에서 마지막 남은 세트면 그 사실을 알린다", () => {
    renderInput({ isLastPendingSet: true });

    expect(screen.getByText(/마지막 세트/)).toBeTruthy();
  });

  it("마지막이 아니면 그 표시가 없다", () => {
    renderInput({ isLastPendingSet: false });

    expect(screen.queryByText(/마지막 세트/)).toBeNull();
  });

  /**
   * 2026-08-09 사용자 지시 "치얼업 메시지 운동중 세션 마지막 세트에 나타나게".
   *
   * 2026-08-04 요구도 원래 "마지막 세트를 **할 때** 안내와 응원"이었는데, 구현이
   * 응원을 완료 화면에만 뒀다. 아래 두 단언이 그 회귀를 막는다.
   */
  it("마지막 세트에서는 응원 문구도 함께 보인다", () => {
    renderInput({
      isLastPendingSet: true,
      lastSetMessage: "포기하기 딱 좋은 타이밍인 거 압니다.",
    });

    expect(screen.getByText(/포기하기 딱 좋은 타이밍/)).toBeTruthy();
  });

  it("마지막이 아니면 응원 문구도 없다", () => {
    renderInput({
      isLastPendingSet: false,
      lastSetMessage: "포기하기 딱 좋은 타이밍인 거 압니다.",
    });

    expect(screen.queryByText(/포기하기 딱 좋은 타이밍/)).toBeNull();
  });

  it("마지막 세트 응원은 완료 응원과 다른 자리에 뜬다 — 완료 문구가 미리 새지 않는다", () => {
    renderInput({
      isLastPendingSet: true,
      lastSetMessage: "여기가 승부처예요.",
      completionMessage: { headline: "오늘 다 했어요", cheer: "오늘의 승자" },
    });

    expect(screen.getByText(/여기가 승부처/)).toBeTruthy();
    // 아직 마지막 세트를 **하기 전**이다. 완료 문구가 여기서 보이면 거짓말이다.
    expect(screen.queryByText(/오늘의 승자/)).toBeNull();
    expect(screen.queryByText(/오늘 다 했어요/)).toBeNull();
  });

  it("마지막 세트를 끝내면 완료 안내와 응원을 보여준다", () => {
    renderRest({
      nextUp: null,
      completionMessage: {
        headline: "오늘 계획한 운동을 다 했어요 🎉",
        cheer: "담은 거 하나도 안 남기셨네요. 오늘의 승자십니다 🏆",
      },
    });

    expect(screen.getByText(/오늘 계획한 운동을 다 했어요/)).toBeTruthy();
    expect(screen.getByText(/오늘의 승자십니다/)).toBeTruthy();
  });

  it("다 끝냈으면 결과 화면으로 넘어갈 길을 준다", () => {
    // B안(2026-08-04)에서 주 버튼이 사라지고 3초 자동 전환 + 보조 링크가 됐다.
    // 그래도 **기다림이 강제가 아니어야** 한다는 요구는 그대로다.
    const onFinish = vi.fn();
    renderRest({
      nextUp: null,
      completionMessage: {
        headline: "오늘 계획한 운동을 다 했어요 🎉",
        cheer: "응원",
      },
      onFinish,
    });

    fireEvent.click(screen.getByRole("button", { name: /지금 바로 보기/ }));
    expect(onFinish).toHaveBeenCalled();
  });

  it("아직 남은 운동이 있으면 완료 안내를 띄우지 않는다", () => {
    renderRest({
      completionMessage: {
        headline: "오늘 계획한 운동을 다 했어요 🎉",
        cheer: "응원",
      },
    });

    expect(screen.queryByText(/다 했어요/)).toBeNull();
    expect(screen.getByRole("button", { name: /다음 운동 시작/ })).toBeTruthy();
  });
});

/**
 * B안 화면 (2026-08-04, 사용자 결정).
 *
 * 마지막 세트에는 휴식을 걸지 않으므로, 완료 화면에 **휴식 타이머와 프리셋을
 * 그리면 거짓말이 된다** — 돌지도 않는 시간이 떠 있게 된다.
 */
describe("ActiveSessionOverlay — 완료 화면 (B안)", () => {
  const done = {
    nextUp: null,
    completionMessage: {
      headline: "오늘 계획한 운동을 다 했어요 🎉",
      cheer: "오늘의 승자십니다 🏆",
    },
  };

  it("휴식 타이머를 그리지 않는다 — 돌지 않는 시간을 보여주면 안 된다", () => {
    renderRest(done);

    expect(screen.queryByText("휴식 시간")).toBeNull();
    expect(screen.queryByRole("button", { name: "휴식 10초 줄이기" })).toBeNull();
  });

  it("휴식 프리셋 칩도 그리지 않는다", () => {
    renderRest(done);

    expect(screen.queryByRole("button", { name: "1분" })).toBeNull();
    expect(screen.queryByRole("button", { name: "2분" })).toBeNull();
  });

  it("곧 결과 화면으로 넘어간다고 알린다", () => {
    renderRest(done);

    expect(screen.getByText(/잠시 후|곧/)).toBeTruthy();
  });

  it("바로 가고 싶으면 누를 수 있다 — 기다림이 강제가 아니다", () => {
    const onFinish = vi.fn();
    renderRest({ ...done, onFinish });

    fireEvent.click(screen.getByRole("button", { name: /지금 바로 보기/ }));
    expect(onFinish).toHaveBeenCalled();
  });

  it("아직 남은 세트가 있으면 휴식 타이머는 그대로 나온다", () => {
    renderRest();

    expect(screen.getByText("휴식 시간")).toBeTruthy();
    expect(screen.getByRole("button", { name: "1분" })).toBeTruthy();
  });
});

describe("진행률·세트 남음 표시 (2026-08-07, 사용자 목업)", () => {
  it("두 화면 모두 전체 진행률을 그린다", () => {
    // 사용자 결정: 휴식 화면만이 아니라 세트 입력 중에도 보여준다
    for (const render of [renderInput, renderRest]) {
      cleanup();
      render();
      const bar = screen.getByRole("progressbar", { name: "전체 운동 진행률" });
      expect(bar.getAttribute("aria-valuenow")).toBe("37");
      expect(screen.getByText("3 / 8 완료")).toBeTruthy();
      expect(screen.getByText("37%")).toBeTruthy();
    }
  });

  it("휴식 화면에서는 '{종목명} 완료' 헤드라인이 사라졌다", () => {
    // 부정 확인 — 그 자리를 진행률에 내줬다 (사용자 지시 ②)
    renderRest();

    expect(screen.queryByText("데드리프트 완료")).toBeNull();
    expect(
      screen.getByRole("progressbar", { name: "전체 운동 진행률" }),
    ).toBeTruthy();
  });

  it("입력 화면은 종목명 헤드라인을 그대로 둔다 — 지금 뭘 하는지가 먼저다", () => {
    renderInput();

    expect(screen.getByRole("heading", { name: "데드리프트" })).toBeTruthy();
  });

  it("휴식 중에 이 종목이 몇 세트 남았는지 말한다 (지시 ③)", () => {
    renderRest();

    expect(screen.getByText("3세트 / 4세트")).toBeTruthy();
    expect(screen.getByText("1세트 남음")).toBeTruthy();
  });

  it("다 끝낸 화면에는 세트 남음 카드를 그리지 않는다", () => {
    renderRest({ nextUp: null });

    expect(screen.queryByText("1세트 남음")).toBeNull();
  });

  it("운동 시간은 휴식 타이머보다 작게 그린다 (사용자 지시 2026-08-07)", () => {
    // 휴식 화면에서 제일 큰 숫자는 지금 세고 있는 휴식 시간이어야 한다.
    renderRest();

    const elapsed = screen.getByText("24:18");
    const rest = screen.getByText("00:50");
    const px = (el: HTMLElement) =>
      Number(/text-\[(\d+)px\]/.exec(el.className)?.[1] ?? 0);

    expect(px(elapsed)).toBeGreaterThan(0);
    expect(px(rest)).toBeGreaterThan(0);
    expect(px(elapsed)).toBeLessThan(px(rest));
  });
});

/**
 * 운동 중 자세 안내 (계획 2026-08-12 Task 3).
 *
 * 준비 화면과 **같은 안내**를 쓴다. 자세가 헷갈리는 순간은 운동 직전이 아니라
 * 세트 사이라서, 여기서 못 열면 안내가 있으나 마나다.
 *
 * ⚠️ 기본 픽스처 '데드리프트'에는 안내가 없다(등록된 것은 '루마니안 데드리프트').
 *    그래서 없는 경우 검증이 저절로 따라온다.
 */
describe("ActiveSessionOverlay — 자세 안내", () => {
  it("운동 중 화면에서 안내를 열 수 있다", () => {
    const onOpenGuide = vi.fn();
    renderInput({ exerciseName: "숄더프레스", onOpenGuide });

    fireEvent.click(screen.getByRole("button", { name: "숄더프레스 자세 안내" }));

    expect(onOpenGuide).toHaveBeenCalledWith("숄더프레스");
  });

  it("휴식 중에도 안내를 열 수 있다", () => {
    const onOpenGuide = vi.fn();
    renderRest({ exerciseName: "숄더프레스", onOpenGuide });

    fireEvent.click(screen.getByRole("button", { name: "숄더프레스 자세 안내" }));

    expect(onOpenGuide).toHaveBeenCalledWith("숄더프레스");
  });

  it("안내가 없는 종목에는 버튼을 숨긴다", () => {
    renderInput({ onOpenGuide: vi.fn() });

    expect(screen.queryByRole("button", { name: /자세 안내/ })).toBeNull();
  });

  it("onOpenGuide를 안 넘기면 버튼이 없다", () => {
    renderInput({ exerciseName: "숄더프레스" });

    expect(screen.queryByRole("button", { name: /자세 안내/ })).toBeNull();
  });

  it("안내를 열어도 세트 완료·운동 종료가 함께 일어나지 않는다", () => {
    const onCompleteSet = vi.fn();
    const onFinish = vi.fn();
    renderInput({
      exerciseName: "숄더프레스",
      onOpenGuide: vi.fn(),
      onCompleteSet,
      onFinish,
    });

    fireEvent.click(screen.getByRole("button", { name: "숄더프레스 자세 안내" }));

    expect(onCompleteSet).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
  });
});

/**
 * 운동 중 목표 범위 (계획 2026-08-12 Task 4).
 *
 * 세트를 입력하는 순간 "몇 회가 목표인지"가 화면에 있어야 한다. 준비 카드에만
 * 있으면 운동을 시작한 뒤에는 볼 수 없다.
 */
const RX = {
  repsMin: 8,
  repsMax: 10,
  targetRir: 2,
  restSeconds: 120,
  loadStepKg: 2.5,
} as const;

describe("ActiveSessionOverlay — 프로그램 목표 범위", () => {
  it("입력 화면에 목표 반복 범위와 휴식을 보여준다", () => {
    renderInput({ prescription: RX });

    expect(screen.getByText(/목표 8~10회/)).toBeTruthy();
    expect(screen.getByText(/휴식 2:00/)).toBeTruthy();
  });

  it("처방이 다르면 숫자가 따라 바뀐다", () => {
    renderInput({
      prescription: { ...RX, repsMin: 12, repsMax: 15, restSeconds: 75 },
    });

    expect(screen.getByText(/목표 12~15회/)).toBeTruthy();
    expect(screen.getByText(/휴식 1:15/)).toBeTruthy();
  });

  it("처방이 없는 일반 운동에는 안 보여준다", () => {
    renderInput();

    expect(screen.queryByText(/목표 .*회/)).toBeNull();
  });

  it("휴식 화면에도 목표 범위가 남는다", () => {
    renderRest({ prescription: RX });

    expect(screen.getByText(/목표 8~10회/)).toBeTruthy();
  });
});
