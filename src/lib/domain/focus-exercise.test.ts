import { describe, expect, it } from "vitest";
import {
  advanceFocusAfterComplete,
  clampFocusIndex,
  type FocusExercise,
} from "./focus-exercise";

/**
 * ② 큰 팝업은 **한 종목만** 보여준다 (2026-08-04, 사용자 지적).
 *
 * 처음엔 전체 목록을 그대로 옮겨 놨는데, 그러면 "지금 하는 운동에 집중"이라는
 * 요구가 성립하지 않는다. 한 종목만 보이면 나머지로 갈 길이 필요하고, 그 이동
 * 규칙이 여기 있다.
 *
 * ⚠️ 현재 종목을 **상태로 들고 간다.** "미완료 첫 세트가 있는 종목"으로 매번
 * 파생하면, 사용자가 3번 종목으로 옮겨 기록하는 순간 1번에 미완료가 남아 있어
 * 화면이 1번으로 튕겨 돌아간다.
 */
const ex = (name: string, done: boolean[]): FocusExercise => ({
  name,
  sets: done.map((d) => ({ done: d })),
});

describe("clampFocusIndex", () => {
  it("범위 안이면 그대로 둔다", () => {
    expect(clampFocusIndex(1, 3)).toBe(1);
  });

  it("종목을 지워 인덱스가 넘치면 마지막으로 당긴다", () => {
    expect(clampFocusIndex(5, 3)).toBe(2);
  });

  it("음수는 0으로", () => {
    expect(clampFocusIndex(-1, 3)).toBe(0);
  });

  it("종목이 없으면 0", () => {
    expect(clampFocusIndex(2, 0)).toBe(0);
  });
});

describe("advanceFocusAfterComplete — 세트를 완료한 뒤 어디로 가는가", () => {
  it("현재 종목에 남은 세트가 있으면 그대로 머문다", () => {
    const list = [ex("벤치", [true, false]), ex("스쿼트", [false])];

    expect(advanceFocusAfterComplete(list, 0)).toBe(0);
  });

  it("현재 종목을 다 끝냈으면 다음 미완료 종목으로 넘어간다", () => {
    const list = [ex("벤치", [true, true]), ex("스쿼트", [false])];

    expect(advanceFocusAfterComplete(list, 0)).toBe(1);
  });

  it("뒤가 다 끝났으면 앞쪽에 남은 종목으로 돌아간다", () => {
    // 사용자가 순서를 건너뛰며 했을 때 남은 것을 놓치지 않아야 한다.
    const list = [ex("벤치", [false]), ex("스쿼트", [true])];

    expect(advanceFocusAfterComplete(list, 1)).toBe(0);
  });

  it("전부 끝났으면 그 자리에 머문다 — 임의로 튀지 않는다", () => {
    const list = [ex("벤치", [true]), ex("스쿼트", [true])];

    expect(advanceFocusAfterComplete(list, 1)).toBe(1);
  });

  it("세트가 없는 종목은 넘어갈 대상이 아니다", () => {
    const list = [ex("벤치", [true]), ex("빈 종목", []), ex("스쿼트", [false])];

    expect(advanceFocusAfterComplete(list, 0)).toBe(2);
  });

  it("종목이 없으면 0", () => {
    expect(advanceFocusAfterComplete([], 0)).toBe(0);
  });
});
