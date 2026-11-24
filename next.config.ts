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
  // 채널별 유입 추적용 짧은 주소. `/`가 utm_*를 /home으로 실어 나르므로(app/page.tsx)
  // `/ig` → `/?utm_…` → `/home?utm_…` 로 첫 접촉 출처가 보존된다.
  // 고정 댓글용 등 위치를 나누려면 campaign만 바꾼 항목을 추가한다.
  async redirects() {
    const channel = (source: string, utm: string) => ({
      source,
      destination: `/?utm_source=${utm}&utm_medium=social&utm_campaign=bio`,
      permanent: false, // 302 — 나중에 목적지를 바꿔도 캐시에 안 박힌다
    });
    return [
      channel("/ig", "instagram"),
      channel("/tt", "tiktok"),
      channel("/yt", "youtube"),
    ];
  },
};

export default nextConfig;
