/**
 * 서비스워커가 알림 클릭 때 열린 창으로 보내는 이동 메시지 (`public/sw.js`).
 *
 * 앱이 열려 있는데 `client.navigate()`가 안 먹는 환경(제어되지 않는 창, iOS 홈 화면
 * 앱)에서 이 메시지가 대체 경로다. 받는 쪽은 **같은 출처의 앱 경로만** 따른다.
 */
export const SW_NAVIGATE_TYPE = "gnd:navigate";

/** 메시지 데이터에서 이동할 경로를 꺼낸다. 형식이 틀리면 null. */
export function parseSwNavigateMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const { type, url } = data as { type?: unknown; url?: unknown };
  if (type !== SW_NAVIGATE_TYPE || typeof url !== "string") return null;
  // `//evil.com`, `/\evil.com`, `https://…` 모두 거른다 — 앱 안 경로(`/x`)만 허용.
  if (!url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) {
    return null;
  }
  return url;
}
