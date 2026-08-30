"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { ImageLightbox } from "@/components/image-lightbox";
import { UiIcon } from "@/components/ui-icon";
import { uploadAvatarPhoto } from "@/lib/avatar";
import { updateMyAvatar } from "@/lib/crew";
import { avatarSource } from "@/lib/domain/avatar-source";
import { linkLabel } from "@/lib/domain/profile-links";
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

      {/*
        소개 · SNS (0085) — 레벨·성과보다 **앞**이다.

        ⚠️ 사람을 먼저 보여주고 숫자를 나중에 보여준다. 이 시트의 목적은 "이 사람이
           누구인가"이고, 그 답은 XP가 아니라 소개다.

        ⚠️ 값이 없는 항목은 **그리지 않는다.** 빈 줄과 죽은 버튼이 남으면 프로필이
           비어 보인다.

        ⚠️ 외부 링크는 `target="_blank"` + `rel="noopener noreferrer"`다. `noopener`가
           없으면 열린 페이지가 `window.opener`로 이 창을 조종할 수 있다.
           도메인 검증(`profile-links.ts`)을 통과한 주소여도 **이건 별개 방어**다 —
           다른 클라이언트가 넣은 값이 DB에 남아 있을 수 있다.
      */}
      {(profile.bio || profile.instagramUrl || profile.youtubeUrl) && (
        <div className="mt-3.5 flex flex-col gap-2">
          {profile.bio && (
            <p className="text-[13.5px] leading-snug break-words">
              {profile.bio}
            </p>
          )}
          {(profile.instagramUrl || profile.youtubeUrl) && (
            <div className="flex flex-wrap gap-1.5">
              {profile.instagramUrl && (
                <a
                  href={profile.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[34px] items-center gap-1 rounded-full border border-line bg-surface-2 px-3 text-[12px] font-bold text-muted"
                >
                  📷 {linkLabel("instagram", profile.instagramUrl)}
                </a>
              )}
              {profile.youtubeUrl && (
                <a
                  href={profile.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[34px] items-center gap-1 rounded-full border border-line bg-surface-2 px-3 text-[12px] font-bold text-muted"
                >
                  ▶️ {linkLabel("youtube", profile.youtubeUrl)}
                </a>
              )}
            </div>
          )}
        </div>
      )}

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
  onAvatarChanged,
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
  /**
   * **이걸 넘긴 호출부는 "이건 내 프로필이다"라고 말하는 것이다** (2026-08-22
   * 사용자 지시 — *"설정 화면이 아니라 홈 화면에 프로필 누른 뒤에 프로필 사진을
   * 눌러서 바로 수정"*).
   *
   * 넘기면 맨 위 아바타가 **누르는 순간 사진첩이 열리는 버튼**이 된다. 고른 사진은
   * 올라가서 곧바로 `profiles.avatar_url`에 저장되고, 새 URL이 이 콜백으로 온다 —
   * **저장 버튼이 없다.** 사진 하나만 바꾸는 자리에 저장 단계를 두면 홈에서 2탭에
   * 끝내려던 이유가 사라진다.
   *
   * ⚠️⚠️ **남의 프로필을 여는 5곳(챌린지·피드·크루 화면·크루 카드·크루 목록)에
   * 넘기지 마라.** 서버는 RLS(`profiles_update_own`)가 막지만, 화면에는 남의
   * 사진에 카메라 표시가 붙고 눌러도 실패만 한다. 지금 넘기는 곳은
   * `home-client.tsx`의 **내 시트 하나뿐**이다.
   *
   * ⚠️ 콜백을 받은 쪽이 `avatarUrl` prop을 새 값으로 올려 줘야 화면이 바뀐다 —
   * 이 시트는 사진을 자기 안에 따로 기억하지 않는다. 두 곳에 두면 홈 카드와 시트가
   * 서로 다른 사진을 그리는 순간이 생긴다.
   */
  onAvatarChanged?: (avatarUrl: string) => void;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<CrewMemberProfile | null>(null);
  const [catalog, setCatalog] = useState<BadgeMeta[] | null>(null);
  const [failure, setFailure] = useState<"not_crew" | "failed" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /** 사진 교체 중 — 아바타 버튼을 잠그고 그 위에 진행 표시를 덮는다 */
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  /** 친구 사진을 크게 띄우는 중 (2026-08-28) */
  const [zoomOpen, setZoomOpen] = useState(false);

  /**
   * 사진일 때만 값이 있다 — 이모지·빈 값이면 `null`이다.
   *
   * ⚠️ 이모지를 512px로 키워 봐야 볼 것이 없다. `avatar_url` 한 칸에는 사진 URL과
   * 이모지가 같이 들어온다(`domain/avatar-source.ts`). **판정을 여기서 손으로 쓰지
   * 않고 `avatarSource`를 부르는 것이 규칙이다** — `startsWith("http")`를 다시 쓰면
   * 판정이 두 곳으로 갈린다.
   *
   * ⚠️⚠️ **여기서 "내 프로필인가"를 보지 않는다.** 그 판정은 아래 렌더 분기
   * `onAvatarChanged ? … : avatarPhotoUrl ? …` **한 곳뿐**이어야 한다. 예전 판은
   * 여기서도 한 번 더 걸렀는데, 그러면 규칙이 두 겹이 되어 **한 겹을 부숴도
   * 테스트가 통과한다** — 2026-08-28에 일부러 고장 내 보고 실제로 그랬다.
   * 안전장치를 늘리는 대신 진실을 하나로 뒀다.
   */
  const avatarPhotoUrl = (() => {
    const source = avatarSource(avatarUrl);
    return source.kind === "photo" ? source.url : null;
  })();

  /**
   * 고른 사진을 올리고 **바로 저장한다** — 저장 버튼이 없다.
   *
   * ⚠️ 순서가 규칙이다: 업로드 → DB 저장 → **그다음에** 콜백. 올리기만 하고
   * 콜백을 부르면 화면은 새 사진인데 `profiles`는 옛 사진이라, 탭을 옮기면
   * 되돌아간다. 사용자는 "저장이 안 됐다"가 아니라 "사진이 사라졌다"로 읽는다.
   *
   * ⚠️ `URL.createObjectURL`로 미리보기를 앞당기지 마라 —
   * `profile-edit-sheet.tsx`가 같은 이유로 안 쓴다. 실제로 올라간 URL만 그리면
   * "보이는 것 ≠ 저장된 것"이 불가능해진다.
   */
  async function pickAvatar(file: File | undefined) {
    if (!file || !onAvatarChanged || avatarBusy) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const url = await uploadAvatarPhoto(userId, file);
      await updateMyAvatar(userId, url);
      onAvatarChanged(url);
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : "사진을 바꾸지 못했어요");
    } finally {
      setAvatarBusy(false);
      // 같은 파일을 다시 고를 수 있게 비운다 — 안 비우면 onChange가 안 뜬다
      if (avatarFileRef.current) avatarFileRef.current.value = "";
    }
  }

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
          {/* ⚠️ **내 프로필일 때만 눌린다** (`onAvatarChanged` 유무로 가른다).
              남의 시트에서는 옛날 그대로 그냥 그림이다 — 카메라 표시조차 안 붙는다.

              ⚠️ 이 자리가 프로필 사진을 바꾸는 **홈 쪽 유일한 입구**다
              (2026-08-22). 설정 탭의 `프로필 편집`은 닉네임과 함께 그대로 남아
              있으므로 둘 중 하나가 없어져도 길이 끊기지는 않는다.

              ⚠️ 44px는 눌리는 최소 크기라 **더 줄이지 마라.** 카메라 칩이 없으면
              눌린다는 것을 알 방법이 아예 없다 — 같이 지우지 마라. */}
          {onAvatarChanged ? (
            <>
              <button
                type="button"
                onClick={() => avatarFileRef.current?.click()}
                disabled={avatarBusy}
                aria-busy={avatarBusy}
                aria-label="프로필 사진 바꾸기"
                className="relative flex-none rounded-full disabled:opacity-60"
              >
                <Avatar
                  src={avatarUrl}
                  /* 버튼의 접근 가능한 이름이 이미 말한다 — 채우면 두 번 읽힌다 */
                  className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-accent/60 bg-surface-2 text-2xl"
                />
                <span
                  aria-hidden
                  className="absolute -bottom-0.5 -right-0.5 flex h-[19px] w-[19px] items-center justify-center rounded-full border border-line bg-surface shadow-card"
                >
                  <UiIcon name="camera" size={11} />
                </span>
                {avatarBusy && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-[9px] font-extrabold leading-none text-white">
                    올리는 중
                  </span>
                )}
              </button>
              <input
                ref={avatarFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="프로필 사진 파일"
                onChange={(e) => void pickAvatar(e.target.files?.[0])}
              />
            </>
          ) : avatarPhotoUrl ? (
            /* ⚠️⚠️ **이 삼항의 순서가 기능의 전부다.** `onAvatarChanged`(내 프로필)가
                **먼저** 걸러지므로 내 시트에는 확대가 절대 안 붙는다 — 그 자리는
                2026-08-22부터 **홈에서 사진을 바꾸는 유일한 입구**이고, 확대를 겹쳐
                달면 2탭에 사진을 바꾸려던 이유가 사라진다(2026-08-28 "이번엔 친구만").
                **순서를 뒤집지 마라.** 이 규칙이 사는 곳은 여기 한 줄뿐이다.

                ⚠️ 사진일 때만 이 갈래다. 이모지·빈 값이면 아래 옛 `<Avatar>` 그대로 —
                누를 수 없는 그림이다. `member-profile-sheet.zoom.test.tsx`가
                "이모지면 버튼이 없다"·"내 시트면 확대가 아니라 사진 바꾸기다"를
                **먼저 단언한다**(부정 확인이 이 기능의 증거다).

                ⚠️ 44px는 눌리는 최소 크기다 — 카메라 버튼과 같은 이유로 줄이지 마라. */
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              aria-label={`${nickname}님 프로필 사진 크게 보기`}
              className="relative flex-none rounded-full"
            >
              <Avatar
                src={avatarUrl}
                /* 버튼의 접근 가능한 이름이 이미 말한다 — 채우면 두 번 읽힌다 */
                className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-2 text-2xl"
              />
              {/* ⚠️ 칩을 지우지 마라. 내 시트의 카메라 칩과 **같은 자리·같은 19px**
                  이고, 이유도 같다 — 표시가 없으면 눌린다는 것을 알 방법이 아예 없다.
                  `ui-icons`에 확대 아이콘이 없어서 `personal-today-card.tsx`의
                  `BadgeHex`와 같은 방식으로 인라인 SVG를 그린다. */}
              <span
                aria-hidden
                className="absolute -bottom-0.5 -right-0.5 flex h-[19px] w-[19px] items-center justify-center rounded-full border border-line bg-surface text-accent shadow-card"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-[11px] w-[11px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6" />
                </svg>
              </span>
            </button>
          ) : (
            <Avatar
              src={avatarUrl}
              label={`${nickname}님 프로필 사진`}
              className="flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-full bg-surface-2 text-2xl"
            />
          )}
          <p id="member-profile-title" className="text-lg font-extrabold">
            {nickname}님
          </p>
          {streak !== undefined && streak > 0 && (
            <span className="text-xs font-extrabold text-accent">
              🔥{streak}
            </span>
          )}
        </div>

        {/* ⚠️ 성공은 **사진이 바뀌는 것 자체**가 알린다 — "저장했어요"를 따로 적지
            않는다. 실패만 말한다. */}
        {avatarError && (
          <p role="alert" className="mt-2 text-[12.5px] text-warn">
            {avatarError}
          </p>
        )}

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

      {/* ⚠️ 시트 **위**에 겹친다(z 60/70 vs 시트 50). 시트를 닫지 않으므로 확대를
          닫으면 보고 있던 성과 화면이 그대로 남는다 — 사진 한 장 보려고 프로필을
          다시 여는 일이 없어야 한다. */}
      {zoomOpen && avatarPhotoUrl && (
        <ImageLightbox
          src={avatarPhotoUrl}
          alt={`${nickname}님 프로필 사진`}
          onClose={() => setZoomOpen(false)}
        />
      )}
    </>
  );
}
