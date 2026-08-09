/**
 * 큰 팝업의 화면 전환 규칙 (2026-08-04, 사용자 신고로 추가).
 *
 * **버그였던 것**: 모드를 "휴식이 도는가"로만 정해서, 마지막 세트를 끝내고
 * 휴식이 *끝나는* 순간 입력 화면으로 되돌아갔다. 이미 완료한 세트가
 * `현재 세트 1 / 1`로 다시 떠서 "운동이 안 끝났나?" 싶어진다.
 *
 * 남은 세트가 있는지도 함께 봐야 한다 — 그래서 규칙을 화면에서 떼어 여기 둔다.
 */
export function overlayMode(input: {
  /** 휴식 카운트다운이 도는 중인가 */
  resting: boolean;
  /** 아직 완료하지 않은 세트 수 */
  pendingSetCount: number;
}): "input" | "rest" {
  if (input.resting) return "rest";
  // 다 끝냈으면 완료 화면(rest)에 머문다. 입력으로 되돌아가지 않는다.
  return input.pendingSetCount === 0 ? "rest" : "input";
}

/**
 * 휴식이 끝난 순간 운동을 자동으로 마무리할지 (사용자 요청).
 *
 * "사진 찍는 화면으로 자연스럽게 전환이 되게" — 남은 세트가 0이면 사용자가 더
 * 할 일이 없다. 이때는 종료 확인창도 뜨지 않으므로(미완료 세트 0건) 자동
 * 전환이 안전하다. 남은 세트가 있으면 절대 자동으로 끝내지 않는다.
 */
export function shouldAutoFinishAfterRest(input: {
  pendingSetCount: number;
}): boolean {
  return input.pendingSetCount === 0;
}

/**
 * 세트를 완료한 뒤 휴식을 걸지 (2026-08-04, 사용자 결정 = B안).
 *
 * **마지막 세트에는 걸지 않는다.** 더 할 세트가 없는데 타이머를 돌릴 이유가 없고,
 * 무엇보다 유산소는 애초에 휴식이 안 걸리므로(`shouldStartRestCountdown`)
 * "휴식이 끝나면 넘어간다"에 기대면 **유산소로 끝낸 날은 자동 전환이 영영 안 온다.**
 * 타이머 대신 축하 화면을 잠깐 보여주고 넘어간다.
 */
export function shouldRestAfterCompletion(input: {
  /** 이 세트를 완료한 **뒤** 남는 미완료 세트 수 */
  pendingSetCountAfter: number;
}): boolean {
  return input.pendingSetCountAfter > 0;
}

/** 축하 화면을 보여주는 시간 — 이 뒤에 결과·인증 사진 화면으로 넘어간다 */
export const COMPLETION_AUTO_FINISH_MS = 3000;

// ── 운동 중 종목 바꾸기·건너뛰기 (2026-08-09) ──────────────────
//
// 사용자 신고: "운동 중 운동 교체 혹은 취소 하기 (…) 기능 작동 안함".
// 실제로는 **경로가 없었다.** 오버레이가 열려 있으면 `ExerciseCard`가 아예
// 렌더되지 않아(`record/page.tsx`의 `{!overlayOpen && exerciseCards}`), 종목
// 삭제·순서 변경이 전부 닫혀 있었다. 접기마저 상태바에 가려 안 눌렸으므로
// (`active-session-overlay.tsx` 주석) 운동 중에는 손쓸 방법이 없었다.

type FlowSet = { done: boolean };
type FlowExercise = { key: string; sets: FlowSet[] };

/**
 * 이 종목을 **다른 종목으로 바꿔도 되는가.**
 *
 * 완료한 세트가 하나라도 있으면 안 된다 — 그건 오늘의 **기록**이고, 종목을 바꾸면
 * 그 기록이 다른 운동의 것으로 둔갑한다. 그 경우엔 `건너뛰기`만 남긴다
 * (건너뛰기는 완료분을 보존한다).
 */
export function canReplaceExercise(exercise: FlowExercise | null): boolean {
  if (!exercise) return false;
  return !exercise.sets.some((set) => set.done);
}

/**
 * 종목 바꾸기 — 세트 **수**는 유지하고 값은 새로 시작한다.
 *
 * `build(previousSetCount)`로 새 종목을 만들게 해서 이 파일이 `LocalExercise`·
 * `localId`에 의존하지 않게 했다(도메인 계층은 데이터 계층을 모른다). 세트 수를
 * 넘겨주는 이유: 4세트 하려고 담아 뒀는데 바꿨더니 1세트가 되면 계획이 사라진다.
 *
 * 완료한 세트가 있으면 **아무것도 하지 않는다**(`replaced: false`). 화면이 버튼을
 * 숨기지만, 화면 규칙만 믿지 않는다 — 여기서도 막는다.
 */
export function replaceExercise<E extends FlowExercise>(
  exercises: E[],
  exKey: string,
  build: (previousSetCount: number) => E,
): { exercises: E[]; replaced: boolean } {
  const target = exercises.find((ex) => ex.key === exKey) ?? null;
  if (!target || !canReplaceExercise(target)) {
    return { exercises, replaced: false };
  }
  const next = build(target.sets.length);
  return {
    exercises: exercises.map((ex) => (ex.key === exKey ? next : ex)),
    replaced: true,
  };
}

/**
 * 종목 건너뛰기 — **종목을 통째로 오늘 기록에서 뺀다** (사용자 결정 2026-08-09:
 * *"건너뛰면 그 종목은 통째로 오늘 기록에서 빼줘"*).
 *
 * 기구에 사람이 많거나 몸이 안 따라줄 때 쓴다.
 *
 * ⚠️ **완료한 세트도 같이 사라진다.** 처음엔 완료분을 남기게 만들었는데(3세트 중
 * 2세트를 했으면 "2세트 한 것"으로), 사용자가 통째로 빼라고 정했다. 그래서 이건
 * **되돌릴 수 없는 삭제**다 — 화면은 완료한 세트가 있을 때 반드시 한 번 묻는다
 * (`handleSkipExercise`). 그 확인창을 지우지 마라.
 *
 * `discardedDoneSets`가 그 경고의 재료다. 0이면 잃을 것이 없으니 묻지 않는다.
 */
export function skipExercise<E extends FlowExercise>(
  exercises: E[],
  exKey: string,
): {
  exercises: E[];
  /** 사라진 세트 총수 (완료분 포함) */
  skippedSets: number;
  /** 그중 **완료돼 있던** 세트 수 — 확인창을 띄울지의 판단 재료 */
  discardedDoneSets: number;
  removedExercise: boolean;
} {
  const target = exercises.find((ex) => ex.key === exKey);
  if (!target) {
    return {
      exercises,
      skippedSets: 0,
      discardedDoneSets: 0,
      removedExercise: false,
    };
  }

  return {
    exercises: exercises.filter((ex) => ex.key !== exKey),
    skippedSets: target.sets.length,
    discardedDoneSets: target.sets.filter((set) => set.done).length,
    removedExercise: true,
  };
}
