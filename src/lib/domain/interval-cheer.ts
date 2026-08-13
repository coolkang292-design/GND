import type { IntervalCue } from "./interval-cue";

/**
 * 인터벌 실행 화면의 응원 문구 (사용자 지시 2026-08-13).
 *
 * 종목 이름만 있으니 화면이 허전하다는 지적에서 나왔다.
 *
 * ⚠️ **렌더마다 랜덤을 뽑으면 안 된다.** 이 화면은 음원 위치가 바뀔 때마다 —
 *    초당 네 번쯤 — 다시 그려진다. 랜덤이면 문구가 깜빡여서 읽을 수가 없다.
 *    그래서 **라운드 번호로 정해지는 순수 함수**다. 같은 라운드 안에서는 항상
 *    같은 문구가 나오고, 라운드가 바뀔 때만 바뀐다.
 *
 * ⚠️ 숫자를 세지 않는다. 남은 초는 음악이 부르고 화면에서는 뺐다 — 문구까지
 *    "3초 남았어요"라고 하면 같은 실수를 되풀이하는 셈이다.
 */

/** 운동 구간 — 몸을 쓰는 20초 동안 읽힐 말 */
const WORK: readonly string[] = [
  "지금 이 순간만 버티면 돼요",
  "자세부터, 속도는 그다음",
  "숨 참지 말고 계속 쉬어요",
  "딱 이만큼만 더",
  "어깨 힘 빼고 편하게",
  "잘하고 있어요",
  "리듬만 유지하면 돼요",
  "여기서 한 번 더",
];

/** 휴식 구간 — 10초 안에 회복하게 만드는 말 */
const REST: readonly string[] = [
  "숨 고르세요",
  "어깨 내리고 크게 한 번",
  "물 한 모금 해도 좋아요",
  "곧 다시 시작해요",
];

/** 마지막 라운드에만 나오는 말 — 끝이 보일 때가 제일 힘들다 */
const LAST_WORK = "마지막 라운드예요 — 여기까지 왔어요";
const LAST_REST = "이제 한 번만 더 하면 끝이에요";

/**
 * 이 순간에 보여줄 응원 문구. 없으면 `null`이라 화면이 자리를 비운다.
 *
 * @param cue `intervalCueAt()`이 준 지금 상태
 */
export function intervalCheer(cue: IntervalCue): string | null {
  switch (cue.phase) {
    case "prep":
      return cue.round === 0
        ? "곧 시작해요 — 크게 숨 한 번"
        : "이어서 갑니다 — 자세 잡으세요";
    case "work":
      return cue.round === cue.totalRounds - 1
        ? LAST_WORK
        : WORK[cue.round % WORK.length];
    case "rest":
      // 마지막 운동을 앞둔 휴식
      return cue.round === cue.totalRounds - 2
        ? LAST_REST
        : REST[cue.round % REST.length];
    case "done":
      return "끝까지 해냈어요";
  }
}
