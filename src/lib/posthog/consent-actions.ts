/**
 * 동의·철회 동작. 화면은 이 두 함수만 부른다.
 *
 * 철회 순서: ① 동의 기록을 먼저 "거부"로 바꾸고(이 순간부터 새 이벤트가 전부 막힌다)
 * ② SDK를 걷어내고 ③ 이 기기의 PostHog 저장 데이터와 중복 방지 기록을 지운다.
 * 기존 기능(로그인·운동·챌린지)은 아무 영향이 없다.
 */
import { writeConsent } from "./consent";
import { stopAnalytics } from "./client";
import { clearDedupeRecords } from "./track";

export function grantAnalyticsConsent(): boolean {
  return writeConsent("granted");
}

/** 거부와 철회는 같은 동작이다 — 상태가 `denied`가 되고 남은 것을 치운다. */
export function declineOrWithdrawAnalyticsConsent(): void {
  writeConsent("denied");
  try {
    stopAnalytics();
    clearDedupeRecords();
  } catch {
    // 무시 — 동의 기록은 이미 거부로 바뀌었다
  }
}
