import { notFound } from "next/navigation";
import { ResultQA } from "./result-qa";

/**
 * 개발 전용 — 종료 챌린지 결과 화면(2026-10-07 시안) 확인용.
 * 종료된 챌린지를 만드는 픽스처가 없어서(`dev-fixture.mjs challenge`는 active만) 실제 부품을
 * 예시 데이터로 띄운다. 운영 빌드·플래그 없는 개발 서버에서는 404 (`image-local-qa`와 같은 잠금).
 *
 *   NEXT_PUBLIC_CHALLENGE_RESULT_QA=1 pnpm dev → /challenge-result-qa?state=active|ended&n=4&min=0|1
 *   (n = 참가자 수 2~60, min=0 = 0117 적용 전 응답 흉내)
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ n?: string; state?: string; min?: string }> }) {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_CHALLENGE_RESULT_QA !== "1") {
    notFound();
  }
  const { n, state, min } = await searchParams;
  const count = Math.min(60, Math.max(2, Number(n) || 4));
  return <ResultQA count={count} state={state === "active" ? "active" : "ended"} withMinutes={min !== "0"} />;
}
