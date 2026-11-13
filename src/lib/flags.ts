/**
 * 기능 플래그. 빌드 시점에 굳는다 — 바꾸면 다시 빌드해야 한다.
 *
 * GROWTH_V2: '내 성장'(단계 진입 기록 대비 성장) 카드를 성장 허브에 보인다.
 *   켜기: 환경변수 NEXT_PUBLIC_GROWTH_V2=1 (`.env.local` 또는 Vercel 환경변수) 후 재시작/재빌드
 *   끄기: 변수를 지우거나 1이 아닌 값 — 꺼져 있으면 기존 화면이 그대로다.
 */
export const GROWTH_V2 = process.env.NEXT_PUBLIC_GROWTH_V2 === "1";
