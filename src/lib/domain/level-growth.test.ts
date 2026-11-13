import { describe, expect, it } from "vitest";
import {
  MAX_PLAUSIBLE_GROWTH_PCT,
  computeStageGrowth,
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


/** 세션들을 지표로 바꿔 단계 성장을 계산한다 */
function grow(sessions: RawSession[], entered: string, previous: string | null = null) {
  return computeStageGrowth({
    points: toMetricPoints(sessions),
    stageEnteredAtMs: Date.parse(entered),
    previousStageEnteredAtMs: previous === null ? null : Date.parse(previous),
  });
}
const bench = (day: string, kg: number, reps = 10) =>
  sess(day, [{ name: "벤치", sets: [{ weight_kg: kg, reps }] }]);
const ENTRY = "2026-11-01T00:00:00.000Z";

describe("computeStageGrowth — 진입 시점까지의 종목별 최고 기록 대비", () => {
  it("60kg×10 → 66kg×10 은 정확히 +10% 성장 기록", () => {
    const r = grow([bench("2026-10-20", 60), bench("2026-11-05", 66)], ENTRY);
    expect(r.growths).toHaveLength(1);
    const g = r.growths[0];
    expect(g.exerciseKey).toBe("벤치");
    expect(g.kind).toBe("w");
    expect(g.growthPct).toBeCloseTo(10, 9);
    expect(g.baseline).toBeCloseTo(60 * (1 + 10 / 30), 9);
    expect(g.current).toBeCloseTo(66 * (1 + 10 / 30), 9);
    expect(g.baselineDay).toBe("2026-10-20");
    expect(g.currentDay).toBe("2026-11-05");
    expect(g.baselineBest).toEqual({ weight: 60, reps: 10, seconds: null });
    expect(g.currentBest).toEqual({ weight: 66, reps: 10, seconds: null });
    expect(r.comparableCount).toBe(1);
    expect(r.unchangedCount).toBe(0);
  });

  it("같으면 성장 기록이 없고 변함없음으로 센다", () => {
    const r = grow([bench("2026-10-20", 60), bench("2026-11-05", 60)], ENTRY);
    expect(r.growths).toEqual([]);
    expect(r.unchangedCount).toBe(1);
    expect(r.comparableCount).toBe(1);
  });

  it("더 낮아도 성장 기록이 없다 (음수 기록을 만들지 않는다)", () => {
    const r = grow([bench("2026-10-20", 60), bench("2026-11-05", 50)], ENTRY);
    expect(r.growths).toEqual([]);
    expect(r.unchangedCount).toBe(1);
  });

  it("기준선은 단계 안에서 움직이지 않는다: 60 → 66 → 70 은 60 대비 +16.7%", () => {
    const r = grow(
      [bench("2026-10-20", 60), bench("2026-11-05", 66), bench("2026-11-10", 70)],
      ENTRY,
    );
    expect(r.growths).toHaveLength(1);
    expect(r.growths[0].growthPct).toBeCloseTo((70 / 60 - 1) * 100, 9);
    expect(r.growths[0].growthPct).toBeCloseTo(16.6667, 3);
    expect(r.growths[0].baselineDay).toBe("2026-10-20");
  });

  it("진입 전에 기록이 없던 종목은 비교 불가 목록에 들고 성장 기록에는 없다", () => {
    const r = grow(
      [
        bench("2026-10-20", 60),
        bench("2026-11-05", 66),
        sess("2026-11-06", [{ name: "스쿼트", sets: [{ weight_kg: 80, reps: 5 }] }]),
      ],
      ENTRY,
    );
    expect(r.growths.map((g) => g.exerciseKey)).toEqual(["벤치"]);
    expect(r.unmatched).toEqual([{ exerciseKey: "스쿼트", kind: "w", reason: "no_baseline" }]);
    expect(r.comparableCount).toBe(1);
  });

  it("인터벌 블록만 한 종목은 어디에도 나오지 않는다", () => {
    const tabata = (day: string) =>
      sess(
        day,
        [
          { name: "마운틴 클라이머", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "점핑잭", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "푸시업", type: "bodyweight", sets: [{ reps: 4 }] },
          { name: "버드독", type: "bodyweight", sets: [{ reps: 4 }] },
        ],
        8,
      );
    const r = grow([tabata("2026-10-20"), tabata("2026-11-05")], ENTRY);
    expect(r.growths).toEqual([]);
    expect(r.unmatched).toEqual([]);
    expect(r.comparableCount).toBe(0);
    expect(r.unchangedCount).toBe(0);
  });

  it("유산소는 어디에도 나오지 않는다", () => {
    const run = (day: string, sec: number) =>
      sess(day, [{ name: "트레드밀", type: "cardio", sets: [{ duration_seconds: sec }] }]);
    const r = grow([run("2026-10-20", 600), run("2026-11-05", 1800)], ENTRY);
    expect(r.growths).toEqual([]);
    expect(r.unmatched).toEqual([]);
    expect(r.comparableCount).toBe(0);
  });

  it("진입 시각과 같은 순간에 끝난 세션은 기준선, 1초 뒤는 현재", () => {
    const at = (iso: string, kg: number): RawSession => ({
      ...bench("2026-11-01", kg),
      completed_at: iso,
    });
    const r = grow(
      [at("2026-11-01T00:00:00.000Z", 60), at("2026-11-01T00:00:01.000Z", 66)],
      ENTRY,
    );
    expect(r.growths).toHaveLength(1);
    expect(r.growths[0].baselineBest.weight).toBe(60);
    expect(r.growths[0].currentBest.weight).toBe(66);
    // 정확히 진입 시각의 기록만 있으면 현재 기록이 없어 비교 대상이 아니다
    const only = grow([at("2026-11-01T00:00:00.000Z", 60)], ENTRY);
    expect(only.growths).toEqual([]);
    expect(only.comparableCount).toBe(0);
    expect(only.unmatched).toEqual([]);
  });

  it("다음 단계 진입 때 그 시점 최고 기록으로 기준선을 다시 잡는다", () => {
    const sessions = [bench("2026-10-20", 60), bench("2026-11-05", 66), bench("2026-11-20", 68)];
    const first = grow(sessions, ENTRY);
    expect(first.growths[0].growthPct).toBeCloseTo((68 / 60 - 1) * 100, 9);
    const second = grow(sessions, "2026-11-10T00:00:00.000Z", ENTRY);
    expect(second.growths).toHaveLength(1);
    expect(second.growths[0].baselineBest.weight).toBe(66);
    expect(second.growths[0].baselineDay).toBe("2026-11-05");
    expect(second.growths[0].growthPct).toBeCloseTo((68 / 66 - 1) * 100, 9);
    // 새 단계에서 더 오르지 않았다면 앞 단계의 +10%는 더 이상 세지 않는다
    const third = grow(
      [bench("2026-10-20", 60), bench("2026-11-05", 66)],
      "2026-11-10T00:00:00.000Z",
      ENTRY,
    );
    expect(third.growths).toEqual([]);
  });

  it("같은 날 여러 번 한 것은 그날 최고 기록 하나", () => {
    const r = grow(
      [
        bench("2026-10-20", 60),
        bench("2026-10-20", 55),
        bench("2026-11-05", 62),
        bench("2026-11-05", 66),
      ],
      ENTRY,
    );
    expect(r.growths[0].baselineBest.weight).toBe(60);
    expect(r.growths[0].currentBest.weight).toBe(66);
    expect(r.growths[0].growthPct).toBeCloseTo(10, 9);
  });

  it("이름이 같아도 지표가 다르면(중량 vs 맨몸 반복) 합치지 않는다", () => {
    const r = grow(
      [
        sess("2026-10-20", [{ name: "딥스", type: "weight", sets: [{ weight_kg: 20, reps: 10 }] }]),
        sess("2026-11-05", [{ name: "딥스", type: "bodyweight", sets: [{ reps: 30 }] }]),
      ],
      ENTRY,
    );
    expect(r.growths).toEqual([]);
    expect(r.comparableCount).toBe(0);
    expect(r.unmatched).toEqual([{ exerciseKey: "딥스", kind: "r", reason: "no_baseline" }]);
  });

  it("같은 무게에서 반복이 늘어도 성장이다 (16kg×12 → 16kg×17)", () => {
    const r = grow([bench("2026-10-20", 16, 12), bench("2026-11-05", 16, 17)], ENTRY);
    expect(r.growths).toHaveLength(1);
    expect(r.growths[0].growthPct).toBeCloseTo(((1 + 17 / 30) / (1 + 12 / 30) - 1) * 100, 9);
    expect(r.growths[0].currentBest).toEqual({ weight: 16, reps: 17, seconds: null });
  });

  it("맨몸 반복·시간 유지도 같은 규칙으로 비교한다", () => {
    const r = grow(
      [
        sess("2026-10-20", [
          { name: "푸시업", type: "bodyweight", sets: [{ reps: 20 }] },
          { name: "플랭크", type: "bodyweight", sets: [{ duration_seconds: 60 }] },
        ]),
        sess("2026-11-05", [
          { name: "푸시업", type: "bodyweight", sets: [{ reps: 25 }] },
          { name: "플랭크", type: "bodyweight", sets: [{ duration_seconds: 90 }] },
        ]),
      ],
      ENTRY,
    );
    const by = Object.fromEntries(r.growths.map((g) => [g.exerciseKey, g.growthPct]));
    expect(by["푸시업"]).toBeCloseTo(25, 9);
    expect(by["플랭크"]).toBeCloseTo(50, 9);
  });

  it("이전 단계 종목 수: 이전 진입 이후 ~ 현재 진입 이하 구간의 서로 다른 종목", () => {
    const prev = "2026-10-01T00:00:00.000Z";
    const r = grow(
      [
        // 이전 단계 이전: 세지 않는다
        sess("2026-09-20", [{ name: "데드리프트", sets: [{ weight_kg: 100, reps: 5 }] }]),
        // 이전 단계 구간
        bench("2026-10-10", 60),
        bench("2026-10-20", 62),
        sess("2026-10-21", [{ name: "스쿼트", sets: [{ weight_kg: 80, reps: 5 }] }]),
        sess("2026-10-22", [{ name: "푸시업", type: "bodyweight", sets: [{ reps: 20 }] }]),
        // 현재 단계: 세지 않는다
        sess("2026-11-05", [{ name: "풀업", type: "bodyweight", sets: [{ reps: 8 }] }]),
      ],
      ENTRY,
      prev,
    );
    expect(r.previousStageExerciseCount).toBe(3);
  });

  it("이전 단계 진입 시각이 없으면 previousStageExerciseCount는 null", () => {
    const r = grow([bench("2026-10-20", 60)], ENTRY, null);
    expect(r.previousStageExerciseCount).toBeNull();
  });

  it("빈 입력이면 빈 목록이고 NaN이 없다", () => {
    const r = grow([], ENTRY, "2026-10-01T00:00:00.000Z");
    expect(r).toEqual({
      growths: [],
      unchangedCount: 0,
      unmatched: [],
      comparableCount: 0,
      previousStageExerciseCount: 0,
    });
  });

  it("성장 기록은 성장률 큰 순으로 정렬한다", () => {
    const r = grow(
      [
        sess("2026-10-20", [
          { name: "벤치", sets: [{ weight_kg: 60, reps: 10 }] },
          { name: "푸시업", type: "bodyweight", sets: [{ reps: 20 }] },
        ]),
        sess("2026-11-05", [
          { name: "벤치", sets: [{ weight_kg: 63, reps: 10 }] },
          { name: "푸시업", type: "bodyweight", sets: [{ reps: 30 }] },
        ]),
      ],
      ENTRY,
    );
    expect(r.growths.map((g) => g.exerciseKey)).toEqual(["푸시업", "벤치"]);
  });
});

describe("computeStageGrowth — 보강 (부동소수·경계·결정성)", () => {
  const sw = (day: string, kg: number, reps: number) =>
    sess(day, [{ name: "벤치", sets: [{ weight_kg: kg, reps }] }]);

  it("추정 1RM이 수학적으로 같은 조합(55kg×30 = 100kg×3)은 부동소수 잡음으로 성장 기록을 만들지 않는다", () => {
    const r = grow([sw("2026-10-20", 55, 30), sw("2026-11-05", 100, 3)], ENTRY);
    expect(r.growths).toEqual([]);
    expect(r.unchangedCount).toBe(1);
    // 방향을 뒤집어도 마찬가지
    const rev = grow([sw("2026-10-20", 100, 3), sw("2026-11-05", 55, 30)], ENTRY);
    expect(rev.growths).toEqual([]);
  });

  it("108kg×5 와 90kg×12 도 같은 e1RM(126)이라 성장이 아니다", () => {
    expect(grow([sw("2026-10-20", 108, 5), sw("2026-11-05", 90, 12)], ENTRY).growths).toEqual([]);
    expect(grow([sw("2026-10-20", 90, 12), sw("2026-11-05", 108, 5)], ENTRY).growths).toEqual([]);
  });

  it("진짜 성장은 여전히 잡는다 (100kg×3 → 100kg×4)", () => {
    const r = grow([sw("2026-10-20", 100, 3), sw("2026-11-05", 100, 4)], ENTRY);
    expect(r.growths).toHaveLength(1);
    expect(r.growths[0].growthPct).toBeGreaterThan(0.1);
  });

  it("이전 단계 구간은 (이전 진입, 현재 진입]: 이전 진입 시각 정각은 제외, 현재 진입 정각은 포함", () => {
    const prev = "2026-10-01T00:00:00.000Z";
    const at = (iso: string, name: string): RawSession => ({
      ...sess("2026-10-15", [{ name, sets: [{ weight_kg: 50, reps: 5 }] }]),
      completed_at: iso,
    });
    const onlyPrevEdge = grow([at(prev, "A")], ENTRY, prev);
    expect(onlyPrevEdge.previousStageExerciseCount).toBe(0);
    const justAfterPrev = grow([at("2026-10-01T00:00:01.000Z", "A")], ENTRY, prev);
    expect(justAfterPrev.previousStageExerciseCount).toBe(1);
    const onEntry = grow([at(ENTRY, "A")], ENTRY, prev);
    expect(onEntry.previousStageExerciseCount).toBe(1);
    const afterEntry = grow([at("2026-11-01T00:00:01.000Z", "A")], ENTRY, prev);
    expect(afterEntry.previousStageExerciseCount).toBe(0);
  });

  it("최고 기록이 같으면 입력 순서와 무관하게 더 이른 날을 쓴다", () => {
    const a = grow([bench("2026-10-10", 60), bench("2026-10-20", 60), bench("2026-11-05", 66), bench("2026-11-09", 66)], ENTRY);
    const b = grow([bench("2026-11-09", 66), bench("2026-11-05", 66), bench("2026-10-20", 60), bench("2026-10-10", 60)], ENTRY);
    for (const r of [a, b]) {
      expect(r.growths[0].baselineDay).toBe("2026-10-10");
      expect(r.growths[0].currentDay).toBe("2026-11-05");
    }
  });

  it("성장률이 같으면 종목 이름 오름차순, 입력 순서와 무관", () => {
    const mk = (names: string[]) =>
      grow(
        [
          sess("2026-10-20", names.map((name) => ({ name, type: "bodyweight", sets: [{ reps: 20 }] }))),
          sess("2026-11-05", names.map((name) => ({ name, type: "bodyweight", sets: [{ reps: 22 }] }))),
        ],
        ENTRY,
      ).growths.map((g) => g.exerciseKey);
    expect(mk(["다", "가", "나"])).toEqual(["가", "나", "다"]);
    expect(mk(["나", "다", "가"])).toEqual(["가", "나", "다"]);
  });
});

describe("computeStageGrowth — 비현실적 점프(+100% 초과) 제외", () => {
  const w = (day: string, kg: number, reps = 10) =>
    sess(day, [{ name: "오버헤드 프레스", sets: [{ weight_kg: kg, reps }] }]);

  it("상한 상수는 100", () => {
    expect(MAX_PLAUSIBLE_GROWTH_PCT).toBe(100);
  });

  it("정확히 +100%(20kg → 40kg, 같은 반복)는 성장 기록이다", () => {
    const r = grow([w("2026-10-20", 20), w("2026-11-05", 40)], ENTRY);
    expect(r.growths).toHaveLength(1);
    expect(r.growths[0].growthPct).toBeCloseTo(100, 9);
    expect(r.unmatched).toEqual([]);
    expect(r.comparableCount).toBe(1);
  });

  it("10kg×10 → 25kg×10 (+150%)은 기록이 아니라 jump로 비교 제외되고, 비교·변함없음 수에 들지 않는다", () => {
    const r = grow([w("2026-10-20", 10), w("2026-11-05", 25)], ENTRY);
    expect(r.growths).toEqual([]);
    expect(r.unmatched).toEqual([{ exerciseKey: "오버헤드 프레스", kind: "w", reason: "jump" }]);
    expect(r.comparableCount).toBe(0);
    expect(r.unchangedCount).toBe(0);
  });

  it("맨몸 반복 5 → 11 (+120%)도 jump", () => {
    const r = grow(
      [
        sess("2026-10-20", [{ name: "풀업", type: "bodyweight", sets: [{ reps: 5 }] }]),
        sess("2026-11-05", [{ name: "풀업", type: "bodyweight", sets: [{ reps: 11 }] }]),
      ],
      ENTRY,
    );
    expect(r.growths).toEqual([]);
    expect(r.unmatched).toEqual([{ exerciseKey: "풀업", kind: "r", reason: "jump" }]);
  });

  it("보통 성장(60 → 66)은 그대로 +10%이고 jump 종목과 섞여도 영향이 없다", () => {
    const r = grow(
      [
        bench("2026-10-20", 60),
        bench("2026-11-05", 66),
        w("2026-10-20", 10),
        w("2026-11-05", 25),
      ],
      ENTRY,
    );
    expect(r.growths.map((g) => g.exerciseKey)).toEqual(["벤치"]);
    expect(r.growths[0].growthPct).toBeCloseTo(10, 9);
    expect(r.comparableCount).toBe(1);
    expect(r.unmatched.map((u) => u.reason)).toEqual(["jump"]);
  });

  it("비교 불가 사유: 진입 전 기록이 없으면 no_baseline", () => {
    const r = grow([w("2026-11-05", 25)], ENTRY);
    expect(r.unmatched).toEqual([{ exerciseKey: "오버헤드 프레스", kind: "w", reason: "no_baseline" }]);
  });

  it("다음 단계 진입 때 25kg이 새 기준선이 되어, 27.5kg×10은 +10% 성장 기록", () => {
    const sessions = [w("2026-10-20", 10), w("2026-11-05", 25), w("2026-11-20", 27.5)];
    const stage1 = grow(sessions, ENTRY);
    expect(stage1.growths).toEqual([]); // 27.5 vs 10 = +175% → 여전히 jump
    expect(stage1.unmatched[0].reason).toBe("jump");
    const stage2 = grow(sessions, "2026-11-10T00:00:00.000Z", ENTRY);
    expect(stage2.unmatched).toEqual([]);
    expect(stage2.growths).toHaveLength(1);
    expect(stage2.growths[0].baselineBest.weight).toBe(25);
    expect(stage2.growths[0].growthPct).toBeCloseTo(10, 9);
  });
});
