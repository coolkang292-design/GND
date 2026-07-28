import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: "GND 관리자",
  // 운영자 전용 화면이라 색인 대상이 아니다
  robots: { index: false, follow: false },
};

/**
 * 집계 결과가 CDN·중간 캐시에 남지 않게 한다.
 * 게이트를 통과한 관리자에게만 보여야 할 값이 캐시에 얹히면 게이트가 무의미해진다.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="admin-root">{children}</div>;
}
