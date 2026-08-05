import { pickByDay } from "./streak-messages";

/**
 * 마지막 세트를 끝냈을 때의 안내 + 응원 (2026-08-04, 사용자 요청).
 *
 * ⚠️ **렌더 중 랜덤을 쓰지 않는다.** `streak-messages.ts`가 같은 이유로
 * `pickByDay`를 쓴다 — 재렌더마다 문구가 바뀌면 화면이 덜컹거리고, 서버·클라이언트
 * 문구가 갈리면 하이드레이션이 어긋난다. 문구 추가·수정은 이 파일만 고친다.
 */
export type CompletionMessage = {
  headline: string;
  cheer: string;
};

/** GND 톤: 손실회피 없이, 끝낸 사람에게는 능청스럽게 칭찬만 */
const CHEERS = [
  "담은 거 하나도 안 남기셨네요. 오늘의 승자십니다 🏆",
  "계획대로 끝내는 사람, 생각보다 드뭅니다. 오늘 그중 하나예요 💪",
  "미룬 세트 0개. 이 기록은 좀 자랑하셔도 됩니다 🔥",
  "몸은 힘들었겠지만 기록은 아주 깔끔합니다 ✨",
  "오늘 몫 완납. 내일의 나에게 빚 안 남겼어요 👏",
  "끝까지 한 날은 티가 납니다. 오늘이 그런 날이에요 🙌",
  "세트 다 채우셨습니다. 이제 쉬는 것도 운동의 일부예요 😌",
];

const HEADLINE = "오늘 계획한 운동을 다 했어요 🎉";

export function workoutCompletionMessage(input: {
  /** 사용자 tz 기준 오늘 (YYYY-MM-DD) — 문구 로테이션 기준 */
  todayKey: string;
}): CompletionMessage {
  return {
    headline: HEADLINE,
    cheer: pickByDay(CHEERS, input.todayKey),
  };
}
