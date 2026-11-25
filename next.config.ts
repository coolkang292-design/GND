import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// 빌드 시각을 번들에 박는다 — 버그 신고에 실려 "이 폰이 어느 배포본을 돌고 있는지"를
// 알려준다. 자세한 이유는 src/lib/build-info.ts.
const BUILD_TIME = new Date().toISOString();

// 커밋 해시도 박는다 (2026-11-25). 운영 앱이 "나는 어느 커밋이다"를 직접 말하게 해서
// 다음 세션이 Vercel 기록의 브랜치 이름 같은 간접 증거로 추측하지 않게 한다.
// 우선순위:
//  1) src/lib/build-commit.txt — `git archive`가 export-subst(.gitattributes)로
//     `$Format:…$`을 실제 해시로 바꿔 준다. `.git` 없는 배포 복사본에서도 남는 유일한 길
//  2) git rev-parse HEAD — 로컬 개발·로컬 빌드
//  3) VERCEL_GIT_COMMIT_SHA — Vercel이 git 메타데이터를 받은 경우(GitHub 연동 Preview 등)
function resolveCommit(): { sha: string; source: string } {
  try {
    const raw = readFileSync("src/lib/build-commit.txt", "utf8").trim();
    const sha = raw.split(/\s+/)[0];
    if (!raw.includes("$Format") && /^[0-9a-f]{40}$/.test(sha)) return { sha, source: "archive" };
  } catch {
    // 파일이 없으면 다음 방법으로
  }
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (/^[0-9a-f]{40}$/.test(sha)) return { sha, source: "git" };
  } catch {
    // .git이 없는 곳(원격 빌드 등)
  }
  const vercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (vercel && /^[0-9a-f]{40}$/.test(vercel)) return { sha: vercel, source: "vercel" };
  return { sha: "unknown", source: "none" };
}
const COMMIT = resolveCommit();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
    NEXT_PUBLIC_BUILD_COMMIT: COMMIT.sha,
    NEXT_PUBLIC_BUILD_COMMIT_SOURCE: COMMIT.source,
  },
  devIndicators: false,
  // 폰 실기기 테스트: LAN·Tailscale IP에서 dev 리소스 접근 허용
  // (Next 16은 크로스 오리진 dev 요청을 기본 차단 → 하이드레이션 불가)
  allowedDevOrigins: ["192.168.219.112", "192.168.219.104", "100.85.240.15"],
};

export default nextConfig;
