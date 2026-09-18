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
  perDayFromTotal,
  perWeekFromTotal,
  perWeekFromTotalDays,
  roundTarget,
  totalDaysFromPerWeek,
  totalFromPerDay,
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
 * 세부 목표 개수 상한 — **사용자 결정 2026-09-18: 기본 목표 빼고 3개.**
 *
 * ⚠️ 완료 목표 보너스는 **3개까지만** 인정된다(`COMPLETED_GOAL_BONUS_MAX`).
 *    기본 1 + 세부 3 = 4라서 **네 번째 완료 목표는 보너스를 못 받는다.**
 * ⚠️ 더 중요한 것 — 달성률은 목표들의 **평균**이다(`achievementScore`).
 *    목표를 더 걸수록 못 채운 줄이 평균을 끌어내려 **점수가 낮아질 수 있다.**
 *    "많이 걸면 유리하다"가 아니다. 이 두 가지는 사용자에게 설명했고, 그 위에서
 *    3개로 정해졌다. 숫자를 다시 만지려면 두 성질부터 다시 보라.
 */
export const MAX_DETAIL_GOALS = 3;

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
    // 0111 — 사용자 지시 2026-09-18 "유산소 주간 횟수도 선택할 수 있게".
    // 웨이트·맨몸에만 있던 일수형을 유산소에도 연다.
    { type: "cardio_days", label: "주간 횟수" },
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
  return (
    type === "weight_days" ||
    type === "bodyweight_days" ||
    type === "cardio_days" // 0111 — "유산소 주 N회"
  );
}

/**
 * 처음 고를 때의 기본값.
 *
 * ⚠️ `perDay`가 있는 지표는 **하루 기준으로 열릴 때 그 값을 쓴다.** 주간 기본값을
 *    주 N회로 나누면 `3.3km`처럼 어중간한 수가 첫 화면에 뜬다(2026-09-18 화면 확인).
 *    사람이 고르는 자리에는 사람이 고를 법한 수가 있어야 한다.
 */
const DETAIL_DEFAULTS: Record<
  DetailGoalType,
  { perWeek: number; step: number; perDay?: number; dayStep?: number }
> = {
  weight_reps: { perWeek: 100, step: 10 },
  volume: { perWeek: 10000, step: 1000 },
  weight_days: { perWeek: 2, step: 1 },
  cardio_distance: { perWeek: 10, step: 1, perDay: 3, dayStep: 0.5 },
  cardio_time: { perWeek: 120, step: 10, perDay: 30, dayStep: 5 },
  cardio_days: { perWeek: 2, step: 1 },
  bodyweight_reps: { perWeek: 100, step: 10 },
  bodyweight_time: { perWeek: 30, step: 5 },
  bodyweight_days: { perWeek: 2, step: 1 },
  tabata_count: { perWeek: 3, step: 1 },
};

/** 세부 지표를 처음 고를 때의 값과 +/− 단위. `basis`에 맞춰 돌려준다 */
export function detailDefaults(
  type: DetailGoalType,
  basis: GoalBasis = "week",
): {
  perWeek: number;
  step: number;
  unit: string;
} {
  const d = DETAIL_DEFAULTS[type];
  const unit = GOAL_TYPE_META[type].unit;
  if (basis === "day" && d.perDay !== undefined) {
    return { perWeek: d.perDay, step: d.dayStep ?? d.step, unit };
  }
  return { perWeek: d.perWeek, step: d.step, unit };
}

/**
 * 세부 목표를 **무엇 단위로 입력받나** (2026-09-18 사용자 지시 — "유산소는 하루
 * 기준으로 목표를 세팅할 수 있게").
 *
 * 러닝은 "주 10km"보다 "한 번에 2.5km"로 생각한다. 저장은 어느 쪽이든 **기간
 * 총량** 그대로다 — `user_goals.target_value`의 뜻을 바꾸지 않아야 옛 챌린지와
 * 점수 계산이 그대로 간다.
 *
 * ⚠️ 일수형(`*_days`)에는 `day`를 쓰지 마라. "하루에 몇 일"은 말이 안 된다.
 *    `basisChoicesFor`가 그 경우 `week` 하나만 돌려준다.
 */
export type GoalBasis = "week" | "day";

/** 세부 목표 한 줄. `value`의 뜻은 `basis`가 정한다 */
export type DetailGoalInput = {
  type: DetailGoalType;
  /** `basis === "week"`면 주간 값, `"day"`면 1회(하루) 값 */
  perWeek: number;
  /** 없으면 `"week"` — 옛 상태·테스트가 그대로 돈다 */
  basis?: GoalBasis;
  /**
   * 편집으로 열었을 때의 **원래 기간 총량**. 숫자를 건드리지 않았다면 이 값을
   * 그대로 저장한다.
   *
   * ⚠️⚠️ 없으면 **편집만 해도 목표가 바뀐다.** 화면은 주간·하루 값을 소수 첫째
   *    자리까지만 쓰는데, 총량을 그 값으로 되돌렸다 다시 곱하면 딱 떨어지지
   *    않는 조합이 있다 — 30일 챌린지의 40km는 주 9.3km로 보였다가 39.9km로
   *    저장된다. 사용자는 아무것도 안 건드렸는데 목표가 깎인 것을 나중에야 안다.
   *    2026-09-18 전수 왕복 테스트가 찾았다(그전부터 있던 성질이다).
   * ⚠️ 숫자를 한 번이라도 고치면 **반드시 지운다**(`goal-setup-flow.tsx`의 `setGoal`).
   *    안 지우면 이번엔 반대로 사용자가 바꾼 값이 무시된다.
   */
  lockedTotal?: number;
  /** 일수형만. 없으면 `DEFAULT_DAYS_QUALIFIER` */
  qualifier?: number | null;
};

/** 이 지표가 고를 수 있는 기준. 일수형은 주간뿐이다 */
export function basisChoicesFor(type: DetailGoalType): readonly GoalBasis[] {
  return isDaysMetric(type) ? ["week"] : ["week", "day"];
}

/**
 * 유산소는 **하루**로 연다(사용자 지시). 그 밖은 주간 그대로.
 *
 * ⚠️ 일수형은 유산소라도 **주간**이다. `cardio_days`(0111)가 여기 걸린다 —
 *    분류만 보고 정하면 "하루 2일"이 뜬다(2026-09-18 화면 확인에서 잡았다).
 *    `basisChoicesFor`와 **같은 기준**을 봐야 한다.
 */
export function defaultBasisFor(type: DetailGoalType): GoalBasis {
  if (isDaysMetric(type)) return "week";
  return detailCategoryOf(type) === "cardio" ? "day" : "week";
}

/**
 * 저장된 목표를 **편집으로 다시 열 때** 어떤 기준으로 보여줄까.
 *
 * ⚠️⚠️ 기본 기준(유산소=하루)을 무조건 쓰면 **목표가 조용히 줄어든다.**
 *    4주·주 3회에 총 40km를 하루로 되돌리면 3.333…인데 화면은 소수 첫째 자리까지만
 *    쓴다(3.3). 그대로 다시 저장하면 3.3 × 3 × 4주 = **39.6km** — 사용자는 아무것도
 *    안 건드렸는데 목표가 깎인다. 2026-09-18에 왕복 테스트가 이걸 잡았다.
 *
 * 그래서 **되돌린 값이 같은 총량으로 되돌아오는 경우에만** 하루로 연다.
 * 하루 기준으로 만든 목표는 언제나 여기에 해당한다(그렇게 만들어진 값이므로).
 * 주간으로 만든 목표는 주간으로 열린다 — 그게 원래 사용자가 생각한 단위이기도 하다.
 */
export function prefillBasisFor(input: {
  type: DetailGoalType;
  total: number;
  weeklyDays: number;
  periodDays: number;
}): GoalBasis {
  const { type, total, weeklyDays, periodDays } = input;
  if (isDaysMetric(type)) return "week";
  if (defaultBasisFor(type) !== "day") return "week";
  if (!(total > 0) || weeklyDays <= 0 || periodDays <= 0) return "week";
  const unit = GOAL_TYPE_META[type].unit;
  const perDay = perDayFromTotal(total, weeklyDays, periodDays);
  if (!(perDay > 0)) return "week";
  const back = roundTarget(totalFromPerDay(perDay, weeklyDays, periodDays), unit);
  return back === roundTarget(total, unit) ? "day" : "week";
}

export const BASIS_LABEL: Record<GoalBasis, string> = {
  week: "주",
  day: "하루",
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
    const unit = GOAL_TYPE_META[d.type].unit;
    // ⚠️ 저장은 **언제나 기간 총량**이다. 기준(주/하루)은 입력 단위일 뿐이고
    //    `user_goals.target_value`의 뜻을 바꾸지 않는다 — 바꾸면 옛 챌린지 점수가 갈린다.
    const target = days
      ? d.perWeek > 0
        ? totalDaysFromPerWeek(d.perWeek, periodDays)
        : 0
      : // 손대지 않은 목표는 원래 총량 그대로 — 위 `lockedTotal` 주석 참조
        typeof d.lockedTotal === "number" && d.lockedTotal > 0
        ? d.lockedTotal
        : (d.basis ?? "week") === "day"
          ? roundTarget(totalFromPerDay(d.perWeek, weeklyDays, periodDays), unit)
          : totalFromPerWeek(d.perWeek, periodDays, unit);
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
    /*
      ⚠️ DB에는 **총량만** 남아서 사용자가 어느 기준으로 넣었는지 알 수 없다.
         그래서 지표의 기본 기준(`defaultBasisFor`)으로 되돌린다 — 유산소는 하루.
         총량은 그대로라 되돌린 값으로 다시 저장해도 목표가 안 바뀐다.
    */
    const basis = prefillBasisFor({ type, total, weeklyDays, periodDays });
    details.push({
      type,
      basis,
      // 숫자를 안 건드리면 이 값이 그대로 저장된다 (왕복 보존)
      lockedTotal: isDaysMetric(type) ? undefined : total,
      perWeek: isDaysMetric(type)
        ? perWeekFromTotalDays(total, periodDays)
        : basis === "day"
          ? perDayFromTotal(total, weeklyDays, periodDays)
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
  // 기준을 같이 적는다 — "10km"만 있으면 주간인지 1회인지 알 수 없다
  const basis = BASIS_LABEL[d.basis ?? "week"];
  return {
    title,
    value: `${basis} ${d.perWeek.toLocaleString("ko-KR")}${GOAL_TYPE_META[d.type].unit}`,
  };
}

/**
 * 입력한 기준의 **반대쪽**을 알려 준다 — 주간으로 넣으면 1회가 얼마인지,
 * 하루로 넣으면 주 합계가 얼마인지.
 *
 * 한쪽만 보이면 "주 10km"가 버거운 목표인지 감이 안 온다. 2026-09-18에 유산소를
 * 하루 기준으로 열면서, 하루로 넣는 사람에게는 이 힌트가 **주간 합계**여야
 * 의미가 생겼다(1회 값을 넣고 1회 값을 다시 보여 주면 아무 말도 아니다).
 */
export function perSessionHint(
  d: DetailGoalInput,
  weeklyDays: number,
): string | null {
  if (isDaysMetric(d.type) || weeklyDays <= 0 || d.perWeek <= 0) return null;
  const unit = GOAL_TYPE_META[d.type].unit;
  const show = (n: number) =>
    (unit === "km" ? Math.round(n * 10) / 10 : Math.round(n)).toLocaleString("ko-KR");
  if ((d.basis ?? "week") === "day") {
    return `주 ${weeklyDays}회면 한 주에 약 ${show(d.perWeek * weeklyDays)}${unit}`;
  }
  return `주 ${weeklyDays}회 기준 1회 약 ${show(d.perWeek / weeklyDays)}${unit}`;
}

/**
 * 시안 ④ `내 목표 확인`의 **진행 예시** — "주 N회가 어떤 모습인지" 한 주로 보여준다.
 *
 * ⚠️⚠️ **실적이 아니다.** 목표를 세우는 자리라 아직 이번 챌린지 기록이 없다.
 *    그래서 채워진 칸 수는 `주 N회 - 1`로 **고정**한다 — 그러면 아래 문구가
 *    항상 "한 번만 더 하면 목표 달성"으로 참이 되고, 사용자가 "내가 2번 했다"로
 *    읽을 여지를 문구(`진행 예시`)와 함께 줄인다.
 *    ⛔ 여기에 실제 세션 수를 끌어오지 마라. 그러려면 챌린지 기간 조회가 필요하고,
 *      목표 설정 시트가 네트워크를 한 번 더 때리게 된다(시트는 저장 전 화면이다).
 *
 * 주는 **월요일 시작**이다(시안 그대로). 채우는 칸도 앞에서부터다 — 특정 요일을
 * 지목하지 않으려고 굳이 흩뿌리지 않는다. 예시라는 걸 아는 편이 낫다.
 */
export type WeekPreview = {
  /** 월~일 7칸. `true`면 채워진 동그라미 */
  days: readonly boolean[];
  /** 채워진 칸 수 */
  done: number;
  /** 주 N회 */
  target: number;
  /** 카드 아래 한 줄 */
  caption: string;
};

/** 월요일 시작 — 시안과 같은 순서 */
export const WEEK_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;

export function weekPreview(weeklyDays: number): WeekPreview {
  const target = Math.min(
    MAX_WEEKLY_DAYS,
    Math.max(MIN_WEEKLY_DAYS, Math.round(weeklyDays)),
  );
  const done = target - 1;
  return {
    days: WEEK_LABELS.map((_, i) => i < done),
    done,
    target,
    caption:
      done === 0
        ? "한 번만 하면 이번 주 목표 달성!"
        : "한 번만 더 하면 이번 주 목표 달성!",
  };
}
