import Image from "next/image";
import { Icon } from "@/components/ui/icon";
import { badgeShelf, type BadgeMeta } from "@/lib/domain/badges";
import {
  achievementKstDay,
  buildAchievementHistory,
  featuredBadgeCondition,
  PROFILE_METRIC_LABEL,
  selectFeaturedBadges,
} from "@/lib/domain/profile-achievements";
import { badgeImageSrc } from "@/lib/domain/badge-art";
import type { CrewMemberProfile } from "@/lib/progression";

/**
 * 홈의 내 프로필과 크루 프로필에서 공통으로 쓰는 성취 요약.
 * '내 정보' 탭의 GrowthHub와 BadgeShowcase는 수정하지 않는다.
 * 전체 이력·전체 배지 목록은 MemberProfileBody의 펼침 영역에 보존한다.
 */
export function MemberAchievementOverview({
  profile,
  catalog,
}: {
  profile: CrewMemberProfile;
  catalog: BadgeMeta[];
}) {
  const featured = selectFeaturedBadges(badgeShelf(catalog, profile.badges));
  const recent = buildAchievementHistory({
    joinedAt: profile.joinedAt,
    levelUps: profile.levelUps,
    badges: profile.badges,
    catalog,
  }).slice(0, 3);

  return (
    <>
      <section aria-labelledby="member-featured-badges" className="mt-4 border-t border-line pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <h4 id="member-featured-badges" className="text-[15px] font-extrabold">대표 배지</h4>
          <span className="text-[11px] text-muted">6개 항목별 최고 배지</span>
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-2">
          {featured.map(({ metricKey, badge }) => (
            <li key={metricKey} className="min-w-0">
              <div className="flex min-h-[94px] items-center gap-2 rounded-card-sm border border-line bg-surface-2 p-2">
                {badge ? (
                  <div className="relative h-11 w-11 flex-none">
                    <Image src={badgeImageSrc(badge.key)} alt="" width={44} height={44} sizes="44px" unoptimized />
                    {badge.count > 1 && (
                      <span className="absolute -bottom-1 -right-1 rounded-full border border-gold/50 bg-bg px-1 text-[9px] font-bold text-gold">
                        ×{badge.count}
                      </span>
                    )}
                  </div>
                ) : (
                  <span aria-hidden="true" className="flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-line text-lg text-faint">
                    ?
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] leading-tight text-muted">{PROFILE_METRIC_LABEL[metricKey]}</p>
                  <p className="mt-1 break-keep text-[12px] font-extrabold leading-snug">{badge?.name ?? "미획득"}</p>
                  <p className="mt-1 break-keep text-[10px] leading-snug text-faint">
                    {badge ? featuredBadgeCondition(badge) : "첫 달성을 기다려요"}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="member-recent-history" className="mt-4 border-t border-line pt-3.5">
        <h4 id="member-recent-history" className="text-[15px] font-extrabold">최근 이력</h4>
        {recent.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted">아직 성취 이력이 없어요.</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-2">
            {recent.map((event) => (
              <li key={event.id} className="flex min-h-[64px] items-center gap-2.5 rounded-card-sm border border-line bg-surface-2 p-2.5">
                <time dateTime={achievementKstDay(event.at)} className="w-[65px] shrink-0 text-[11px] tabular-nums text-muted">
                  {achievementKstDay(event.at).slice(2).replaceAll("-", ".")}
                </time>
                <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-surface text-accent">
                  <Icon name={event.type === "level" ? "level" : event.type === "badge" ? "award" : "play"} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-keep text-[13px] font-extrabold">{event.title}</span>
                  <span className="mt-0.5 block text-[11px] text-muted">{event.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
