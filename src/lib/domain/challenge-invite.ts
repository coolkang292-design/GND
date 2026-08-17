/**
 * **친구부터 부르는** 챌린지 시작 경로의 순수 규칙 (2026-08-17).
 *
 * 왜 생겼나: 운영 DB 실측에서 챌린지 18개 중 **14개가 참가자 1명**이었고, 전 기간
 * 초대 알림은 **1건**, 초대 링크로 들어온 신규 가입자는 **0명**이었다. 만들기가
 * 막힌 게 아니다 — 만든 **뒤에야** 초대할 수 있어서, 방장이 혼자 만들고 아무도
 * 안 오면 지우고 다시 만들기를 반복했다(2026-07-31 하루에 7개 생성·전부 취소).
 *
 * 그래서 순서를 뒤집는다. 기본값으로 방을 먼저 만들고 **링크를 즉시** 손에 쥐여
 * 준다. 이름·기간·목표를 묻는 폼은 친구가 들어온 뒤로 미룬다.
 *
 * ⚠️ 여기에는 DB·네트워크·`navigator`가 들어오지 않는다. 순수 함수만 둔다 —
 * 공유 자체는 브라우저 API라 화면이 부르고, 이 파일은 **무엇을 보낼지**만 정한다.
 */

/**
 * 기본 챌린지 기간(일). 양끝 포함이라 시작일 + 27일이 종료일이다.
 *
 * ⚠️ `defaultChallengeName`의 `4주`와 **묶여 있다.** 여기를 고치면 이름도 같이
 * 고쳐라 — 안 그러면 이름이 `4주 챌린지`인데 기간이 5주인 방이 생긴다.
 * `challenge-invite.test.ts`가 `DEFAULT_CHALLENGE_DAYS / 7 === 4`를 단언한다.
 */
export const DEFAULT_CHALLENGE_DAYS = 28;

/** `YYYY-MM-DD` → UTC ms. 시간대를 태우지 않는다(날짜 키끼리의 산수다). */
function toUtc(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function toKey(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/**
 * 초대 링크 주소.
 *
 * ⚠️ 경로는 `/challenge?join=`이어야 한다. `?open=`은 "참가가 이미 끝났으니 이 방을
 * 열어라"이고 `?join=`이 "이 코드로 참가시켜라"다(`challenge/page.tsx` 주석).
 * 바꾸면 링크를 받은 사람이 참가 없이 빈 화면만 본다.
 *
 * ⚠️ 코드를 인코딩한다. 지금 형식은 `GND-XXXXX`라 인코딩이 필요 없지만, 서버가
 * 형식을 바꾸는 날 링크가 조용히 깨지는 쪽이 훨씬 비싸다.
 */
export function challengeInviteUrl(origin: string, code: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/challenge?join=${encodeURIComponent(code)}`;
}

/**
 * 고를 수 있는 **가장 이른 시작일 = 내일**.
 *
 * ⚠️⚠️ 오늘로 시작하는 방은 **초대 창이 0이다.** `autostart_due_challenges`가
 * `status='setup' and start_date <= 오늘`인 방을 전부 `active`로 올리는데, 시작한
 * 뒤에는 `invite_to_challenge`·`issue_challenge_invite_code`·
 * `join_challenge_with_code`가 **모두 `invalid_status`로 막힌다.** 그 RPC는
 * 크론뿐 아니라 **챌린지 탭이 열릴 때마다** 도니까, 만들고 화면을 한 번 더 보는
 * 것만으로 초대가 닫힌다.
 *
 * 이게 운영 데이터의 모양을 설명한다 — 참가자 1명짜리 챌린지 14개,
 * 2026-07-31 하루에 7번의 생성·취소.
 *
 * ⚠️ **"오늘 시작하고 싶다"를 막는 규칙이 아니다.** 목표를 세운 뒤
 * `지금 바로 시작하기`(`start_challenge`)를 누르면 날짜와 무관하게 오늘 시작한다.
 * 여기서 막는 것은 **초대할 수 없는 방이 조용히 만들어지는 것**뿐이다.
 */
export function earliestStartDate(todayKey: string): string {
  return toKey(toUtc(todayKey) + 86_400_000);
}

/** 초대 창이 없는 시작일인가. 빈 값은 판단하지 않는다(날짜 미입력은 다른 규칙이 본다). */
export function startsTooSoon(startDate: string, todayKey: string): boolean {
  if (!startDate) return false;
  return startDate < earliestStartDate(todayKey);
}

/**
 * 기본 기간 — **내일** 시작해서 28일간(양끝 포함).
 *
 * ⚠️⚠️ **`todayKey`를 그대로 시작일로 쓰지 마라.** `autostart_due_challenges`가
 * `status='setup' and start_date <= 오늘`인 방을 전부 `active`로 올리고, 그때
 * **목표가 없는 참가자를 `dropped`로 뺀다**(설계 §4.2). 그리고 그 RPC는 크론
 * (`vercel.json`의 `/api/briefing`)뿐 아니라 **챌린지 탭이 열릴 때마다**
 * 클라이언트에서도 돈다.
 *
 * 2026-08-17 브라우저 실측: 오늘로 시작일을 넣었더니 방을 만든 직후 같은 화면의
 * 조회가 그 방을 시작시켰고, 이어진 초대 코드 발급이 `invalid_status:active`로
 * **400**을 냈다. 친구를 부르려고 만든 방인데 초대가 그 자리에서 닫혔다.
 * 목표를 일부러 나중에 받는 이 경로에서는 방장이 **자기 방에서 빠지기까지** 한다.
 *
 * 내일로 두면 오늘 하루는 `setup`으로 남아 링크가 살아 있고, 그동안 친구가
 * 들어와 각자 목표를 세운다. `challenge-invite.test.ts`가 이 규칙을 고정한다.
 */
export function defaultChallengePeriod(todayKey: string): {
  startDate: string;
  endDate: string;
} {
  // ⚠️ 시작일은 `earliestStartDate`에서 받는다. 여기서 다시 `+1일`을 짜면 규칙이
  //    두 벌이 되고, 한쪽만 고치는 날 기본값과 입력 하한이 어긋난다.
  const startDate = earliestStartDate(todayKey);
  return {
    startDate,
    endDate: toKey(
      toUtc(startDate) + (DEFAULT_CHALLENGE_DAYS - 1) * 86_400_000,
    ),
  };
}

/**
 * 기본 챌린지 이름.
 *
 * ⚠️ 닉네임을 넣지 마라(`○○의 챌린지`). 이 이름은 **초대받은 사람이 먼저** 본다 —
 * 링크를 누른 사람에게 필요한 건 "누구 방인가"가 아니라 "얼마나 하는 건가"다.
 * 방장 이름은 참가 화면이 따로 말한다.
 */
export function defaultChallengeName(): string {
  return "4주 챌린지";
}

/** `navigator.share`에 넘길 것. 주소는 본문에도 넣는다(아래 주석 참조). */
export function inviteSharePayload(
  challengeName: string,
  url: string,
): { title: string; text: string; url: string } {
  return {
    title: `GND · ${challengeName}`,
    // ⚠️ 본문에 주소를 **한 번 더** 넣는다. 공유 대상 앱이 `url` 필드를 무시하고
    //    `text`만 싣는 경우가 있어서, 안 넣으면 받는 사람에게 링크 없는 초대말만
    //    간다 — 초대가 통째로 무의미해진다.
    text: `${challengeName} 같이 할래? 링크 누르면 바로 들어와져 💪\n${url}`,
    url,
  };
}

/**
 * 공유가 어떻게 끝났는가.
 *
 * `shared` 기기 공유 시트가 떴다 · `copied` 클립보드에 담겼다 ·
 * `manual` 둘 다 안 돼서 화면의 링크를 직접 복사해야 한다.
 */
export type ShareOutcome = "shared" | "copied" | "manual";

/**
 * 결과별 안내.
 *
 * ⚠️ 어느 것도 **실패로 쓰지 마라.** 이 시점에 챌린지는 **이미 만들어져 있다** —
 * 공유가 안 됐다고 "실패했어요"라고 하면, 사용자는 방까지 안 만들어진 줄 알고
 * 처음부터 다시 한다. 그게 취소된 챌린지 14개를 만든 종류의 오해다.
 * 테스트가 세 문구 모두에 `실패`가 없음을 단언한다.
 */
export function shareOutcomeMessage(outcome: ShareOutcome): string {
  switch (outcome) {
    case "shared":
      return "챌린지를 만들었어요 — 친구가 들어오면 목표를 같이 정해요 🎯";
    case "copied":
      return "초대 링크를 복사했어요 — 카톡에 붙여넣기 하세요 🔗";
    case "manual":
      return "챌린지를 만들었어요 — 아래 초대 링크를 길게 눌러 복사하세요";
  }
}
