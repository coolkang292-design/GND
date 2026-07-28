/**
 * 관리자 접근 판정 — 순수 함수. **이 파일에 I/O를 넣지 말 것.**
 *
 * requireAdmin()(`src/lib/admin/auth.ts`)은 서버 전용이라 `server-only`를 import하고,
 * 그 파일은 테스트 환경에서 import되는 순간 throw한다. 그래서 판정 로직만 여기로
 * 떼어내 테스트가 실제로 게이트 규칙을 검증할 수 있게 한다.
 */

/** `ADMIN_USER_IDS` 파싱 — 쉼표 구분, 공백 제거, 빈 항목 제외 */
export function parseAdminIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 관리자 판정. 허용목록이 비어 있으면 **누구도 통과하지 못한다**(fail-closed) —
 * 환경변수 설정 누락이 전면 개방으로 이어지면 안 된다.
 * 비교는 정확 일치. 부분·접두사 일치를 허용하면 게이트가 뚫린다.
 */
export function isAdminUser(
  userId: string | null,
  adminIds: string[],
): boolean {
  if (!userId) return false;
  if (adminIds.length === 0) return false;
  return adminIds.includes(userId);
}

/**
 * 길이가 같으면 내용 비교 시간이 입력에 좌우되지 않는다.
 * (길이는 새지만 그건 표준적으로 감수하는 부분이다.)
 * 엣지 런타임이라 node:crypto의 timingSafeEqual을 쓸 수 없어 직접 만든다.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** 암호키가 맞는가. 키가 설정 안 됐으면 **무조건 거짓**(fail-closed) */
export function isValidAccessKey(
  provided: string | null | undefined,
  accessKey: string | undefined,
): boolean {
  if (!accessKey || accessKey.length === 0) return false;
  if (!provided) return false;
  return constantTimeEqual(provided, accessKey);
}

export interface AdminAccessInput {
  userId: string | null;
  adminIds: string[];
  /** 브라우저가 보낸 관리자 쿠키 값 */
  cookieValue: string | null | undefined;
  /** 서버의 ADMIN_ACCESS_KEY */
  accessKey: string | undefined;
}

/**
 * 관리자 접근 판정 — 두 경로 중 하나면 통과.
 *
 * ① UID 허용목록: 특정 계정에 고정. 익명 인증이라 브라우저마다 계정이 달라
 *    새 환경에서 열려면 등록·재배포가 필요하다.
 * ② 암호키 쿠키: `?key=`로 한 번 열면 쿠키가 남아 그 브라우저에서 계속 열린다.
 *    기기·브라우저를 안 가리고 재배포도 필요 없다.
 *
 * 둘 다 없으면 거짓. 설정이 비어 있을 때 열리는 경로는 만들지 않는다.
 */
export function hasAdminAccess(input: AdminAccessInput): boolean {
  return (
    isAdminUser(input.userId, input.adminIds) ||
    isValidAccessKey(input.cookieValue, input.accessKey)
  );
}
