import { describe, expect, it } from "vitest";

import {
  effortTotals,
  findComparableSession,
  recordBeatenNote,
} from "./record-beaten";

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

describe("findComparableSession", () => {
  function candidate(
    id: string,
    completedAt: string,
    exerciseNames: string[],
    isTabata = false,
  ) {
    return { id, completedAt: new Date(completedAt), exerciseNames, isTabata };
  }

  it("같은 종목 집합의 세션을 찾는다", () => {
    const found = findComparableSession(
      ["벤치프레스", "스쿼트"],
      [candidate("a", "2026-07-01T10:00:00Z", ["벤치프레스", "스쿼트"])],
    );
    expect(found?.id).toBe("a");
  });

  it("순서가 달라도 같은 집합이면 찾는다", () => {
    const found = findComparableSession(
      ["벤치프레스", "스쿼트"],
      [candidate("a", "2026-07-01T10:00:00Z", ["스쿼트", "벤치프레스"])],
    );
    expect(found?.id).toBe("a");
  });

  it("종목이 하나라도 다르면 비교하지 않는다", () => {
    expect(
      findComparableSession(
        ["벤치프레스", "스쿼트"],
        [
          candidate("a", "2026-07-01T10:00:00Z", ["벤치프레스"]),
          candidate("b", "2026-07-02T10:00:00Z", [
            "벤치프레스",
            "스쿼트",
            "데드리프트",
          ]),
        ],
      ),
    ).toBeNull();
  });

  it("조건을 만족하는 후보 중 가장 최근 것을 고른다", () => {
    const found = findComparableSession(
      ["벤치프레스"],
      [
        candidate("old", "2026-07-01T10:00:00Z", ["벤치프레스"]),
        candidate("new", "2026-07-05T10:00:00Z", ["벤치프레스"]),
        candidate("mid", "2026-07-03T10:00:00Z", ["벤치프레스"]),
      ],
    );
    expect(found?.id).toBe("new");
  });

  it("타바타 세션은 후보에서 제외한다", () => {
    const found = findComparableSession(
      ["버피"],
      [
        candidate("tabata", "2026-07-05T10:00:00Z", ["버피"], true),
        candidate("normal", "2026-07-01T10:00:00Z", ["버피"]),
      ],
    );
    expect(found?.id).toBe("normal");
  });

  it("후보가 없으면 null", () => {
    expect(findComparableSession(["벤치프레스"], [])).toBeNull();
  });

  it("이번 운동에 종목이 없으면 비교하지 않는다", () => {
    expect(
      findComparableSession([], [candidate("a", "2026-07-01T10:00:00Z", [])]),
    ).toBeNull();
  });

  it("같은 종목이 중복돼도 집합으로 비교한다", () => {
    const found = findComparableSession(
      ["벤치프레스", "벤치프레스"],
      [candidate("a", "2026-07-01T10:00:00Z", ["벤치프레스"])],
    );
    expect(found?.id).toBe("a");
  });

  it("완료 시각이 같으면 먼저 만난 후보를 고른다", () => {
    const found = findComparableSession(
      ["벤치프레스"],
      [
        candidate("first", "2026-07-05T10:00:00Z", ["벤치프레스"]),
        candidate("second", "2026-07-05T10:00:00Z", ["벤치프레스"]),
      ],
    );
    expect(found?.id).toBe("first");
  });

  it("양쪽에 중복이 있어도 집합이 같으면 찾는다", () => {
    const found = findComparableSession(
      ["벤치프레스", "벤치프레스", "스쿼트"],
      [candidate("a", "2026-07-01T10:00:00Z", ["벤치프레스", "스쿼트", "스쿼트"])],
    );
    expect(found?.id).toBe("a");
  });
});
