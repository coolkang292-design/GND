import { describe, expect, it } from "vitest";
import { toMetricPoints, type RawSession, type RawSet } from "./level-growth";

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
