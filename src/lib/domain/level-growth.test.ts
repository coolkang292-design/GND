import { describe, expect, it } from "vitest";
import {
  computeBaselines,
  computeLevelGrowth,
  toMetricPoints,
  type RawSession,
  type RawSet,
} from "./level-growth";

/** 그 날 09:00 KST에 끝난 세션 */
export function sess(
  day: string,
  exercises: {
    name: string;
    type?: string | null;
    sets: Partial<RawSet>[];
    order?: number | null;
  }[],
  tabataMinutes: number | null = null,
): RawSession {
  return {
    completed_at: `${day}T00:00:00.000Z`,
    tabata_minutes: tabataMinutes,
    workout_exercises: exercises.map((e, i) => ({
      exercise_name: e.name,
      exercise_type: e.type === undefined ? "weight" : e.type,
      sort_order: e.order === undefined ? i : e.order,
      workout_sets: e.sets.map((s) => ({
        weight_kg: null,
        reps: null,
        duration_seconds: null,
        is_completed: true,
        ...s,
      })),
    })),
  };
}

describe("toMetricPoints — 무엇을 성장 지표로 치는가", () => {
  it("중량 종목은 하루 최고 추정 1RM = 무게 × (1 + 반복/30)", () => {
    const p = toMetricPoints([
      sess("2026-11-01", [{ name: "벤치", sets: [{ weight_kg: 60, reps: 6 }, { weight_kg: 60, reps: 9 }] }]),
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ exerciseKey: "벤치", kind: "w", day: "2026-11-01" });
    expect(p[0].value).toBeCloseTo(60 * (1 + 9 / 30), 6);
    expect(p[0].best).toEqual({ weight: 60, reps: 9, seconds: null });
  });

  it("인터벌 블록(sort_order 0~3)의 반복은 라운드 수라 버린다", () => {
    const p = toMetricPoints([
      sess(
        "2026-11-01",
        [
          { name: "마운틴 클라이머", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "점핑잭", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "푸시업", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "버드독", type: "bodyweight", sets: [{ reps: 4 }] },
        ],
        8,
      ),
    ]);
    expect(p).toEqual([]);
  });

  it("인터벌 뒤에 이어서 한 일반 운동(sort_order 4~)은 넣는다", () => {
    const p = toMetricPoints([
      sess(
        "2026-11-01",
        [
          { name: "a", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "b", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "c", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "d", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "풀업", type: "bodyweight", sets: [{ reps: 5 }, { reps: 4 }] },
        ],
        8,
      ),
    ]);
    expect(p.map((x) => x.exerciseKey)).toEqual(["풀업"]);
    expect(p[0]).toMatchObject({ kind: "r", value: 5 });
  });

  it("인터벌 세션에서 자리(sort_order)를 모르면 블록으로 보고 뺀다", () => {
    const p = toMetricPoints([
      sess("2026-11-01", [{ name: "푸시업", type: "bodyweight", sets: [{ reps: 30 }], order: null }], 4),
    ]);
    expect(p).toEqual([]);
  });

  it("유산소(트레드밀)는 시간이 길어도 지표가 아니다", () => {
    const p = toMetricPoints([
      sess("2026-11-01", [{ name: "트레드밀", type: "cardio", sets: [{ duration_seconds: 2040 }] }]),
    ]);
    expect(p).toEqual([]);
  });

  it("시간 유지 운동(플랭크)은 하루 최장 시간", () => {
    const p = toMetricPoints([
      sess("2026-11-01", [
        { name: "플랭크", type: "bodyweight", sets: [{ duration_seconds: 60 }, { duration_seconds: 75 }] },
      ]),
    ]);
    expect(p[0]).toMatchObject({ kind: "t", value: 75 });
  });

  it("미완료 세트는 뺀다", () => {
    const p = toMetricPoints([
      sess("2026-11-01", [{ name: "벤치", sets: [{ weight_kg: 100, reps: 5, is_completed: false }] }]),
    ]);
    expect(p).toEqual([]);
  });

  it("추정 1RM은 반복 1~30회 세트만 쓴다 (31회 이상은 제외)", () => {
    const p = toMetricPoints([
      sess("2026-11-01", [{ name: "밴드 레터럴", sets: [{ weight_kg: 5, reps: 45 }, { weight_kg: 5, reps: 30 }] }]),
    ]);
    expect(p[0].best).toEqual({ weight: 5, reps: 30, seconds: null });
  });

  it("무게 0으로 적힌 중량 종목(밴드)은 맨몸 반복으로 치지 않는다", () => {
    const p = toMetricPoints([
      sess("2026-11-01", [{ name: "밴드 스쿼트", type: "weight", sets: [{ weight_kg: 0, reps: 25 }] }]),
    ]);
    expect(p).toEqual([]);
  });

  it("이름 앞뒤 공백만 다른 종목은 같고, 다른 이름은 합치지 않는다", () => {
    const p = toMetricPoints([
      sess("2026-11-01", [
        { name: " 벤치 ", sets: [{ weight_kg: 60, reps: 5 }] },
        { name: "인클라인 벤치", sets: [{ weight_kg: 40, reps: 5 }] },
      ]),
    ]);
    expect(p.map((x) => x.exerciseKey)).toEqual(["벤치", "인클라인 벤치"]);
  });
});

const ENTERED = Date.parse("2026-11-09T00:00:00.000Z");
const bench = (day: string, kg: number, reps = 10) =>
  sess(day, [{ name: "벤치", sets: [{ weight_kg: kg, reps }] }]);
const e1 = (kg: number, reps = 10) => kg * (1 + reps / 30);

describe("computeBaselines — 레벨 진입 전 기준선", () => {
  it("진입 전 최근 3개 운동일의 중앙값이다", () => {
    const b = computeBaselines(
      toMetricPoints([
        bench("2026-10-01", 50),
        bench("2026-10-10", 60),
        bench("2026-10-20", 62),
        bench("2026-11-01", 58),
      ]),
      ENTERED,
    );
    expect(b).toHaveLength(1);
    expect(b[0].samples.map((s) => s.day)).toEqual(["2026-10-10", "2026-10-20", "2026-11-01"]);
    expect(b[0].value).toBeCloseTo(e1(60), 6);
  });

  it("3일 미만이면 기준선을 만들지 않는다", () => {
    const b = computeBaselines(toMetricPoints([bench("2026-10-20", 60), bench("2026-11-01", 60)]), ENTERED);
    expect(b).toEqual([]);
  });

  it("같은 날 두 번 한 것은 1일이고 그날 최고 기록을 쓴다", () => {
    const b = computeBaselines(
      toMetricPoints([
        bench("2026-10-20", 60),
        bench("2026-10-20", 70),
        bench("2026-11-01", 60),
      ]),
      ENTERED,
    );
    expect(b).toEqual([]);
  });

  it("60일보다 오래된 기록은 쓰지 않는다 (창을 늘리지 않는다)", () => {
    const b = computeBaselines(
      toMetricPoints([bench("2026-08-01", 60), bench("2026-10-20", 60), bench("2026-11-01", 60)]),
      ENTERED,
    );
    expect(b).toEqual([]);
  });

  it("레벨업을 일으킨 세션(완료 시각 = 진입 시각)은 기준선에 든다", () => {
    const b = computeBaselines(
      toMetricPoints([bench("2026-10-20", 60), bench("2026-11-01", 60), bench("2026-11-09", 66)]),
      ENTERED,
    );
    expect(b[0].samples.map((s) => s.day)).toContain("2026-11-09");
  });

  it("진입 뒤 기록은 기준선을 바꾸지 않는다", () => {
    const before = [bench("2026-10-10", 60), bench("2026-10-20", 60), bench("2026-11-01", 60)];
    const a = computeBaselines(toMetricPoints(before), ENTERED);
    const b = computeBaselines(toMetricPoints([...before, bench("2026-11-12", 90)]), ENTERED);
    expect(b).toEqual(a);
  });

  it("다음 레벨에 들어가면 그 시점 기준으로 새 기준선이 나온다", () => {
    const all = toMetricPoints([
      bench("2026-10-10", 60),
      bench("2026-10-20", 60),
      bench("2026-11-01", 60),
      bench("2026-11-12", 66),
      bench("2026-11-15", 66),
    ]);
    const next = computeBaselines(all, Date.parse("2026-11-16T00:00:00.000Z"));
    expect(next[0].value).toBeCloseTo(e1(66), 6);
  });
});

const squat = (day: string, kg: number) =>
  sess(day, [{ name: "스쿼트", sets: [{ weight_kg: kg, reps: 10 }] }]);
const BEFORE = [
  bench("2026-10-10", 60), bench("2026-10-20", 60), bench("2026-11-01", 60),
  squat("2026-10-11", 100), squat("2026-10-21", 100), squat("2026-11-02", 100),
];
function grow(after: RawSession[]) {
  const points = toMetricPoints([...BEFORE, ...after]);
  return computeLevelGrowth({
    baselines: computeBaselines(points, ENTERED),
    points,
    enteredAtMs: ENTERED,
  });
}
const of = (g: ReturnType<typeof grow>, name: string) =>
  g.exercises.find((e) => e.exerciseKey === name)!;

describe("computeLevelGrowth — 기준선 대비 성장률", () => {
  it("같으면 0%, +10%는 +10%, -10%는 -10%", () => {
    expect(of(grow([bench("2026-11-10", 60)]), "벤치").growthPct).toBeCloseTo(0, 6);
    expect(of(grow([bench("2026-11-10", 66)]), "벤치").growthPct).toBeCloseTo(10, 6);
    expect(of(grow([bench("2026-11-10", 54)]), "벤치").growthPct).toBeCloseTo(-10, 6);
  });

  it("현재 레벨 기록이 없으면 0%가 아니라 null(대기)", () => {
    const e = of(grow([]), "벤치");
    expect(e.status).toBe("waiting");
    expect(e.growthPct).toBeNull();
    expect(e.current).toBeNull();
  });

  it("1~2일은 잠정, 3일부터 확정", () => {
    expect(of(grow([bench("2026-11-10", 66)]), "벤치").status).toBe("provisional");
    expect(of(grow([bench("2026-11-10", 66), bench("2026-11-11", 66)]), "벤치").status).toBe("provisional");
    expect(
      of(grow([bench("2026-11-10", 66), bench("2026-11-11", 66), bench("2026-11-12", 66)]), "벤치").status,
    ).toBe("confirmed");
  });

  it("현재값은 현재 레벨의 최근 3일 중앙값이다", () => {
    const e = of(
      grow([bench("2026-11-10", 50), bench("2026-11-11", 66), bench("2026-11-12", 66), bench("2026-11-13", 72)]),
      "벤치",
    );
    expect(e.currentSamples.map((s) => s.day)).toEqual(["2026-11-11", "2026-11-12", "2026-11-13"]);
    expect(e.growthPct).toBeCloseTo(10, 6);
    expect(e.currentDayCount).toBe(4);
  });

  it("확정 종목이 2개 미만이면 종합은 null, 잠정 참고값은 따로 준다", () => {
    const g = grow([bench("2026-11-10", 66), squat("2026-11-10", 104)]);
    expect(g.value).toBeNull();
    expect(g.confirmedCount).toBe(0);
    expect(g.provisionalValue).toBeCloseTo(7, 6); // median(+10, +4)
    expect(g.provisionalCount).toBe(2);
  });

  it("확정 2종목 이상이면 종합 = 확정 종목만의 중앙값 (0%·음수도 포함)", () => {
    const three = (f: (d: string) => RawSession) => ["2026-11-10", "2026-11-11", "2026-11-12"].map(f);
    const g = grow([...three((d) => bench(d, 60)), ...three((d) => squat(d, 90))]);
    expect(g.confirmedCount).toBe(2);
    expect(g.value).toBeCloseTo(-5, 6); // median(0, -10)
    expect(g.provisionalValue).toBeNull();
  });

  it("종합에는 ±30% 상한을 걸지만 종목 상세는 실제 값이다", () => {
    const three = (f: (d: string) => RawSession) => ["2026-11-10", "2026-11-11", "2026-11-12"].map(f);
    const g = grow([...three((d) => bench(d, 120)), ...three((d) => squat(d, 200))]);
    expect(of(g, "벤치").growthPct).toBeCloseTo(100, 6);
    expect(g.value).toBeCloseTo(30, 6);
  });

  it("기준선이 없는 종목은 0%가 아니라 비교 불가 목록에 든다", () => {
    const g = grow([sess("2026-11-10", [{ name: "덤벨 벤치프레스", sets: [{ weight_kg: 12, reps: 12 }] }])]);
    expect(g.exercises.find((e) => e.exerciseKey === "덤벨 벤치프레스")).toBeUndefined();
    expect(g.unmatched).toEqual([{ exerciseKey: "덤벨 벤치프레스", kind: "w", currentDayCount: 1 }]);
  });

  it("현재 레벨의 인터벌 블록은 성장률을 만들지 않는다", () => {
    const g = grow([
      sess(
        "2026-11-10",
        [
          { name: "벤치", type: "weight", sets: [{ weight_kg: 0, reps: 4 }] },
          { name: "b", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "c", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "d", type: "bodyweight", sets: [{ reps: 4 }] },
        ],
        8,
      ),
    ]);
    expect(of(g, "벤치").status).toBe("waiting");
    expect(g.unmatched).toEqual([]);
  });

  it("진입 시각과 같은 순간에 끝난 세션은 현재 기록이 아니다", () => {
    const g = grow([bench("2026-11-09", 90)]);
    expect(of(g, "벤치").currentDayCount).toBe(0);
  });
});
