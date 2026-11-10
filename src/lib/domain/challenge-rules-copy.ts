import {
  ACHIEVEMENT_WEIGHT,
  COMPLETED_GOAL_BONUS_MAX,
  COMPLETED_GOAL_BONUS_PER,
  PARTICIPATION_WEIGHT,
} from "./goal-score";
import { CARDIO_RULES_V2_FROM } from "@/lib/challenge";

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
export function scoreCards(): RuleCard[] {
  const bonusMax = COMPLETED_GOAL_BONUS_PER * COMPLETED_GOAL_BONUS_MAX;
  return [
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
}

/** 한 줄 공식 — 카드를 읽은 뒤 정리용 */
export function scoreFormula(): string {
  return (
    `종합점수 = 달성 평균 × ${ACHIEVEMENT_WEIGHT} + 꾸준함 × ${PARTICIPATION_WEIGHT} + 보너스`
  );
}

/** 목표를 더 추가하면 — 좋은 점과 조심할 점을 **둘 다** 말한다 */
export function addGoalAdvice(): { good: string; careful: string } {
  return {
    good:
      `100%로 채운 목표마다 보너스 +${COMPLETED_GOAL_BONUS_PER}점을 받아요. ` +
      `보너스는 ${COMPLETED_GOAL_BONUS_MAX}개까지만 늘어나요.`,
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

/** 꼭 알아둘 약속들 */
export function mustKnow(input: {
  photoRequired: boolean;
  startDate: string;
}): string[] {
  const lines: string[] = [];
  if (input.photoRequired) {
    lines.push("사진을 올린 운동만 기록으로 세요. 사진이 없으면 점수에 안 들어가요.");
  }
  lines.push("시작 전까지는 목표를 바꿀 수 있어요. 시작한 뒤에는 목표를 올리는 것만 돼요.");
  // 새 규칙(2026-11-12 이후 시작): 사이클은 거리가 아니라 시간으로 센다
  if (input.startDate >= CARDIO_RULES_V2_FROM) {
    lines.push(
      "유산소 거리는 걷기·달리기만 세고, 사이클은 '사이클 시간'으로 세요. 로잉·줄넘기 같은 유산소는 시간으로만 세요.",
    );
  }
  return lines;
}

export const CONSENT_LABEL = "위 규칙을 모두 읽었고, 이 목표로 참여하는 데 동의해요";
