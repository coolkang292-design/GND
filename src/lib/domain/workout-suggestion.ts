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

/** `"YYYY-MM-DD"` 두 개의 날짜 차이(일). `Date`를 안 쓴다 — 타임존이 끼어든다 */
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
