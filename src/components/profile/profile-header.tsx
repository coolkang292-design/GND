"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { useAuth } from "@/components/auth-provider";
import { Icon } from "@/components/ui/icon";
import { getMyProfile } from "@/lib/crew";

/**
 * 내 정보 맨 위 — 아바타 · 닉네임 · 소개 · `프로필 편집` (2026-10-05 Performance Social 프로필 시안).
 *
 * 예전엔 `프로필 편집 · 이름·사진·소개 ›` 한 줄짜리 입구만 있었다. 시안은 맨 위에 **나를 보여 주는
 * 카드**가 있고 그 옆에 편집 버튼이 붙는다. 편집 자체는 그대로 `ProfileEditSheet`가 한다 —
 * 이 카드는 입구일 뿐이다(⚠️ 편집 입구를 맨 위에 두라는 2026-08-20 지시를 그대로 지킨다).
 *
 * ⚠️ 저장하면 부모가 `key`를 바꿔 이 카드를 다시 읽힌다(바뀐 이름·사진이 바로 보이게).
 * ⚠️ 조회 전·실패에는 이름 자리를 비워 두고 버튼은 그대로 둔다 — 편집 입구가 사라지면 안 된다.
 */
export function ProfileHeader({ onEdit }: { onEdit: () => void }) {
  const { userId } = useAuth();
  const [profile, setProfile] = useState<{
    nickname: string;
    avatarUrl: string | null;
    bio: string | null;
  } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const p = await getMyProfile(userId);
        if (!cancelled && p) {
          setProfile({ nickname: p.nickname, avatarUrl: p.avatar_url, bio: p.bio ?? null });
        }
      } catch {
        /* 입구 버튼은 남는다 — 이름만 비어 있다 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <section className="flex items-center gap-3.5 rounded-card border border-line-strong bg-surface p-4 shadow-card">
      <Avatar
        src={profile?.avatarUrl}
        label={profile ? `${profile.nickname}님 프로필 사진` : undefined}
        className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-full border-2 border-line-strong bg-surface-2 text-3xl"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[20px] font-black tracking-tight">
          {profile?.nickname ?? " "}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">
          {profile?.bio || "소개를 적어 크루에게 나를 알려 보세요"}
        </p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="flex h-9 flex-none items-center gap-1 rounded-full border border-line-strong px-3 text-[12px] font-extrabold"
      >
        <Icon name="person" size={14} className="text-accent" />
        프로필 편집
      </button>
    </section>
  );
}
