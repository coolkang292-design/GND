/**
 * 이 배포본의 **절대 주소** — `metadataBase`가 쓴다 (2026-09-20).
 *
 * ⚠️⚠️ **왜 필요한가.** Next의 `metadata.openGraph.images`에 `/og/x.png`처럼
 *    상대 경로를 쓰면, `metadataBase`가 없을 때 절대 URL로 못 바꾼다. 그러면
 *    `og:image`가 상대 경로로 나가고 **카카오가 이미지를 못 가져온다** —
 *    태그는 있는데 카드에 그림만 없는, 가장 헷갈리는 실패다.
 *
 * ⚠️ **프리뷰 배포에서도 맞아야 한다.** 이 기능은 localhost에서 검증이
 *    불가능하다(카카오 스크래퍼가 localhost를 못 긁는다). 유일한 검증 경로가
 *    Vercel 프리뷰인데, 거기서 주소가 운영으로 박혀 있으면 **프리뷰를 긁어도
 *    운영 이미지를 보게 되어** 고친 것이 맞는지 알 수 없다. 그래서
 *    `VERCEL_URL`(프리뷰마다 다른 호스트)을 본다.
 */

/** 운영 주소. `docs`·릴리스 스크립트가 쓰는 값과 같다 */
export const PRODUCTION_URL = "https://gnd-one.vercel.app";

/**
 * 우선순위: 명시 설정 → 운영 → 프리뷰(`VERCEL_URL`) → 운영 폴백.
 *
 * ⚠️ `VERCEL_URL`에는 프로토콜이 없다(`gnd-xxx.vercel.app`). 붙여야 한다.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  if (process.env.VERCEL_ENV === "production") return PRODUCTION_URL;

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return PRODUCTION_URL;
}
