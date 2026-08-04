// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActiveSessionOverlay } from "./active-session-overlay";

afterEach(cleanup);

/**
 * ② 운동 중 큰 팝업 (2026-08-04, 사용자 승인).
 *
 * 풀스크린 · 운동 시작 시 자동 표시 · **닫기는 종료가 아니라 최소화**다.
 * 닫기=종료로 만들면 오조작 한 번이 세션을 날린다.
 *
 * 입력 카드는 `children`으로 받는다 — `ExerciseCard`를 그대로 재사용해야
 * 프리필·볼륨 계산·완료 토글이 두 벌이 되지 않는다.
 */
function setup(
  override: Partial<Parameters<typeof ActiveSessionOverlay>[0]> = {},
) {
  const props = {
    open: true,
    elapsedLabel: "00:12:34",
    volumeKg: 480,
    completedSetCount: 3,
    paused: false,
    busy: false,
    onMinimize: vi.fn(),
    onFinish: vi.fn(),
    onCancel: vi.fn(),
    position: { index: 0, total: 3 },
    currentName: "벤치 프레스",
    onPrev: vi.fn(),
    onNext: vi.fn(),
    children: <div>운동 카드 자리</div>,
    ...override,
  };
  render(<ActiveSessionOverlay {...props} />);
  return props;
}

describe("ActiveSessionOverlay", () => {
  it("open이 false면 아무것도 그리지 않는다", () => {
    setup({ open: false });

    expect(screen.queryByText("운동 카드 자리")).toBeNull();
  });

  it("경과 시간과 완료 볼륨을 크게 보여준다", () => {
    setup();

    expect(screen.getByText("00:12:34")).toBeTruthy();
    expect(screen.getByText(/480/)).toBeTruthy();
  });

  it("입력 카드를 children으로 그대로 그린다", () => {
    setup();

    expect(screen.getByText("운동 카드 자리")).toBeTruthy();
  });

  it("최소화 버튼은 종료가 아니라 접기다", () => {
    const { onMinimize, onFinish } = setup();

    fireEvent.click(screen.getByRole("button", { name: /최소화/ }));

    expect(onMinimize).toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("운동 종료 버튼은 onFinish를 부른다", () => {
    const { onFinish } = setup();

    fireEvent.click(screen.getByRole("button", { name: /운동 종료/ }));

    expect(onFinish).toHaveBeenCalled();
  });

  it("취소는 종료와 다른 버튼이다 — 나란히 두지 않는다", () => {
    const { onCancel, onFinish } = setup();

    fireEvent.click(screen.getByRole("button", { name: /^취소$/ }));

    expect(onCancel).toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("처리 중이면 종료 버튼을 잠근다 — 두 번 종료를 막는다", () => {
    setup({ busy: true });

    const finish = screen.getByRole("button", {
      name: /운동 종료|처리 중/,
    }) as HTMLButtonElement;
    expect(finish.disabled).toBe(true);
  });

  it("무동작으로 정지 중이면 그 사실을 알린다", () => {
    setup({ paused: true });

    expect(screen.getByText(/정지/)).toBeTruthy();
  });

  it("휴식 바·피커·정지 모달이 위에 뜰 수 있도록 z-20에 머문다", () => {
    // RestBar z-30 · 피커 z-40/50 · 정지 모달 z-50보다 아래여야 한다.
    // 이 값을 올리면 휴식 바가 팝업 뒤로 숨어 카운트다운이 안 보인다.
    const { container } = render(
      <ActiveSessionOverlay
        open
        elapsedLabel="00:00:01"
        volumeKg={0}
        completedSetCount={0}
        paused={false}
        busy={false}
        position={{ index: 0, total: 1 }}
        currentName="벤치 프레스"
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onMinimize={vi.fn()}
        onFinish={vi.fn()}
        onCancel={vi.fn()}
      >
        <div />
      </ActiveSessionOverlay>,
    );

    expect(container.querySelector(".fixed.inset-0.z-20")).toBeTruthy();
  });
});

/**
 * 한 종목만 보여준다 (2026-08-04, 사용자 지적으로 수정).
 *
 * 처음엔 전체 목록을 그대로 옮겨 놨는데 "지금 하는 운동에 집중"이 성립하지
 * 않았다. 한 종목만 보이므로 **나머지로 갈 길**이 반드시 있어야 한다 —
 * 없으면 담아 둔 2·3번 종목에 영영 못 간다.
 */
describe("ActiveSessionOverlay — 한 종목만 보여주기", () => {
  it("지금 종목의 이름과 위치를 보여준다", () => {
    setup({ position: { index: 1, total: 3 }, currentName: "스쿼트" });

    expect(screen.getByText("스쿼트")).toBeTruthy();
    expect(screen.getByText("2 / 3")).toBeTruthy();
  });

  it("이전·다음 종목으로 갈 수 있다", () => {
    const { onPrev, onNext } = setup({ position: { index: 1, total: 3 } });

    fireEvent.click(screen.getByRole("button", { name: "이전 종목" }));
    expect(onPrev).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "다음 종목" }));
    expect(onNext).toHaveBeenCalled();
  });

  it("첫 종목에서는 이전이 잠긴다", () => {
    setup({ position: { index: 0, total: 3 } });

    expect(
      (screen.getByRole("button", { name: "이전 종목" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("마지막 종목에서는 다음이 잠긴다", () => {
    setup({ position: { index: 2, total: 3 } });

    expect(
      (screen.getByRole("button", { name: "다음 종목" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("종목이 하나뿐이면 이동 버튼을 아예 그리지 않는다", () => {
    setup({ position: { index: 0, total: 1 } });

    expect(screen.queryByRole("button", { name: "이전 종목" })).toBeNull();
    expect(screen.queryByRole("button", { name: "다음 종목" })).toBeNull();
  });
});
