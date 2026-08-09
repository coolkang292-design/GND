import { describe, expect, it } from "vitest";
import {
  canReplaceExercise,
  COMPLETION_AUTO_FINISH_MS,
  overlayMode,
  replaceExercise,
  shouldAutoFinishAfterRest,
  shouldRestAfterCompletion,
  skipExercise,
} from "./session-flow";

/**
 * ② 큰 팝업의 화면 전환 (2026-08-04, 사용자 신고로 수정).
 *
 * **버그**: 마지막 세트를 끝내고 휴식이 *끝나면* 입력 화면으로 되돌아가
 * 이미 완료한 세트(`현재 세트 1 / 1`)를 다시 보여줬다. 모드를 "휴식이 도는가"로만
 * 정했기 때문이다 — 남은 세트가 있는지도 같이 봐야 한다.
 */
describe("overlayMode", () => {
  it("휴식이 도는 동안은 휴식 화면", () => {
    expect(overlayMode({ resting: true, pendingSetCount: 3 })).toBe("rest");
  });

  it("휴식이 아니고 남은 세트가 있으면 입력 화면", () => {
    expect(overlayMode({ resting: false, pendingSetCount: 3 })).toBe("input");
  });

  it("남은 세트가 없으면 휴식이 끝나도 입력 화면으로 되돌아가지 않는다", () => {
    // 이 단언이 신고된 버그 자체다. 되돌아가면 완료한 세트를 다시 입력하는
    // 화면이 떠서 "운동이 안 끝났나?" 싶어진다.
    expect(overlayMode({ resting: false, pendingSetCount: 0 })).toBe("rest");
  });

  it("남은 세트가 없고 휴식 중이어도 휴식 화면", () => {
    expect(overlayMode({ resting: true, pendingSetCount: 0 })).toBe("rest");
  });
});

describe("shouldAutoFinishAfterRest", () => {
  it("휴식이 끝났고 남은 세트가 없으면 자동으로 마무리한다", () => {
    // 사용자 요청: "사진 찍는 화면으로 자연스럽게 전환이 되게".
    // 남은 세트가 0이면 종료 확인창도 안 뜨므로(미완료 0건) 자동 전환이 안전하다.
    expect(shouldAutoFinishAfterRest({ pendingSetCount: 0 })).toBe(true);
  });

  it("남은 세트가 있으면 자동으로 마무리하지 않는다", () => {
    expect(shouldAutoFinishAfterRest({ pendingSetCount: 1 })).toBe(false);
  });
});

/**
 * B안 — 마지막 세트에는 휴식을 걸지 않는다 (2026-08-04, 사용자 결정).
 *
 * 마지막 세트 뒤에 쉴 이유가 없는데 타이머를 돌리는 게 이상했다. 게다가
 * 유산소는 애초에 휴식이 안 걸려서(`shouldStartRestCountdown`), 타이머 종료에
 * 기대면 유산소로 끝낸 날은 자동 전환이 영영 안 왔다.
 */
describe("shouldRestAfterCompletion", () => {
  it("완료 뒤에도 남은 세트가 있으면 휴식을 건다", () => {
    expect(shouldRestAfterCompletion({ pendingSetCountAfter: 2 })).toBe(true);
  });

  it("이번이 마지막이면 휴식을 걸지 않는다", () => {
    expect(shouldRestAfterCompletion({ pendingSetCountAfter: 0 })).toBe(false);
  });
});

describe("COMPLETION_AUTO_FINISH_MS", () => {
  it("축하 화면을 3초 보여주고 넘어간다 (사용자 확정)", () => {
    expect(COMPLETION_AUTO_FINISH_MS).toBe(3000);
  });
});

/**
 * 운동 중 종목 바꾸기·건너뛰기 (2026-08-09 사용자 지시
 * "운동 중 운동 교체 혹은 취소 하기").
 *
 * 오버레이가 열려 있으면 `ExerciseCard`가 렌더되지 않아 종목을 손댈 방법이
 * **없었다.** 그 경로를 오버레이 안으로 들여오면서 규칙을 여기로 뺐다.
 */
const ex = (key: string, done: boolean[]) => ({
  key,
  name: key,
  sets: done.map((d) => ({ done: d })),
});

describe("canReplaceExercise — 기록이 있으면 못 바꾼다", () => {
  it("아무것도 안 했으면 바꿀 수 있다", () => {
    expect(canReplaceExercise(ex("a", [false, false]))).toBe(true);
  });

  it("한 세트라도 완료했으면 못 바꾼다 — 기록이 다른 운동 것으로 둔갑한다", () => {
    expect(canReplaceExercise(ex("a", [true, false]))).toBe(false);
    expect(canReplaceExercise(ex("a", [false, true]))).toBe(false);
  });

  it("없는 종목은 못 바꾼다", () => {
    expect(canReplaceExercise(null)).toBe(false);
  });
});

describe("replaceExercise", () => {
  it("세트 수를 유지한 채 그 자리만 바꾼다", () => {
    const list = [ex("a", [false, false, false, false]), ex("b", [false])];
    let gotCount = -1;

    const out = replaceExercise(list, "a", (previousSetCount) => {
      gotCount = previousSetCount;
      return ex("새종목", Array(previousSetCount).fill(false));
    });

    // 4세트 하려고 담아 뒀는데 바꿨더니 1세트가 되면 계획이 사라진다
    expect(gotCount).toBe(4);
    expect(out.replaced).toBe(true);
    expect(out.exercises.map((e) => e.key)).toEqual(["새종목", "b"]);
    expect(out.exercises[0].sets).toHaveLength(4);
  });

  it("다른 종목은 참조까지 그대로다", () => {
    const list = [ex("a", [false]), ex("b", [false])];

    const out = replaceExercise(list, "a", () => ex("새종목", [false]));

    expect(out.exercises[1]).toBe(list[1]);
  });

  it("완료한 세트가 있으면 아무것도 하지 않는다 — 화면 규칙만 믿지 않는다", () => {
    const list = [ex("a", [true, false])];

    const out = replaceExercise(list, "a", () => ex("새종목", [false, false]));

    expect(out.replaced).toBe(false);
    expect(out.exercises).toBe(list);
  });

  it("없는 키면 아무것도 하지 않는다", () => {
    const list = [ex("a", [false])];

    expect(replaceExercise(list, "없음", () => ex("x", [false])).replaced).toBe(
      false,
    );
  });
});

/**
 * ⚠️ **통째로 뺀다** — 사용자 결정 2026-08-09: *"건너뛰면 그 종목은 통째로 오늘
 * 기록에서 빼줘"*. 처음엔 완료분을 남기게 만들었다가 바꿨다. 완료분을 남기는
 * 쪽으로 되돌리면 아래 단언들이 전부 실패한다 — 그게 목적이다.
 */
describe("skipExercise — 종목을 통째로 뺀다", () => {
  it("완료한 세트가 있어도 종목이 통째로 사라진다", () => {
    const list = [ex("a", [true, true, false, false]), ex("b", [false])];

    const out = skipExercise(list, "a");

    expect(out.removedExercise).toBe(true);
    expect(out.exercises.map((e) => e.key)).toEqual(["b"]);
    expect(out.skippedSets).toBe(4);
    // 확인창을 띄울지의 판단 재료 — 완료돼 있던 2세트가 사라진다
    expect(out.discardedDoneSets).toBe(2);
  });

  it("한 세트도 안 했으면 잃을 것이 없다 — 묻지 않아도 되는 경우", () => {
    const list = [ex("a", [false, false]), ex("b", [false])];

    const out = skipExercise(list, "a");

    expect(out.removedExercise).toBe(true);
    expect(out.skippedSets).toBe(2);
    expect(out.discardedDoneSets).toBe(0);
    expect(out.exercises.map((e) => e.key)).toEqual(["b"]);
  });

  it("이미 다 한 종목도 통째로 빠진다 — 완료분 전부가 경고 대상이다", () => {
    const list = [ex("a", [true, true]), ex("b", [false])];

    const out = skipExercise(list, "a");

    expect(out.exercises.map((e) => e.key)).toEqual(["b"]);
    expect(out.discardedDoneSets).toBe(2);
  });

  it("다른 종목은 참조까지 그대로다", () => {
    const list = [ex("a", [false]), ex("b", [false])];

    expect(skipExercise(list, "a").exercises[0]).toBe(list[1]);
  });

  it("없는 키면 아무것도 하지 않는다", () => {
    const list = [ex("a", [false])];

    const out = skipExercise(list, "없음");

    expect(out.exercises).toBe(list);
    expect(out.removedExercise).toBe(false);
    expect(out.discardedDoneSets).toBe(0);
  });
});
