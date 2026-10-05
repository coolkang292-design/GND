import { describe, expect, it } from "vitest";
import type { BreakdownExercise } from "@/components/workout/set-breakdown";
import { exerciseSetSummary, feedStatCells } from "./feed-card";

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

  it("완료 세트가 없으면 그렇다고 적는다", () => {
    expect(exerciseSetSummary(ex("weight", [{ weightKg: 60, done: false }]))).toBe(
      "완료 세트 없음",
    );
  });
});
