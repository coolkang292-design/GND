import { describe, expect, it } from "vitest";
import type { BreakdownExercise } from "@/components/workout/set-breakdown";
import { allocateExerciseMinutes, exerciseSetSummary, feedStatCells } from "./feed-card";

const VOL = {
  weightVolumeKg: 0,
  bodyweightReps: 0,
  cardioDistanceMeters: 0,
  cardioDurationSeconds: 0,
  completedSetCount: 0,
};

function ex(
  exerciseType: BreakdownExercise["exerciseType"],
  sets: Partial<BreakdownExercise["sets"][number]>[],
  measure: BreakdownExercise["measure"] = null,
): BreakdownExercise {
  return {
    name: "x",
    exerciseType,
    measure,
    sets: sets.map((s) => ({
      weightKg: 0,
      reps: 0,
      distanceKm: 0,
      durationMin: 0,
      done: true,
      ...s,
    })),
  };
}

describe("feedStatCells — 피드 카드 숫자 줄", () => {
  it("시간·세트·볼륨 세 칸", () => {
    const cells = feedStatCells({
      durationMinutes: 52,
      volume: { ...VOL, weightVolumeKg: 6840, completedSetCount: 18 },
    });
    expect(cells.map((c) => `${c.value} ${c.unit}`)).toEqual([
      "52 MIN",
      "18 SETS",
      "6,840 KG",
    ]);
  });

  it("0인 값은 칸을 만들지 않는다 — 지어내지 않는다", () => {
    const cells = feedStatCells({
      durationMinutes: 0,
      volume: { ...VOL, completedSetCount: 4, weightVolumeKg: 0 },
    });
    expect(cells.map((c) => c.key)).toEqual(["sets"]);
  });

  it("무게가 없으면 맨몸 반복, 그것도 없으면 유산소 거리", () => {
    expect(
      feedStatCells({ durationMinutes: 10, volume: { ...VOL, bodyweightReps: 60 } }).at(-1)
        ?.unit,
    ).toBe("REPS");
    expect(
      feedStatCells({
        durationMinutes: 30,
        volume: { ...VOL, cardioDistanceMeters: 5250 },
      }).at(-1)?.value,
    ).toBe("5.3");
  });
});

describe("exerciseSetSummary — 운동 한 줄 요약", () => {
  it("무게가 모두 같으면 `N세트 × kg`", () => {
    expect(exerciseSetSummary(ex("weight", Array(4).fill({ weightKg: 100, reps: 6 })))).toBe(
      "4세트 × 100kg",
    );
  });

  it("무게가 다르면 `×`로 속이지 않고 최고 무게를 말한다", () => {
    expect(
      exerciseSetSummary(
        ex("weight", [
          { weightKg: 60, reps: 10 },
          { weightKg: 80, reps: 6 },
        ]),
      ),
    ).toBe("2세트 · 최고 80kg");
  });

  it("미완료 세트는 세지 않는다", () => {
    expect(
      exerciseSetSummary(
        ex("weight", [
          { weightKg: 60, reps: 8 },
          { weightKg: 60, reps: 4, done: false },
        ]),
      ),
    ).toBe("1세트 × 60kg");
  });

  it("맨몸 횟수 — 같으면 ×, 다르면 총", () => {
    expect(exerciseSetSummary(ex("bodyweight", Array(3).fill({ reps: 12 })))).toBe(
      "3세트 × 12회",
    );
    expect(
      exerciseSetSummary(ex("bodyweight", [{ reps: 12 }, { reps: 8 }])),
    ).toBe("2세트 · 총 20회");
  });

  it("맨몸 시간은 초로 더한다", () => {
    expect(
      exerciseSetSummary(
        ex("bodyweight", [{ durationSec: 30 }, { durationSec: 45 }], "time"),
      ),
    ).toBe("2세트 · 총 1분 15초");
  });

  it("유산소는 거리·시간", () => {
    expect(
      exerciseSetSummary(ex("cardio", [{ distanceKm: 5.2, durationSec: 1920 }])),
    ).toBe("5.2km · 32분");
  });

  it("근력은 배분된 시간을 `약 N분`으로 덧붙인다", () => {
    const e = ex("weight", Array(4).fill({ weightKg: 100, reps: 6 }));
    expect(exerciseSetSummary(e, 12)).toBe("4세트 × 100kg · 약 12분");
    expect(exerciseSetSummary(e, 0)).toBe("4세트 × 100kg · 1분 미만");
    expect(exerciseSetSummary(e)).toBe("4세트 × 100kg");
  });

  it("유산소는 잰 시간이 있으니 배분 시간을 또 붙이지 않는다", () => {
    const e = ex("cardio", [{ distanceKm: 5, durationSec: 1920 }]);
    expect(exerciseSetSummary(e, 40)).toBe("5km · 32분");
  });
});

describe("allocateExerciseMinutes — 종목별 시간 배분", () => {
  const w = (n: number) => ex("weight", Array(n).fill({ weightKg: 50, reps: 5 }));
  const sum = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);

  it("세트 수 비율로 나누고 합이 전체 시간과 정확히 같다", () => {
    const m = allocateExerciseMinutes([w(3), w(3), w(1)], 50);
    expect(sum(m)).toBe(50);
    expect(m.get(0)).toBe(22);
    expect(m.get(2)).toBe(7);
  });

  it("나누어떨어지지 않아도 합이 맞는다", () => {
    for (const total of [1, 7, 33, 97]) {
      expect(sum(allocateExerciseMinutes([w(2), w(3), w(5), w(1)], total))).toBe(total);
    }
  });

  it("직접 잰 시간은 빼고 나머지만 나눈다", () => {
    const run = ex("cardio", [{ distanceKm: 5, durationSec: 1200 }]); // 20분
    const m = allocateExerciseMinutes([w(2), run, w(2)], 60);
    expect(m.has(1)).toBe(false);
    expect(m.get(0)).toBe(20);
    expect(m.get(2)).toBe(20);
  });

  it("잰 시간이 전체 시간 이상이거나 전체 시간이 0이면 만들지 않는다", () => {
    const run = ex("cardio", [{ distanceKm: 9, durationSec: 4200 }]); // 70분
    expect(allocateExerciseMinutes([w(2), run], 55).size).toBe(0);
    expect(allocateExerciseMinutes([w(2)], 0).size).toBe(0);
  });

  it("완료 세트가 없는 종목은 건너뛴다", () => {
    const m = allocateExerciseMinutes(
      [ex("weight", [{ weightKg: 60, done: false }]), w(2)],
      10,
    );
    expect(m.has(0)).toBe(false);
    expect(m.get(1)).toBe(10);
  });
});

describe("exerciseSetSummary — 완료 세트 없음", () => {
  it("완료 세트가 없으면 그렇다고 적는다", () => {
    expect(exerciseSetSummary(ex("weight", [{ weightKg: 60, done: false }]))).toBe(
      "완료 세트 없음",
    );
  });
});
