import { describe, expect, it } from "vitest";
import {
  advanceFocusAfterComplete,
  advanceSetFocus,
  clampFocusIndex,
  clampSetFocus,
  ensurePendingFocus,
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

/**
 * 세트 단위 이동 (2026-08-04, 사용자 목업).
 *
 * 목업은 `현재 세트 1 / 5`처럼 **세트 하나**를 보여준다. 세트를 완료하면
 * 다음 미완료 세트로 옮겨 가야 한다 — 종목 안에서 먼저, 없으면 다음 종목으로.
 */
describe("advanceSetFocus — 세트를 완료한 뒤 어느 세트로", () => {
  it("같은 종목의 다음 미완료 세트로 간다", () => {
    const list = [ex("벤치", [true, false, false])];

    expect(advanceSetFocus(list, { exerciseIndex: 0, setIndex: 0 })).toEqual({
      exerciseIndex: 0,
      setIndex: 1,
    });
  });

  it("앞쪽에 건너뛴 미완료가 있어도 뒤부터 찾는다 — 순서대로 진행 중이다", () => {
    const list = [ex("벤치", [false, true, false])];

    expect(advanceSetFocus(list, { exerciseIndex: 0, setIndex: 1 })).toEqual({
      exerciseIndex: 0,
      setIndex: 2,
    });
  });

  it("종목을 다 끝내면 다음 종목의 첫 미완료 세트로 간다", () => {
    const list = [ex("벤치", [true, true]), ex("스쿼트", [false, false])];

    expect(advanceSetFocus(list, { exerciseIndex: 0, setIndex: 1 })).toEqual({
      exerciseIndex: 1,
      setIndex: 0,
    });
  });

  it("뒤가 다 끝났으면 앞쪽에 남은 것으로 돌아간다", () => {
    const list = [ex("벤치", [false]), ex("스쿼트", [true])];

    expect(advanceSetFocus(list, { exerciseIndex: 1, setIndex: 0 })).toEqual({
      exerciseIndex: 0,
      setIndex: 0,
    });
  });

  it("전부 끝났으면 그 자리에 머문다 — 임의로 튀지 않는다", () => {
    const list = [ex("벤치", [true]), ex("스쿼트", [true])];

    expect(advanceSetFocus(list, { exerciseIndex: 1, setIndex: 0 })).toEqual({
      exerciseIndex: 1,
      setIndex: 0,
    });
  });

  it("종목이 없으면 0,0", () => {
    expect(advanceSetFocus([], { exerciseIndex: 3, setIndex: 2 })).toEqual({
      exerciseIndex: 0,
      setIndex: 0,
    });
  });
});

describe("clampSetFocus — 종목·세트를 지워도 범위를 벗어나지 않는다", () => {
  it("세트를 줄이면 마지막 세트로 당긴다", () => {
    const list = [ex("벤치", [false, false])];

    expect(clampSetFocus(list, { exerciseIndex: 0, setIndex: 5 })).toEqual({
      exerciseIndex: 0,
      setIndex: 1,
    });
  });

  it("종목을 지우면 마지막 종목으로 당긴다", () => {
    const list = [ex("벤치", [false])];

    expect(clampSetFocus(list, { exerciseIndex: 4, setIndex: 0 })).toEqual({
      exerciseIndex: 0,
      setIndex: 0,
    });
  });

  it("세트가 없는 종목이면 0", () => {
    const list = [ex("빈 종목", [])];

    expect(clampSetFocus(list, { exerciseIndex: 0, setIndex: 3 })).toEqual({
      exerciseIndex: 0,
      setIndex: 0,
    });
  });
});

/**
 * 목록이 바뀐 뒤 초점 복구 (2026-08-09, 사용자 신고 **"A 계정에서 운동완료
 * 버튼이 안눌림"**).
 *
 * 실제로 일어난 일: `↷ 이 종목 건너뛰기`로 종목이 배열에서 빠졌는데 초점 인덱스는
 * 그대로였다. 같은 인덱스가 **다음 종목**을 가리키게 됐고, 그 종목의 0번 세트가
 * 이미 완료라 세 가지가 한꺼번에 조용히 망가졌다:
 *   ① `onCompleteSet`이 `focusedSet.done`에서 return → **버튼이 안 눌린다**
 *   ② `canReplaceExercise`가 false → `⇄ 운동 바꾸기`가 사라진다
 *   ③ `isLastPendingSet`가 false → 마지막 세트 안내가 안 뜬다
 *
 * ⚠️ `advanceSetFocus`로 대신하지 마라. 저건 "방금 이 세트를 끝냈다"는 전제라
 *    `setIndex + 1`부터 찾는다 — 지금 자리가 **미완료인데도** 건너뛴다.
 */
describe("ensurePendingFocus — 목록이 바뀐 뒤 성한 자리로", () => {
  it("지금 자리가 미완료면 그대로 둔다 — 임의로 튀지 않는다", () => {
    const list = [ex("벤치", [false, false, false])];

    expect(ensurePendingFocus(list, { exerciseIndex: 0, setIndex: 0 })).toEqual({
      exerciseIndex: 0,
      setIndex: 0,
    });
  });

  it("지금 자리가 이미 완료면 다음 미완료로 옮긴다", () => {
    const list = [ex("벤치", [true, true, false])];

    expect(ensurePendingFocus(list, { exerciseIndex: 0, setIndex: 0 })).toEqual({
      exerciseIndex: 0,
      setIndex: 2,
    });
  });

  /** 신고된 그 상황 — 앞 종목을 건너뛰어 배열이 줄었고, 그 자리에 완료된 종목이 왔다 */
  it("종목이 빠져 인덱스가 밀린 뒤에도 미완료 세트를 찾아간다", () => {
    // 건너뛰기 전: [건너뛸종목, 다한종목, 남은종목], 초점 = 0
    // 건너뛴 뒤:   [다한종목, 남은종목] — 인덱스 0이 이제 '다한종목'이다
    const after = [ex("다한종목", [true, true]), ex("남은종목", [false])];

    expect(ensurePendingFocus(after, { exerciseIndex: 0, setIndex: 0 })).toEqual({
      exerciseIndex: 1,
      setIndex: 0,
    });
  });

  it("좌표가 범위를 벗어나도 당겨 온다", () => {
    const list = [ex("벤치", [false, false])];

    expect(ensurePendingFocus(list, { exerciseIndex: 9, setIndex: 9 })).toEqual({
      exerciseIndex: 0,
      setIndex: 1,
    });
  });

  it("전부 완료면 그 자리에 머문다 — 완료 화면이 뜰 차례다", () => {
    const list = [ex("벤치", [true, true])];

    expect(ensurePendingFocus(list, { exerciseIndex: 0, setIndex: 1 })).toEqual({
      exerciseIndex: 0,
      setIndex: 1,
    });
  });

  it("목록이 비면 원점", () => {
    expect(ensurePendingFocus([], { exerciseIndex: 3, setIndex: 2 })).toEqual({
      exerciseIndex: 0,
      setIndex: 0,
    });
  });
});
