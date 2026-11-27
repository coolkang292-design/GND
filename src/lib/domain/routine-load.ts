/**
 * 루틴 불러오기 — **덧붙이기가 아니라 교체** (2026-11-27, 회원 신고 → 작업지시서).
 *
 * 신고: "어제 고친 루틴을 오늘 다시 불러오면 저장된 루틴과 다른 값이 나온다."
 * 원인(개발 서버 재현, `docs/superpowers/plans/2026-11-27-routine-load-fix.md` §0):
 * 불러오기가 `mergeImportedExercises`(이름이 겹치면 **지금 목록이 이긴다**)를 탔다.
 * - 풀(스쿼트 4세트) 위에 데일리(3세트) → 4세트가 남았다
 * - 다음날 퀘스트가 담은 목록 위에서 퀘스트 아래 '내 루틴' 타일로 부르면, 병합이 겹치는
 *   종목을 버리고 타일 효과가 원래 종목을 걷어내 **겹치는 종목이 양쪽에서 다 사라졌다**
 *
 * 원칙: **저장된 루틴은 설계도다.** 부르면 설계도대로 오늘 목록을 맞춘다.
 * 오늘 목록을 고쳐도 설계도는 안 바뀐다 — 루틴 테이블은 저장·덮어쓰기·이름변경·삭제만 쓴다.
 *
 * ⚠️ `mergeImportedExercises`는 고치지 않는다. 지난 기록 불러오기·달력도 그 함수를 쓰고,
 *    "현재 목록에 추가하기"를 고른 경우와 운동 중 추가는 여전히 병합이 맞다.
 */
import type { WorkoutDraft } from "@/lib/workout";
import { toDraftExercises, type PlanExercise } from "./workout-plan";

/**
 * - `replace` 묻지 않고 루틴으로 교체
 * - `ask` 교체/추가를 고르게 한다 (사용자가 만든 목록이 있다)
 * - `add-only` 운동이 이미 열렸다 — 지금처럼 겹치지 않는 종목만 더한다
 */
export type RoutineLoadDecision = "replace" | "ask" | "add-only";

type DecideDraft = Pick<
  WorkoutDraft,
  "exercises" | "sessionId" | "startedAtMs" | "suggestedForDayKey" | "scheduledPlanId"
>;

export function decideRoutineLoad(input: {
  draft: DecideDraft;
  /**
   * 퀘스트 카드 아래 **"내 루틴" 타일**로 열었는가 (`startCustomList("routine")`).
   * 그 타일은 "내 방법으로 시작"이다 — 퀘스트 목록을 걷어내고 고른 것만 남기는 길이라
   * 언제나 교체다. 묻는 화면을 띄우면 "추가"를 골라도 타일 효과가 원래 목록을 걷어내
   * 결국 같은 사고(종목 증발)가 난다.
   */
  fromTile: boolean;
  /**
   * 목록이 계획에 안 묶였는데 **오늘 일반 계획이 달력에 있다.** 교체하면 그 계획도
   * 루틴으로 바뀌므로(목록 = 오늘 계획 한 줄) 몰래 하지 않고 묻는다.
   */
  hasUnboundTodayPlan: boolean;
}): RoutineLoadDecision {
  const { draft, fromTile, hasUnboundTodayPlan } = input;
  // ⚠️ 세션이 열렸으면(시작 응답 전 포함) 목록은 그 세션 것이다 — 어떤 길로도 갈지 않는다
  if (draft.sessionId !== null || draft.startedAtMs !== null) return "add-only";
  if (fromTile) return "replace";
  if (draft.exercises.length === 0) return "replace";
  if (draft.scheduledPlanId === null && hasUnboundTodayPlan) return "ask";
  // 앱이 담아 준 제안(퀘스트)은 사용자가 만든 것이 아니다 — 루틴이 이긴다
  if (draft.suggestedForDayKey !== null) return "replace";
  return "ask";
}

/**
 * 루틴으로 **바꾼** draft. 순수 함수 — 원본 루틴 배열을 건드리지 않는다.
 *
 * - 종목·순서·무게·횟수·세트 수·시간·거리: 루틴 그대로 (`toDraftExercises` — 새 키, 미완료, 체감 없음)
 * - 제안 도장(`suggestedForDayKey`)을 지운다. 남기면 ① 달력 계획에 안 써지고
 *   ② 달력 계획이 있으면 화면 복귀 때 `swap`으로 계획에 덮이고 ③ 자정에 통째로 지워진다
 * - 인터벌·프로그램 표식은 푼다 — 그 계획은 운동 탭이 고치지 않는다(`decidePlanPush`)
 * - 일반 계획에 묶여 있으면 묶음을 유지한다 → 다음 쓰기(`update`)가 계획을 루틴으로 바꾼다
 * - 안 묶였으면 `bindPlanId`(오늘 일반 계획)에 묶는다 → 쓰기가 `create`(합치기, 계획 값이
 *   이김)가 아니라 `update`(교체)가 된다. 넘길 계획이 없으면 null
 */
export function buildRoutineReplacement(input: {
  draft: WorkoutDraft;
  routine: PlanExercise[];
  makeKey: () => string;
  bindPlanId: string | null;
}): WorkoutDraft {
  const { draft, routine, makeKey, bindPlanId } = input;
  const special = Boolean(draft.program) || Boolean(draft.tabataMinutes);
  const keptPlanId = special ? null : draft.scheduledPlanId;
  return {
    ...draft,
    exercises: toDraftExercises(routine, makeKey),
    suggestedForDayKey: null,
    effortMessage: null,
    sourceSessionId: null,
    tabataMinutes: null,
    intervalStartIndex: 0,
    program: null,
    scheduledPlanId: keptPlanId ?? bindPlanId,
  };
}

/** 동작 흔적용 요약 — 종목 수·세트 수만. 이름·무게는 남기지 않는다(`bug-trail` 규칙 2) */
export function routineLoadSummary(exercises: { sets: unknown[] }[]): string {
  const sets = exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  return `${exercises.length}ex/${sets}sets`;
}
