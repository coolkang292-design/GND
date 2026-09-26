import { describe, expect, it } from "vitest";

import {
  cardioPaceLabel,
  formatPace,
  isPaceExercise,
  MAX_PACE_SECONDS,
  MIN_PACE_SECONDS,
  paceSecondsPerKm,
} from "./cardio-pace";

describe("paceSecondsPerKm", () => {
  it("시간 ÷ 거리 — 30분에 5km면 1km 360초", () => {
    expect(paceSecondsPerKm({ durationSec: 1_800, distanceKm: 5 })).toBe(360);
  });

  it("초 단위로 반올림한다 — 32분 40초에 5.2km는 377초", () => {
    // 1960 / 5.2 = 376.92…
    expect(paceSecondsPerKm({ durationSec: 1_960, distanceKm: 5.2 })).toBe(377);
  });

  it("거리가 없으면 null — 0으로 나누지 않는다", () => {
    expect(paceSecondsPerKm({ durationSec: 1_800, distanceKm: 0 })).toBeNull();
  });

  it("시간이 없으면 null", () => {
    expect(paceSecondsPerKm({ durationSec: 0, distanceKm: 5 })).toBeNull();
  });

  /**
   * 오타 한 번이 피드에 `0'36"/km`를 띄운다. 친구들이 보는 자리다.
   * 사람이 낼 수 없는 페이스는 **틀린 숫자를 보여 주느니 안 보여 준다.**
   */
  it("사람이 낼 수 없는 페이스는 null — 5.0을 50으로 친 오타", () => {
    expect(paceSecondsPerKm({ durationSec: 1_800, distanceKm: 50 })).toBeNull();
  });

  it("너무 느린 페이스도 null — 0.1km에 30분", () => {
    expect(
      paceSecondsPerKm({ durationSec: 1_800, distanceKm: 0.1 }),
    ).toBeNull();
  });

  it("경계: 1km 2분과 60분은 보여 준다", () => {
    expect(MIN_PACE_SECONDS).toBe(120);
    expect(MAX_PACE_SECONDS).toBe(3_600);
    expect(paceSecondsPerKm({ durationSec: 120, distanceKm: 1 })).toBe(120);
    expect(paceSecondsPerKm({ durationSec: 3_600, distanceKm: 1 })).toBe(3_600);
    expect(paceSecondsPerKm({ durationSec: 119, distanceKm: 1 })).toBeNull();
    expect(paceSecondsPerKm({ durationSec: 3_601, distanceKm: 1 })).toBeNull();
  });
});

describe("formatPace", () => {
  it("러너가 읽는 모양 — 6'17\"/km", () => {
    expect(formatPace(377)).toBe("6'17\"/km");
  });

  it("초가 한 자리면 0을 채운다", () => {
    expect(formatPace(360)).toBe("6'00\"/km");
    expect(formatPace(425)).toBe("7'05\"/km");
  });
});

describe("isPaceExercise", () => {
  const cardio = (name: string) =>
    isPaceExercise({ name, exerciseType: "cardio" });

  it("러닝·트레드밀·걷기는 1km당 시간으로 읽는다", () => {
    expect(cardio("러닝")).toBe(true);
    expect(cardio("트레드밀")).toBe(true);
    expect(cardio("걷기")).toBe(true);
  });

  /**
   * 사이클은 km/h, 로잉은 500m당 시간을 쓴다. 분/km를 붙이면 **틀린 정보**다.
   * 줄넘기는 거리가 없다.
   */
  it("사이클·로잉·줄넘기는 아니다", () => {
    expect(cardio("사이클")).toBe(false);
    expect(cardio("로잉")).toBe(false);
    expect(cardio("줄넘기")).toBe(false);
  });

  it("직접 만든 종목은 이름으로 판단한다", () => {
    expect(cardio("런닝머신")).toBe(true);
    expect(cardio("아침 조깅")).toBe(true);
    expect(cardio("한강 달리기")).toBe(true);
    expect(cardio("인클라인 워킹")).toBe(true);
    expect(cardio("하프 마라톤")).toBe(true);
    expect(cardio("스피닝")).toBe(false);
  });

  it("유산소가 아니면 이름이 겹쳐도 아니다 — 워킹 런지", () => {
    expect(isPaceExercise({ name: "워킹 런지", exerciseType: "bodyweight" })).toBe(
      false,
    );
  });
});

describe("cardioPaceLabel", () => {
  it("러닝 계열이고 값이 맞으면 표기를 준다", () => {
    expect(
      cardioPaceLabel({
        name: "트레드밀",
        exerciseType: "cardio",
        durationSec: 1_960,
        distanceKm: 5.2,
      }),
    ).toBe("6'17\"/km");
  });

  it("사이클이면 null", () => {
    expect(
      cardioPaceLabel({
        name: "사이클",
        exerciseType: "cardio",
        durationSec: 1_800,
        distanceKm: 10,
      }),
    ).toBeNull();
  });

  it("거리를 아직 안 넣었으면 null", () => {
    expect(
      cardioPaceLabel({
        name: "트레드밀",
        exerciseType: "cardio",
        durationSec: 1_800,
        distanceKm: 0,
      }),
    ).toBeNull();
  });
});
