"use client";

import { PhotoStamp } from "@/components/photo-stamp";
import { ReactionBar } from "@/components/feed/reaction-bar";
import type { FeedItem } from "@/lib/social";
import { timeAgo } from "@/lib/time-ago";

/** 종목 요약 — 최대 3개 + "외 n종" */
function exerciseSummary(names: string[]): string {
  if (names.length === 0) return "운동 완료";
  const head = names.slice(0, 3).join(" · ");
  return names.length > 3 ? `${head} 외 ${names.length - 3}종` : head;
}

type Props = { item: FeedItem; userId: string };

/** 피드 카드 — 프로필·요약·인증사진·스트릭·반응 (§9 그룹 피드) */
export function FeedItemCard({ item, userId }: Props) {
  const stats: string[] = [];
  if (item.durationMinutes > 0) stats.push(`${item.durationMinutes}분`);
  if (item.volume.weightVolumeKg > 0)
    stats.push(`${Math.round(item.volume.weightVolumeKg).toLocaleString()}kg`);
  if (item.volume.bodyweightReps > 0)
    stats.push(`${item.volume.bodyweightReps}회`);
  if (item.volume.cardioDistanceMeters > 0)
    stats.push(`${(item.volume.cardioDistanceMeters / 1000).toFixed(1)}km`);

  return (
    <article className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-lg">
            {item.avatarUrl ?? "👤"}
          </span>
          <div>
            <p className="text-sm font-extrabold">
              {item.nickname}
              {item.userId === userId && (
                <span className="ml-1 text-faint">(나)</span>
              )}
              {item.streak > 0 && (
                <span className="ml-1.5 text-xs font-bold text-accent">
                  🔥{item.streak}
                </span>
              )}
            </p>
            <p className="text-xs text-muted">
              {timeAgo(item.completedAt)} 운동 완료
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-2.5 pb-3">
        <p className="text-sm font-bold">{exerciseSummary(item.exerciseNames)}</p>
        {stats.length > 0 && (
          <p className="mt-0.5 text-xs font-bold text-muted">
            {stats.join(" · ")}
          </p>
        )}
      </div>

      {item.photoUrl && (
        <div className="relative aspect-[4/3] w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.photoUrl}
            alt={`${item.nickname}님의 운동 인증`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <PhotoStamp
            completedAt={item.completedAt}
            durationMinutes={item.durationMinutes}
          />
        </div>
      )}

      <div className="px-4 py-3">
        <ReactionBar
          sessionId={item.sessionId}
          userId={userId}
          counts={item.reactions}
          myReactions={item.myReactions}
        />
      </div>
    </article>
  );
}
