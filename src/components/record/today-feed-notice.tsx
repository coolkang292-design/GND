import { Icon } from "@/components/ui/icon";

/**
 * 오늘 이미 운동을 올렸을 때 기록 탭에 뜨는 한 줄 안내 (사용자 지시 2026-11-11).
 *
 * 같은 날 운동을 더 하면 피드에 새 카드가 생기지 않고 **오늘 올린 카드에 이어서 합쳐진다**
 * (`mergeSameDayFeed`). 모르고 시작하면 "왜 새 게시물이 안 생기지?" 싶으므로, **시작하기 전에**
 * 알려 준다. 운동 중에는 안 그린다(부르는 쪽이 판단) — 진행 중 화면 위에 안내를 얹지 않는다.
 *
 * ⚠️ 오늘 올린 운동이 **없으면** 아무것도 그리지 않는다. 안내할 합침이 없다.
 */
export function TodayFeedNotice({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div
      data-testid="today-feed-notice"
      className="flex items-start gap-2.5 rounded-card border border-accent/40 bg-accent-weak/25 px-3.5 py-3"
    >
      <Icon name="users" size={18} className="mt-0.5 flex-none text-accent" />
      <p className="text-[13px] leading-5 text-text">
        <span className="font-extrabold">오늘 올린 피드가 있어요.</span>{" "}
        운동을 추가하면 새 게시물이 아니라{" "}
        <span className="font-extrabold">그 피드에 합쳐져요.</span>
      </p>
    </div>
  );
}
