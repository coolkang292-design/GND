import { describe, expect, it } from "vitest";

import {
  durationSecondsOf,
  formatDurationAmount,
  formatSetClock,
  formatStepLabel,
  goalReachedBeep,
  setTimerSeconds,
  stopFinishesSet,
} from "./set-timer";

describe("setTimerSeconds", () => {
  it("시작 전에는 0이다", () => {
    expect(setTimerSeconds({ startedAtMs: null, nowMs: 1_000_000 })).toBe(0);
  });

  it("시작 시각과 지금의 차이를 초로 준다", () => {
    expect(
      setTimerSeconds({ startedAtMs: 1_000_000, nowMs: 1_037_400 }),
    ).toBe(37);
  });

  it("초 미만은 버린다 — 36.9초는 아직 36초다", () => {
    expect(setTimerSeconds({ startedAtMs: 0, nowMs: 36_900 })).toBe(36);
  });

  /**
   * 이 테스트가 사보타주를 잡는다: 구현을 "1초마다 +1" 카운터로 바꾸면
   * 백그라운드에서 틱이 밀려 이 값이 안 나온다.
   */
  it("백그라운드로 30분 밀려 있어도 실제 시간대로 센다", () => {
    expect(
      setTimerSeconds({ startedAtMs: 0, nowMs: 30 * 60 * 1_000 }),
    ).toBe(1_800);
  });

  it("시계를 거꾸로 돌려도 음수를 주지 않는다", () => {
    expect(setTimerSeconds({ startedAtMs: 5_000, nowMs: 1_000 })).toBe(0);
  });
});

describe("durationSecondsOf", () => {
  it("초가 있으면 그대로 쓴다", () => {
    expect(durationSecondsOf({ durationSec: 37, durationMin: 0 })).toBe(37);
  });

  /** 계획·루틴은 아직 분이다. 폴백을 빼면 `30분 러닝`이 `0초`가 된다 */
  it("초가 없으면 계획의 분을 초로 환산한다", () => {
    expect(durationSecondsOf({ durationMin: 30 })).toBe(1_800);
  });

  it("초가 0이면 0이다 — 분으로 새지 않는다", () => {
    expect(durationSecondsOf({ durationSec: 0, durationMin: 30 })).toBe(0);
  });
});

describe("formatDurationAmount", () => {
  it.each([
    [0, "0초"],
    [37, "37초"],
    [59, "59초"],
    [60, "1분"],
    [90, "1분 30초"],
    [1_800, "30분"],
    [1_960, "32분 40초"],
  ])("%i초 → %s", (seconds, expected) => {
    expect(formatDurationAmount(seconds)).toBe(expected);
  });

  /**
   * ⚠️ 지금까지 저장된 시간은 전부 `분 × 60`이라 나머지가 0이다.
   * 옛 기록의 표기가 `30분 0초`로 바뀌면 그건 개악이다.
   */
  it("분이 딱 떨어지면 초를 붙이지 않는다 — 옛 기록 표기가 안 바뀐다", () => {
    expect(formatDurationAmount(1_800)).toBe("30분");
    expect(formatDurationAmount(120)).toBe("2분");
  });
});

describe("formatSetClock", () => {
  it.each([
    [0, "00:00"],
    [37, "00:37"],
    [90, "01:30"],
    [1_800, "30:00"],
  ])("%i초 → %s", (seconds, expected) => {
    expect(formatSetClock(seconds)).toBe(expected);
  });

  it("한 시간을 넘으면 시간을 앞에 붙인다", () => {
    expect(formatSetClock(3_725)).toBe("1:02:05");
  });
});

describe("formatStepLabel", () => {
  it.each([
    [30, "+30초"],
    [-10, "-10초"],
    [60, "+1분"],
    [-300, "-5분"],
  ])("%i → %s", (delta, expected) => {
    expect(formatStepLabel(delta)).toBe(expected);
  });
});

describe("goalReachedBeep — 목표 도달 알림 (B안)", () => {
  it("목표에 못 미치면 안 운다", () => {
    expect(
      goalReachedBeep({ seconds: 29, targetSeconds: 30, alreadyPlayed: false }),
    ).toBeNull();
  });

  it("목표에 닿으면 한 번 운다", () => {
    expect(
      goalReachedBeep({ seconds: 30, targetSeconds: 30, alreadyPlayed: false }),
    ).toEqual({ durationSeconds: 0.35 });
  });

  /**
   * ⚠️ 이 단언이 없으면 목표를 넘긴 뒤 **매 초** 운다. 시끄러운 정도가 아니라
   * 쓸 수 없는 기능이 된다.
   */
  it("한 번 울고 나면 다시 울지 않는다", () => {
    expect(
      goalReachedBeep({ seconds: 45, targetSeconds: 30, alreadyPlayed: true }),
    ).toBeNull();
  });

  it("목표가 없으면(0) 울지 않는다 — 계획 없이 담은 유산소", () => {
    expect(
      goalReachedBeep({ seconds: 5, targetSeconds: 0, alreadyPlayed: false }),
    ).toBeNull();
  });

  /**
   * 백그라운드에서 틱이 밀려 목표 초를 **건너뛰어도** 울어야 한다.
   * `=== targetSeconds`로 좁히면 30초 목표가 29 → 34로 튈 때 영영 안 운다.
   */
  it("목표 초를 건너뛰어도 운다", () => {
    expect(
      goalReachedBeep({ seconds: 34, targetSeconds: 30, alreadyPlayed: false }),
    ).toEqual({ durationSeconds: 0.35 });
  });
});

describe("stopFinishesSet", () => {
  it("시간 하나뿐이면 정지가 곧 세트 완료다 — 매달리기·플랭크", () => {
    expect(stopFinishesSet(1)).toBe(true);
  });

  it("거리가 남으면 정지와 완료를 나눈다 — 유산소", () => {
    expect(stopFinishesSet(2)).toBe(false);
  });
});
