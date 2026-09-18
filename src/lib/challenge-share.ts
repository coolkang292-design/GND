/**
 * 챌린지 초대 링크 공유 — 기기 공유 시트 → 클립보드 → 직접 복사 순으로 내려간다.
 *
 * 옛 `challenge/page.tsx`의 `handleInviteFirst`에 들어 있던 순서를 한 곳으로 옮겼다
 * (2026-09-18). 만들기 완료 화면·상세 상단 공유 버튼·"친구 초대하기" 대표 버튼이
 * 같은 순서를 쓴다 — 세 벌로 두면 한쪽만 `by`(0091)를 빠뜨린다.
 *
 * ⚠️ **코드를 다시 발급하지 마라.** `create_challenge_room`이 0064부터 `invite_code`를
 *    같이 넣어 준다. 없을 때만(코드 충돌 10회 폴백) 발급한다 — 발급은 서버가 멱등이다.
 *
 * ⚠️ **공유 시트를 닫은 것도 실패가 아니다**(AbortError). 링크는 살아 있으니
 *    클립보드에 담아 둔다.
 *
 * ⚠️ `navigator.share`는 **사용자 제스처 안에서** 불러야 한다. 방을 만드는 `await`
 *    뒤에 바로 부르면 브라우저가 제스처가 끝났다고 보고 거절할 수 있다 — 그래서
 *    만들기 흐름은 완료 화면의 **"친구 초대하기" 버튼**으로 새 제스처를 받는다.
 */
import { recordFunnelEvent } from "@/lib/analytics-events";
import { issueChallengeInviteCode } from "@/lib/challenge";
import {
  challengeInviteUrl,
  inviteSharePayload,
  type ShareOutcome,
} from "@/lib/domain/challenge-invite";

export type ShareResult = {
  outcome: ShareOutcome;
  /** 직접 복사해야 할 때 화면에 띄울 링크. 코드 발급까지 실패하면 null */
  url: string | null;
};

export async function shareChallengeInvite(input: {
  challengeId: string;
  challengeName: string;
  /** 이미 알고 있는 코드 (`challenges.invite_code`) */
  inviteCode: string | null;
  /** 링크를 주는 사람 (0091) */
  userId: string | null;
}): Promise<ShareResult> {
  // 퍼널 (0109) — 눌렀다는 사실. 사람당 한 번만 남는다. 던지지 않는다.
  void recordFunnelEvent("challenge_share_started", input.userId);

  let url: string;
  try {
    const code =
      input.inviteCode ?? (await issueChallengeInviteCode(input.challengeId));
    url = challengeInviteUrl(window.location.origin, code, input.userId);
  } catch {
    // 시작해서 초대가 닫혔거나(invalid_status) 네트워크가 끊겼다 — 보낼 링크가 없다
    return { outcome: "manual", url: null };
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(inviteSharePayload(input.challengeName, url));
      return { outcome: "shared", url };
    } catch {
      // 사용자가 공유 시트를 닫았거나 거절됐다 — 아래 클립보드로 내려간다
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return { outcome: "copied", url };
  } catch {
    return { outcome: "manual", url };
  }
}

/** 개발 서버 주소인가 — 다른 기기(폰)에서는 안 열린다 (invite-sheet와 같은 판정) */
export function isLocalOnlyUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$|\/)/.test(url);
}
