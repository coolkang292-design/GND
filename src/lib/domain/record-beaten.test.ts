import { describe, expect, it } from "vitest";

import {
  exerciseImprovementNote,
  exerciseMetric,
  recordBeatenSummary,
} from "./record-beaten";

function weightEx(
  sets: Array<[weightKg: number, reps: number, done?: boolean]>,
) {
  return {
    name: "벤치프레스",
    exerciseType: "weight" as const,
    measure: null,
    sets: sets.map(([weightKg, reps, done = true]) => ({
      weightKg,
      reps,
      distanceKm: 0,
      durationMin: 0,
      isCompleted: done,
    })),
  };
}

function bodyweightEx(
  name: string,
  measure: "reps" | "time",
  sets: Array<[reps: number, durationMin: number]>,
) {
  return {
    name,
    exerciseType: "bodyweight" as const,
    measure,
    sets: sets.map(([reps, durationMin]) => ({
      weightKg: 0,
      reps,
      distanceKm: 0,
      durationMin,
      isCompleted: true,
    })),
  };
}

/** 초로 재는 홀드 종목 — 실제 저장 모양(`durationSec`)을 그대로 쓴다 */
function holdEx(name: string, seconds: number[]) {
  return {
    name,
    exerciseType: "bodyweight" as const,
    measure: "time" as const,
    sets: seconds.map((durationSec) => ({
      weightKg: 0,
      reps: 0,
      distanceKm: 0,
      durationMin: 0,
      durationSec,
      isCompleted: true,
    })),
  };
}

function cardioEx(
  name: string,
  sets: Array<[distanceKm: number, durationMin: number]>,
) {
  return {
    name,
    exerciseType: "cardio" as const,
    measure: null,
    sets: sets.map(([distanceKm, durationMin]) => ({
      weightKg: 0,
      reps: 0,
      distanceKm,
      durationMin,
      isCompleted: true,
    })),
  };
}

describe("exerciseMetric", () => {
  it("웨이트는 볼륨(무게×횟수) 합계", () => {
    expect(exerciseMetric(weightEx([[30, 10], [30, 10]]))).toBe(600);
  });

  it("미완료 세트는 세지 않는다", () => {
    expect(exerciseMetric(weightEx([[30, 10], [30, 10, false]]))).toBe(300);
  });

  it("맨몸 횟수형은 총 횟수", () => {
    expect(exerciseMetric(bodyweightEx("푸시업", "reps", [[20, 0], [15, 0]]))).toBe(35);
  });

  /**
   * ⚠️ 지표는 **초**다 (2026-08-28). 분으로 재던 시절엔 매달리기가 30초에서
   * 45초로 늘어도 둘 다 `0분`이라 **기록 갱신이 영영 안 잡혔다.**
   */
  it("맨몸 시간형은 총 시간(초)", () => {
    expect(exerciseMetric(bodyweightEx("플랭크", "time", [[0, 2], [0, 1]]))).toBe(
      180,
    );
  });

  it("1분 미만의 향상도 잡는다 — 30초 → 45초", () => {
    const before = holdEx("매달리기", [30]);
    const after = holdEx("매달리기", [45]);

    expect(exerciseMetric(before)).toBe(30);
    expect(exerciseMetric(after)).toBe(45);
    expect(exerciseImprovementNote(before, after)).toBe(
      "매달리기를 15초 더 버텼어요",
    );
  });

  it("유산소는 거리 km", () => {
    expect(exerciseMetric(cardioEx("러닝", [[3, 20]]))).toBe(3);
  });

  it("유산소 거리가 0이면 시간(초)을 쓴다", () => {
    expect(exerciseMetric(cardioEx("러닝", [[0, 25]]))).toBe(1_500);
  });
});

describe("exerciseImprovementNote", () => {
  it("세트가 늘면 세트 문구", () => {
    expect(
      exerciseImprovementNote(
        weightEx([[30, 10], [30, 10], [30, 10], [30, 10]]),
        weightEx([[30, 10], [30, 10], [30, 10], [30, 10], [30, 10]]),
      ),
    ).toBe("벤치프레스를 1세트 더 하셨어요");
  });

  it("세트가 같고 무게가 오르면 무게 문구", () => {
    expect(
      exerciseImprovementNote(weightEx([[60, 5]]), weightEx([[65, 5]])),
    ).toBe("벤치프레스를 5kg 더 무겁게 드셨어요");
  });

  it("세트·무게가 같고 횟수가 늘면 횟수 문구", () => {
    expect(
      exerciseImprovementNote(weightEx([[30, 8]]), weightEx([[30, 10]])),
    ).toBe("벤치프레스를 2회 더 하셨어요");
  });

  it("맨몸 횟수형", () => {
    expect(
      exerciseImprovementNote(
        bodyweightEx("푸시업", "reps", [[20, 0]]),
        bodyweightEx("푸시업", "reps", [[25, 0]]),
      ),
    ).toBe("푸시업을 5회 더 하셨어요");
  });

  it("맨몸 시간형", () => {
    expect(
      exerciseImprovementNote(
        bodyweightEx("플랭크", "time", [[0, 1]]),
        bodyweightEx("플랭크", "time", [[0, 3]]),
      ),
    ).toBe("플랭크를 2분 더 버텼어요");
  });

  it("유산소 거리", () => {
    expect(
      exerciseImprovementNote(cardioEx("러닝", [[3, 20]]), cardioEx("러닝", [[3.5, 20]])),
    ).toBe("러닝을 0.5km 더 뛰었어요");
  });

  it("유산소 시간 (거리 없음)", () => {
    expect(
      exerciseImprovementNote(cardioEx("러닝", [[0, 20]]), cardioEx("러닝", [[0, 25]])),
    ).toBe("러닝을 5분 더 뛰었어요");
  });

  it("동률이면 null", () => {
    expect(
      exerciseImprovementNote(weightEx([[30, 10]]), weightEx([[30, 10]])),
    ).toBeNull();
  });

  it("줄었으면 null", () => {
    expect(
      exerciseImprovementNote(weightEx([[30, 10]]), weightEx([[30, 8]])),
    ).toBeNull();
  });

  it("직전 실적이 0이면 null", () => {
    expect(
      exerciseImprovementNote(weightEx([[0, 0]]), weightEx([[30, 10]])),
    ).toBeNull();
  });

  it("받침 있는 이름엔 '을'을 쓴다", () => {
    expect(
      exerciseImprovementNote(
        bodyweightEx("랫풀다운", "reps", [[10, 0]]),
        bodyweightEx("랫풀다운", "reps", [[12, 0]]),
      ),
    ).toBe("랫풀다운을 2회 더 하셨어요");
  });

  it("한글이 아닌 이름엔 '를'을 쓴다", () => {
    expect(
      exerciseImprovementNote(
        bodyweightEx("Burpee", "reps", [[10, 0]]),
        bodyweightEx("Burpee", "reps", [[12, 0]]),
      ),
    ).toBe("Burpee를 2회 더 하셨어요");
  });

  it("소수는 2자리까지만 남긴다", () => {
    expect(
      exerciseImprovementNote(cardioEx("러닝", [[3, 20]]), cardioEx("러닝", [[3.333, 20]])),
    ).toBe("러닝을 0.33km 더 뛰었어요");
  });
});

describe("recordBeatenSummary", () => {
  const bench = { note: "벤치프레스를 2회 더 하셨어요", ratio: 0.2 };
  const squat = { note: "스쿼트를 1세트 더 하셨어요", ratio: 0.5 };
  const run = { note: "러닝을 5분 더 뛰었어요", ratio: 0.1 };

  it("개선이 없으면 null", () => {
    expect(recordBeatenSummary([])).toBeNull();
  });

  it("1종목이면 그 문구 그대로", () => {
    expect(recordBeatenSummary([bench])).toBe("벤치프레스를 2회 더 하셨어요");
  });

  it("여러 종목이면 개선율이 가장 큰 종목 + 외 N종목", () => {
    expect(recordBeatenSummary([bench, squat, run])).toBe(
      "스쿼트를 1세트 더 하셨어요 외 2종목 갱신",
    );
  });

  it("개선율이 같으면 먼저 온 종목을 대표로 쓴다", () => {
    expect(
      recordBeatenSummary([
        { note: "먼저를 1회 더 하셨어요", ratio: 0.3 },
        { note: "나중을 1회 더 하셨어요", ratio: 0.3 },
      ]),
    ).toBe("먼저를 1회 더 하셨어요 외 1종목 갱신");
  });

  it("문구는 80자를 넘지 않는다", () => {
    const long = {
      note: "아주아주긴이름의커스텀운동종목이름입니다를 1000회 더 하셨어요",
      ratio: 1,
    };
    const summary = recordBeatenSummary([long, bench, squat]);
    expect(summary).not.toBeNull();
    expect(summary!.length).toBeLessThanOrEqual(80);
  });
});
