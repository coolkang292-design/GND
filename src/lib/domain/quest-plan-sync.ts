/**
 * 퀘스트 목록 ↔ 오늘 계획 **두 줄** 동기화 (이슈 #33, 2026-11-28).
 *
 * 신고: 오늘의 퀘스트에서 인터벌을 지우고 다른 메뉴를 다녀오면 인터벌이 다시 나타났다.
 *
 * 원인: 같은 날 일반 계획(G)과 인터벌 계획(I)이 따로 있으면, 퀘스트는 I를 목록 뒤에 **복사해**
 * 담았다(`mergeIntervalPlanIntoList`). 목록은 그 복사본이 어느 계획에서 왔는지 몰랐고, 인터벌이 든
 * 목록은 계획에 아무것도 쓰지 않았다(`decidePlanPush`가 `tabataMinutes`면 none). 그래서 목록에서
 * 인터벌을 빼도 I는 DB에 그대로 남았고, 퀘스트 카드는 "목록에 인터벌이 없으니 오늘 인터벌 계획을
 * 같이 보여 준다"(`pickCompanionIntervalPlan`)로 그 I를 다시 집었다. 같은 이유로 인터벌이 든 목록에서
 * 고친 무게·횟수도 달력에 가지 않았다.
 *
 * 결정: 목록이 **두 출처를 따로 기억한다.**
 * - 일반 부분 → `scheduledPlanId`(G) — 지금까지와 같은 규칙(`decidePlanPush`/`decidePlanPull`)
 * - 인터벌 블록 + I에서 온 이어하기 → `intervalPlanId`(I) + `intervalFollowUpKeys`
 *
 * `intervalPlanId`의 세 가지 값 (블록이 목록에 있을 때만 뜻이 있다):
 * - `undefined` — 이 기능 전 draft(옛 모양). 인터벌 부분은 아무것도 쓰지 않는다(예전 동작).
 *   단, 오늘 인터벌 계획과 확실히 같은 복사본이면 연결한다(`inferIntervalLink`)
 * - `null` — 인터벌을 목록에서 새로 담았다(계획 없음) → 오늘 인터벌 계획을 **만든다**
 * - `"<id>"` — 그 계획과 연결됨
 *
 * 삭제 의도는 **따로** 적는다: `intervalRemovalPlanId`. 사용자가 인터벌 카드에서 [빼기]를 눌렀을 때만
 * 찬다(`removeIntervalBlockFromDraft`). `tabataMinutes === null`로 미루어 짐작하지 않는 이유 —
 * 루틴 갈아 끼우기·내 방법 모드처럼 목록을 통째로 비우는 길이 여럿이라, 짐작하면 그 길들이
 * 사용자가 지우지 않은 인터벌 계획을 지운다.
 *
 * ⚠️ 쓰는 순서는 언제나 **더하기 → 고치기 → 지우기**다(`day-plan-store.ts`와 같은 원칙).
 *    인터벌을 지울 때 이어하기는 일반 계획으로 먼저 옮겨 쓰고, 그게 성공한 뒤에야 I를 지운다.
 *    중간에 실패하면 남은 단계는 draft(이 폰 저장소)에 남아 다음 저장에서 다시 계산된다 —
 *    각 쓰기가 "그 계획의 전체 모습"을 쓰므로 몇 번 다시 해도 결과가 같다.
 *
 * ⚠️ DB 타입을 모른다 — 화면(`record/page.tsx`)이 조합한다.
 */
import { normalizedExerciseName } from "./workout-import";
import {
  decidePlanPull,
  decidePlanPush,
  planExercisesKey,
  toPlanExercises,
  type PlanExercise,
  type PlanPull,
  type PlanPush,
  type PlanSyncMark,
  type SyncPlan,
} from "./workout-plan";
import {
  TABATA_EXERCISE_COUNT,
  isIntervalBlockIndex,
  normalizeIntervalStartIndex,
  splitIntervalPlan,
} from "./tabata";

type ExerciseLike = Parameters<typeof toPlanExercises>[0][number];
/** draft가 든 종목 모양 */
type Item<D extends { exercises: unknown[] }> = D["exercises"][number];

export type QuestSyncDraft<E extends ExerciseLike = ExerciseLike> = {
  exercises: E[];
  scheduledPlanId: string | null;
  sessionId: string | null;
  startedAtMs: number | null;
  tabataMinutes: number | null;
  intervalStartIndex?: number | null;
  suggestedForDayKey: string | null;
  program: unknown;
  intervalPlanId?: string | null;
  intervalFollowUpKeys?: string[];
  /** 지울 차례인 인터벌 계획 — 블록을 [빼기]로 뺐고 계획은 아직 DB에 있다 */
  intervalRemovalPlanId?: string | null;
};

export type QuestParts<E> = {
  /** 일반 계획(G)에 쓰는 종목 — 목록 순서 그대로 */
  general: E[];
  /** 인터벌 블록 4종 (없으면 빈 배열) */
  block: E[];
  /** 인터벌 계획(I)에서 온 이어하기 — 목록 순서 그대로 */
  followUps: E[];
};

/** 목록을 출처별로 가른다. 블록이 없으면 전부 일반이다 */
export function splitQuestDraft<E extends ExerciseLike>(
  draft: QuestSyncDraft<E>,
): QuestParts<E> {
  if (draft.tabataMinutes === null) {
    return { general: [...draft.exercises], block: [], followUps: [] };
  }
  const followKeys = new Set(draft.intervalFollowUpKeys ?? []);
  const general: E[] = [];
  const block: E[] = [];
  const followUps: E[] = [];
  draft.exercises.forEach((exercise, index) => {
    if (isIntervalBlockIndex(draft.tabataMinutes, index, draft.intervalStartIndex)) {
      block.push(exercise);
    } else if (followKeys.has(exercise.key)) {
      followUps.push(exercise);
    } else {
      general.push(exercise);
    }
  });
  return { general, block, followUps };
}

/** 이 draft의 인터벌 부분을 계획과 맞추는가 — 옛 draft(`undefined`)는 맞추지 않는다 */
export function isIntervalTracked(draft: { intervalPlanId?: string | null }): boolean {
  return draft.intervalPlanId !== undefined;
}

/** 일반 부분이 묶인 계획 — 인터벌 계획에 묶인 옛 목록이면 일반 계획은 없다 */
export function generalPlanIdOf(draft: {
  scheduledPlanId: string | null;
  intervalPlanId?: string | null;
}): string | null {
  return draft.scheduledPlanId !== null && draft.scheduledPlanId === draft.intervalPlanId
    ? null
    : draft.scheduledPlanId;
}

/** 지울 차례인 인터벌 계획 — 블록은 목록에서 빠졌고 계획은 아직 DB에 있다 */
export function pendingIntervalRemoval(draft: {
  tabataMinutes: number | null;
  intervalRemovalPlanId?: string | null;
}): string | null {
  return typeof draft.intervalRemovalPlanId === "string" ? draft.intervalRemovalPlanId : null;
}

/** 인터벌 계획의 비교 표식 — 코스 분수가 바뀌어도 다시 쓴다 */
export function intervalPayloadKey(minutes: number, exercises: PlanExercise[]): string {
  return JSON.stringify({ minutes, exercises });
}

export type IntervalPush =
  | { kind: "none" }
  | { kind: "create"; tabataMinutes: number; exercises: PlanExercise[] }
  | { kind: "update"; planId: string; tabataMinutes: number; exercises: PlanExercise[] };

/** 인터벌 계획에 쓸 내용 — 블록 4종 + I에서 온 이어하기. 모양이 깨졌으면 null */
export function intervalPayload<E extends ExerciseLike>(
  draft: QuestSyncDraft<E>,
): { tabataMinutes: number; exercises: PlanExercise[] } | null {
  if (!draft.tabataMinutes) return null;
  const { block, followUps } = splitQuestDraft(draft);
  if (block.length !== TABATA_EXERCISE_COUNT) return null;
  const exercises = toPlanExercises([...block, ...followUps]);
  // 하나라도 계획 모양으로 못 바꾸면(값이 깨짐) 쓰지 않는다 — 멀쩡한 계획을 덮지 않는다
  if (exercises.length !== block.length + followUps.length) return null;
  return { tabataMinutes: draft.tabataMinutes, exercises };
}

/**
 * 인터벌 계획에 **써야 하는가**.
 *
 * - 운동 중·프로그램 회차면 쓰지 않는다(일반 부분과 같은 이유)
 * - 옛 draft(`intervalPlanId === undefined`)는 쓰지 않는다
 * - 연결이 없으면(`null`) → 만든다
 * - 지우기는 여기서 정하지 않는다 — `pendingIntervalRemoval`, 언제나 마지막 단계다
 * - 마지막으로 맞춘 내용과 같으면 → 쓰지 않는다
 */
export function decideIntervalPush<E extends ExerciseLike>(
  draft: QuestSyncDraft<E>,
  mark: PlanSyncMark | null,
): IntervalPush {
  if (draft.startedAtMs !== null || draft.program) return { kind: "none" };
  if (!isIntervalTracked(draft)) return { kind: "none" };
  const payload = intervalPayload(draft);
  if (!payload) return { kind: "none" };
  if (!draft.intervalPlanId) return { kind: "create", ...payload };
  if (
    mark?.planId === draft.intervalPlanId &&
    mark.json === intervalPayloadKey(payload.tabataMinutes, payload.exercises)
  ) {
    return { kind: "none" };
  }
  return { kind: "update", planId: draft.intervalPlanId, ...payload };
}

/**
 * 일반 부분을 일반 계획에 써야 하는가 — 규칙은 `decidePlanPush` 그대로, 목록만 일반 부분이다.
 *
 * 옛 draft에 인터벌이 들어 있으면 예전처럼 아무것도 쓰지 않는다 — 어느 종목이 인터벌 계획에서
 * 왔는지 몰라, 일반 계획에 쓰면 이어하기가 두 계획에 겹친다.
 */
export function decideGeneralPush<E extends ExerciseLike>(
  draft: QuestSyncDraft<E>,
  mark: PlanSyncMark | null,
): PlanPush {
  if (draft.tabataMinutes !== null && !isIntervalTracked(draft)) return { kind: "none" };
  const { general } = splitQuestDraft(draft);
  return decidePlanPush(
    {
      ...draft,
      exercises: general,
      tabataMinutes: null,
      scheduledPlanId: generalPlanIdOf(draft),
    },
    mark,
  );
}

/** 지금 계획에 쓸 것이 남았는가 — 저장 상태 표시("저장 중…")용 */
export function hasPendingPlanWrites<E extends ExerciseLike>(
  draft: QuestSyncDraft<E>,
  marks: { general: PlanSyncMark | null; interval: PlanSyncMark | null },
): boolean {
  return (
    decideGeneralPush(draft, marks.general).kind !== "none" ||
    decideIntervalPush(draft, marks.interval).kind !== "none" ||
    pendingIntervalRemoval(draft) !== null
  );
}

/**
 * 인터벌이 든 목록의 **일반 부분** 읽기 — `decidePlanPull`을 일반 부분에만 돌린다.
 *
 * 인터벌이 함께 있으면 받아들이는 것은 두 가지뿐이다:
 * - `adopt` 달력·다른 기기가 일반 계획을 고쳤다 → 일반 부분만 갈아 끼운다
 * - `clear`(지움·옮김·지난 계획) → 일반 부분만 비운다
 * 나머지(`load`·`swap`·`absorb`)는 목록 전체를 다시 짜는 동작이라 인터벌과 섞으면 순서가 깨진다.
 * 그건 다음 push가 맞춘다.
 */
export function decideGeneralPull<P extends SyncPlan, E extends ExerciseLike>(input: {
  draft: QuestSyncDraft<E>;
  todayKey: string;
  todayPlans: P[];
  bound: P | null;
  mark: PlanSyncMark | null;
  starting: boolean;
}): PlanPull<P> {
  const { draft } = input;
  if (draft.tabataMinutes === null) {
    return withLocalEditsKept(
      decidePlanPull({ ...input, draft: { ...draft, tabataMinutes: null } }),
      draft.exercises,
      input.mark,
    );
  }
  if (!isIntervalTracked(draft)) return { kind: "none" };
  const { general } = splitQuestDraft(draft);
  const pull = decidePlanPull({
    ...input,
    draft: {
      ...draft,
      exercises: general,
      tabataMinutes: null,
      scheduledPlanId: generalPlanIdOf(draft),
      // 인터벌이 든 목록은 이미 사용자가 받아들인 퀘스트다 — 제안 표식으로 갈아 끼우지 않는다
      suggestedForDayKey: null,
    },
  });
  if (pull.kind === "adopt") return withLocalEditsKept(pull, general, input.mark);
  if (pull.kind === "clear" && pull.reason !== "special") return { ...pull, next: null };
  return { kind: "none" };
}

/**
 * 충돌 기준 (이슈 #33 TASK-03): 이 폰에 **아직 저장 못 한 수정**이 있으면 이 폰이 이긴다.
 *
 * 표식(`mark.json`)은 마지막으로 계획과 맞춘 목록이다. 지금 목록이 그것과 다르면 사용자가 그 뒤에
 * 고친 것이고, 0.6초 뒤(또는 다시 연결되면) 그대로 계획에 쓴다. 그 사이에 달력·다른 기기 값을
 * 받아들이면 방금 친 무게·횟수가 사라진다. 고친 게 없으면 달력·다른 기기의 최신 저장을 받는다.
 * 즉 **마지막으로 저장된 쪽이 남는다.**
 */
function withLocalEditsKept<P extends SyncPlan, E extends ExerciseLike>(
  pull: PlanPull<P>,
  general: E[],
  mark: PlanSyncMark | null,
): PlanPull<P> {
  if (pull.kind !== "adopt" || !mark) return pull;
  return mark.json === planExercisesKey(toPlanExercises(general)) ? pull : { kind: "none" };
}

export type IntervalPull<P> =
  | { kind: "none" }
  /** 연결된 인터벌 계획이 오늘 인터벌이 아니게 됐다(지움·옮김·일반으로 바뀜) — 블록을 뺀다 */
  | { kind: "dropped" }
  /** 달력·다른 기기가 인터벌 계획을 고쳤다 — 블록·이어하기를 그 계획으로 갈아 끼운다 */
  | { kind: "adopt"; plan: P };

/** 연결된 인터벌 계획 읽기. `plan`은 id로 찾은 계획(없으면 null) */
export function decideIntervalPull<
  P extends { id: string; planDate: string; updatedAt: string; tabataMinutes: number | null },
  E extends ExerciseLike,
>(input: {
  draft: QuestSyncDraft<E>;
  todayKey: string;
  plan: P | null;
  mark: PlanSyncMark | null;
  starting: boolean;
}): IntervalPull<P> {
  const { draft, plan, mark } = input;
  if (input.starting || draft.startedAtMs !== null || draft.sessionId !== null) {
    return { kind: "none" };
  }
  if (!draft.intervalPlanId || draft.tabataMinutes === null) return { kind: "none" };
  if (!plan || plan.planDate !== input.todayKey || !plan.tabataMinutes) {
    return { kind: "dropped" };
  }
  if (!mark || mark.planId !== plan.id || mark.updatedAt === plan.updatedAt) {
    return { kind: "none" };
  }
  // 이 폰에 아직 저장 못 한 인터벌 수정이 있으면 이 폰이 이긴다 (`withLocalEditsKept`와 같은 기준)
  const payload = intervalPayload(draft);
  if (payload && intervalPayloadKey(payload.tabataMinutes, payload.exercises) !== mark.json) {
    return { kind: "none" };
  }
  return { kind: "adopt", plan };
}

/** 목록에서 인터벌 부분(블록 + I의 이어하기)을 뺀다. 일반 부분은 그대로 */
export function withoutIntervalPart<D extends QuestSyncDraft>(
  draft: D,
): D {
  if (draft.tabataMinutes === null) return draft;
  const { general } = splitQuestDraft(draft);
  return {
    ...draft,
    exercises: general,
    tabataMinutes: null,
    intervalStartIndex: undefined,
    intervalPlanId: undefined,
    intervalFollowUpKeys: [],
  };
}

/**
 * 목록의 인터벌 부분을 계획 내용으로 갈아 끼운다 (`adopt`). 블록 자리는 그대로 두고,
 * I의 이어하기는 블록 바로 뒤에 둔다. 일반 부분에 같은 이름이 있으면 이어하기에서 뺀다
 * (`followUpsNotInList`와 같은 규칙 — 목록 쪽 세트를 남긴다).
 */
export function replaceIntervalPart<D extends QuestSyncDraft>(
  draft: D,
  next: { tabataMinutes: number; block: Item<D>[]; followUps: Item<D>[] },
): D {
  const start = normalizeIntervalStartIndex(draft.intervalStartIndex);
  const { general } = splitQuestDraft(draft);
  // 블록 앞에 있던 일반 종목 수 — 갈아 끼운 뒤에도 같은 자리에 둔다
  const leadingCount = draft.tabataMinutes === null
    ? general.length
    : draft.exercises
        .slice(0, start)
        .filter((exercise) => !(draft.intervalFollowUpKeys ?? []).includes(exercise.key)).length;
  const known = new Set(general.map((exercise) => normalizedExerciseName(exercise.name)));
  const followUps = next.followUps.filter((exercise) => {
    const name = normalizedExerciseName(exercise.name);
    if (!name || known.has(name)) return false;
    known.add(name);
    return true;
  });
  const leading = general.slice(0, leadingCount);
  const trailing = general.slice(leadingCount);
  return {
    ...draft,
    exercises: [...leading, ...next.block, ...followUps, ...trailing],
    tabataMinutes: next.tabataMinutes,
    intervalStartIndex: leading.length,
    intervalFollowUpKeys: followUps.map((exercise) => exercise.key),
  };
}

/**
 * 이 기능 전에 담긴 목록(옛 draft)이 오늘 인터벌 계획의 **온전한 복사본**인지 보고 연결한다.
 *
 * 블록 4종 이름이 그 계획의 블록과 같고, 그 계획의 이어하기가 **전부** 블록 밖에 들어 있을 때만
 * 연결한다. 하나라도 빠졌으면(계획의 인터벌 4종만 담긴 옛 복사본 등) 연결하지 않는다 — 연결하면
 * 다음 저장이 목록 모양으로 계획을 덮어, 목록에 없던 이어하기가 계획에서 지워진다.
 */
export function inferIntervalLink<
  P extends {
    id: string;
    tabataMinutes: number | null;
    programEnrollmentId: string | null;
    exercises: { name: string }[];
  },
  E extends ExerciseLike,
>(draft: QuestSyncDraft<E>, todayPlans: P[]): { plan: P; followUpKeys: string[] } | null {
  if (draft.tabataMinutes === null || isIntervalTracked(draft)) return null;
  if (draft.startedAtMs !== null || draft.sessionId !== null) return null;
  const { block } = splitQuestDraft({ ...draft, intervalFollowUpKeys: [] });
  if (block.length !== TABATA_EXERCISE_COUNT) return null;
  const blockNames = block.map((exercise) => normalizedExerciseName(exercise.name));
  const candidates = todayPlans.filter((plan) => {
    if (!plan.tabataMinutes || plan.programEnrollmentId) return false;
    const planBlock = splitIntervalPlan(plan.exercises).block;
    return (
      planBlock.length === TABATA_EXERCISE_COUNT &&
      planBlock.every((item, index) => normalizedExerciseName(item.name) === blockNames[index])
    );
  });
  // 같은 블록의 인터벌 계획이 둘이면 어느 것인지 모른다 — 연결하지 않는다
  if (candidates.length !== 1) return null;
  const plan = candidates[0];
  const start = normalizeIntervalStartIndex(draft.intervalStartIndex);
  const outside = draft.exercises.filter(
    (_, index) => index < start || index >= start + TABATA_EXERCISE_COUNT,
  );
  const followUpKeys: string[] = [];
  const used = new Set<string>();
  for (const item of splitIntervalPlan(plan.exercises).followUps) {
    const name = normalizedExerciseName(item.name);
    const match = outside.find(
      (exercise) => !used.has(exercise.key) && normalizedExerciseName(exercise.name) === name,
    );
    if (!match) return null;
    used.add(match.key);
    followUpKeys.push(match.key);
  }
  return { plan, followUpKeys };
}

/** 지운 것을 되돌리기 위해 남겨 두는 모습 (실행 취소, TASK-04) */
export type IntervalRemovalSnapshot<E> = {
  block: E[];
  startIndex: number;
  tabataMinutes: number;
  followUpKeys: string[];
  planId: string | null | undefined;
};

/**
 * 인터벌 블록을 뺀다 — 삭제 의도를 남긴다. 이어하기는 일반 부분으로 넘어간다
 * (인터벌 계획의 후속 운동은 보존한다 — 일반 계획으로 옮겨 쓴 뒤 인터벌 계획을 지운다).
 */
export function removeIntervalBlockFromDraft<D extends QuestSyncDraft>(
  draft: D,
): { draft: D; snapshot: IntervalRemovalSnapshot<Item<D>> | null } {
  if (draft.tabataMinutes === null) return { draft, snapshot: null };
  const start = normalizeIntervalStartIndex(draft.intervalStartIndex);
  const { block } = splitQuestDraft(draft);
  const snapshot: IntervalRemovalSnapshot<Item<D>> = {
    block,
    startIndex: start,
    tabataMinutes: draft.tabataMinutes,
    followUpKeys: [...(draft.intervalFollowUpKeys ?? [])],
    planId: draft.intervalPlanId,
  };
  return {
    draft: {
      ...draft,
      exercises: draft.exercises.filter(
        (_, index) => !isIntervalBlockIndex(draft.tabataMinutes, index, draft.intervalStartIndex),
      ),
      tabataMinutes: null,
      intervalStartIndex: undefined,
      intervalPlanId: undefined,
      intervalFollowUpKeys: [],
      // 연결이 있으면 "지울 차례"로 적는다. 연결이 없으면(`null`, 아직 안 만든 인터벌) 지울 계획도 없다.
      // 앞서 지울 차례였던 것이 아직 남아 있으면 그것을 잃지 않는다
      intervalRemovalPlanId:
        typeof draft.intervalPlanId === "string"
          ? draft.intervalPlanId
          : (draft.intervalRemovalPlanId ?? null),
      // 목록이 인터벌 계획 자체에 묶여 있었으면(옛 담기) 묶음을 푼다 — 일반 부분은 일반 계획으로 간다
      scheduledPlanId:
        draft.scheduledPlanId !== null && draft.scheduledPlanId === draft.intervalPlanId
          ? null
          : draft.scheduledPlanId,
    },
    snapshot,
  };
}

/**
 * 인터벌 삭제를 되돌린다 — 블록을 원래 자리에 다시 넣고 이어하기 연결을 되살린다.
 * 그 사이 고친 다른 종목(무게·추가·삭제)은 그대로 둔다.
 *
 * - 계획을 아직 안 지웠으면(그대로 "지울 차례") 연결을 되살린다 → 지우기가 취소된다
 * - 이미 지웠으면 새로 만들도록 `null`로 둔다 → 다음 저장이 인터벌 계획을 다시 만든다
 * - 이미 다른 인터벌을 담았으면 되돌리지 않는다(한 목록에 인터벌은 하나)
 */
export function restoreIntervalBlock<D extends QuestSyncDraft>(
  draft: D,
  snapshot: IntervalRemovalSnapshot<Item<D>>,
): D | null {
  if (draft.tabataMinutes !== null || draft.startedAtMs !== null) return null;
  const at = Math.min(snapshot.startIndex, draft.exercises.length);
  const keys = new Set(draft.exercises.map((exercise) => exercise.key));
  const stillPending =
    typeof snapshot.planId === "string" && draft.intervalRemovalPlanId === snapshot.planId;
  return {
    ...draft,
    exercises: [...draft.exercises.slice(0, at), ...snapshot.block, ...draft.exercises.slice(at)],
    tabataMinutes: snapshot.tabataMinutes,
    intervalStartIndex: at,
    intervalFollowUpKeys: snapshot.followUpKeys.filter((key) => keys.has(key)),
    intervalPlanId:
      snapshot.planId === undefined ? undefined : stillPending ? snapshot.planId : null,
    intervalRemovalPlanId: stillPending ? null : (draft.intervalRemovalPlanId ?? null),
  };
}

/** 종목 하나를 되돌린다 — 그 사이 목록이 바뀌었어도 원래 자리 근처에 다시 넣는다 */
export function restoreRemovedExercise<D extends QuestSyncDraft>(
  draft: D,
  removed: { exercise: Item<D>; index: number; wasFollowUp: boolean },
): D | null {
  if (draft.startedAtMs !== null) return null;
  if (draft.exercises.some((exercise) => exercise.key === removed.exercise.key)) return null;
  const at = Math.min(removed.index, draft.exercises.length);
  const start = normalizeIntervalStartIndex(draft.intervalStartIndex);
  // 블록 한가운데에는 넣지 않는다 — 블록 뒤로 민다
  const insertAt =
    draft.tabataMinutes !== null && at > start && at < start + TABATA_EXERCISE_COUNT
      ? start + TABATA_EXERCISE_COUNT
      : at;
  return {
    ...draft,
    exercises: [
      ...draft.exercises.slice(0, insertAt),
      removed.exercise,
      ...draft.exercises.slice(insertAt),
    ],
    ...(draft.tabataMinutes !== null && insertAt <= start
      ? { intervalStartIndex: start + 1 }
      : {}),
    ...(removed.wasFollowUp && draft.tabataMinutes !== null
      ? { intervalFollowUpKeys: [...(draft.intervalFollowUpKeys ?? []), removed.exercise.key] }
      : {}),
    suggestedForDayKey: null,
  };
}

/**
 * 목록의 **일반 부분만** 갈아 끼운다 — 인터벌 블록과 I의 이어하기는 자리째 그대로 둔다.
 * 달력이 일반 계획을 고쳤을 때(`adopt`)·일반 계획이 지워졌을 때(`clear`)·합친 계획으로 바꿀 때 쓴다.
 * 블록 앞에 있던 일반 종목 수만큼은 새 일반 종목도 블록 앞에 둔다.
 */
export function replaceGeneralPart<D extends QuestSyncDraft>(
  draft: D,
  nextGeneral: Item<D>[],
): D {
  if (draft.tabataMinutes === null) return { ...draft, exercises: nextGeneral };
  const start = normalizeIntervalStartIndex(draft.intervalStartIndex);
  const { block, followUps } = splitQuestDraft(draft);
  const followKeys = new Set(draft.intervalFollowUpKeys ?? []);
  const leadingCount = Math.min(
    draft.exercises.slice(0, start).filter((exercise) => !followKeys.has(exercise.key)).length,
    nextGeneral.length,
  );
  return {
    ...draft,
    exercises: [
      ...nextGeneral.slice(0, leadingCount),
      ...block,
      ...followUps,
      ...nextGeneral.slice(leadingCount),
    ],
    intervalStartIndex: leadingCount,
  };
}
