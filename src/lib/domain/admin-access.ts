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
