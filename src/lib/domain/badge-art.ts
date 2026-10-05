/**
 * 배지 그림 경로 — **이 앱에서 배지 그림을 그리는 유일한 경로** (2026-10-05).
 *
 * Performance Social 패키지의 `catalog`(같은 육각 프레임 + 동기 아이콘 시리즈)로 바꿨다.
 * 키·달성 조건·획득 기록은 그대로다 — 그림만 바뀐다(적용 지침 §패키지 `catalog`).
 * 원본: `어플 UI 이미지/Performance-Social-2026-10-05/catalog/<key>-128.webp` → `public/gnd/badges/<key>.webp`.
 *
 * ⚠️ 경로를 화면마다 문자열로 조립하지 마라. 2026-10-05 전에는 `/badges/${key}.png`가
 *    여섯 곳에 흩어져 있어서, 그림을 바꾸려면 여섯 곳을 다 찾아야 했다.
 * ⚠️ 옛 `public/badges/*.png`는 지우지 않았다 — 설치형 앱의 옛 캐시가 잠깐 참조할 수 있다.
 */
export function badgeImageSrc(key: string): string {
  return `/gnd/badges/${key}.webp`;
}
