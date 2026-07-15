import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 폰 실기기 테스트: LAN·Tailscale IP에서 dev 리소스 접근 허용
  // (Next 16은 크로스 오리진 dev 요청을 기본 차단 → 하이드레이션 불가)
  allowedDevOrigins: ["192.168.219.112", "100.85.240.15"],
};

export default nextConfig;
