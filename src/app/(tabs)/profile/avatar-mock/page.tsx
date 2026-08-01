import Link from "next/link";
import { notFound } from "next/navigation";
import { AvatarShopMock } from "@/components/profile/avatar-shop-mock";
import { isAvatarMockEnabled } from "@/lib/domain/avatar-coordinate-items";

export default function AvatarMockPage() {
  if (!isAvatarMockEnabled()) notFound();

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center gap-3 pt-1 pb-1">
        <Link
          href="/profile"
          aria-label="내 정보로 돌아가기"
          className="flex h-10 w-10 flex-none items-center justify-center rounded-card-sm border border-line bg-surface text-lg font-bold"
        >
          ‹
        </Link>
        <div>
          <h1 className="text-[19px] font-extrabold tracking-tight">
            캐릭터 아이템 상점
          </h1>
          <p className="mt-0.5 text-[12px] text-muted">
            포인트로 구매하고 좌표 레이어로 장착해 보세요.
          </p>
        </div>
      </header>

      <AvatarShopMock />
    </div>
  );
}
