import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEEKLY_DAYS,
  DETAIL_CATEGORIES,
  DETAIL_METRICS,
  MAX_DETAIL_GOALS,
  WEEK_LABELS,
  WEEKLY_DAY_CHOICES,
  buildGoalDrafts,
  detailDefaults,
  detailGoalText,
  perSessionHint,
  splitGoalsForEdit,
  weekPreview,
} from "./challenge-simple-goal";

const FOUR_WEEKS = 28;

describe("buildGoalDrafts — 기본 목표 (주 N회)", () => {
  it("주 3회만 고르면 workout_days 한 줄이 생긴다", () => {
    const r = buildGoalDrafts({ weeklyDays: 3, periodDays: FOUR_WEEKS, details: [] });
    expect(r).toEqual({
      ok: true,
      goals: [{ type: "workout_days", target: 12, qualifier: null }],
      plannedDays: 3,
    });
  });

  it("목표값은 계획일수 계산값이다 — 사용자가 기간 총량을 계산하지 않는다", () => {
    const r = buildGoalDrafts({ weeklyDays: 4, periodDays: 30, details: [] });
    // plannedDaysForPeriod(4, 30) = round(120/7) = 17
    expect(r.ok && r.goals[0].target).toBe(17);
  });

  it("세부 목표 0개여도 저장할 수 있다 — 세부 목표는 완전히 선택이다", () => {
    expect(buildGoalDrafts({ weeklyDays: 2, periodDays: 14, details: [] }).ok).toBe(true);
  });

  it("주 1~7회 밖은 거부한다", () => {
    expect(buildGoalDrafts({ weeklyDays: 0, periodDays: 28, details: [] })).toEqual({
      ok: false,
      reason: "weekly_out_of_range",
    });
    expect(buildGoalDrafts({ weeklyDays: 8, periodDays: 28, details: [] }).ok).toBe(false);
    expect(buildGoalDrafts({ weeklyDays: 2.5, periodDays: 28, details: [] }).ok).toBe(false);
  });
});

describe("buildGoalDrafts — 세부 목표", () => {
  it("workout_days + volume을 함께 만든다 — 주 12,000kg는 4주에 48,000kg", () => {
    const r = buildGoalDrafts({
      weeklyDays: 3,
      periodDays: FOUR_WEEKS,
      details: [{ type: "volume", perWeek: 12000 }],
    });
    expect(r).toEqual({
      ok: true,
      goals: [
        { type: "workout_days", target: 12, qualifier: null },
        { type: "volume", target: 48000, qualifier: null },
      ],
      plannedDays: 3,
    });
  });

  it("workout_days + cardio_distance를 함께 만든다 — 주 10km는 4주에 40km", () => {
    const r = buildGoalDrafts({
      weeklyDays: 3,
      periodDays: FOUR_WEEKS,
      details: [{ type: "cardio_distance", perWeek: 10 }],
    });
    expect(r.ok && r.goals[1]).toEqual({ type: "cardio_distance", target: 40, qualifier: null });
  });

  it("일수형은 주 N일을 기간 일수로 바꾸고 하루 최소 종목 수를 싣는다", () => {
    const r = buildGoalDrafts({
      weeklyDays: 3,
      periodDays: FOUR_WEEKS,
      details: [{ type: "weight_days", perWeek: 2, qualifier: 1 }],
    });
    expect(r.ok && r.goals[1]).toEqual({ type: "weight_days", target: 8, qualifier: 1 });
  });

  it("일수형의 하루 최소 종목 수 기본값은 1이다 (D5)", () => {
    const r = buildGoalDrafts({
      weeklyDays: 3,
      periodDays: FOUR_WEEKS,
      details: [{ type: "bodyweight_days", perWeek: 2 }],
    });
    expect(r.ok && r.goals[1].qualifier).toBe(1);
  });

  it(`세부 목표는 ${MAX_DETAIL_GOALS}개까지 — 기본 1 + 세부 2 = 완료 보너스 상한 3`, () => {
    const r = buildGoalDrafts({
      weeklyDays: 3,
      periodDays: FOUR_WEEKS,
      details: [
        { type: "volume", perWeek: 12000 },
        { type: "cardio_distance", perWeek: 10 },
        { type: "bodyweight_reps", perWeek: 100 },
      ],
    });
    expect(r).toEqual({ ok: false, reason: "too_many_details" });
  });

  it("같은 지표를 두 번 넣으면 거부한다 — DB가 (사람·챌린지·지표)로 유일하다", () => {
    const r = buildGoalDrafts({
      weeklyDays: 3,
      periodDays: FOUR_WEEKS,
      details: [
        { type: "cardio_distance", perWeek: 10 },
        { type: "cardio_distance", perWeek: 5 },
      ],
    });
    expect(r).toEqual({ ok: false, reason: "duplicate_metric" });
  });

  it("0이 되는 세부 목표는 거부한다", () => {
    const r = buildGoalDrafts({
      weeklyDays: 3,
      periodDays: FOUR_WEEKS,
      details: [{ type: "cardio_distance", perWeek: 0 }],
    });
    expect(r).toEqual({ ok: false, reason: "non_positive_target" });
  });

  it("모든 줄의 planned_days는 같은 값 하나다 — 기본 목표의 주 N회", () => {
    const r = buildGoalDrafts({
      weeklyDays: 5,
      periodDays: FOUR_WEEKS,
      details: [{ type: "cardio_time", perWeek: 120 }],
    });
    expect(r.ok && r.plannedDays).toBe(5);
  });

  it("세부 목표의 주간 값은 planned_days를 건드리지 않는다 — 참여율 분모는 기본 목표 하나", () => {
    const a = buildGoalDrafts({
      weeklyDays: 3,
      periodDays: FOUR_WEEKS,
      details: [{ type: "weight_days", perWeek: 6 }],
    });
    expect(a.ok && a.plannedDays).toBe(3);
  });
});

describe("splitGoalsForEdit — 저장된 목표 → 화면 상태", () => {
  const row = (goal_type: string, target_value: number, planned_days = 3, qualifier: number | null = null) => ({
    goal_type: goal_type as never,
    target_value,
    planned_days,
    qualifier,
  });

  it("기본 목표와 세부 목표를 가른다", () => {
    const s = splitGoalsForEdit(
      [row("workout_days", 12), row("volume", 48000), row("cardio_distance", 40)],
      FOUR_WEEKS,
    );
    expect(s).toEqual({
      weeklyDays: 3,
      details: [
        { type: "volume", perWeek: 12000, qualifier: null },
        { type: "cardio_distance", perWeek: 10, qualifier: null },
      ],
      hasBasic: true,
    });
  });

  it("옛 목표(workout_days 없음)도 그대로 세부 목표로 보여준다 — 과거 데이터를 버리지 않는다", () => {
    const s = splitGoalsForEdit([row("weight_days", 12, 5, 3)], FOUR_WEEKS);
    expect(s).toEqual({
      weeklyDays: 5,
      details: [{ type: "weight_days", perWeek: 3, qualifier: 3 }],
      hasBasic: false,
    });
  });

  it("목표가 없으면 기본값(주 3회, 세부 없음)", () => {
    expect(splitGoalsForEdit([], FOUR_WEEKS)).toEqual({
      weeklyDays: DEFAULT_WEEKLY_DAYS,
      details: [],
      hasBasic: false,
    });
  });

  it("split → build를 거치면 같은 목표가 다시 나온다 (왕복 불변)", () => {
    const stored = [row("workout_days", 12), row("cardio_distance", 40)];
    const s = splitGoalsForEdit(stored, FOUR_WEEKS);
    const r = buildGoalDrafts({ weeklyDays: s.weeklyDays, periodDays: FOUR_WEEKS, details: s.details });
    expect(r.ok && r.goals.map((g) => [g.type, g.target])).toEqual([
      ["workout_days", 12],
      ["cardio_distance", 40],
    ]);
  });
});

describe("선택지 — 실제 GoalType과 데이터 모델에 맞춘다", () => {
  it("기본 선택지는 주 2·3·4회, 추천은 3회", () => {
    expect(WEEKLY_DAY_CHOICES).toEqual([2, 3, 4]);
    expect(DEFAULT_WEEKLY_DAYS).toBe(3);
  });

  it("러닝과 걷기는 한 분류다 — 운동 데이터가 둘을 가르지 않는다", () => {
    const labels = DETAIL_CATEGORIES.map((c) => c.label);
    expect(labels).toEqual(["웨이트", "유산소", "맨몸운동", "인터벌"]);
    expect(DETAIL_CATEGORIES.find((c) => c.key === "cardio")?.sub).toBe("러닝·걷기");
  });

  it("웨이트: 운동 횟수 · 총 운동량 · 운동 일수", () => {
    expect(DETAIL_METRICS.weight.map((m) => [m.type, m.label])).toEqual([
      ["weight_reps", "운동 횟수"],
      ["volume", "총 운동량"],
      ["weight_days", "운동 일수"],
    ]);
  });

  it("세부 지표에 workout_days는 없다 — 기본 목표 자리가 따로 있다", () => {
    const all = Object.values(DETAIL_METRICS).flat().map((m) => m.type);
    expect(all).not.toContain("workout_days");
    expect(new Set(all).size).toBe(all.length);
  });

  it("인터벌은 tabata_count, 화면에 '타바타'라는 말은 없다", () => {
    expect(DETAIL_METRICS.interval.map((m) => m.type)).toEqual(["tabata_count"]);
    const text = JSON.stringify([DETAIL_CATEGORIES, DETAIL_METRICS]);
    expect(text).not.toContain("타바타");
  });

  it("모든 세부 지표에 기본 주간 값과 증감 단위가 있다", () => {
    for (const m of Object.values(DETAIL_METRICS).flat()) {
      const d = detailDefaults(m.type);
      expect(d.perWeek).toBeGreaterThan(0);
      expect(d.step).toBeGreaterThan(0);
    }
  });
});

describe("detailGoalText · perSessionHint — 화면 글자", () => {
  it("웨이트 총 운동량 · 주 12,000kg", () => {
    expect(detailGoalText({ type: "volume", perWeek: 12000 })).toEqual({
      title: "웨이트 총 운동량",
      value: "주 12,000kg",
    });
  });

  it("인터벌은 이름이 겹치지 않는다", () => {
    expect(detailGoalText({ type: "tabata_count", perWeek: 3 }).title).toBe("인터벌 횟수");
  });

  it("일수형은 주 N일과 하루 최소 종목을 같이 말한다", () => {
    expect(detailGoalText({ type: "weight_days", perWeek: 2, qualifier: 1 }).value).toBe(
      "주 2일 · 하루 1종목 이상",
    );
  });

  it("주 3회 기준 1회 약 4,000kg", () => {
    expect(perSessionHint({ type: "volume", perWeek: 12000 }, 3)).toBe(
      "주 3회 기준 1회 약 4,000kg",
    );
  });

  it("거리는 소수 첫째 자리, 일수형은 힌트가 없다", () => {
    expect(perSessionHint({ type: "cardio_distance", perWeek: 10 }, 3)).toBe(
      "주 3회 기준 1회 약 3.3km",
    );
    expect(perSessionHint({ type: "weight_days", perWeek: 2 }, 3)).toBeNull();
  });
});

describe("weekPreview — 시안 ④ 진행 예시", () => {
  it("주 3회는 시안 그대로 2 / 3 · 월·화가 채워진다", () => {
    const p = weekPreview(3);
    expect(p.done).toBe(2);
    expect(p.target).toBe(3);
    expect(p.days).toEqual([true, true, false, false, false, false, false]);
  });

  it("칸은 항상 7개다 — 주 N회가 몇이든 한 주를 그린다", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      expect(weekPreview(n).days).toHaveLength(7);
    }
  });

  it("채워진 칸은 항상 목표보다 하나 적다 — 문구가 참이어야 한다", () => {
    for (const n of [1, 2, 3, 4, 7]) {
      const p = weekPreview(n);
      expect(p.done).toBe(n - 1);
      expect(p.days.filter(Boolean)).toHaveLength(n - 1);
    }
  });

  it("주 1회는 0 / 1이고 '한 번만 하면'으로 말한다 ('더'가 붙으면 거짓말이다)", () => {
    const p = weekPreview(1);
    expect(p.done).toBe(0);
    expect(p.caption).toBe("한 번만 하면 이번 주 목표 달성!");
    expect(p.days.some(Boolean)).toBe(false);
  });

  it("그 밖에는 '한 번만 더 하면'", () => {
    expect(weekPreview(3).caption).toBe("한 번만 더 하면 이번 주 목표 달성!");
  });

  it("범위를 벗어난 값도 1~7로 눕힌다 (직접 설정이 새는 것을 막는다)", () => {
    expect(weekPreview(0).target).toBe(1);
    expect(weekPreview(-5).target).toBe(1);
    expect(weekPreview(99).target).toBe(7);
    expect(weekPreview(99).days.filter(Boolean)).toHaveLength(6);
  });

  it("요일 이름은 월요일부터다 (시안 순서)", () => {
    expect(WEEK_LABELS).toEqual(["월", "화", "수", "목", "금", "토", "일"]);
  });
});
