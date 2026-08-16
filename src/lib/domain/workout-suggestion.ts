/**
 * 계획 없는 날의 운동 제안 — 분기와 문구 (2026-08-16).
 *
 * 설계: `docs/superpowers/specs/2026-08-16-empty-day-workout-suggestion-design.md`
 *
 * ⚠️⚠️ **이 모듈은 브리핑 라우트(서버)와 기록 탭(화면)이 같이 쓴다.**
 * `viewing-pass.ts`가 서버 규칙과 갈려서 `peek-reset-check.mjs`라는 감시
 * 스크립트를 낳았는데, 여기는 양쪽 다 TypeScript라 애초에 한 벌로 둘 수 있다.
 *
 * ⚠️ I/O를 하지 않는다. "무엇을 제안할까"만 정하고 조회는 부르는 쪽이 한다.
 */

import { pickByDay } from "./streak-messages";

/** 무엇을 제안하는가 */
export type SuggestionKind = "walk" | "repeat" | "interval";

/**
 * 새 사용자에게 걷기를 권하는 창(일). 이 뒤로도 기록이 없으면 **조용해진다.**
 *
 * ⚠️ 이 창을 지우거나 늘리기 전에 생각하라. 창이 없으면 기록 0건인 계정 전부가
 * 매일 알림을 받는다 — 가입만 하고 잊은 사람에게 영원히 가는 알림은 차단이나
 * 앱 삭제로 이어진다.
 */
export const NEW_USER_GRACE_DAYS = 7;

/**
 * `"YYYY-MM-DD"` 두 날짜의 차이(일).
 *
 * ⚠️ `Date.parse`를 쓰되 **양쪽 모두 `T00:00:00Z`로 못 박는다.** 기기 타임존이
 *    끼어들 자리를 없애려는 것이다. `Z`를 빼지 마라 — `"2026-08-16T00:00:00"`처럼
 *    **시각은 있는데 오프셋이 없는** 문자열은 기기 지역시로 읽혀서, KST 기기에서는
 *    `2026-08-15T15:00:00Z`가 되어 하루가 밀린다.
 *
 *    (날짜만 있는 `"2026-08-16"`은 명세상 이미 UTC라 그 자체로는 안 밀린다.
 *     여기서 위험한 건 `Z` 없는 **시각 붙은** 형태다 — 반례를 헷갈리지 마라.)
 */
function daysBetween(fromDayKey: string, toDayKey: string): number {
  const ms =
    Date.parse(`${toDayKey}T00:00:00Z`) - Date.parse(`${fromDayKey}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * 오늘 무엇을 제안할까. 제안할 것이 없으면 `null`.
 *
 * ⚠️ **종목을 반환하지 않는다.** `kind`만 돌려주고 무엇을 담을지는 화면이 정한다.
 *    서버가 종목까지 실어 보내면, 알림이 저장된 뒤 사용자가 운동을 하나 더 해도
 *    옛 제안이 그대로 온다.
 *
 * ⚠️ **입력에 `completedCount`를 쓰지 마라.** 화면은 완료 수를 모르고
 *    `hasHistory` 1비트만 갖고 있다(`record/page.tsx`의 `hasHistory`). 수를
 *    요구하면 화면이 새 질의를 하게 되고, 그 질의가 서버와 미묘하게 갈리는 순간
 *    **알림은 걷기를 말하는데 화면은 지난 운동을 담는다.**
 */
export function pickSuggestionKind(input: {
  hasPlanToday: boolean;
  didWorkoutToday: boolean;
  hasHistory: boolean;
  lastSessionWasInterval: boolean;
  isInActiveChallenge: boolean;
  signedUpDayKey: string;
  todayKey: string;
}): SuggestionKind | null {
  if (input.hasPlanToday) return null;
  if (input.didWorkoutToday) return null;

  if (!input.hasHistory) {
    // 되살릴 지난 운동이 없다. 챌린지 참가자는 창과 무관하게 인터벌로 보낸다 —
    // 이미 하겠다고 손 든 사람이라 "조용해지는" 규칙의 대상이 아니다.
    if (input.isInActiveChallenge) return "interval";
    return daysBetween(input.signedUpDayKey, input.todayKey) <
      NEW_USER_GRACE_DAYS
      ? "walk"
      : null;
  }

  // 지난 세션이 인터벌이면 주 제안이 인터벌이다 — 아니면 주·보조가 같은 것 둘이 된다.
  if (input.lastSessionWasInterval) return "interval";
  return "repeat";
}

/**
 * 주 제안에 딸리는 보조 제안. 없으면 `null`.
 *
 * ⚠️ 보조 버튼은 주 버튼과 **하는 일이 다르다** — 주 제안은 목록에 담고,
 * 인터벌은 4분 시트를 연다. `recommended-picker.tsx`의 `interval` 칸이 같은
 * 함정을 겪었다(담기만 하면 3세트 10회짜리 일반 운동이 되어 버린다). 그래서
 * 화면 문구도 `담기`가 아니라 **`시작`** 이어야 한다.
 */
export function secondaryKind(primary: SuggestionKind): SuggestionKind | null {
  return primary === "repeat" ? "interval" : null;
}

export type SuggestionCopy = { title: string; body: string };

/**
 * 공통 철학문 — **이 기능의 존재 이유다** (사용자 지시 2026-08-16).
 *
 * "오래 하는 게 중요한 게 아니라 하루라도 빼먹지 않는 게 중요하다."
 * 알림 본문과 화면 카드가 **같은 말**을 하도록 한 곳에 둔다.
 */
// ⚠️ `readonly`를 붙이지 마라. `pickByDay<T>(variants: T[], …)`가 **가변 배열**을
//    받는다(`streak-messages.ts:118` 실측). `readonly string[]`을 넘기면
//    `Argument of type 'readonly string[]' is not assignable to 'string[]'`로 막힌다.
export const SUGGESTION_PHILOSOPHY: string[] = [
  "오래 하는 것보다, 하루도 빼먹지 않는 게 중요해요",
  "길게 못 해도 괜찮아요 · 안 빼먹는 게 이겨요",
];

const WALK_TITLES: string[] = [
  "🚶 오늘은 10분 걷기부터",
  "🚶 딱 10분만 걸어볼까요?",
  "🚶 오늘의 한 걸음, 10분",
];

const INTERVAL_TITLES: string[] = [
  "⏱️ 딱 4분만 해볼까요?",
  "⏱️ 4분이면 충분해요",
  "⏱️ 오늘은 4분 인터벌 어때요?",
];

const REPEAT_TITLES: ((streak: number) => string)[] = [
  (n) => `🔥 ${n}일째 — 오늘이 아직 비어 있어요`,
  (n) => `🔥 ${n}일 이어왔어요, 오늘도 한 번?`,
  (n) => `🔥 오늘만 채우면 ${n + 1}일`,
];

/**
 * 스트릭이 **끊긴** 사람의 제목 (2026-08-16).
 *
 * ⚠️⚠️ `currentStreak`는 연속이 끊기면 **0**을 돌려준다(`streak.ts:42`). 그대로
 *    `REPEAT_TITLES`에 넣으면 `🔥 0일째` · `🔥 0일 이어왔어요`가 나간다 —
 *    **하필 재참여가 가장 필요한 사람에게** 말이 안 되는 문구다.
 *
 * ⚠️ 없는 연속을 숫자로 말하지 않는다. `streak-messages.ts` 머리주석이 같은
 *    규칙을 적어 두고 있다: 소멸 단계는 새 출발 효과를 쓰고, *"사실을 넘지 마라.
 *    화면이 거짓말하는 순간 다음 경고도 안 믿는다."*
 */
const REPEAT_RESTART_TITLES: string[] = [
  "🔥 오늘, 다시 시작해볼까요?",
  "🔥 지난번 그 운동부터 다시",
  "🔥 오늘 한 번이면 다시 1일",
];

const REPEAT_BODY = "지난번 그대로 담아 뒀어요 · 시간 없으면 4분만이라도";

/**
 * 알림과 화면 카드가 **같이 쓰는** 문구.
 *
 * ⚠️ 문구를 kind마다 하나로 고정하지 마라. 계획 없는 날이 이어지면 이 알림이
 * 매일 오는데, 같은 말이 반복되면 잔소리가 된다. 기존 브리핑이 `pickByDay`로
 * 이미 돌고 있어서(`briefing.ts`), 고정하면 **기존보다 후퇴**한다.
 *
 * ⚠️ 랜덤이 아니라 **날짜 기반 결정적 로테이션**이다. 렌더 중 랜덤은
 * 하이드레이션 불일치와 "재렌더마다 문구가 바뀜"을 만든다 —
 * `streak-messages.ts` 머리주석이 같은 이유를 적어 두고 있다.
 */
export function suggestionCopy(
  kind: SuggestionKind,
  todayKey: string,
  streak: number,
): SuggestionCopy {
  if (kind === "repeat") {
    return {
      // ⚠️ 스트릭 0은 **끊긴 상태**다. 숫자를 말하지 않는 쪽으로 간다 —
      //    위 `REPEAT_RESTART_TITLES` 주석 참조.
      title:
        streak > 0
          ? pickByDay(REPEAT_TITLES, todayKey)(streak)
          : pickByDay(REPEAT_RESTART_TITLES, todayKey),
      body: REPEAT_BODY,
    };
  }
  return {
    title: pickByDay(kind === "walk" ? WALK_TITLES : INTERVAL_TITLES, todayKey),
    body: pickByDay(SUGGESTION_PHILOSOPHY, todayKey),
  };
}
