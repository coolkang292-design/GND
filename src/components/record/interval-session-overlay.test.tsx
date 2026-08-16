// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntervalSessionOverlay } from "./interval-session-overlay";

afterEach(cleanup);

const NAMES = ["맨몸 스쿼트", "니 푸시업", "데드버그", "마운틴 클라이머"];

function view(elapsedSeconds: number, overrides: Record<string, unknown> = {}) {
  return render(
    <IntervalSessionOverlay
      open
      exerciseNames={NAMES}
      minutes={4}
      elapsedSeconds={elapsedSeconds}
      paused={false}
      onTogglePause={vi.fn()}
      onStop={vi.fn()}
      {...overrides}
    />,
  );
}

describe("IntervalSessionOverlay", () => {
  it("닫혀 있으면 아무것도 그리지 않는다", () => {
    const { container } = render(
      <IntervalSessionOverlay
        open={false}
        exerciseNames={NAMES}
        minutes={4}
        elapsedSeconds={0}
        paused={false}
        onTogglePause={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  /**
   * 사용자가 **아무것도 입력하지 않는다** (사용자 지시 2026-08-13).
   * 근력 오버레이의 ± 버튼·세트 입력은 인터벌에서 의미가 없다.
   */
  /**
   * 카운트다운을 **되살렸다** (사용자 지시 2026-08-16).
   *
   * 2026-08-13에는 뺐었다 — *"화면 숫자가 음원의 3·2·1과 1~2초만 어긋나도 그게
   * 제일 먼저 보인다"*. 그 위험은 그대로다. 그래서 숫자를 따로 세지 않고
   * **`intervalCueAt`의 `secondsLeft`를 그대로** 그린다. 그 값은 `audio.currentTime`
   * 에서 나오고, 종목 전환을 정하는 값과 **같은 값**이다 — 숫자가 화면의 다른
   * 요소와 어긋나는 것 자체가 불가능하다.
   *
   * ⚠️ 화면에서 따로 세는 타이머(`setInterval` 등)를 절대 두지 마라. 그 순간
   *    2026-08-13에 뺐던 이유가 그대로 돌아온다.
   */
  it("운동 구간은 20초부터 거꾸로 센다", () => {
    expect(view(13).getByTestId("interval-countdown").textContent).toBe("20");
    cleanup();
    expect(view(28).getByTestId("interval-countdown").textContent).toBe("5");
    cleanup();
    expect(view(32.5).getByTestId("interval-countdown").textContent).toBe("1");
  });

  it("휴식 구간은 10초부터 거꾸로 센다", () => {
    expect(view(33).getByTestId("interval-countdown").textContent).toBe("10");
    cleanup();
    expect(view(40).getByTestId("interval-countdown").textContent).toBe("3");
  });

  it("준비 구간에도 남은 초를 보여준다", () => {
    expect(view(0).getByTestId("interval-countdown").textContent).toBe("13");
  });

  it("끝나면 숫자를 안 보여준다 — 셀 것이 없다", () => {
    view(250);

    expect(screen.getByTestId("interval-phase").textContent).toBe("끝났어요");
    expect(screen.queryByTestId("interval-countdown")).toBeNull();
  });

  /**
   * 이 화면은 `aria-live="polite"`다. 1초마다 바뀌는 숫자를 읽히면 스크린리더가
   * 쉬지 않고 떠든다 — 게다가 숫자는 음원이 이미 말해 준다.
   */
  it("카운트다운은 스크린리더에서 감춘다", () => {
    view(15);

    expect(
      screen.getByTestId("interval-countdown").getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("횟수 입력 장치가 하나도 없다", () => {
    view(15);

    expect(screen.queryByText("횟수")).toBeNull();
    expect(screen.queryByRole("button", { name: "+" })).toBeNull();
    expect(screen.queryByRole("button", { name: "−" })).toBeNull();
    expect(screen.queryByText(/현재 세트/)).toBeNull();
    // 남는 것은 두 개뿐이다
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("시작 10초는 준비를 보여준다", () => {
    view(0);

    expect(screen.getByTestId("interval-phase").textContent).toBe("준비");
    expect(screen.getByText("다음: 맨몸 스쿼트")).toBeTruthy();
  });

  it("운동 구간에는 종목과 남은 초를 크게 보여준다", () => {
    view(13);

    expect(screen.getByTestId("interval-phase").textContent).toBe("맨몸 스쿼트");
    expect(screen.getByTestId("interval-round").textContent).toBe(
      "1라운드 / 8라운드",
    );
    expect(screen.getByText("다음: 니 푸시업")).toBeTruthy();
  });

  it("20초가 지나면 휴식과 다음 종목을 알린다", () => {
    view(33);

    expect(screen.getByTestId("interval-phase").textContent).toBe("휴식");
    expect(screen.getByText("다음: 니 푸시업")).toBeTruthy();
  });

  it("시간만 흐르면 다음 종목으로 넘어간다 — 누르는 것이 없다", () => {
    const first = view(13);
    expect(screen.getByTestId("interval-phase").textContent).toBe("맨몸 스쿼트");
    first.unmount();

    view(43);
    expect(screen.getByTestId("interval-phase").textContent).toBe("니 푸시업");
    expect(screen.getByTestId("interval-round").textContent).toBe(
      "2라운드 / 8라운드",
    );
  });

  it("지금 하는 종목을 목록에서 표시한다", () => {
    view(73);

    const current = screen
      .getAllByRole("listitem")
      .filter((item) => item.getAttribute("data-current") === "true");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("데드버그");
  });

  it("일시정지 중임을 알리고 버튼 문구가 바뀐다", () => {
    const onTogglePause = vi.fn();
    view(15, { paused: true, onTogglePause });

    expect(screen.getByRole("status").textContent).toContain("일시정지 중");
    fireEvent.click(screen.getByRole("button", { name: "이어서 하기" }));
    expect(onTogglePause).toHaveBeenCalledTimes(1);
  });

  it("중단을 부모에게 넘긴다", () => {
    const onStop = vi.fn();
    view(15, { onStop });

    fireEvent.click(screen.getByRole("button", { name: "중단하기" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("음원이 끝나면 완료를 보여준다", () => {
    view(250);

    expect(screen.getByTestId("interval-phase").textContent).toBe("끝났어요");
    expect(screen.getByTestId("interval-round").textContent).toBe(
      "8라운드 완료",
    );
    expect(screen.queryByText(/^다음:/)).toBeNull();
  });

  it("라운드 진행률 막대를 보여준다 — 일반 운동과 같은 모양", () => {
    // 사용자 지시 2026-08-13
    const first = view(0); // 준비 — 아직 한 라운드도 안 끝났다
    expect(
      screen.getByRole("progressbar").getAttribute("aria-valuenow"),
    ).toBe("0");
    first.unmount();

    // 4라운드째 운동 중이면 세 라운드를 마쳤다 → 3/8 = 38%
    const mid = view(13 + 3 * 30 + 5);
    expect(
      screen.getByRole("progressbar").getAttribute("aria-valuenow"),
    ).toBe("38");
    mid.unmount();

    view(250);
    expect(
      screen.getByRole("progressbar").getAttribute("aria-valuenow"),
    ).toBe("100");
  });

  it("막대에 transition-[width]를 붙이지 않는다", () => {
    /*
      2026-08-07 근력 오버레이에서 겪은 것 — 붙이면 인라인 width가 있는데도
      계산 폭이 0px에 머물러 막대가 아예 안 보인다. 화면을 봐야만 잡히는
      결함이라 여기서 클래스 자체를 막는다.
    */
    view(13);
    const bar = screen.getByRole("progressbar").firstElementChild;
    expect(bar?.className ?? "").not.toContain("transition");
  });
  it("응원 문구를 함께 보여준다", () => {
    // 사용자 지시 2026-08-13 — 종목 이름만 있으니 허전하다
    view(15);
    const cheer = screen.getByTestId("interval-cheer").textContent ?? "";
    expect(cheer.length).toBeGreaterThan(3);
  });

  it("같은 라운드를 다시 그려도 문구가 안 바뀐다", () => {
    // 이 화면은 초당 네 번쯤 다시 그려진다 — 깜빡이면 읽을 수가 없다
    const first = view(15);
    const before = screen.getByTestId("interval-cheer").textContent;
    first.rerender(
      <IntervalSessionOverlay
        open
        exerciseNames={NAMES}
        minutes={4}
        elapsedSeconds={17.5}
        paused={false}
        onTogglePause={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByTestId("interval-cheer").textContent).toBe(before);
  });
  it("16분 코스는 32라운드를 센다", () => {
    view(263, { minutes: 16 });

    expect(screen.getByTestId("interval-round").textContent).toBe(
      "9라운드 / 32라운드",
    );
    expect(screen.getByTestId("interval-phase").textContent).toBe("맨몸 스쿼트");
  });
});
