import { describe, expect, it } from "vitest";
import { exerciseTip, growthTips } from "./evolution-guidance";
import type { ExerciseGrowth, GrowthSummary } from "./evolution";

const e1 = (w: number, r: number) => w * (1 + r / 30);

function ex(over: Partial<ExerciseGrowth>): ExerciseGrowth {
  return {
    exercise: "벤치프레스", kind: "w", dayCount: 8,
    base: e1(60, 8), recent: e1(60, 8) * 1.05, growthPct: 5,
    last: { weight: 63, reps: 8, seconds: null }, ...over,
  };
}

describe("exerciseTip — 몇 kg·몇 번", () => {
  it("중량 운동: 같은 횟수로 몇 kg, 또는 같은 무게로 몇 번", () => {
    // 처음 60kg×8회(e1RM 76) → +8% 목표 = 82.08. 지금 63kg×8회
    const t = exerciseTip(ex({}), 8)!;
    // 82.08 / (1+8/30) = 64.8 → 0.5kg 올림 65kg
    expect(t).toContain("벤치프레스: 지금 63kg 8번 → 다음엔 65kg 8번");
    // 같은 63kg로는 30*(82.08/63 - 1) = 9.1 → 10번
    expect(t).toContain("(또는 63kg 10번)");
  });

  it("무게를 0.5kg 단위로 올림한다 (목표에 모자라지 않게)", () => {
    const t = exerciseTip(ex({ base: e1(50, 10), last: { weight: 50, reps: 10, seconds: null } }), 10)!;
    // 목표 e1RM = 66.67×1.1 = 73.33 → /1.3333 = 55.0 → 55kg
    expect(t).toContain("다음엔 55kg 10번");
  });

  it("이미 목표 수준이면 '충분해요, 3번 중 2번만'이라고 말한다", () => {
    const t = exerciseTip(ex({ last: { weight: 70, reps: 8, seconds: null } }), 8)!;
    expect(t).toContain("지금 70kg 8번이면 충분해요. 최근 3번 중 2번만 이만큼 하면 점수가 올라가요");
  });

  it("맨몸 반복: 목표 횟수", () => {
    const t = exerciseTip(
      { exercise: "푸시업", kind: "r", dayCount: 7, base: 20, recent: 21, growthPct: 5, last: { weight: null, reps: 21, seconds: null } },
      12,
    )!;
    expect(t).toBe("푸시업: 지금 21번 → 23번 하기"); // 20×1.12 = 22.4 → 23
  });

  it("시간 유지: 목표 초", () => {
    const t = exerciseTip(
      { exercise: "플랭크", kind: "t", dayCount: 7, base: 60, recent: 63, growthPct: 5, last: { weight: null, reps: null, seconds: 63 } },
      15,
    )!;
    expect(t).toBe("플랭크: 지금 63초 → 69초 버티기");
  });

  it("마지막 세트 정보가 없으면 지침을 만들지 않는다", () => {
    expect(exerciseTip(ex({ last: { weight: null, reps: null, seconds: null } }), 8)).toBeNull();
  });
});

describe("growthTips", () => {
  it("과반이 목표를 넘어야 하므로 목표에 가까운 종목부터 필요한 개수만큼", () => {
    // 3종목: 7%, 4%, 1% — 중앙값 4% → 목표 8%엔 과반(2개)이 필요, 이미 0개 → 2개 안내
    const list = [
      ex({ exercise: "A", growthPct: 7, recent: e1(60, 8) * 1.07 }),
      ex({ exercise: "B", growthPct: 4, recent: e1(60, 8) * 1.04 }),
      ex({ exercise: "C", growthPct: 1, recent: e1(60, 8) * 1.01 }),
    ];
    const g: GrowthSummary = { measuredCount: 3, baselineCount: 3, value: 4, exercises: list };
    const tips = growthTips(g, 8);
    expect(tips).toHaveLength(2);
    expect(tips[0].startsWith("A:")).toBe(true); // 가장 가까운 종목 먼저
    expect(tips[1].startsWith("B:")).toBe(true);
  });

  it("이미 목표를 넘은 종목은 빼고, 남은 필요 개수만 안내한다", () => {
    const list = [
      ex({ exercise: "A", growthPct: 9, recent: e1(60, 8) * 1.09 }),
      ex({ exercise: "B", growthPct: 4, recent: e1(60, 8) * 1.04 }),
      ex({ exercise: "C", growthPct: 1, recent: e1(60, 8) * 1.01 }),
    ];
    const tips = growthTips({ measuredCount: 3, baselineCount: 3, value: 4, exercises: list }, 8);
    expect(tips).toHaveLength(1); // 과반 2개 필요 − 이미 1개 = 1개
    expect(tips[0].startsWith("B:")).toBe(true);
  });

  it("최대 3개까지만 보여 준다", () => {
    const list = Array.from({ length: 9 }, (_, i) =>
      ex({ exercise: `E${i}`, growthPct: 1, recent: e1(60, 8) * 1.01 }),
    );
    const tips = growthTips({ measuredCount: 9, baselineCount: 9, value: 1, exercises: list }, 8);
    expect(tips).toHaveLength(3);
  });

  it("못 재는 경우: 몇 번 더 기록하면 되는지 (기록 많은 종목 먼저)", () => {
    const list = [
      ex({ exercise: "스쿼트", dayCount: 3, growthPct: null }),
      ex({ exercise: "벤치프레스", dayCount: 5, growthPct: null }),
    ];
    const tips = growthTips({ measuredCount: 0, baselineCount: 2, value: null, exercises: list }, 5);
    expect(tips[0]).toBe("벤치프레스: 5번 기록했어요 → 1번만 더 하면 잴 수 있어요");
    expect(tips[1]).toBe("스쿼트: 3번 기록했어요 → 3번만 더 하면 잴 수 있어요");
  });

  it("기록이 전혀 없으면 예시 운동을 알려 준다", () => {
    expect(growthTips({ measuredCount: 0, baselineCount: 0, value: null, exercises: [] }, 5)[0]).toContain(
      "같은 운동(예: 벤치프레스)을 6번 기록",
    );
    expect(growthTips({ measuredCount: 0, baselineCount: 0, value: null, exercises: [] }, 0)[0]).toContain(
      "3번만 기록",
    );
  });
});
