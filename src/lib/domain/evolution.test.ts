import { describe, expect, it } from "vitest";
import {
  evaluateEvolution,
  daysBetween,
  type GrowthSummary,
} from "./evolution";
import { computeGrowth, median, type GrowthRecord } from "./evolution-growth";

const TODAY = "2026-11-06";
const NO_GROWTH: GrowthSummary = { measuredCount: 0, baselineCount: 0, value: null };
const growth = (value: number | null, baselineCount = 3): GrowthSummary => ({
  measuredCount: value === null ? 0 : 3,
  baselineCount,
  value,
});

/** today에서 offset일 전 날짜 키 */
function ago(n: number): string {
  const d = new Date(Date.UTC(2026, 10, 6) - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}
/** 오래전부터 n일 운동 (매 2일마다) */
function days(n: number, startAgo: number): string[] {
  return Array.from({ length: n }, (_, i) => ago(startAgo - i * 2));
}

const XP_FOR = { lv6: 1000, lv11: 3000, lv16: 6000, lv21: 10000, lv26: 15000, lv31: 21000 };

function cond(s: ReturnType<typeof evaluateEvolution>, key: string) {
  return s.conditions.find((c) => c.key === key)!;
}

describe("daysBetween", () => {
  it("달력 일수로 센다 (월·연 경계)", () => {
    expect(daysBetween("2026-10-31", "2026-11-01")).toBe(1);
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
    expect(daysBetween("2026-11-06", "2026-11-06")).toBe(0);
  });
});

describe("evaluateEvolution — 3중 조건", () => {
  it("XP 충분, 운동일수 부족 → 진화 불가", () => {
    const s = evaluateEvolution({
      totalXp: XP_FOR.lv6, currentStage: 1, today: TODAY,
      workoutDays: days(5, 40), growth: NO_GROWTH,
    });
    expect(cond(s, "xp").met).toBe(true);
    expect(cond(s, "days").met).toBe(false);
    expect(s.allMet).toBe(false);
  });

  it("XP 충분, 기간 부족 → 진화 불가 (6일 운동이지만 첫 운동이 1주 전)", () => {
    const s = evaluateEvolution({
      totalXp: XP_FOR.lv6, currentStage: 1, today: TODAY,
      workoutDays: [ago(7), ago(6), ago(5), ago(4), ago(3), ago(2)], growth: NO_GROWTH,
    });
    expect(cond(s, "days").met).toBe(true);
    expect(cond(s, "weeks").met).toBe(false);
    expect(s.allMet).toBe(false);
  });

  it("2단계는 성장 조건이 없다 — XP·6일·2주면 진화", () => {
    const s = evaluateEvolution({
      totalXp: XP_FOR.lv6, currentStage: 1, today: TODAY,
      workoutDays: [ago(16), ago(14), ago(12), ago(10), ago(8), ago(6)], growth: NO_GROWTH,
    });
    expect(s.nextStage).toBe(2);
    expect(s.conditions.map((c) => c.key)).toEqual(["xp", "days", "weeks"]);
    expect(s.allMet).toBe(true);
  });

  it("운동일수 충분, 성장률 부족 → 진화 불가 (측정됐으므로 우회 불가)", () => {
    const s = evaluateEvolution({
      totalXp: XP_FOR.lv16, currentStage: 3, today: TODAY,
      workoutDays: days(40, 200), growth: growth(3.2),
    });
    expect(cond(s, "days").met).toBe(true);
    expect(cond(s, "weeks").met).toBe(true);
    expect(cond(s, "growth").met).toBe(false);
    expect(cond(s, "days").altPath).toBe(false);
    expect(s.allMet).toBe(false);
  });

  it("모든 조건 충족 → 진화 가능 (4단계: +5% 경계값 포함)", () => {
    const s = evaluateEvolution({
      totalXp: XP_FOR.lv16, currentStage: 3, today: TODAY,
      workoutDays: days(36, 200), growth: growth(5),
    });
    expect(s.nextStage).toBe(4);
    expect(s.allMet).toBe(true);
  });

  it("측정 불가 + 운동일 1.5배 → 대체 경로로 진화 가능", () => {
    const s = evaluateEvolution({
      totalXp: XP_FOR.lv16, currentStage: 3, today: TODAY,
      workoutDays: days(54, 200), growth: NO_GROWTH,
    });
    expect(cond(s, "days").required).toBe(54);
    expect(cond(s, "days").altPath).toBe(true);
    expect(cond(s, "growth").preparing).toBe(true);
    expect(s.allMet).toBe(true);
  });

  it("측정 불가여도 1.5배에 모자라면 진화 불가", () => {
    const s = evaluateEvolution({
      totalXp: XP_FOR.lv16, currentStage: 3, today: TODAY,
      workoutDays: days(53, 200), growth: NO_GROWTH,
    });
    expect(s.allMet).toBe(false);
  });

  it("성장률 미달 + 운동일 1.5배 → 대체 경로로 우회 불가", () => {
    const s = evaluateEvolution({
      totalXp: XP_FOR.lv16, currentStage: 3, today: TODAY,
      workoutDays: days(60, 300), growth: growth(1),
    });
    expect(cond(s, "days").altPath).toBe(false);
    expect(cond(s, "days").required).toBe(36);
    expect(s.allMet).toBe(false);
  });

  it("6단계 — 최근 28일 운동이 8일 미만이면 진화 불가, 8일이면 가능", () => {
    const old = days(100, 300).filter((d) => daysBetween(d, TODAY) >= 28);
    const base = {
      totalXp: XP_FOR.lv26, currentStage: 5, today: TODAY, growth: growth(12),
    };
    const few = evaluateEvolution({
      ...base, workoutDays: [...old, ...Array.from({ length: 7 }, (_, i) => ago(i * 3))],
    });
    expect(cond(few, "recent").current).toBe(7);
    expect(few.allMet).toBe(false);
    const ok = evaluateEvolution({
      ...base, workoutDays: [...old, ...Array.from({ length: 8 }, (_, i) => ago(i * 3))],
    });
    expect(cond(ok, "recent").met).toBe(true);
    expect(ok.allMet).toBe(true);
  });

  it("7단계 — 최근 42일 12일 미만이면 진화 불가", () => {
    const old = days(160, 400).filter((d) => daysBetween(d, TODAY) >= 42);
    const s = evaluateEvolution({
      totalXp: XP_FOR.lv31, currentStage: 6, today: TODAY, growth: growth(15),
      workoutDays: [...old, ...Array.from({ length: 11 }, (_, i) => ago(i * 3))],
    });
    expect(cond(s, "recent").required).toBe(12);
    expect(s.allMet).toBe(false);
  });

  it("같은 날 여러 번 기록해도 운동일은 1일", () => {
    const s = evaluateEvolution({
      totalXp: XP_FOR.lv6, currentStage: 1, today: TODAY,
      workoutDays: [ago(20), ago(20), ago(20), ago(20), ago(20), ago(20)], growth: NO_GROWTH,
    });
    expect(cond(s, "days").current).toBe(1);
  });

  it("XP만 쌓이면(운동 기록 없음) 진화하지 않는다", () => {
    const s = evaluateEvolution({
      totalXp: XP_FOR.lv31, currentStage: 6, today: TODAY, workoutDays: [], growth: NO_GROWTH,
    });
    expect(cond(s, "xp").met).toBe(true);
    expect(s.allMet).toBe(false);
  });

  it("3단계는 기준선만 요구한다 — 기준선 없으면 '측정 준비 중'", () => {
    const s = evaluateEvolution({
      totalXp: XP_FOR.lv11, currentStage: 2, today: TODAY,
      workoutDays: days(18, 100), growth: growth(null, 0),
    });
    expect(cond(s, "growth").preparing).toBe(true);
    // 기준선 없음 → 대체 경로(27일)가 적용돼 18일로는 부족
    expect(cond(s, "days").required).toBe(27);
    expect(s.allMet).toBe(false);
  });

  it("최종 7단계는 다음 진화가 없다", () => {
    const s = evaluateEvolution({
      totalXp: 26000, currentStage: 7, today: TODAY, workoutDays: days(200, 500), growth: growth(20),
    });
    expect(s.nextStage).toBeNull();
    expect(s.conditions).toEqual([]);
  });

  it("미래 날짜 기록은 세지 않는다", () => {
    const s = evaluateEvolution({
      totalXp: XP_FOR.lv6, currentStage: 1, today: TODAY,
      workoutDays: ["2026-11-20", "2026-11-21"], growth: NO_GROWTH,
    });
    expect(cond(s, "days").current).toBe(0);
  });
});

describe("computeGrowth — 개인 성장률", () => {
  const set = (w: number, r: number) => ({ weight_kg: w, reps: r, duration_seconds: null });
  function series(name: string, ws: number[], r = 5): GrowthRecord[] {
    return ws.map((w, i) => ({
      exercise: name,
      day: `2026-10-${String(10 + i).padStart(2, "0")}`,
      sets: [set(w, r)],
    }));
  }

  it("median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("초기 3 vs 최근 3의 중앙값으로 종목별 성장률을 구하고, 종목들의 중앙값을 쓴다", () => {
    const g = computeGrowth([
      ...series("벤치", [60, 60, 60, 63, 63, 63]), // +5%
      ...series("스쿼트", [100, 100, 100, 110, 110, 110]), // +10%
    ]);
    expect(g.measuredCount).toBe(2);
    expect(g.value).toBeCloseTo(7.5, 5);
  });

  it("한 번의 반짝 최고 기록으로는 성장하지 않는다 (중앙값)", () => {
    const g = computeGrowth([
      ...series("벤치", [60, 60, 60, 60, 60, 100]),
      ...series("스쿼트", [100, 100, 100, 100, 100, 100]),
    ]);
    expect(g.value).toBeCloseTo(0, 5);
  });

  it("종목별 성장률은 +30%로 막는다", () => {
    const g = computeGrowth([
      ...series("벤치", [10, 10, 10, 50, 50, 50]),
      ...series("스쿼트", [10, 10, 10, 50, 50, 50]),
    ]);
    expect(g.value).toBe(30);
  });

  it("측정 가능한 종목이 1개뿐이면 '측정 준비 중'(null)", () => {
    const g = computeGrowth(series("벤치", [60, 60, 60, 66, 66, 66]));
    expect(g.measuredCount).toBe(1);
    expect(g.value).toBeNull();
    expect(g.baselineCount).toBe(1);
  });

  it("기록일이 6일 미만이면 비교하지 않는다", () => {
    const g = computeGrowth(series("벤치", [60, 60, 60, 66, 66]));
    expect(g.measuredCount).toBe(0);
    expect(g.baselineCount).toBe(1);
  });

  it("같은 날 여러 번 기록은 하루 최고치 1개로 접는다", () => {
    const recs = series("벤치", [60, 60, 60, 66, 66, 66]);
    recs.push({ exercise: "벤치", day: "2026-10-10", sets: [set(1, 1)] });
    const g = computeGrowth([...recs, ...series("스쿼트", [100, 100, 100, 110, 110, 110])]);
    expect(g.measuredCount).toBe(2);
  });

  it("'지금 내 수준'은 마지막 날이 아니라 최근 3번의 가운데 기록이다 (가벼운 날 방지)", () => {
    // 마지막 날만 가볍게(50kg) 했어도 지금 수준은 가운데 기록(70kg)
    const g = computeGrowth([
      ...series("벤치", [60, 60, 60, 70, 70, 50]),
      ...series("스쿼트", [100, 100, 100, 110, 110, 110]),
    ]);
    const bench = g.exercises!.find((e) => e.exercise === "벤치")!;
    expect(bench.last.weight).toBe(70);
    expect(bench.last.reps).toBe(5);
  });

  it("종목별 상세(기록일 수·성장률)를 함께 돌려준다", () => {
    const g = computeGrowth([
      ...series("벤치", [60, 60, 60, 63, 63, 63]),
      ...series("풀업", [1, 1, 1], 5),
    ]);
    const bench = g.exercises!.find((e) => e.exercise === "벤치")!;
    expect(bench.dayCount).toBe(6);
    expect(bench.growthPct).toBeCloseTo(5, 5);
    const pull = g.exercises!.find((e) => e.exercise === "풀업")!;
    expect(pull.dayCount).toBe(3);
    expect(pull.growthPct).toBeNull();
  });

  it("거리 기록·빈 세트는 제외한다", () => {
    const g = computeGrowth([
      { exercise: "러닝", day: "2026-10-10", sets: [{ weight_kg: null, reps: null, duration_seconds: null }] },
    ]);
    expect(g.baselineCount).toBe(0);
  });

  it("맨몸 반복·시간 유지는 종목 안에서 따로 비교한다", () => {
    const reps = ["a", "b", "c", "d", "e", "f"].map((_, i) => ({
      exercise: "푸시업", day: `2026-10-${10 + i}`,
      sets: [{ weight_kg: null, reps: i < 3 ? 20 : 25, duration_seconds: null }],
    }));
    const hold = ["a", "b", "c", "d", "e", "f"].map((_, i) => ({
      exercise: "플랭크", day: `2026-10-${10 + i}`,
      sets: [{ weight_kg: null, reps: null, duration_seconds: i < 3 ? 60 : 72 }],
    }));
    const g = computeGrowth([...reps, ...hold]);
    expect(g.measuredCount).toBe(2);
    expect(g.value).toBeCloseTo(22.5, 5); // (+25% , +20%) 중앙값
  });
});
