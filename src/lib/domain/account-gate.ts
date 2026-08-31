/**
 * 정식 계정이 필요한 기능의 안내 — **순수 함수만. I/O 금지.**
 *
 * 0094가 익명 계정에게 세 가지를 막는다. 막힌 사람에게 화면이 무슨 말을 할지는
 * 여기 한 곳에서 정한다 — 세 화면이 각자 문구를 쓰면 조용히 갈린다.
 *
 * ⚠️ **막는 이유를 사용자 말로 번역한다.** `permanent_account_required`를 그대로
 *    보여주면 사용자는 자기가 뭘 잘못했는지 모른다. GND에서 이건 "잘못"이 아니라
 *    **아직 카카오·구글을 연결하지 않은 상태**다.
 */

/** 0094가 던지는 코드. DB와 이 문자열이 갈리면 안내가 통째로 안 뜬다 */
export const PERMANENT_ACCOUNT_REQUIRED = "permanent_account_required";

/** 정식 계정 연결로 가는 곳 — `/account`에 카카오·구글 연결 버튼이 있다 */
export const ACCOUNT_LINK_PATH = "/account";

/**
 * 이 오류가 "정식 계정이 필요하다"인가.
 *
 * ⚠️ Supabase는 `raise exception`을 `{ message }`로 감싸 준다. 모양이 여러 가지라
 *    (Error·PostgrestError·문자열) 전부 문자열로 눕혀서 본다.
 */
export function isPermanentAccountRequired(e: unknown): boolean {
  if (e == null) return false;
  const text =
    e instanceof Error
      ? e.message
      : typeof e === "string"
        ? e
        : typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "";
  return text.includes(PERMANENT_ACCOUNT_REQUIRED);
}

/**
 * 화면에 띄울 문구.
 *
 * ⚠️ **"안 됩니다"로 끝내지 않는다.** 다음에 뭘 하면 되는지를 같은 문장에 담는다 —
 *    막다른 길처럼 보이면 사용자는 앱을 닫는다.
 */
export function permanentAccountMessage(action: PermanentAction): string {
  return `${ACTION_LABEL[action]}에는 카카오·구글 연결이 필요해요. 내 정보 → 계정에서 연결하면 바로 쓸 수 있어요 (기록은 그대로 유지돼요).`;
}

export type PermanentAction = "invite" | "crew" | "challenge";

const ACTION_LABEL: Record<PermanentAction, string> = {
  invite: "친구 초대 링크를 만들려면",
  crew: "크루 요청을 보내려면",
  challenge: "챌린지 방을 만들려면",
};

/**
 * 오류를 사용자 문구로. 정식 계정 문제가 아니면 `null`을 준다 —
 * 그때는 각 화면이 원래 쓰던 문구를 그대로 쓰면 된다.
 */
export function accountGateMessage(
  e: unknown,
  action: PermanentAction,
): string | null {
  return isPermanentAccountRequired(e) ? permanentAccountMessage(action) : null;
}
