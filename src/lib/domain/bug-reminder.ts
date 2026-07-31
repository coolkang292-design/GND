import { dayKey } from "./time";

/**
 * 알림 2층 — 미처리 신고가 남아 있으면 09시 브리핑에 얹어 하루 한 번 다시 알린다.
 *
 * **왜 1층(즉시 푸시)만으로 부족한가.** 즉시 푸시는 **조용히** 실패한다:
 * `/api/push/notify`는 구독이 404·410을 돌려주면 그 구독을 **삭제한다.** 폰을
 * 바꾸거나 브라우저 데이터를 지우면 그 뒤로 아무 소리 없이 알림이 끊기고,
 * 끊겼다는 사실조차 알 방법이 없다. 2층은 매일 다시 세어 그물을 친다.
 *
 * 하루 지연은 감수한다 — 1층이 살아 있으면 2층은 볼 일이 없고, 죽었을 때 하루
 * 안에는 알게 된다.
 */

/** 관리자 1명당 하루 1건. dedupe_key는 **전역 유니크**라 uid를 반드시 넣는다. */
export function bugReminderDedupeKey(userId: string, now: Date): string {
  return `bug_pending:${userId}:${dayKey(now, "Asia/Seoul")}`;
}

export function bugReminderText(count: number): { title: string; body: string } {
  return {
    title: `🐞 미처리 신고 ${count}건`,
    body:
      count === 1
        ? "아직 확인하지 않은 버그 신고가 1건 있어요."
        : `아직 확인하지 않은 버그 신고가 ${count}건 있어요.`,
  };
}
