import { notFound } from "next/navigation";

/**
 * Creator Studio 미리보기 (2026-10-25). **개발 서버 전용** — 운영·Preview 빌드는
 * `NODE_ENV=production`이라 이 아래 모든 경로가 404다. 가짜 회원이 실제 사용자에게
 * 보이면 안 된다. 데이터는 `buildCreatorDemo` 코드에서만 나오고 DB에 쓰지 않는다.
 */
export default function CreatorDemoLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <p
        role="note"
        className="mb-3 rounded-full border border-accent/50 bg-accent/10 px-3 py-1.5 text-center text-[12px] font-bold text-accent"
      >
        미리보기 · 가짜 회원 20명 · 개발 서버 전용
      </p>
      {children}
    </>
  );
}
