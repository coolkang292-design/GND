import { describe, expect, it } from "vitest";

import {
  MAX_RESTORE_SECONDS,
  parseSavedSetTimer,
  restoreSetTimer,
  setTimerFocusKey,
  type SavedSetTimer,
} from "./set-timer-restore";

const NOW = 1_800_000_000_000;

const bench = {
  key: "ex-bench",
  exerciseType: "weight" as const,
  measure: null,
  sets: [{ done: true }, { done: false }],
};
const treadmill = {
  key: "ex-tread",
  exerciseType: "cardio" as const,
  measure: null,
  sets: [{ done: false }, { done: false }],
};
const hang = {
  key: "ex-hang",
  exerciseType: "bodyweight" as const,
  measure: "time" as const,
  sets: [{ done: false }],
};

function saved(over: Partial<SavedSetTimer> = {}): SavedSetTimer {
  return {
    sessionId: "session-1",
    exerciseKey: "ex-tread",
    setIndex: 0,
    startedAtMs: NOW - 20 * 60_000,
    targetSec: 30 * 60,
    ...over,
  };
}

function restore(
  over: Partial<Parameters<typeof restoreSetTimer>[0]> = {},
) {
  return restoreSetTimer({
    saved: saved(),
    sessionId: "session-1",
    sessionActive: true,
    exercises: [bench, treadmill],
    nowMs: NOW,
    ...over,
  });
}

describe("restoreSetTimer", () => {
  /**
   * 이 테스트가 "저장은 되는데 화면에 안 뜨는" 사고를 잡는다.
   *
   * 시계는 **보고 있는 세트의 순번**과 짝이다. 새로고침하면 순번이 0으로
   * 돌아가므로, 트레드밀이 두 번째 종목이면 복원한 시계가 화면에 안 붙는다.
   * 트레드밀 하나만 담고 시험하면 순번이 우연히 0이라 통과해 버린다.
   */
  it("두 번째 종목의 시계는 두 번째 종목 자리로 되살린다", () => {
    expect(restore()).toEqual({
      exerciseIndex: 1,
      setIndex: 0,
      startedAtMs: NOW - 20 * 60_000,
      targetSec: 30 * 60,
      goalAlreadyPassed: false,
    });
  });

  it("순번이 아니라 종목 key로 찾는다 — 순서를 바꿔도 따라간다", () => {
    expect(restore({ exercises: [treadmill, bench] })?.exerciseIndex).toBe(0);
  });

  it("몇 번째 세트였는지도 되살린다", () => {
    expect(restore({ saved: saved({ setIndex: 1 }) })?.setIndex).toBe(1);
  });

  it("다른 세션의 시계는 버린다 — 지난 운동의 시계가 새 운동에 붙으면 안 된다", () => {
    expect(restore({ sessionId: "session-2" })).toBeNull();
  });

  it("운동이 진행 중이 아니면 버린다", () => {
    expect(restore({ sessionActive: false })).toBeNull();
    expect(restore({ sessionId: null })).toBeNull();
  });

  it("종목이 빠졌으면 버린다", () => {
    expect(restore({ exercises: [bench] })).toBeNull();
  });

  it("그 세트가 없어졌으면 버린다", () => {
    expect(restore({ saved: saved({ setIndex: 2 }) })).toBeNull();
  });

  it("이미 끝낸 세트면 버린다", () => {
    const doneTreadmill = { ...treadmill, sets: [{ done: true }] };
    expect(restore({ exercises: [bench, doneTreadmill] })).toBeNull();
  });

  it("시간 칸이 없는 종목(웨이트)이면 버린다", () => {
    expect(
      restore({ saved: saved({ exerciseKey: "ex-bench", setIndex: 1 }) }),
    ).toBeNull();
  });

  it("시간형 맨몸(매달리기)도 되살린다", () => {
    expect(
      restore({
        saved: saved({ exerciseKey: "ex-hang" }),
        exercises: [bench, hang],
      })?.exerciseIndex,
    ).toBe(1);
  });

  /**
   * 잊어버린 시계. 저장하기 전에는 앱을 다시 켜는 순간 우연히 지워졌다.
   * 이제는 살아남으므로 "트레드밀 18시간"을 막는 선이 필요하다.
   */
  it("6시간이 넘은 시계는 되살리지 않는다", () => {
    expect(
      restore({
        saved: saved({ startedAtMs: NOW - (MAX_RESTORE_SECONDS + 1) * 1_000 }),
      }),
    ).toBeNull();
  });

  it("딱 6시간은 되살린다", () => {
    expect(
      restore({
        saved: saved({ startedAtMs: NOW - MAX_RESTORE_SECONDS * 1_000 }),
      }),
    ).not.toBeNull();
  });

  it("6시간이 기준이다", () => {
    expect(MAX_RESTORE_SECONDS).toBe(6 * 60 * 60);
  });

  it("시작 시각이 미래면 버린다 — 기기 시계가 뒤로 갔다", () => {
    expect(restore({ saved: saved({ startedAtMs: NOW + 60_000 }) })).toBeNull();
  });

  /** 복원한 순간 "삐" — 화면을 켰을 뿐인데 목표 도달음이 울리면 안 된다 */
  it("목표를 이미 지났으면 알려준다", () => {
    expect(
      restore({ saved: saved({ startedAtMs: NOW - 31 * 60_000 }) })
        ?.goalAlreadyPassed,
    ).toBe(true);
  });

  it("목표가 0이면 지난 것으로 보지 않는다", () => {
    expect(restore({ saved: saved({ targetSec: 0 }) })?.goalAlreadyPassed).toBe(
      false,
    );
  });

  it("저장된 것이 없으면 null", () => {
    expect(restore({ saved: null })).toBeNull();
  });
});

describe("parseSavedSetTimer", () => {
  it("온전한 값은 그대로 읽는다", () => {
    expect(parseSavedSetTimer(saved())).toEqual(saved());
  });

  it("모양이 틀리면 null — 옛 버전·손상된 값", () => {
    expect(parseSavedSetTimer(null)).toBeNull();
    expect(parseSavedSetTimer("x")).toBeNull();
    expect(parseSavedSetTimer({ ...saved(), sessionId: 1 })).toBeNull();
    expect(parseSavedSetTimer({ ...saved(), exerciseKey: "" })).toBeNull();
    expect(parseSavedSetTimer({ ...saved(), setIndex: -1 })).toBeNull();
    expect(parseSavedSetTimer({ ...saved(), setIndex: 0.5 })).toBeNull();
    expect(
      parseSavedSetTimer({ ...saved(), startedAtMs: Number.NaN }),
    ).toBeNull();
    expect(parseSavedSetTimer({ ...saved(), targetSec: -1 })).toBeNull();
    const missing: Partial<SavedSetTimer> = saved();
    delete missing.targetSec;
    expect(parseSavedSetTimer(missing)).toBeNull();
  });
});

describe("setTimerFocusKey", () => {
  it("화면의 시계 주인 표기와 같은 모양이다", () => {
    expect(setTimerFocusKey(1, 0, true)).toBe("1:0:true");
  });
});
