/**
 * 사진을 안 넣은 챌린지의 **대체 그림** (2026-09-18).
 *
 * 시안은 목록 카드·상세가 전부 사진이다. 사용자가 만들 때 사진을 넣으면
 * `recruit_image_url`이 쓰이고, 안 넣으면 그동안 `🏁` 이모지 한 글자가 떴다 —
 * 시안과 가장 크게 어긋나던 자리다.
 *
 * ⚠️⚠️ **사용자 사진이 언제나 이긴다.** 대체 그림은 `recruit_image_url`이 없을
 *    때만 쓴다(`public/challenge-assets/manifest.json`의 `priority`).
 *
 * ⚠️ **랜덤으로 고르지 마라.** 같은 챌린지가 화면을 다시 그릴 때마다 다른 그림이
 *    되면 "사진이 바뀌었나?"로 읽힌다. 서버·클라이언트 마크업이 갈려 hydration
 *    경고도 난다. 챌린지 id에서 **결정적으로** 고른다 — 같은 방은 언제나 같은 그림.
 *
 * ⚠️ 이름만 보고 종목을 추측하지 않는다("헬스"가 들어가면 웨이트 그림 식). 방 이름은
 *    자유 문자열이고, 틀리면 걷기 챌린지에 바벨이 붙는다. id 해시가 더 정직하다.
 */

/** 카드용 4:5. `manifest.json`의 `aspect`와 같아야 한다 */
export const CARD_ART = [
  "/challenge-assets/challenge-morning-run.webp",
  "/challenge-assets/challenge-strength-gym.webp",
  "/challenge-assets/challenge-walking.webp",
] as const;

/** 상세 히어로용 16:9 */
export const DETAIL_ART = "/challenge-assets/challenge-detail-sunrise.webp";

/**
 * 문자열 → 0 이상의 정수. FNV-1a 32비트.
 *
 * 암호용이 아니다. **같은 입력이 언제나 같은 칸**이면 된다.
 */
function hashOf(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 이 챌린지의 카드 그림. `imageUrl`이 있으면 **그것이 답이다** */
export function cardArtFor(
  challengeId: string,
  imageUrl?: string | null,
): string {
  if (imageUrl) return imageUrl;
  return CARD_ART[hashOf(challengeId) % CARD_ART.length];
}

/** 이 챌린지의 상세 히어로. `imageUrl`이 있으면 그것이 답이다 */
export function detailArtFor(imageUrl?: string | null): string {
  return imageUrl || DETAIL_ART;
}
