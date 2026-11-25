import { NextResponse } from "next/server";
import { BUILD_COMMIT, BUILD_COMMIT_SOURCE, BUILD_TIME } from "@/lib/build-info";

/**
 * 운영 앱이 "나는 어느 커밋에서, 언제 빌드됐다"를 직접 말한다 (2026-11-25).
 *
 * 세션 시작 때 `scripts/session-truth.mjs`가 이 값을 `origin/main`과 대조한다.
 * 빌드 때 값이 굳으므로 정적으로 둔다. 개인 정보는 없다(커밋 해시·빌드 시각뿐이고
 * 둘 다 공개 저장소의 기록이다).
 */
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({
    commit: BUILD_COMMIT,
    commitSource: BUILD_COMMIT_SOURCE,
    builtAt: BUILD_TIME,
  });
}
