import { Icon, type IconName } from "@/components/ui/icon";
import type { PeriodRewards } from "@/lib/domain/challenge-report";

/**
 * 시안 `획득한 보상` 3칸. 코인·뱃지·상자 그림 대신 아이콘(사용자 지시: 이미지는 제외).
 * ⚠️ 새 지급이 아니다 — 챌린지 기간에 원래 쌓인 포인트·배지·경험치를 보여 줄 뿐이다.
 *    시안의 `랜덤 아이템 상자`는 앱에 없는 기능이라 경험치 칸으로 대신한다.
 */
export function RewardsRow({ r }: { r: PeriodRewards }) {
  const tiles: { key: string; icon: IconName; title: string; value: string; isNew: boolean }[] = [
    { key: "points", icon: "spark", title: "GND 포인트", value: `+${r.pointsEarned.toLocaleString()}`, isNew: false },
    { key: "badges", icon: "award", title: "배지", value: `${r.badgeCount}개`, isNew: r.badgeCount > 0 },
    { key: "xp", icon: "level", title: "경험치", value: `+${r.xpGained.toLocaleString()} XP`, isNew: false },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {tiles.map((t) => (
        <div
          key={t.key}
          data-testid="reward-tile"
          className="relative flex flex-col items-center gap-1.5 rounded-card-sm border border-line bg-surface-2 px-2 py-3 text-center"
        >
          {t.isNew && (
            <span className="absolute right-1.5 top-1.5 rounded-full bg-gold px-1.5 text-[9.5px] font-black text-accent-ink">
              NEW
            </span>
          )}
          <span className="grid h-12 w-12 place-items-center rounded-full bg-gold-weak text-gold">
            <Icon name={t.icon} size={26} />
          </span>
          <p className="text-[11.5px] font-bold">{t.title}</p>
          <p className="font-mono text-[15px] font-black text-gold">{t.value}</p>
        </div>
      ))}
    </div>
  );
}
