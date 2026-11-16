import {
  ACHIEVEMENT_WEIGHT,
  COMPLETED_GOAL_BONUS_MAX,
  COMPLETED_GOAL_BONUS_PER,
  PARTICIPATION_WEIGHT,
  plannedDaysForPeriod,
  type GoalType,
} from "./goal-score";
import { ACTIVITY_RULE_TEXT } from "./goal-score-v2";
import { CARDIO_RULES_V2_FROM, goalLabel } from "@/lib/challenge";

/**
 * 챌린지 **참여 전 최종 확인** 화면의 설명 문구 (사용자 지시 2026-11-11:
 * "점수 계산 로직, 목표를 추가하면 어떤 혜택이 있는지, 동점이면 어떤 로직인지 쉽고 직관적으로
 * 설명하고 최종 동의를 하게 한 뒤 참여").
 *
 * ⚠️ **숫자를 손으로 적지 않는다.** 비중(80·20)·보너스(+3, 최대 3개)는 `goal-score.ts`의 상수에서
 *    읽는다 — 설명과 실제 계산이 갈라지지 않게. 동점 순서(`TIE_BREAKERS`)는 `rankParticipants`의
 *    비교 사슬과 **같은 순서**여야 한다(`challenge-rules-copy.test.ts`가 묶는다).
 *
 * 말투 규칙: 계산식 기호보다 **한 줄 요약 + 예**를 먼저, 어려운 말(KPI·가중치)은 쓰지 않는다.
 */

const pct = (n: number) => Math.round(n * 100);

export type RuleCard = { title: string; body: string };

/** 점수가 어떻게 나오는지 — 세 덩어리 */
export function scoreCards(scoringVersion = 1): RuleCard[] {
  const bonusMax = COMPLETED_GOAL_BONUS_PER * COMPLETED_GOAL_BONUS_MAX;
  const cards: RuleCard[] = [
    {
      title: `① 목표 달성 ${pct(ACHIEVEMENT_WEIGHT)}점`,
      body:
        "정한 목표마다 얼마나 채웠는지(최대 100%)를 구해 평균을 내요. " +
        "한 목표를 100%보다 많이 해도 100%까지만 인정돼요.",
    },
    {
      title: `② 꾸준함 ${pct(PARTICIPATION_WEIGHT)}점`,
      body: "실제로 운동한 날 ÷ 하기로 한 날이에요. 거르지 않고 할수록 올라가요.",
    },
    {
      title: `③ 보너스 +${COMPLETED_GOAL_BONUS_PER}점씩`,
      body:
        `목표를 100% 채울 때마다 +${COMPLETED_GOAL_BONUS_PER}점, ` +
        `최대 ${COMPLETED_GOAL_BONUS_MAX}개까지(+${bonusMax}점)예요.`,
    },
  ];
  // 랭킹 v2: 기본 점수(위 세 덩어리)는 만점에서 멈춘다. 활동 점수는 **최종 발표 때만** 더한다(진행 중 순위는 기본 점수만)
  if (scoringVersion === 2) {
    cards.push({
      title: "④ 최종 발표 때 더해지는 활동 점수",
      body:
        `${ACTIVITY_RULE_TEXT}이에요. ` +
        "진행 중에는 기본 점수로만 순위를 매기고, 챌린지가 끝나면 활동 점수를 더한 총점으로 최종 순위를 발표해요. " +
        "목표를 다 채운 뒤에도 운동할수록 유리해요.",
    });
  }
  return cards;
}

/** 한 줄 공식 — 카드를 읽은 뒤 정리용 */
export function scoreFormula(scoringVersion = 1): string {
  if (scoringVersion === 2) {
    return (
      `최종 발표 총점 = (달성 평균 × ${ACHIEVEMENT_WEIGHT} + 꾸준함 × ${PARTICIPATION_WEIGHT} + 보너스) + 활동 점수 (진행 중에는 괄호 안만)`
    );
  }
  return (
    `종합점수 = 달성 평균 × ${ACHIEVEMENT_WEIGHT} + 꾸준함 × ${PARTICIPATION_WEIGHT} + 보너스`
  );
}

/**
 * 진행 중 / 최종 발표 — 순위가 **언제 무엇으로** 정해지는지 (사용자 지시 2026-11-17).
 *
 * ⚠️ 활동 점수는 **최종 발표 때만** 더한다(2026-11-16 결정). v1(옛 규칙) 챌린지에는 활동 점수가 없다 —
 *    진행 중인 경기에 새 규칙을 말하면 거짓이다. 숫자는 상수에서 읽는다.
 */
export function stageGuide(scoringVersion = 1): { when: string; text: string }[] {
  const baseMax = baseScoreMax();
  if (scoringVersion === 2) {
    return [
      { when: "진행 중", text: `기본 점수로 순위를 매겨요 (최대 ${baseMax}점)` },
      {
        when: "최종 발표",
        text: `기본 점수에 활동 점수(${ACTIVITY_RULE_TEXT})를 더해 최종 순위를 발표해요`,
      },
    ];
  }
  return [{ when: "진행 중·최종", text: `종합점수로 순위를 매겨요 (최대 ${baseMax}점)` }];
}

/** 기본 점수의 최대치 — 달성 80 + 꾸준함 20 + 보너스(+3 × 최대 3개). 활동 점수는 포함하지 않는다 */
function baseScoreMax(): number {
  return (
    pct(ACHIEVEMENT_WEIGHT) +
    pct(PARTICIPATION_WEIGHT) +
    COMPLETED_GOAL_BONUS_PER * COMPLETED_GOAL_BONUS_MAX
  );
}

/** 목표 한 줄이 "한 번에" 얼마나 올리는지 보여 줄 **예시 분량** — 초보자가 감을 잡는 단위다 */
const EXAMPLE_AMOUNT: Record<GoalType, { n: number; unit: string }> = {
  weight_days: { n: 1, unit: "일" },
  cardio_days: { n: 1, unit: "일" },
  bodyweight_days: { n: 1, unit: "일" },
  workout_days: { n: 1, unit: "일" },
  tabata_count: { n: 1, unit: "회" },
  cardio_time: { n: 30, unit: "분" },
  cycle_time: { n: 30, unit: "분" },
  bodyweight_time: { n: 30, unit: "분" },
  cardio_distance: { n: 5, unit: "km" },
  weight_reps: { n: 50, unit: "회" },
  bodyweight_reps: { n: 50, unit: "회" },
  volume: { n: 1000, unit: "kg" },
};

export type GoalPointRow = {
  type: GoalType;
  label: string;
  /** 예시 분량 — `30분` · `1일` */
  amount: string;
  /** 그만큼 했을 때 오르는 점수(소수 첫째 자리) */
  points: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 목표를 다 세운 **마지막 설명 단계**의 "내 목표로는 이렇게 올라요" (사용자 지시 2026-11-17).
 *
 * 한 목표가 100%가 되면 (달성 80 ÷ 목표 수)점이다(`achievementScore`가 평균이므로). 그래서 예시 분량이
 * 목표에서 차지하는 비율에 그 값을 곱하면 **운동 한 번의 점수**가 나온다. 목표를 작게 잡을수록 크게 오른다 —
 * 초보자가 운동할 때마다 점수가 눈에 띄게 오르는 것이 의도다(사용자 판단 2026-11-17).
 *
 * ⚠️ 하루 평균은 어림값이다: 달성 80 + 꾸준함 20을 계획한 날 수로 나눈다. 보너스·활동 점수는 포함하지 않는다.
 * ⚠️ 100%까지만 인정되므로 예시가 목표보다 크면 목표까지만 센다 (`achievementScore`와 같다).
 */
export function goalPointGuide(input: {
  goals: readonly { type: GoalType; target: number; qualifier?: number | null }[];
  weeklyDays: number;
  periodDays: number;
  scoringVersion?: number;
}): { rows: GoalPointRow[]; plannedDays: number; perDay: number; baseMax: number } {
  const count = input.goals.length;
  const perGoal = count > 0 ? (ACHIEVEMENT_WEIGHT * 100) / count : 0;
  const rows: GoalPointRow[] = input.goals.map((g) => {
    const ex = EXAMPLE_AMOUNT[g.type];
    const rate = g.target > 0 ? Math.min(ex.n / g.target, 1) : 0;
    return {
      type: g.type,
      label: goalLabel(g.type, g.qualifier),
      amount: `${ex.n.toLocaleString("ko-KR")}${ex.unit}`,
      points: round1(rate * perGoal),
    };
  });
  const plannedDays = plannedDaysForPeriod(input.weeklyDays, input.periodDays);
  return {
    rows,
    plannedDays,
    perDay: round1((pct(ACHIEVEMENT_WEIGHT) + pct(PARTICIPATION_WEIGHT)) / plannedDays),
    baseMax: baseScoreMax(),
  };
}

/** 목표를 더 추가하면 — 좋은 점과 조심할 점을 **둘 다** 말한다 */
export function addGoalAdvice(scoringVersion = 1): { good: string; careful: string } {
  return {
    good:
      `100%로 채운 목표마다 보너스 +${COMPLETED_GOAL_BONUS_PER}점을 받아요. ` +
      `보너스는 ${COMPLETED_GOAL_BONUS_MAX}개까지만 늘어나요.` +
      // 랭킹 v2: 동점은 꾸준함(운동한 날 수 → 횟수 → 시간)으로 가른다 — 목표 수는 동점 기준이 아니다
      (scoringVersion === 2
        ? " 점수가 같을 땐 목표 수가 아니라 운동한 날 수·횟수·시간으로 가려요."
        : ""),
    careful:
      "목표가 많을수록 못 채운 목표도 평균에 들어가 점수가 내려가요. 채울 수 있는 만큼만 정하세요.",
  };
}

/**
 * 점수가 같을 때 가리는 순서. `rankParticipants`의 비교 사슬(goal-score.ts)과 **같은 순서**다.
 *   종합점수 → ① 평균 달성률 → ② 꾸준함 → ③ 모든 목표를 먼저 채운 시각 → ④ 100% 채운 목표 수 → 공동 순위
 */
export const TIE_BREAKERS: readonly string[] = [
  "목표 달성 평균이 더 높은 사람",
  "꾸준함(운동한 날 비율)이 더 높은 사람",
  "모든 목표를 먼저 100% 채운 사람",
  "100%로 채운 목표가 더 많은 사람",
];

export const TIE_FINAL = "그래도 같으면 공동 순위예요.";

/**
 * 랭킹 v2(`challenges.scoring_version = 2`)의 동점 순서 — `goal-score-v2.ts`의 `rankParticipantsV2`와
 * **같은 순서**다(테스트가 묶는다). 기본 점수가 소수 둘째 자리까지 같을 때만 이 순서로 가린다.
 */
export const TIE_BREAKERS_V2: readonly string[] = [
  "운동한 날이 더 많은 사람",
  "운동 횟수가 더 많은 사람",
  "운동 시간이 더 긴 사람",
];
export const TIE_STEPS_V2: readonly string[] = ["운동한 날 수", "운동 횟수", "운동 시간"];

/** 챌린지 점수 규칙 버전에 맞는 동점 설명 묶음 */
export function tieRules(scoringVersion: number): {
  steps: readonly string[];
  breakers: readonly string[];
  intro: string;
} {
  return scoringVersion === 2
    ? {
        steps: TIE_STEPS_V2,
        breakers: TIE_BREAKERS_V2,
        intro: "점수가 같을 때만 위에서부터 먼저 높은 사람이 이겨요",
      }
    : {
        steps: TIE_STEPS,
        breakers: TIE_BREAKERS,
        intro: "위에서부터 먼저 높은 사람이 이겨요",
      };
}

/** 동점 사다리용 **짧은 이름** — `TIE_BREAKERS`와 같은 순서·같은 개수다 (인포그래픽 칸에 들어가는 글자) */
export const TIE_STEPS: readonly string[] = [
  "달성 평균",
  "꾸준함",
  "먼저 완료",
  "완료 목표 수",
];

/** 점수 막대의 두 칸 비중(%) — 계산 상수에서 읽는다 */
export function scoreBarSplit(): { achievement: number; participation: number } {
  return {
    achievement: pct(ACHIEVEMENT_WEIGHT),
    participation: pct(PARTICIPATION_WEIGHT),
  };
}

/** 보너스 칩 — "+3" 이 최대 몇 개까지 붙는지 */
export function bonusChips(): { per: number; max: number } {
  return { per: COMPLETED_GOAL_BONUS_PER, max: COMPLETED_GOAL_BONUS_MAX };
}

/** 꼭 알아둘 약속들 */
export function mustKnow(input: {
  photoRequired: boolean;
  startDate: string;
  scoringVersion?: number;
}): string[] {
  const lines: string[] = [];
  // 랭킹 v2 챌린지는 시작 전에 목표를 기본 포함 3개 이상 세워야 한다 (`minDetailGoals`)
  if (input.scoringVersion === 2) {
    lines.push("기본 목표를 포함해 목표를 3개 이상 정해야 시작할 수 있어요.");
  }
  if (input.photoRequired) {
    lines.push("사진을 올린 운동만 기록으로 세요. 사진이 없으면 점수에 안 들어가요.");
  }
  lines.push("시작 전까지는 목표를 바꿀 수 있어요. 시작한 뒤에는 목표를 올리는 것만 돼요.");
  // 새 규칙(2026-11-03 이후 시작): 싸이클은 거리가 아니라 시간으로 센다
  if (input.startDate >= CARDIO_RULES_V2_FROM) {
    lines.push(
      "유산소 거리는 걷기·달리기만 세고, 싸이클은 '싸이클 시간'으로 세요. 로잉·줄넘기 같은 유산소는 시간으로만 세요.",
    );
  }
  return lines;
}

export const CONSENT_LABEL = "위 규칙을 모두 읽었고, 이 목표로 참여하는 데 동의해요";
