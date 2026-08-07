"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { badgeShelf, earnedBadgeCount, type BadgeMeta } from "@/lib/domain/badges";
import { getBadgeCatalog } from "@/lib/badges";
import {
  getCrewMemberProfile,
  type CrewMemberProfile,
} from "@/lib/progression";

/**
 * 성과 요약 (2026-08-07) — 홈 친구 목록이 **이미 계산해 둔 값**을 넘겨준다.
 *
 * ⚠️ 여기서 조회하지 않는다. 친구 목록이 세션을 한 번에 받아 접은 결과라,
 * 시트를 열 때 새 질의가 나가지 않는다.
 *
 * ⚠️ `domain/friend-board`의 타입을 import하지 않고 **필요한 모양만 구조적으로**
 * 받는다. 크루 시트가 홈 모듈에 묶이면 안 된다(challenge.ts의 PeriodSessionRow와 같은 수법).
 */
export type MemberPerformance = {
  workoutCount: number;
  totalMinutes: number;
  weekDays: number;
};

function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  return safe < 60 ? `${safe}분` : `${Math.floor(safe / 60)}시간`;
}

/**
 * 시트 본문 — 조회가 끝난 뒤의 표시만 담당한다.
 * 셸에서 분리해 둬야 표시 로직을 SSR 테스트로 덮을 수 있다.
 */
export function MemberProfileBody({
  profile,
  catalog,
  stats,
  streak,
}: {
  profile: CrewMemberProfile;
  catalog: BadgeMeta[];
  /** 없으면 성과 블록을 안 그린다 — 크루 카드·피드에서 열 때는 값이 없다 */
  stats?: MemberPerformance;
  streak?: number;
}) {
  const pct = Math.min(100, Math.round(profile.levelProgressPercent));
  const maxed = profile.nextLevelRequiredXp === null;
  // 카탈로그에 없는 badge_key는 badgeShelf가 자연히 걸러낸다 —
  // 배지가 46개로 늘어도 이 컴포넌트는 그대로다.
  const shelf = badgeShelf(catalog, profile.badges);
  const owned = earnedBadgeCount(catalog, profile.badges);
  // 남의 프로필에서는 보유한 배지만 보여준다 — 미획득은 본인 성장 허브에서만 목표로 진열한다.
  const earned = shelf.filter((b) => b.earnedAt !== null);

  return (
    <>
      <div className="mt-4 flex items-center gap-3.5">
        <Image
          src={profile.characterPath}
          alt={`${profile.stageName} 캐릭터`}
          width={96}
          height={128}
          sizes="96px"
          className="flex-none rounded-card-sm object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xl font-extrabold text-accent">
            {profile.stageName} Lv.{profile.currentLevel}
          </p>
          <p className="mt-1.5 text-[11px] text-faint">
            누적 {profile.totalXp.toLocaleString()} XP
          </p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${pct}%` }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="현재 레벨 구간 진행률"
            />
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted">
            {maxed
              ? "최고 레벨을 달성했어요 🏆"
              : `다음 레벨까지 ${profile.xpToNextLevel.toLocaleString()} XP`}
          </p>
        </div>
      </div>

      {stats && (
        <div className="mt-4 border-t border-line pt-3.5">
          <h4 className="text-sm font-extrabold">성과</h4>
          <p className="mt-1.5 text-[12.5px] text-muted">
            누적 <b className="text-text">{stats.workoutCount}회</b> ·{" "}
            <b className="text-text">{formatMinutes(stats.totalMinutes)}</b>
            {streak !== undefined && streak > 0 && <> · 🔥 {streak}일</>} · 이번
            주 <b className="text-text">{stats.weekDays}일</b>
          </p>
        </div>
      )}

      <div className="mt-4 border-t border-line pt-3.5">
        <div className="flex items-baseline justify-between">
          <h4 className="text-sm font-extrabold">보유 배지</h4>
          <p className="text-[11px] text-muted">
            {owned} / {shelf.length}
          </p>
        </div>
        {earned.length === 0 ? (
          <p className="mt-1.5 text-[11.5px] text-muted">
            아직 획득한 배지가 없어요
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {earned.map((badge) => (
              <li
                key={badge.key}
                className="flex items-center gap-2.5 rounded-card-sm border border-line bg-surface-2 px-3 py-2"
              >
                <Image
                  src={`/badges/${badge.key}.png`}
                  alt=""
                  width={36}
                  height={36}
                  sizes="36px"
                  className="flex-none"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-extrabold">
                    {badge.name}
                    {badge.count > 1 && (
                      <span className="ml-1 text-[11px] font-bold text-muted">
                        ×{badge.count}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                    {badge.description}
                  </p>
                </div>
                <span className="flex-none text-[11px] font-extrabold text-accent">
                  +{badge.pointReward} P
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** 크루원 프로필 바텀시트 — 피드·크루 카드가 공유한다. */
export function MemberProfileSheet({
  userId,
  nickname,
  avatarUrl,
  streak,
  stats,
  onClose,
}: {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  streak?: number;
  /** 홈 친구 목록만 넘긴다 — 크루 카드·피드에서는 없어서 성과 블록이 안 뜬다 */
  stats?: MemberPerformance;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<CrewMemberProfile | null>(null);
  const [catalog, setCatalog] = useState<BadgeMeta[] | null>(null);
  const [failure, setFailure] = useState<"not_crew" | "failed" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // 실패 상태 초기화는 재시도 핸들러가 한다 — effect 본문에서 setState를 동기로
  // 부르면 렌더가 연쇄된다.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getCrewMemberProfile(userId), getBadgeCatalog()])
      .then(([p, c]) => {
        if (cancelled) return;
        setProfile(p);
        setCatalog(c);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setFailure(message.includes("not_crew") ? "not_crew" : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-profile-title"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[22px] border-t border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />

        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-surface-2 text-2xl">
            {avatarUrl ?? "👤"}
          </span>
          <p id="member-profile-title" className="text-lg font-extrabold">
            {nickname}님
          </p>
          {streak !== undefined && streak > 0 && (
            <span className="text-xs font-extrabold text-accent">
              🔥{streak}
            </span>
          )}
        </div>

        {failure === "not_crew" && (
          <p className="mt-4 text-sm text-muted">크루원만 볼 수 있어요</p>
        )}

        {failure === "failed" && (
          <>
            <p className="mt-4 text-sm text-muted">
              성장 정보를 불러오지 못했어요. 네트워크 상태를 확인해주세요.
            </p>
            <button
              type="button"
              onClick={() => {
                setFailure(null);
                setReloadKey((k) => k + 1);
              }}
              className="mt-3 h-11 w-full rounded-card border border-line bg-surface-2 text-sm font-extrabold text-accent"
            >
              다시 시도
            </button>
          </>
        )}

        {!failure && (!profile || !catalog) && (
          <p aria-busy="true" className="mt-4 text-[12.5px] text-muted">
            불러오는 중…
          </p>
        )}

        {!failure && profile && catalog && (
          <MemberProfileBody
            profile={profile}
            catalog={catalog}
            stats={stats}
            streak={streak}
          />
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-12 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink"
        >
          닫기
        </button>
      </div>
    </>
  );
}
