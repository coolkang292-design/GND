import Link from "next/link";

export function AvatarShopEntry() {
  return (
    <Link
      href="/profile/avatar-mock"
      className="flex items-center justify-between rounded-card border border-accent/35 bg-gradient-to-r from-surface to-accent-weak px-4 py-3.5 shadow-card"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-lg text-accent-ink">
          🧢
        </span>
        <div>
          <p className="text-sm font-extrabold">캐릭터 아이템 상점</p>
          <p className="mt-0.5 text-[11px] text-muted">
            개발 목업 · 실제 포인트 차감 없음
          </p>
        </div>
      </div>
      <span className="text-sm font-extrabold text-accent">열기 ›</span>
    </Link>
  );
}
