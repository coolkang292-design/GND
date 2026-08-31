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

/* ── 회원 수의 실체 (2026-08-31) ─────────────────────────────────────────────
   왜 필요한가: `auth.users`의 총수를 "회원 수"로 읽으면 크게 틀린다. GND는 첫
   방문자에게 곧바로 `signInAnonymously()`로 계정을 발급하므로(`auth-provider.tsx`),
   브라우저를 새로 열 때마다 auth 계정이 하나씩 생긴다. 2026-08-31 실측으로
   **123개 중 116개가 익명**이고, 그중 프로필을 만든 것은 1개뿐이었다.

   그래서 화면이 네 층을 따로 보여준다. 하나로 뭉치면 다시 오판한다.
     auth 총수  ⊃  영구 계정  ⊃  프로필 보유  ⊃  테스트 제외한 실사용자
*/

/** `auth.users` 한 행 — 판정에 필요한 것만. `is_anonymous`는 DB 컬럼이라 항상 있다 */
export interface AuthAccountRow {
  userId: string;
  isAnonymous: boolean;
  createdAt: Date;
}

export interface MembershipCounts {
  /** auth.users 전체. **이 숫자를 회원 수라고 부르지 마라** */
  authTotal: number;
  /** 익명 인증 계정 — 대부분 앱을 열기만 한 빈 계정이다 */
  authAnonymous: number;
  /** 카카오·구글·이메일 중 하나라도 붙은 계정 */
  authPermanent: number;
  /** 프로필을 만든 계정 (테스트 포함) */
  profilesTotal: number;
  /** 그중 픽스처·테스트 계정 */
  profilesExcluded: number;
  /** 실사용자 — **이것이 "회원 수"에 가장 가깝다** */
  profilesReal: number;
  /** 최근 7일에 만들어졌고 지금 영구인 계정 */
  permanentSignups7d: number;
  /** 최근 30일에 만들어졌고 지금 영구인 계정 */
  permanentSignups30d: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 회원 수를 네 층으로 가른다.
 *
 * ⚠️ **7일·30일은 "계정이 만들어진 시점"으로 센다 — 승격 시점이 아니다.**
 *    GND는 익명 계정에 카카오를 붙여 **그 자리에서 승격**시킨다(계정이 갈리지
 *    않는다). 그래서 `created_at`은 익명으로 처음 앱을 연 날에 머문다. 어제
 *    카카오를 연결했더라도 계정이 3주 전에 생겼으면 `permanentSignups7d`에
 *    안 들어간다. 승격 시점을 세려면 `auth.identities.created_at`이 필요한데,
 *    그건 이번 범위 밖이다(§공개 베타 보안 게이트 계획서).
 */
export function membershipCounts(
  authUsers: readonly AuthAccountRow[],
  profileIds: ReadonlySet<string>,
  testIds: ReadonlySet<string>,
  now: Date,
): MembershipCounts {
  const permanent = authUsers.filter((u) => !u.isAnonymous);
  const since = (days: number) =>
    permanent.filter((u) => u.createdAt.getTime() > now.getTime() - days * DAY_MS)
      .length;

  const withProfile = authUsers.filter((u) => profileIds.has(u.userId));
  const excluded = withProfile.filter((u) => testIds.has(u.userId)).length;

  return {
    authTotal: authUsers.length,
    authAnonymous: authUsers.length - permanent.length,
    authPermanent: permanent.length,
    profilesTotal: withProfile.length,
    profilesExcluded: excluded,
    profilesReal: withProfile.length - excluded,
    permanentSignups7d: since(7),
    permanentSignups30d: since(30),
  };
}
