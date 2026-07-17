"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { getMyGroups } from "@/lib/crew";
import {
  getLatestCrewWorkoutWithPhoto,
  type LatestCrewWorkout,
} from "@/lib/workout";
import { timeAgo } from "@/lib/time-ago";

/** 홈 '최근 친구 활동' 섹션 — 크루의 가장 최근 인증사진 운동 미리보기 */
export function CrewLatestWorkout() {
  const { userId, loading, configured } = useAuth();
  const [item, setItem] = useState<LatestCrewWorkout | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;

    async function load() {
      try {
        const groups = await getMyGroups();
        if (cancelled) return;
        const g = groups[0];
        if (!g) return;
        const latest = await getLatestCrewWorkoutWithPhoto(g.id);
        if (!cancelled) setItem(latest);
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId]);

  if (!configured || !ready || !item) return null;

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="relative aspect-[4/3] w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageUrl}
          alt={`${item.nickname}님의 운동 인증`}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-3.5 pt-8 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-base backdrop-blur">
              {item.avatarUrl ?? "👤"}
            </span>
            <span className="text-sm font-extrabold text-white">
              {item.nickname}
              {item.userId === userId && (
                <span className="ml-0.5 opacity-70">(나)</span>
              )}
            </span>
          </div>
          <span className="text-xs font-bold text-white/80">
            {timeAgo(item.completedAt)} 운동 완료 💪
          </span>
        </div>
      </div>
    </section>
  );
}
