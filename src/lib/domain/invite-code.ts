/**
 * 초대코드 입력 정규화 (§4).
 * 서버가 생성한 코드 형식: "GND-" + 대문자/숫자 5자.
 * 사용자는 코드·소문자·링크 전체 등 무엇을 붙여넣어도 표준형으로 맞춰준다.
 */
export function normalizeInviteCode(input: string): string | null {
  let s = input.trim();
  if (!s) return null;

  // 초대 링크 붙여넣기: 마지막 경로 조각만 취한다
  if (s.includes("/")) {
    const segments = s.split("/").filter(Boolean);
    s = segments[segments.length - 1] ?? "";
  }

  s = s.toUpperCase();
  const body = s.startsWith("GND-") ? s.slice(4) : s;
  if (!body) return null;

  return `GND-${body}`;
}
