"use client";

/**
 * 피드 화면 상단 탭 — `피드` | `사진` | `챌린지 모집` (2026-08-31).
 *
 * ⚠️ **왜 나눴나.** 모집 카드를 피드 위에 얹어 봤더니 화면 위쪽을 통째로 먹어서
 *    **첫 운동 게시물이 접힘선 밖으로 밀렸다**(사용자 화면 확인). 피드에 온
 *    사람은 크루의 운동을 보러 온 것이다.
 *
 * ⚠️ **하단 탭바에 넣지 않는다.** 거기는 이미 5개(홈·피드·기록·챌린지·내 정보)라
 *    6개가 되면 390px에서 라벨이 깨진다. 그리고 모집은 피드와 같은 "남을 보는"
 *    영역이라 한 화면 안의 갈래가 맞다.
 *
 * ⚠️ 모집 개수를 탭에 붙인다. 안 붙이면 **탭이 있는 줄도 모르고** 아무도 안 눌러서,
 *    나눈 의미가 사라진다. 0개면 숫자를 안 그린다.
 */
export type FeedTab = "feed" | "photos" | "recruit";

export function FeedTabs({
  value,
  onChange,
  recruitCount,
}: {
  value: FeedTab;
  onChange: (next: FeedTab) => void;
  /** 모집 중인 챌린지 수 — 0이면 숫자를 안 그린다 */
  recruitCount: number;
}) {
  const tabs: { key: FeedTab; label: string; count?: number }[] = [
    { key: "feed", label: "피드" },
    // Phase D: 인증사진 모아 보기. getCrewFeed의 photoOnly가 이미 있었는데
    // 부르는 곳이 없었다. 개수는 안 붙인다 — 사진은 계속 쌓여서 숫자가
    // 커지기만 하고, 커진 숫자는 "새 것이 있다"를 뜻하지 않는다.
    { key: "photos", label: "사진" },
    { key: "recruit", label: "챌린지 모집", count: recruitCount },
  ];

  return (
    <div
      role="tablist"
      aria-label="피드 보기"
      className="flex gap-1 rounded-card border border-line bg-surface-2 p-1"
    >
      {tabs.map((tab) => {
        const on = value === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.key)}
            className={`flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-card-sm text-[13px] font-extrabold transition-colors ${
              on ? "bg-surface text-accent shadow-card" : "text-muted"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={`rounded-full px-1.5 text-[11px] font-bold ${
                  on ? "bg-accent-weak text-accent" : "bg-surface text-muted"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
