"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { badgeShelf, earnedBadgeCount, type BadgeMeta } from "@/lib/domain/badges";
import { getBadgeCatalog } from "@/lib/badges";
import {
  getCrewMemberProfile,
  type CrewMemberProfile,
} from "@/lib/progression";
import {
  buildProfileHistory,
  formatCumulativeDistance,
  formatCumulativeMinutes,
} from "@/lib/domain/profile-history";
import {
  recordProfileView,
  type ProfileViewSource,
} from "@/lib/profile-views";

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
  /**
   * 이번 주 운동일. **이 값만 화면에 쓰인다** — 누적 수치는 RPC(0081)가 준다.
   *
   * ⚠️ 그래서 나머지 둘은 선택이다 (2026-08-21). 홈 내 카드는 누적 분(分)을 손에
   * 들고 있지 않은데, 안 쓰는 칸을 채우자고 `0`을 넘기면 **화면에 안 보이는 거짓말**이
   * 남는다 — 나중에 그 칸을 그리는 순간 0분으로 나온다.
   */
  weekDays: number;
  workoutCount?: number;
  totalMinutes?: number;
};

/** 이력 줄의 날짜 — `2026. 8. 19.`처럼 길면 한 줄에 안 들어간다 */
function historyDate(at: Date): string {
  return `${at.getFullYear() % 100}.${at.getMonth() + 1}.${at.getDate()}`;
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card-sm border border-line bg-surface-2 px-3 py-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-[15px] font-extrabold">{value}</p>
    </div>
  );
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
  const distance = formatCumulativeDistance(profile.distanceMeters);
  const history = buildProfileHistory({
    joinedAt: profile.joinedAt,
    levelUps: profile.levelUps,
    badges: profile.badges,
    catalog,
  });
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

      {/* ⚠️⚠️ 누적 수치는 **RPC(0081)가 단일 원천**이다 — `stats` prop이 아니다.
          옛 판은 홈 친구 목록이 계산해 넘길 때만 이 블록을 그렸다. 그래서
          **피드·크루 화면에서 프로필을 열면 성과가 통째로 안 보였다**
          (2026-08-19 실측). 이제 어느 경로로 열어도 같은 숫자가 나온다.

          `stats`는 **이번 주**에만 쓴다 — 그건 RPC가 안 준다. */}
      <div className="mt-4 border-t border-line pt-3.5">
        <h4 className="text-sm font-extrabold">누적 성과</h4>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Tile label="운동" value={`${profile.workoutCount}회`} />
          <Tile label="운동한 날" value={`${profile.workoutDays}일`} />
          <Tile label="시간" value={formatCumulativeMinutes(profile.totalMinutes)} />
          {distance ? (
            <Tile label="거리" value={distance} />
          ) : (
            stats && <Tile label="이번 주" value={`${stats.weekDays}일`} />
          )}
        </div>
        {(streak !== undefined && streak > 0) || (distance && stats) ? (
          <p className="mt-1.5 text-[11.5px] text-muted">
            {streak !== undefined && streak > 0 && <>🔥 연속 {streak}일</>}
            {streak !== undefined && streak > 0 && distance && stats && " · "}
            {distance && stats && <>이번 주 {stats.weekDays}일</>}
          </p>
        ) : null}
      </div>

      {/* ── 이력 (2026-08-19 사용자 요청) ───────────────────────
          *"언제 가입했고 언제 어떤 배지를 받았으며 언제 레벨업을 했는지"*

          ⚠️ 꾸준왕 열람권과 **무관하다.** 열람권은 챌린지 KPI를 보는 권리다. */}
      {history.length > 0 && (
        <div className="mt-4 border-t border-line pt-3.5">
          <h4 className="text-sm font-extrabold">이력</h4>
          <ul className="mt-2 flex flex-col gap-1.5">
            {history.map((e, i) => (
              <li
                key={`${e.kind}-${e.at.getTime()}-${i}`}
                className="flex items-center gap-2.5 text-[12.5px]"
              >
                <span className="w-[74px] flex-none font-mono text-[11px] text-faint">
                  {historyDate(e.at)}
                </span>
                <span className="flex-none">
                  {e.kind === "joined" ? "🎬" : e.kind === "level_up" ? "⬆️" : e.emoji}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {e.kind === "joined"
                    ? "GND 시작"
                    : e.kind === "level_up"
                      ? `Lv.${e.level} 달성`
                      : e.name}
                </span>
              </li>
            ))}
          </ul>
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
  viewerId,
  source,
  onClose,
}: {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  streak?: number;
  /** 홈 친구 목록만 넘긴다 — **이번 주 일수에만** 쓴다(누적은 RPC가 준다) */
  stats?: MemberPerformance;
  /** 계측용. 없으면 안 남긴다 — 화면은 그대로 동작한다 */
  viewerId?: string;
  /** 어느 화면에서 눌렀나. 0건이 나왔을 때 어느 진입점이 죽었는지 알아야 한다 */
  source?: ProfileViewSource;
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

  // ⚠️ 조회 성공 여부와 무관하게 **연 순간** 남긴다. 성공한 것만 세면
  //    "열었는데 못 봤다"는 실패가 통계에서 사라진다.
  // ⚠️ `reloadKey`를 의존성에 넣지 않는다 — 다시 시도를 누를 때마다 중복으로 쌓인다.
  useEffect(() => {
    if (!viewerId || !source) return;
    void recordProfileView(viewerId, userId, source);
  }, [viewerId, userId, source]);

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
          <Avatar
            src={avatarUrl}
            label={`${nickname}님 프로필 사진`}
            className="flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-full bg-surface-2 text-2xl"
          />
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
