// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoCarousel } from "./photo-carousel";
import type { SessionPhoto } from "@/lib/domain/workout-photos";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** 탭은 260ms 재워 뒀다 깨어난다 (더블탭과 갈리려고) — 그만큼 밀어 준다 */
function settleTap() {
  act(() => vi.advanceTimersByTime(300));
}

function photos(n: number): SessionPhoto[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `img-${i}`,
    url: `https://example.test/p${i}.jpg`,
    source: i === 1 ? ("album" as const) : ("camera" as const),
    sortOrder: i,
  }));
}

function setup(n: number, over: Partial<Parameters<typeof PhotoCarousel>[0]> = {}) {
  const onTap = vi.fn();
  const onDoubleTap = vi.fn();
  const { container } = render(
    <PhotoCarousel
      photos={photos(n)}
      alt="테스터님의 운동 인증"
      onTap={onTap}
      onDoubleTap={onDoubleTap}
      {...over}
    />,
  );
  const track = container.querySelector("[data-carousel-track]") as HTMLElement | null;
  return { onTap, onDoubleTap, container, track };
}

/** jsdom 은 실제 스크롤이 없다 — 폭을 심고 scroll 이벤트를 쏴서 스와이프를 흉내낸다 */
function swipeTo(track: HTMLElement, index: number, slideWidth = 400) {
  Object.defineProperty(track, "clientWidth", {
    value: slideWidth,
    configurable: true,
  });
  track.scrollLeft = slideWidth * index;
  fireEvent.scroll(track);
}

describe("PhotoCarousel — 4:3 유지", () => {
  it("사진이 1장이어도 5장이어도 4:3 이다 (카드 높이가 안 변한다)", () => {
    const { container: one } = render(
      <PhotoCarousel photos={photos(1)} alt="a" onTap={vi.fn()} onDoubleTap={vi.fn()} />,
    );
    expect(one.querySelector(".aspect-\\[4\\/3\\]")).not.toBeNull();
    cleanup();

    const { container: five } = render(
      <PhotoCarousel photos={photos(5)} alt="a" onTap={vi.fn()} onDoubleTap={vi.fn()} />,
    );
    expect(five.querySelector(".aspect-\\[4\\/3\\]")).not.toBeNull();
  });
});

describe("PhotoCarousel — 1장이면 예전 그대로", () => {
  it("사진 1장이면 캐러셀 장치를 아예 안 그린다 (점·카운터·트랙 없음)", () => {
    const { container, track } = setup(1);
    expect(track).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*\d+/);
  });

  it("사진 1장도 이미지 한 장을 그린다", () => {
    const { container } = setup(1);
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });
});

describe("PhotoCarousel — 2장 이상", () => {
  it("장수만큼 이미지를 그린다", () => {
    const { container } = setup(4);
    expect(container.querySelectorAll("img")).toHaveLength(4);
  });

  it("스크롤 트랙이 생긴다 (좌우 swipe 가 여기서 일어난다)", () => {
    const { track } = setup(3);
    expect(track).not.toBeNull();
  });

  it("우측 상단 카운터가 `1 / 4` 로 시작한다", () => {
    setup(4);
    expect(screen.getByText("1 / 4")).toBeTruthy();
  });

  it("점(dot)을 장수만큼 그린다", () => {
    setup(3);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("첫 점만 선택 상태다", () => {
    setup(3);
    const dots = screen.getAllByRole("tab");
    expect(dots[0].getAttribute("aria-selected")).toBe("true");
    expect(dots[1].getAttribute("aria-selected")).toBe("false");
  });
});

describe("PhotoCarousel — swipe", () => {
  it("swipe 하면 카운터가 따라간다", () => {
    const { track } = setup(4);
    swipeTo(track!, 1);
    expect(screen.getByText("2 / 4")).toBeTruthy();
  });

  it("swipe 하면 선택된 점이 옮겨간다", () => {
    const { track } = setup(3);
    swipeTo(track!, 2);
    const dots = screen.getAllByRole("tab");
    expect(dots[2].getAttribute("aria-selected")).toBe("true");
    expect(dots[0].getAttribute("aria-selected")).toBe("false");
  });

  it("범위를 넘는 스크롤도 마지막 장에서 멈춘다", () => {
    const { track } = setup(3);
    swipeTo(track!, 9);
    expect(screen.getByText("3 / 3")).toBeTruthy();
  });

  /** jsdom 에서 폭이 0일 때 0으로 나눠 NaN 이 되면 카운터가 깨진다 */
  it("폭을 못 재는 상황에서도 카운터가 깨지지 않는다", () => {
    const { track } = setup(3);
    Object.defineProperty(track!, "clientWidth", { value: 0, configurable: true });
    fireEvent.scroll(track!);
    expect(screen.getByText("1 / 3")).toBeTruthy();
  });
});

describe("PhotoCarousel — 탭 / 더블탭", () => {
  it("탭하면 **지금 보고 있는** 사진의 index 를 넘긴다", () => {
    const { onTap, track } = setup(4);
    swipeTo(track!, 2);
    fireEvent.click(screen.getAllByRole("button", { name: /크게 보기/ })[2]);
    settleTap();
    expect(onTap).toHaveBeenCalledWith(2);
  });

  it("1장일 때 탭하면 index 0", () => {
    const { onTap } = setup(1);
    fireEvent.click(screen.getByRole("button", { name: /크게 보기/ }));
    settleTap();
    expect(onTap).toHaveBeenCalledWith(0);
  });

  it("더블탭은 좋아요로 간다", () => {
    const { onDoubleTap } = setup(3);
    fireEvent.doubleClick(screen.getAllByRole("button", { name: /크게 보기/ })[0]);
    expect(onDoubleTap).toHaveBeenCalled();
  });

  /**
   * ⚠️⚠️ 계획 §13. 넘기려고 문지른 것을 탭으로 읽으면, 사진을 넘길 때마다
   *    라이트박스가 열려서 캐러셀을 쓸 수가 없다.
   */
  it("문질러서 넘긴 뒤 손을 떼는 것은 탭이 아니다", () => {
    const { onTap } = setup(3);
    const pad = screen.getAllByRole("button", { name: /크게 보기/ })[0];

    fireEvent.touchStart(pad, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(pad, { touches: [{ clientX: 60, clientY: 104 }] });
    fireEvent.touchEnd(pad, {});
    fireEvent.click(pad);
    settleTap();

    expect(onTap).not.toHaveBeenCalled();
  });

  it("손가락이 거의 안 움직였으면 탭으로 본다", () => {
    const { onTap } = setup(3);
    const pad = screen.getAllByRole("button", { name: /크게 보기/ })[0];

    fireEvent.touchStart(pad, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(pad, { touches: [{ clientX: 203, clientY: 101 }] });
    fireEvent.touchEnd(pad, {});
    fireEvent.click(pad);
    settleTap();

    expect(onTap).toHaveBeenCalledWith(0);
  });
});

describe("PhotoCarousel — 성능·접근성", () => {
  it("모든 사진을 처음부터 eager 로 받지 않는다", () => {
    const { container } = setup(5);
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs.every((i) => i.getAttribute("loading") === "lazy")).toBe(true);
  });

  it("점에 몇 번째인지 이름이 붙는다", () => {
    setup(3);
    expect(
      screen.getByRole("tab", { name: "2번째 사진 보기" }),
    ).toBeTruthy();
  });

  it("점을 누르면 그 사진으로 간다 (키보드·낭독 경로)", () => {
    const { track } = setup(3);
    // jsdom 에는 scrollTo 가 없다
    track!.scrollTo = vi.fn() as unknown as HTMLElement["scrollTo"];
    fireEvent.click(screen.getByRole("tab", { name: "3번째 사진 보기" }));
    expect(screen.getByText("3 / 3")).toBeTruthy();
  });

  it("겹쳐 그릴 것(스탬프·프로필)을 children 으로 받는다", () => {
    render(
      <PhotoCarousel photos={photos(3)} alt="a" onTap={vi.fn()} onDoubleTap={vi.fn()}>
        <span>오버레이</span>
      </PhotoCarousel>,
    );
    expect(screen.getByText("오버레이")).toBeTruthy();
  });
});
