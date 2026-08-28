import { describe, expect, it } from "vitest";
import {
  RECOMMENDED_HOLD_SECONDS,
  RECOMMENDED_REPS,
  RECOMMENDED_SET_COUNT,
  defaultSetupPlan,
  isTimeMeasured,
  planFromSets,
  planToSets,
  summarizePlan,
} from "./recommended-sets";
import { defaultSets } from "@/lib/workout";

describe("defaultSetupPlan — 추천 기본값 (사용자 지시 2026-08-06)", () => {
  it("웨이트는 3세트 · 10회 · 무게 0(운동 중 입력)", () => {
    expect(defaultSetupPlan("weight", null)).toEqual({
      sets: 3,
      amount: 10,
      weightKg: 0,
    });
  });

  it("맨몸 횟수형도 3세트 · 10회", () => {
    expect(defaultSetupPlan("bodyweight", "reps")).toEqual({
      sets: 3,
      amount: 10,
      weightKg: 0,
    });
  });

  it("맨몸 시간형은 회가 아니라 **초**다", () => {
    // "10회 플랭크"는 뜻이 없다. 카탈로그에 시간형이 실제로 있다
    // (플랭크·매달리기·월 싯·핸드스탠드…).
    expect(defaultSetupPlan("bodyweight", "time")).toEqual({
      sets: 3,
      amount: RECOMMENDED_HOLD_SECONDS,
      weightKg: 0,
    });
  });

  /**
   * ⚠️ 2026-08-28에 `1분` → `30초`로 내렸다. 기본값이 1분이면 매달리기를 담는
   * 순간부터 웬만한 사람이 못 채울 목표가 서 있었다.
   */
  it("시간형 기본 목표는 30초다 — 1분으로 되돌리지 마라", () => {
    expect(RECOMMENDED_HOLD_SECONDS).toBe(30);
  });

  it("유산소는 1세트이고 거리·시간을 미리 정하지 않는다", () => {
    expect(defaultSetupPlan("cardio", null)).toEqual({
      sets: 1,
      amount: 0,
      weightKg: 0,
    });
  });

  it("상수를 박지 않고 상수에서 읽는다", () => {
    const plan = defaultSetupPlan("weight", null);
    expect(plan.sets).toBe(RECOMMENDED_SET_COUNT);
    expect(plan.amount).toBe(RECOMMENDED_REPS);
  });

  it("⚠️ defaultSets(검색 경로)는 건드리지 않았다", () => {
    // 추천 기본값이 검색으로 담는 경로까지 바꾸면 요구에 없는 변경이다.
    // 검색 경로는 예전대로 1세트다.
    expect(defaultSets("weight", null)).toHaveLength(1);
    expect(defaultSets("weight", null)[0].weightKg).toBe(20);
  });
});

describe("planToSets", () => {
  it("세트 수만큼 행을 만든다", () => {
    const sets = planToSets("weight", null, {
      sets: 3,
      amount: 10,
      weightKg: 0,
    });
    expect(sets).toHaveLength(3);
    expect(sets.every((s) => s.reps === 10 && s.weightKg === 0)).toBe(true);
  });

  it("각 세트가 서로 다른 key를 갖는다 (입력 리마운트용)", () => {
    const sets = planToSets("weight", null, { sets: 3, amount: 10, weightKg: 0 });
    expect(new Set(sets.map((s) => s.key)).size).toBe(3);
  });

  it("무게를 정했으면 그 값이 모든 세트에 실린다", () => {
    const sets = planToSets("weight", null, { sets: 2, amount: 8, weightKg: 40 });
    expect(sets.map((s) => s.weightKg)).toEqual([40, 40]);
  });

  it("시간형은 reps가 아니라 durationSec에 넣는다", () => {
    const [set] = planToSets("bodyweight", "time", {
      sets: 1,
      amount: 45,
      weightKg: 0,
    });
    expect(set.durationSec).toBe(45);
    expect(set.reps).toBe(0);
    /*
      계획 호환 필드도 같이 채운다 — 달력·루틴 JSON이 `durationMin` 키를 쓰고
      서버 RPC가 `?&`로 **존재를 검사**한다(0066·0069·0070·0073). 빼면 계획
      저장이 통째로 거부된다.
    */
    expect(set.durationMin).toBe(0.75);
  });

  it("유산소는 값 없이 빈 행이다 (운동 중 입력)", () => {
    const [set] = planToSets("cardio", null, { sets: 1, amount: 0, weightKg: 0 });
    expect(set.distanceKm).toBe(0);
    expect(set.durationMin).toBe(0);
  });

  it("세트 수가 0이어도 최소 1행은 만든다", () => {
    expect(planToSets("weight", null, { sets: 0, amount: 10, weightKg: 0 })).toHaveLength(1);
  });
});

describe("summarizePlan — 카드 한 줄 요약", () => {
  it("무게 0은 '운동 중 입력'으로 읽는다", () => {
    expect(summarizePlan("weight", null, { sets: 3, amount: 10, weightKg: 0 })).toBe(
      "3세트 · 10회 · 무게 운동 중 입력",
    );
  });

  it("무게를 정했으면 kg으로 보여준다", () => {
    expect(summarizePlan("weight", null, { sets: 4, amount: 8, weightKg: 40 })).toBe(
      "4세트 · 8회 · 40kg",
    );
  });

  it("맨몸은 무게 칸이 아예 없다", () => {
    expect(
      summarizePlan("bodyweight", "reps", { sets: 3, amount: 12, weightKg: 0 }),
    ).toBe("3세트 · 12회");
  });

  it("시간형은 회가 아니라 시간이다 — 60초 미만은 초로 읽는다", () => {
    expect(
      summarizePlan("bodyweight", "time", { sets: 3, amount: 30, weightKg: 0 }),
    ).toBe("3세트 · 30초");
    expect(
      summarizePlan("bodyweight", "time", { sets: 3, amount: 90, weightKg: 0 }),
    ).toBe("3세트 · 1분 30초");
  });

  it("유산소는 거리·시간을 운동 중 입력이라고 말한다", () => {
    expect(summarizePlan("cardio", null, { sets: 1, amount: 0, weightKg: 0 })).toBe(
      "1세트 · 거리·시간 운동 중 입력",
    );
  });
});

describe("planFromSets — 이미 담긴 세트 → 요약값", () => {
  it("세트 수와 첫 세트의 값을 읽는다", () => {
    const plan = planFromSets(
      [
        { weightKg: 0, reps: 10, durationMin: 0 },
        { weightKg: 0, reps: 10, durationMin: 0 },
        { weightKg: 0, reps: 10, durationMin: 0 },
      ],
      false,
    );
    expect(plan).toEqual({ sets: 3, amount: 10, weightKg: 0 });
  });

  it("시간형이면 durationSec을 읽는다", () => {
    const plan = planFromSets(
      [{ weightKg: 0, reps: 0, durationMin: 0.75, durationSec: 45 }],
      true,
    );
    expect(plan.amount).toBe(45);
  });

  /** 계획에서 담아 온 세트에는 초가 없다 — 분을 환산해서라도 읽어야 한다 */
  it("초가 없으면 계획의 분을 초로 환산해 읽는다", () => {
    const plan = planFromSets([{ weightKg: 0, reps: 0, durationMin: 2 }], true);
    expect(plan.amount).toBe(120);
  });

  it("세트가 없어도 던지지 않는다", () => {
    expect(planFromSets([], false)).toEqual({ sets: 0, amount: 0, weightKg: 0 });
  });

  it("추천 흐름을 왕복해도 같은 요약이 나온다", () => {
    const plan = defaultSetupPlan("weight", null);
    const sets = planToSets("weight", null, plan);
    expect(summarizePlan("weight", null, planFromSets(sets, false))).toBe(
      "3세트 · 10회 · 무게 운동 중 입력",
    );
  });
});

describe("isTimeMeasured", () => {
  it("맨몸 + time만 참이다", () => {
    expect(isTimeMeasured("bodyweight", "time")).toBe(true);
    expect(isTimeMeasured("bodyweight", "reps")).toBe(false);
    expect(isTimeMeasured("weight", "time")).toBe(false);
    expect(isTimeMeasured("cardio", null)).toBe(false);
  });
});
