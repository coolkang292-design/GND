import { pickCompletionHeroIndex } from "@/lib/domain/workout-complete-message";

/**
 * 운동 완료 카드 사진을 **완료하는 순간 한 번** 뽑는다 (2026-09-29 사용자 요청 —
 * "운동할 때마다 랜덤으로 노출").
 *
 * 직전에 본 번호를 브라우저에 기억해 두고 다음엔 빼고 뽑는다. 기억은 편의일
 * 뿐이다 — 저장소가 막혀 있거나(사생활 모드 등) 값이 깨져 있으면 그냥 무작위다.
 */
export const COMPLETION_HERO_LAST_KEY = "gnd:completion-hero:last";

export function pickNextCompletionHero(random: () => number = Math.random): number {
  let previous: number | null = null;
  try {
    const raw = window.localStorage.getItem(COMPLETION_HERO_LAST_KEY);
    previous = raw === null ? null : Number(raw);
  } catch {
    previous = null;
  }
  const picked = pickCompletionHeroIndex(random(), previous);
  try {
    window.localStorage.setItem(COMPLETION_HERO_LAST_KEY, String(picked));
  } catch {
    /* 기억 못 해도 된다 — 다음엔 직전 제외만 빠진다 */
  }
  return picked;
}
