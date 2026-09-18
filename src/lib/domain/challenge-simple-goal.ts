/**
 * 챌린지 목표 단순화 — "주 N회" 기본 목표 + 선택 세부 목표 (2026-09-18).
 *
 * 화면이 받는 것:
 *   · 기본 목표 — **주 N회 운동** 하나. 이것만 골라도 완전한 참가자다.
 *   · 세부 목표 — 선택. 최대 `MAX_DETAIL_GOALS`개, **주 단위**로 받는다.
 *
 * DB에 남는 것 (뜻은 옛날과 같다 — 옛 챌린지 점수가 그대로 간다):
 *   · `workout_days` 한 줄 (0108) — 목표값 = `plannedDaysForPeriod(주 N회, 기간)`
 *   · 세부 목표 줄 — 목표값은 **기간 총량**
 *   · 모든 줄의 `planned_days` = 주 N회 (참여율 분모는 이 값 하나다)
 *
 * ⚠️⚠️ `주 N회`를 `weight_days`·`bodyweight_days`로 위장 저장하지 마라.
 *    그 둘은 "그 분류의 종목을 하루 N개 이상 한 날"이라 유산소만 한 날이 0일이다.
 *
 * ⚠️ 세부 목표의 **주간 값**은 `planned_days`를 건드리지 않는다. 2026-08-14 설계가
 *    지킨 경계(달성률 재료와 참여율 재료를 섞지 않는다)를 그대로 잇는다.
 *    기본 목표만 둘 다에 쓰이는데, 그건 뜻이 같아서다(주 N회 = 운동한 날 목표 = 계획일).
 */
import { GOAL_TYPE_META, type GoalDraft } from "@/lib/challenge";
import {
  perWeekFromTotal,
  perWeekFromTotalDays,
  totalDaysFromPerWeek,
  totalFromPerWeek,
} from "./challenge-goal-calc";
import { plannedDaysForPeriod, type GoalType } from "./goal-score";

export type DetailGoalType = Exclude<GoalType, "workout_days">;

/** 기본 화면의 버튼 — 시안 그대로. 그 밖은 `직접 설정`(1~7) */
export const WEEKLY_DAY_CHOICES = [2, 3, 4] as const;
export const DEFAULT_WEEKLY_DAYS = 3;
export const MIN_WEEKLY_DAYS = 1;
export const MAX_WEEKLY_DAYS = 7;

/**
 * 세부 목표 개수 상한.
 *
 * 기본 1 + 세부 2 = 3 — 완료 목표 보너스 상한(`COMPLETED_GOAL_BONUS_MAX`)과 같다
 * (사용자 결정 D1, 2026-09-18). 옛 시트의 `MAX_GOALS = 3`과 같은 이유다.
 */
export const MAX_DETAIL_GOALS = 2;

/**
 * 일수형 세부 목표의 "하루 최소 종목 수" 기본값 (사용자 결정 D5).
 *
 * 옛 기본값은 3이었다(`saveMyGoals`의 `?? 3`). 운영 목표의 66%가 그 기본값을
 * 그대로 쓴 `weight_days`였고, 웨이트 2종목만 한 날은 0일로 잡혔다. 새 목표에만
 * 적용된다 — 저장된 옛 목표의 qualifier는 그대로다.
 */
export const DEFAULT_DAYS_QUALIFIER = 1;

export type DetailCategoryKey = "weight" | "cardio" | "bodyweight" | "interval";

/**
 * 세부 목표 1단계 — "어떤 운동을 목표로 할까요?"
 *
 * ⚠️ **러닝과 걷기를 따로 두지 마라.** 운동 데이터는 둘 다 `cardio`이고,
 *    `user_goals`는 (사람·챌린지·지표)로 유일하다 — "러닝 10km"와 "걷기 5km"는
 *    둘 다 `cardio_distance`라 함께 저장할 수 없다. 시안의 두 칸을 한 칸으로 합쳤다.
 */
export const DETAIL_CATEGORIES: readonly {
  key: DetailCategoryKey;
  label: string;
  sub?: string;
}[] = [
  { key: "weight", label: "웨이트" },
  { key: "cardio", label: "유산소", sub: "러닝·걷기" },
  { key: "bodyweight", label: "맨몸운동" },
  { key: "interval", label: "인터벌" },
];

/**
 * 세부 목표 2단계 — "무엇을 기준으로 할까요?" 기존 GoalType을 그대로 쓴다.
 *
 * `volume`(총 운동량)은 2026-07-17에 선택지에서 뺐던 레거시다(운영 사용 0건).
 * 사용자 결정 D2로 다시 연다 — 집계(`volumeKg`)는 계속 살아 있었다.
 */
export const DETAIL_METRICS: Record<
  DetailCategoryKey,
  readonly { type: DetailGoalType; label: string }[]
> = {
  weight: [
    { type: "weight_reps", label: "운동 횟수" },
    { type: "volume", label: "총 운동량" },
    { type: "weight_days", label: "운동 일수" },
  ],
  cardio: [
    { type: "cardio_distance", label: "거리" },
    { type: "cardio_time", label: "시간" },
  ],
  bodyweight: [
    { type: "bodyweight_reps", label: "운동 횟수" },
    { type: "bodyweight_time", label: "운동 시간" },
    { type: "bodyweight_days", label: "운동 일수" },
  ],
  interval: [{ type: "tabata_count", label: "인터벌 횟수" }],
};

/** 세부 지표가 속한 1단계 분류 */
export function detailCategoryOf(type: DetailGoalType): DetailCategoryKey {
  for (const [key, metrics] of Object.entries(DETAIL_METRICS)) {
    if (metrics.some((m) => m.type === type)) return key as DetailCategoryKey;
  }
  // 목록에 없는 지표는 없어야 한다 — 테스트가 막는다. 그래도 화면이 죽지 않게.
  return "weight";
}

/** 일수형 — 목표값이 "주 N일"이고 하루 최소 종목 수가 붙는다 */
export function isDaysMetric(type: DetailGoalType): boolean {
  return type === "weight_days" || type === "bodyweight_days";
}

const DETAIL_DEFAULTS: Record<DetailGoalType, { perWeek: number; step: number }> = {
  weight_reps: { perWeek: 100, step: 10 },
  volume: { perWeek: 10000, step: 1000 },
  weight_days: { perWeek: 2, step: 1 },
  cardio_distance: { perWeek: 10, step: 1 },
  cardio_time: { perWeek: 120, step: 10 },
  bodyweight_reps: { perWeek: 100, step: 10 },
  bodyweight_time: { perWeek: 30, step: 5 },
  bodyweight_days: { perWeek: 2, step: 1 },
  tabata_count: { perWeek: 3, step: 1 },
};

/** 세부 지표를 처음 고를 때의 주간 값과 +/− 단위 */
export function detailDefaults(type: DetailGoalType): {
  perWeek: number;
  step: number;
  unit: string;
} {
  return { ...DETAIL_DEFAULTS[type], unit: GOAL_TYPE_META[type].unit };
}

/** 세부 목표 한 줄 — 화면은 "주 N"으로 다룬다 */
export type DetailGoalInput = {
  type: DetailGoalType;
  perWeek: number;
  /** 일수형만. 없으면 `DEFAULT_DAYS_QUALIFIER` */
  qualifier?: number | null;
};

export type BuildGoalDraftsResult =
  | { ok: true; goals: GoalDraft[]; plannedDays: number }
  | {
      ok: false;
      reason:
        | "weekly_out_of_range"
        | "too_many_details"
        | "duplicate_metric"
        | "non_positive_target";
    };

/**
 * 화면 상태 → 저장할 목표 줄. `saveMyGoals`에 그대로 넘긴다.
 *
 * `workout_days`가 **항상 첫 줄**이다. 세부 목표가 0개여도 이 한 줄로
 * `start_challenge`의 `kpi_incomplete`와 autostart의 `dropped`를 통과한다.
 */
export function buildGoalDrafts(input: {
  weeklyDays: number;
  periodDays: number;
  details: readonly DetailGoalInput[];
}): BuildGoalDraftsResult {
  const { weeklyDays, periodDays, details } = input;
  if (
    !Number.isInteger(weeklyDays) ||
    weeklyDays < MIN_WEEKLY_DAYS ||
    weeklyDays > MAX_WEEKLY_DAYS
  ) {
    return { ok: false, reason: "weekly_out_of_range" };
  }
  if (details.length > MAX_DETAIL_GOALS) {
    return { ok: false, reason: "too_many_details" };
  }
  const types = details.map((d) => d.type);
  if (new Set(types).size !== types.length) {
    return { ok: false, reason: "duplicate_metric" };
  }

  const goals: GoalDraft[] = [
    {
      type: "workout_days",
      target: plannedDaysForPeriod(weeklyDays, periodDays),
      qualifier: null,
    },
  ];
  for (const d of details) {
    const days = isDaysMetric(d.type);
    const target = days
      ? d.perWeek > 0
        ? totalDaysFromPerWeek(d.perWeek, periodDays)
        : 0
      : totalFromPerWeek(d.perWeek, periodDays, GOAL_TYPE_META[d.type].unit);
    if (!(target > 0)) return { ok: false, reason: "non_positive_target" };
    goals.push({
      type: d.type,
      target,
      qualifier: days ? (d.qualifier ?? DEFAULT_DAYS_QUALIFIER) : null,
    });
  }
  return { ok: true, goals, plannedDays: weeklyDays };
}

/**
 * 저장된 목표 → 화면 상태 (편집 프리필).
 *
 * ⚠️ 옛 목표(`workout_days`가 없는 것)를 버리지 않는다. 전부 세부 목표로
 *    보여준다 — 다시 저장하면 `workout_days`가 한 줄 붙는다(`hasBasic: false`로
 *    화면이 알 수 있다). 옛 시트는 목표를 3개까지 받았으므로 세부가 3개일 수 있다.
 */
export function splitGoalsForEdit(
  goals: readonly {
    goal_type: GoalType;
    target_value: number | string;
    planned_days: number;
    qualifier: number | null;
  }[],
  periodDays: number,
): { weeklyDays: number; details: DetailGoalInput[]; hasBasic: boolean } {
  if (goals.length === 0) {
    return { weeklyDays: DEFAULT_WEEKLY_DAYS, details: [], hasBasic: false };
  }
  const weeklyDays = Math.min(
    MAX_WEEKLY_DAYS,
    Math.max(MIN_WEEKLY_DAYS, Math.round(Number(goals[0].planned_days) || DEFAULT_WEEKLY_DAYS)),
  );
  const details: DetailGoalInput[] = [];
  let hasBasic = false;
  for (const g of goals) {
    if (g.goal_type === "workout_days") {
      hasBasic = true;
      continue;
    }
    const type = g.goal_type;
    const total = Number(g.target_value);
    details.push({
      type,
      perWeek: isDaysMetric(type)
        ? perWeekFromTotalDays(total, periodDays)
        : perWeekFromTotal(total, periodDays, GOAL_TYPE_META[type].unit),
      qualifier: g.qualifier,
    });
  }
  return { weeklyDays, details, hasBasic };
}

/** 세부 목표 한 줄의 화면 글자 — "웨이트 총 운동량" / "주 12,000kg" */
export function detailGoalText(d: DetailGoalInput): { title: string; value: string } {
  const category = DETAIL_CATEGORIES.find((c) => c.key === detailCategoryOf(d.type));
  const metric = Object.values(DETAIL_METRICS)
    .flat()
    .find((m) => m.type === d.type);
  const cat = category?.label ?? "";
  const met = metric?.label ?? "";
  // "인터벌 인터벌 횟수"처럼 겹치지 않게
  const title = met.startsWith(cat) ? met : `${cat} ${met}`.trim();
  if (isDaysMetric(d.type)) {
    const q = d.qualifier ?? DEFAULT_DAYS_QUALIFIER;
    return { title, value: `주 ${d.perWeek}일 · 하루 ${q}종목 이상` };
  }
  return { title, value: `주 ${d.perWeek.toLocaleString("ko-KR")}${GOAL_TYPE_META[d.type].unit}` };
}

/** "주 3회 기준 1회 약 4,000kg" — 세부 목표를 한 번에 얼마인지로 바꿔 보여준다 */
export function perSessionHint(
  d: DetailGoalInput,
  weeklyDays: number,
): string | null {
  if (isDaysMetric(d.type) || weeklyDays <= 0 || d.perWeek <= 0) return null;
  const unit = GOAL_TYPE_META[d.type].unit;
  const per = d.perWeek / weeklyDays;
  const shown = unit === "km" ? Math.round(per * 10) / 10 : Math.round(per);
  return `주 ${weeklyDays}회 기준 1회 약 ${shown.toLocaleString("ko-KR")}${unit}`;
}
