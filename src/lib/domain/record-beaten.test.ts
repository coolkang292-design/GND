import { describe, expect, it } from "vitest";

import { effortTotals, recordBeatenNote } from "./record-beaten";

type Input = Parameters<typeof effortTotals>[0][number];

function weight(sets: Array<[number, number, boolean]>): Input {
  return {
    exerciseType: "weight",
    measure: null,
    sets: sets.map(([weightKg, reps, isCompleted]) => ({
      weightKg,
      reps,
      distanceKm: 0,
      durationMin: 0,
      isCompleted,
    })),
  };
}

describe("effortTotals", () => {
  it("완료 세트만 유형별로 합산한다", () => {
    const totals = effortTotals([
      weight([
        [60, 10, true],
        [60, 10, false],
      ]),
      {
        exerciseType: "bodyweight",
        measure: "reps",
        sets: [
          { weightKg: 0, reps: 15, distanceKm: 0, durationMin: 0, isCompleted: true },
        ],
      },
      {
        exerciseType: "bodyweight",
        measure: "time",
        sets: [
          { weightKg: 0, reps: 0, distanceKm: 0, durationMin: 3, isCompleted: true },
        ],
      },
      {
        exerciseType: "cardio",
        measure: null,
        sets: [
          { weightKg: 0, reps: 0, distanceKm: 5, durationMin: 30, isCompleted: true },
          { weightKg: 0, reps: 0, distanceKm: 2, durationMin: 10, isCompleted: false },
        ],
      },
    ]);
    expect(totals).toEqual({
      weightVolumeKg: 600,
      bodyweightReps: 15,
      bodyweightTimeMin: 3,
      cardioDistanceKm: 5,
      cardioTimeMin: 30,
    });
  });

  it("빈 입력은 전부 0", () => {
    expect(effortTotals([])).toEqual({
      weightVolumeKg: 0,
      bodyweightReps: 0,
      bodyweightTimeMin: 0,
      cardioDistanceKm: 0,
      cardioTimeMin: 0,
    });
  });
});

describe("recordBeatenNote", () => {
  const base = {
    weightVolumeKg: 0,
    bodyweightReps: 0,
    bodyweightTimeMin: 0,
    cardioDistanceKm: 0,
    cardioTimeMin: 0,
  };

  it("웨이트 볼륨 초과를 알린다", () => {
    expect(
      recordBeatenNote(
        { ...base, weightVolumeKg: 600 },
        { ...base, weightVolumeKg: 612.5 },
      ),
    ).toBe("볼륨 +12.5kg");
  });

  it("우선순위 — 볼륨 초과가 있으면 그 문구를 쓴다", () => {
    expect(
      recordBeatenNote(
        { ...base, weightVolumeKg: 600, bodyweightReps: 10 },
        { ...base, weightVolumeKg: 700, bodyweightReps: 30 },
      ),
    ).toBe("볼륨 +100kg");
  });

  it("볼륨이 같으면 다음 지표(횟수)로 판정한다", () => {
    expect(
      recordBeatenNote(
        { ...base, weightVolumeKg: 600, bodyweightReps: 10 },
        { ...base, weightVolumeKg: 600, bodyweightReps: 25 },
      ),
    ).toBe("횟수 +15회");
  });

  it("원본에 없던 지표는 갱신으로 치지 않는다", () => {
    expect(
      recordBeatenNote(
        { ...base, weightVolumeKg: 600 },
        { ...base, weightVolumeKg: 600, cardioDistanceKm: 5 },
      ),
    ).toBeNull();
  });

  it.each([
    ["맨몸 시간", { bodyweightTimeMin: 3 }, { bodyweightTimeMin: 5 }, "맨몸 시간 +2분"],
    ["거리", { cardioDistanceKm: 5 }, { cardioDistanceKm: 5.5 }, "거리 +0.5km"],
    ["유산소 시간", { cardioTimeMin: 30 }, { cardioTimeMin: 42 }, "유산소 +12분"],
  ])("%s 초과 문구", (_label, prev, curr, expected) => {
    expect(recordBeatenNote({ ...base, ...prev }, { ...base, ...curr })).toBe(
      expected,
    );
  });

  it("동률·미달이면 null", () => {
    expect(
      recordBeatenNote(
        { ...base, weightVolumeKg: 600 },
        { ...base, weightVolumeKg: 600 },
      ),
    ).toBeNull();
    expect(
      recordBeatenNote(
        { ...base, weightVolumeKg: 600 },
        { ...base, weightVolumeKg: 500 },
      ),
    ).toBeNull();
  });

  it("원본이 전부 0이면 null", () => {
    expect(recordBeatenNote(base, { ...base, weightVolumeKg: 300 })).toBeNull();
  });
});
