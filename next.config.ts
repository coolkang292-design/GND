import type { NextConfig } from "next";

// 빌드 시각을 번들에 박는다 — 버그 신고에 실려 "이 폰이 어느 배포본을 돌고 있는지"를
// 알려준다. `.git` 없는 복사본에서 배포하므로 커밋 해시는 쓸 수 없다.
// 자세한 이유는 src/lib/build-info.ts.
const BUILD_TIME = new Date().toISOString();

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_TIME: BUILD_TIME },
  devIndicators: false,
  // 폰 실기기 테스트: LAN·Tailscale IP에서 dev 리소스 접근 허용
  // (Next 16은 크로스 오리진 dev 요청을 기본 차단 → 하이드레이션 불가)
  allowedDevOrigins: ["192.168.219.112", "192.168.219.104", "100.85.240.15"],
};

export default nextConfig;
