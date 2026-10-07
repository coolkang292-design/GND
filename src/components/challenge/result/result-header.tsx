import { Icon } from "@/components/ui/icon";

/** 결과 화면 머리 — 시안의 `<` · 제목 · 공유 (2026-10-07) */
export function ResultHeader({
  title,
  onBack,
  onShare,
  quiet = false,
}: {
  title: string;
  /** 화면 A처럼 제목이 보조 정보(챌린지 이름)일 때 — 작고 흐리게 */
  quiet?: boolean;
  onBack: () => void;
  onShare?: () => void;
}) {
  return (
    <header className="flex h-11 items-center">
      <button
        type="button"
        onClick={onBack}
        aria-label="뒤로"
        className="grid h-10 w-10 flex-none place-items-center rounded-full text-text"
      >
        <Icon name="back" size={22} />
      </button>
      <p
        className={`min-w-0 flex-1 truncate text-center ${
          quiet ? "text-[12.5px] font-bold text-muted" : "text-[15px] font-extrabold"
        }`}
      >
        {title}
      </p>
      {onShare ? (
        <button
          type="button"
          onClick={onShare}
          aria-label="결과 공유"
          className="grid h-10 w-10 flex-none place-items-center rounded-full text-text"
        >
          <Icon name="share" size={21} />
        </button>
      ) : (
        <span className="h-10 w-10 flex-none" />
      )}
    </header>
  );
}
