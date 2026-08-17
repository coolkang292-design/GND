/**
 * 어떤 계정이 **테스트 계정인가** — 순수 함수만. DB·네트워크 접근 금지.
 *
 * 왜 필요한가: 운영 Supabase 하나로 개발까지 한다(스테이징이 없다). 그래서 픽스처
 * 계정의 운동 42건이 실사용자 통계에 섞여 `/admin`이 실제보다 부풀어 보인다.
 * 2026-08-17 사용자 지시로 대시보드에서 **집계 대상에서 뺀다.**
 *
 * ⚠️ **DB에서 지우지 않는다.** `dev-테스터A/B`는 `CLAUDE.md`가 지정한 상설 픽스처
 * 계정이라(사회적 기능을 두 계정으로 확인할 때 쓴다) 기록을 지우면 다음 검증 때
 * 크루·챌린지 상태를 처음부터 다시 만들어야 한다. 여기서 거르는 것은 **화면뿐**이고
 * 되돌릴 수 있다.
 *
 * ⚠️ **뺐다는 사실을 화면이 말해야 한다.** 안 그러면 대시보드 숫자와 DB 숫자가
 * 조용히 달라져, 다음 사람이 "집계가 틀렸다"고 의심하게 된다. `testAccountReason`이
 * 사유를 내는 이유다.
 */

export interface AccountIdentity {
  userId: string;
  nickname: string | null;
  email: string | null;
}

/** `scripts/dev-fixture.mjs`가 픽스처 계정을 이 도메인으로 만든다 */
export const FIXTURE_EMAIL_DOMAIN = "@gnd.local";

/** 이 닉네임은 **정확히 일치**할 때만 테스트로 본다(부분 일치 금지 — 아래 참조) */
export const TEST_NICKNAMES: readonly string[] = ["test"];

export type TestAccountReason = "픽스처 계정" | "테스트 닉네임" | "수동 제외 목록";

/** `ANALYTICS_EXCLUDED_USER_IDS` — 규칙으로 안 잡히는 계정을 코드 수정 없이 뺀다 */
export function parseExcludedIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 왜 테스트 계정인가. 아니면 null.
 *
 * ⚠️ 닉네임은 **부분 일치로 잡지 않는다.** `includes("test")`로 걸면 "testosterone"
 * 같은 진짜 닉네임을 쓰는 실사용자가 통계에서 사라진다 — 조용히 사람을 지우는
 * 규칙은 두지 않는다.
 */
export function testAccountReason(
  account: AccountIdentity,
  excludedIds: readonly string[],
): TestAccountReason | null {
  if (excludedIds.includes(account.userId)) return "수동 제외 목록";
  const email = account.email?.trim().toLowerCase() ?? "";
  if (email.endsWith(FIXTURE_EMAIL_DOMAIN)) return "픽스처 계정";
  const nickname = account.nickname?.trim().toLowerCase() ?? "";
  if (nickname !== "" && TEST_NICKNAMES.includes(nickname)) return "테스트 닉네임";
  return null;
}

export function isTestAccount(
  account: AccountIdentity,
  excludedIds: readonly string[],
): boolean {
  return testAccountReason(account, excludedIds) !== null;
}

export function testUserIds(
  accounts: AccountIdentity[],
  excludedIds: readonly string[],
): Set<string> {
  return new Set(
    accounts.filter((a) => isTestAccount(a, excludedIds)).map((a) => a.userId),
  );
}
