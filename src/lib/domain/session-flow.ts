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
