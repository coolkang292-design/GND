import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEEKLY_DAYS,
  DETAIL_CATEGORIES,
  DETAIL_METRICS,
  BASIS_LABEL,
  MAX_DETAIL_GOALS,
  WEEK_LABELS,
  WEEKLY_DAY_CHOICES,
  buildGoalDrafts,
  detailDefaults,
  detailGoalText,
  perSessionHint,
  basisChoicesFor,
  defaultBasisFor,
  prefillBasisFor,
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

  it(`세부 목표는 ${MAX_DETAIL_GOALS}개까지 (사용자 결정 2026-09-18 — 기본 빼고 3개)`, () => {
    const three = buildGoalDrafts({
      weeklyDays: 3,
      periodDays: FOUR_WEEKS,
      details: [
        { type: "volume", perWeek: 12000 },
        { type: "cardio_distance", perWeek: 10 },
        { type: "bodyweight_reps", perWeek: 100 },
      ],
    });
    expect(three.ok).toBe(true);
    const four = buildGoalDrafts({
      weeklyDays: 3,
      periodDays: FOUR_WEEKS,
      details: [
        { type: "volume", perWeek: 12000 },
        { type: "cardio_distance", perWeek: 10 },
        { type: "bodyweight_reps", perWeek: 100 },
        { type: "tabata_count", perWeek: 3 },
      ],
    });
    expect(four).toEqual({ ok: false, reason: "too_many_details" });
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
        { type: "volume", perWeek: 12000, basis: "week", lockedTotal: 48000, qualifier: null },
        // 4주·주 3회에 40km는 하루로 나누면 3.333…이라 **주간으로 연다** —
        // 하루로 열면 3.3으로 잘려 다시 저장할 때 목표가 39.6km로 깎인다.
        // `lockedTotal`은 "안 고쳤으면 이 총량 그대로"라는 표시다.
        { type: "cardio_distance", perWeek: 10, basis: "week", lockedTotal: 40, qualifier: null },
      ],
      hasBasic: true,
    });
  });

  it("옛 목표(workout_days 없음)도 그대로 세부 목표로 보여준다 — 과거 데이터를 버리지 않는다", () => {
    const s = splitGoalsForEdit([row("weight_days", 12, 5, 3)], FOUR_WEEKS);
    expect(s).toEqual({
      weeklyDays: 5,
      details: [
        // 일수형은 주 N일 자체가 저장 단위라 잠글 것이 없다
        { type: "weight_days", perWeek: 3, basis: "week", lockedTotal: undefined, qualifier: 3 },
      ],
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

  it("⚠️⚠️ 어떤 기간·주 N회 조합에서도 왕복이 목표를 바꾸지 않는다", () => {
    // 편집 화면을 열었다 그대로 저장하는 것만으로 목표가 깎이면, 사용자는
    // 아무것도 안 건드렸는데 숫자가 줄어든 것을 나중에야 안다.
    for (const weekly of [1, 2, 3, 4, 5, 6, 7]) {
      for (const period of [14, 21, 28, 30, 56]) {
        for (const [type, total] of [
          ["cardio_distance", 40],
          ["cardio_distance", 17],
          ["cardio_time", 300],
          ["volume", 48000],
        ] as const) {
          const stored = [row("workout_days", 12, weekly), row(type, total, weekly)];
          const s = splitGoalsForEdit(stored, period);
          const r = buildGoalDrafts({ weeklyDays: s.weeklyDays, periodDays: period, details: s.details });
          expect(r.ok && r.goals[1].target).toBe(total);
        }
      }
    }
  });

  it("하루 기준으로 만든 목표는 하루로 다시 열린다", () => {
    // 하루 2.5km · 주 4회 · 4주 = 40km. 되돌리면 정확히 2.5라 하루로 연다.
    const s = splitGoalsForEdit(
      [row("workout_days", 16, 4), row("cardio_distance", 40, 4)],
      FOUR_WEEKS,
    );
    expect(s.details[0]).toEqual({
      type: "cardio_distance",
      perWeek: 2.5,
      basis: "day",
      lockedTotal: 40,
      qualifier: null,
    });
  });

  it("prefillBasisFor — 딱 떨어지면 하루, 아니면 주간", () => {
    expect(
      prefillBasisFor({ type: "cardio_distance", total: 40, weeklyDays: 4, periodDays: 28 }),
    ).toBe("day");
    expect(
      prefillBasisFor({ type: "cardio_distance", total: 40, weeklyDays: 3, periodDays: 28 }),
    ).toBe("week");
    // 일수형·비유산소는 언제나 주간
    expect(
      prefillBasisFor({ type: "weight_days", total: 8, weeklyDays: 2, periodDays: 28 }),
    ).toBe("week");
    expect(
      prefillBasisFor({ type: "volume", total: 48000, weeklyDays: 3, periodDays: 28 }),
    ).toBe("week");
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


describe("하루 기준 목표 (2026-09-18 사용자 지시 — 유산소)", () => {
  it("유산소는 하루로 열고, 그 밖은 주간 그대로다", () => {
    expect(defaultBasisFor("cardio_distance")).toBe("day");
    expect(defaultBasisFor("cardio_time")).toBe("day");
    expect(defaultBasisFor("volume")).toBe("week");
    expect(defaultBasisFor("weight_reps")).toBe("week");
  });

  it("⚠️ 일수형은 하루를 못 고른다 — '하루에 몇 일'은 말이 안 된다", () => {
    expect(basisChoicesFor("weight_days")).toEqual(["week"]);
    expect(basisChoicesFor("bodyweight_days")).toEqual(["week"]);
    expect(basisChoicesFor("cardio_distance")).toEqual(["week", "day"]);
  });

  it("하루 2.5km · 주 4회 · 4주 → 기간 총 40km (주 10km와 같은 결과)", () => {
    const byDay = buildGoalDrafts({
      weeklyDays: 4,
      periodDays: FOUR_WEEKS,
      details: [{ type: "cardio_distance", perWeek: 2.5, basis: "day" }],
    });
    const byWeek = buildGoalDrafts({
      weeklyDays: 4,
      periodDays: FOUR_WEEKS,
      details: [{ type: "cardio_distance", perWeek: 10, basis: "week" }],
    });
    expect(byDay).toEqual(byWeek);
    if (byDay.ok) expect(byDay.goals[1].target).toBe(40);
  });

  it("⚠️ `basis`가 없으면 주간이다 — 옛 상태·저장이 그대로 돈다", () => {
    const r = buildGoalDrafts({
      weeklyDays: 3,
      periodDays: FOUR_WEEKS,
      details: [{ type: "cardio_distance", perWeek: 10 }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.goals[1].target).toBe(40);
  });

  it("편집으로 다시 열면 유산소는 하루 값으로 되돌아온다 (총량은 그대로)", () => {
    const s = splitGoalsForEdit(
      [
        { goal_type: "workout_days", target_value: 16, planned_days: 4, qualifier: null },
        { goal_type: "cardio_distance", target_value: 40, planned_days: 4, qualifier: null },
      ],
      FOUR_WEEKS,
    );
    expect(s.details[0].basis).toBe("day");
    expect(s.details[0].perWeek).toBe(2.5);
    // 되돌린 값을 그대로 다시 저장해도 목표가 안 바뀐다 — 이게 안 맞으면
    // 편집만 해도 목표가 조용히 커지거나 작아진다.
    const again = buildGoalDrafts({ weeklyDays: 4, periodDays: FOUR_WEEKS, details: s.details });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.goals[1].target).toBe(40);
  });

  it("목록 글자가 기준을 같이 말한다 — '10km'만으론 주간인지 1회인지 모른다", () => {
    expect(detailGoalText({ type: "cardio_distance", perWeek: 2.5, basis: "day" }).value).toBe(
      "하루 2.5km",
    );
    expect(detailGoalText({ type: "cardio_distance", perWeek: 10, basis: "week" }).value).toBe(
      "주 10km",
    );
    expect(BASIS_LABEL.day).toBe("하루");
  });

  it("힌트는 **넣은 기준의 반대쪽**을 말한다 — 같은 값을 되풀이하면 아무 말도 아니다", () => {
    expect(perSessionHint({ type: "cardio_distance", perWeek: 2.5, basis: "day" }, 4)).toBe(
      "주 4회면 한 주에 약 10km",
    );
    expect(perSessionHint({ type: "cardio_distance", perWeek: 10, basis: "week" }, 4)).toBe(
      "주 4회 기준 1회 약 2.5km",
    );
  });
});

describe("lockedTotal — 편집만 해도 목표가 바뀌지 않는다", () => {
  it("숫자를 고치면 고친 값이 이긴다 — 잠금은 '안 고쳤을 때'만이다", () => {
    const r = buildGoalDrafts({
      weeklyDays: 3,
      periodDays: 30,
      // 화면이 `setGoal`에서 지우므로 고친 순간 `lockedTotal`은 없다
      details: [{ type: "cardio_distance", perWeek: 20, basis: "week" }],
    });
    expect(r.ok && r.goals[1].target).toBe(85.7);
  });

  it("잠긴 총량은 기준과 무관하게 그대로다", () => {
    for (const basis of ["week", "day"] as const) {
      const r = buildGoalDrafts({
        weeklyDays: 3,
        periodDays: 30,
        details: [{ type: "cardio_distance", perWeek: 9.3, basis, lockedTotal: 40 }],
      });
      expect(r.ok && r.goals[1].target).toBe(40);
    }
  });
});

describe("세부 목표 개수 — 기본 빼고 3개 (사용자 결정 2026-09-18)", () => {
  it("상한이 3이다", () => {
    expect(MAX_DETAIL_GOALS).toBe(3);
  });

  it("세부 3개까지 저장된다 — 기본 1 + 세부 3 = 4줄", () => {
    const r = buildGoalDrafts({
      weeklyDays: 3,
      periodDays: FOUR_WEEKS,
      details: [
        { type: "cardio_distance", perWeek: 10 },
        { type: "weight_reps", perWeek: 100 },
        { type: "bodyweight_reps", perWeek: 100 },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.goals).toHaveLength(4);
  });

  it("4개는 막는다", () => {
    const r = buildGoalDrafts({
      weeklyDays: 3,
      periodDays: FOUR_WEEKS,
      details: [
        { type: "cardio_distance", perWeek: 10 },
        { type: "weight_reps", perWeek: 100 },
        { type: "bodyweight_reps", perWeek: 100 },
        { type: "tabata_count", perWeek: 3 },
      ],
    });
    expect(r).toEqual({ ok: false, reason: "too_many_details" });
  });
});


describe("유산소 주간 횟수 — cardio_days (0111, 사용자 지시 2026-09-18)", () => {
  it("유산소 지표가 거리·시간·주간 횟수 셋이다", () => {
    expect(DETAIL_METRICS.cardio.map((m) => [m.type, m.label])).toEqual([
      ["cardio_distance", "거리"],
      ["cardio_time", "시간"],
      ["cardio_days", "주간 횟수"],
    ]);
  });

  it("일수형이라 주 N일로 저장된다 — 주 2회 · 4주 = 8일", () => {
    const r = buildGoalDrafts({
      weeklyDays: 3,
      periodDays: FOUR_WEEKS,
      details: [{ type: "cardio_days", perWeek: 2, qualifier: 1 }],
    });
    expect(r.ok && r.goals[1]).toEqual({ type: "cardio_days", target: 8, qualifier: 1 });
  });

  it("⚠️ 일수형이므로 하루 기준을 못 고른다 — '하루에 몇 일'은 말이 안 된다", () => {
    expect(basisChoicesFor("cardio_days")).toEqual(["week"]);
    // ⚠️ 분류만 보고 정하면 유산소라서 "하루"가 된다 — 화면에 "하루 2일"이 뜬다
    expect(defaultBasisFor("cardio_days")).toBe("week");
    expect(prefillBasisFor({
      type: "cardio_days", total: 8, weeklyDays: 3, periodDays: FOUR_WEEKS,
    })).toBe("week");
  });

  it("거리·시간과 함께 걸 수 있다 — 지표가 달라 유일 제약에 안 걸린다", () => {
    const r = buildGoalDrafts({
      weeklyDays: 3,
      periodDays: FOUR_WEEKS,
      details: [
        { type: "cardio_days", perWeek: 2 },
        { type: "cardio_distance", perWeek: 3, basis: "day" },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("화면 글자는 '유산소 주간 횟수'와 하루 최소 종목을 같이 말한다", () => {
    const t = detailGoalText({ type: "cardio_days", perWeek: 2, qualifier: 1 });
    expect(t.title).toBe("유산소 주간 횟수");
    expect(t.value).toBe("주 2일 · 하루 1종목 이상");
  });
});
