"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Avatar } from "@/components/avatar";
import { MemberProfileSheet } from "@/components/crew/member-profile-sheet";
import { isPhotoAvatar } from "@/lib/domain/avatar-source";
import { getFriendBoardBase, type FriendBoardBase } from "@/lib/friends";
import {
  buildFriendRows,
  canExpandFriendRows,
  pokeableFriendCount,
  visibleFriendRows,
  type FriendRow,
} from "@/lib/domain/friend-board";
import {
  crewTodaySummary,
  TODAY_STATUS_LABEL,
} from "@/lib/domain/home-competition";
import { pokeUser, SocialError } from "@/lib/social";
import { UiIcon } from "@/components/ui-icon";

/**
 * 찌르기 실패 문구.
 *
 * ⚠️ `pokes_disabled`는 **미리 알 수 없다** — `notification_settings`가 RLS상
 * 본인 전용이라(`db-current-schema.sql:2706`) 상대가 껐는지 화면이 조회할 방법이
 * 없다. 서버 응답으로만 알 수 있으므로 문구가 반드시 있어야 한다.
 */
export function pokeErrorMessage(e: unknown): string {
  const code = e instanceof SocialError ? e.code : null;
  if (code === "poke_cooldown") return "24시간 안엔 한 번만 찌를 수 있어요";
  if (code === "poke_requires_workout")
    return "오늘 운동을 마쳐야 콕 할 수 있어요 💪";
  if (code === "pokes_disabled") return "상대가 찌르기 알림을 꺼 뒀어요";
  if (code === "not_crew") return "크루가 아니에요";
  return "찌르기를 보내지 못했어요";
}

/**
 * 상태 알약의 **색**. 문구는 `TODAY_STATUS_LABEL` 한 곳에서 온다 — 내 카드와
 * 크루 행이 같은 말을 써야 같은 사람이 두 자리에서 다르게 안 읽힌다.
 *
 * ⚠️ 색만으로 구별하지 않는다 — 색 옆에 항상 **글자**가 있다.
 */
const STATUS_TONE: Record<FriendRow["status"], string> = {
  done: "bg-good-weak text-good",
  active: "bg-warn/15 text-warn",
  idle: "bg-surface text-muted",
};

/**
 * 크루 한 사람의 행 (2026-08-21 압축).
 *
 * ⚠️ **내 행이 여기 없다.** 2026-08-07~08-20에는 같은 컴포넌트로 내 행도 그렸는데,
 * 08-21 개편에서 내 정보가 `PersonalTodayCard`로 분리됐다(설계 §5). 그래서
 * `isMe` 갈래도, 내 행에서 콕을 빼던 규칙도 사라졌다 — 이 목록에는 크루만 온다.
 *
 * ⚠️ **누적 지표와 배지를 되살리지 마라**(설계 §7.2). 옛 행은 상태·운동 횟수·누적
 * 시간·연속의 4칸 그리드에 배지 줄까지 있어 실측 152px였다. 오늘의 경쟁을 비교하는
 * 데 필요한 것은 오늘·이번 주·연속뿐이고, 누적과 배지는 프로필 시트가 갖는다.
 *
 * ⚠️ 두 줄 구조인 이유는 375px 실측이다(2026-08-08). 이름 줄에 상태까지 넣으면
 * 친구 행의 닉네임 몫이 **0px**가 된다 — 그래서 상태는 아랫줄 첫 칸이다.
 */
function FriendRowItem({
  row,
  poked,
  iWorkedOut,
  pokingId,
  onSelect,
  onPoke,
}: {
  row: FriendRow;
  poked: Set<string>;
  iWorkedOut: boolean;
  pokingId: string | null;
  onSelect: (row: FriendRow) => void;
  onPoke: (row: FriendRow) => void;
}) {
  return (
    /* ⚠️ `py-2`다. 실측 90px에서 84px 목표까지 6px을 여기와 지표 줄에서 뺐다
        (2026-08-21). 여백을 되돌리려거든 먼저 375×812에서 재라 — 크루 둘째 행이
        하단 탭 밑으로 내려가면 카드를 나눈 이유가 사라진다. */
    <li className="rounded-card border border-line bg-surface-2 px-3 py-2">
      {/* ⚠️ `gap-2`·`gap-1`이다. 2.5/1.5로 되돌리면 375px에서 `오뎅끼데스까`가
          4px 잘린다(2026-08-21 실측 80/84). 이름 줄의 남는 폭은 전부 닉네임 몫이다. */}
      <div className="flex items-center gap-2">
        {/* ⚠️ `min-h-11`(44px)은 접근성 요구다(설계 §10). 아바타가 44px라 실제
            높이는 안 늘지만, 아바타를 줄이는 날에도 터치 영역이 44px 아래로
            내려가지 않게 못 박아 둔다. */}
        <button
          type="button"
          onClick={() => onSelect(row)}
          aria-label={`${row.nickname} 성과 보기`}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          {/* ⚠️⚠️ **여기는 이모지 자리가 아니다.** 2026-08-07 사용자 요청으로
              **현재 레벨의 캐릭터**를 그린다 — 성장 카드·프로필 시트와 같은
              원천이라 셋이 안 갈린다. object-top이 없으면 원형으로 깎을 때
              얼굴이 잘린다.

              ⚠️ 판정에 `isPhotoAvatar`를 쓴다. `row.avatarUrl`에는 이모지도
              들어 있어서 `!= null`로 가르면 **전원이 이모지로 바뀐다.** */}
          {isPhotoAvatar(row.avatarUrl) ? (
            <Avatar
              src={row.avatarUrl}
              label={`${row.nickname}님 프로필 사진`}
              className="h-11 w-11 flex-none overflow-hidden rounded-full border border-line bg-surface"
            />
          ) : (
            <Image
              src={row.characterPath}
              alt={`${row.stageName} 캐릭터`}
              width={44}
              height={58}
              sizes="44px"
              className="h-11 w-11 flex-none rounded-full border border-line bg-surface object-cover object-top"
            />
          )}
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span className="truncate text-[14px] font-extrabold">
              {row.nickname}
            </span>
            {/* ⚠️ **단계명이 앞, 레벨이 뒤**다 (2026-08-08 사용자 지시 —
                "개노답 LV2 이 순으로"). 순서를 뒤집지 마라.
                ⚠️ 레벨과 단계를 **한 알약**에 담는다. 둘로 쪼개면 요소가 하나 늘어
                좁은 폰에서 닉네임이 더 잘린다. */}
            <span className="flex-none rounded-full border border-accent/40 bg-accent-weak px-1.5 py-[1px] text-[10.5px] font-extrabold text-accent">
              {row.stageName} Lv.{row.level}
            </span>
          </span>
        </button>

        {/* ⚠️ 콕은 성과 보기 버튼의 **형제**다 (설계 §7.4). 이름 줄 안(`<button>`
            내부)에 넣으면 버튼이 중첩돼 콕을 눌러도 프로필이 함께 열린다.

            ⚠️ **모든 크루 행에 항상 자리를 둔다** (사용자 확정 6번 요구). 내가 오늘
            운동 전이면 흐리게 잠그되 숨기지 않는다 — 자리가 사라지면 무엇을 하면
            열리는지를 화면이 말할 수 없다. 이유는 카드 위 한 줄이 말한다.

            ⚠️ 상대의 오늘 운동 여부로는 버튼을 숨기지 않는다 (2026-08-07 사용자 지시).
            서버 `poke_user`에 그런 규칙이 없다 — 0028이 건 조건은 *내가* 오늘
            했는가 하나뿐이다. 옛 크루 카드의 화면 규칙을 그대로 옮겼던 탓에
            **오늘 운동을 마친 친구는 영영 못 찌르는** 상태였다. */}
        {poked.has(row.userId) ? (
          <span
            aria-label={`${row.nickname} 찌름 완료`}
            className="flex-none rounded-full bg-surface px-2.5 py-1 text-[11px] font-bold text-faint opacity-70"
          >
            ✅ 찌름
          </span>
        ) : (
          /* ⚠️ 44px 터치 영역을 **`after`로** 만든다 (설계 §10). 2026-08-21에
             버튼 안에 알약 span을 넣어 높이를 키웠더니 폭이 50 → 66px로 늘어
             375px에서 `오뎅끼데스까`가 84px 중 64px로 **잘렸다**(실측). 가상
             요소는 레이아웃 폭·높이를 먹지 않으면서 탭 영역만 넓힌다. */
          <button
            type="button"
            onClick={() => onPoke(row)}
            disabled={!iWorkedOut || pokingId === row.userId}
            aria-label={`${row.nickname} 찌르기`}
            className={`relative flex-none rounded-full px-2.5 py-1 text-[11px] font-extrabold after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] ${
              iWorkedOut
                ? "bg-accent text-accent-ink"
                : "bg-surface text-faint opacity-60"
            }`}
          >
            👉 콕
          </button>
        )}
      </div>

      {/* 지표 줄 — 오늘 상태 · 이번 주 · 연속. **이 셋뿐이다**(설계 §7.2).
          ⚠️ 라벨과 값을 **각각 다른 요소**로 둔다. 한 요소에 `이번 주 2일`로 붙이면
             화면 낭독이 붙여 읽고, 테스트도 라벨만 짚을 수 없다.
          ⚠️ 연속 0일에도 칸을 그린다 — 빼면 그 행만 칸이 밀려 크루끼리 세로가
             안 맞는다(2026-08-07 사용자 요청 "일자로 고정"). */}
      <div className="mt-0.5 grid grid-cols-[1fr_auto_auto] items-center gap-2">
        <span
          className={`justify-self-start rounded-full px-2 py-[2px] text-[11px] font-bold ${STATUS_TONE[row.status]}`}
        >
          {TODAY_STATUS_LABEL[row.status]}
        </span>
        <span className="flex items-baseline gap-1 text-[11px] text-muted">
          <span>이번 주</span>
          <b className="text-[12px] font-extrabold text-text">
            {row.weekDays}일
          </b>
        </span>
        <span className="flex items-baseline gap-1 text-[11px] text-muted">
          <span>연속</span>
          <b className="text-[12px] font-extrabold text-text">
            {row.streak}일
          </b>
        </span>
      </div>
    </li>
  );
}

/** 목록이 오기 전 자리를 잡아 두는 한 행 — 실제 행과 **같은 구조**라 높이가 같다 */
function SkeletonRow() {
  return (
    <li
      aria-hidden
      className="animate-pulse rounded-card border border-line bg-surface-2 px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <div className="h-11 w-11 flex-none rounded-full bg-surface" />
        <div className="h-3.5 flex-1 rounded-full bg-surface" />
      </div>
      <div className="mt-0.5 grid grid-cols-[1fr_auto_auto] items-center gap-2">
        <div className="h-[19px] w-14 justify-self-start rounded-full bg-surface" />
        <div className="h-[19px] w-14 rounded-full bg-surface" />
        <div className="h-[19px] w-12 rounded-full bg-surface" />
      </div>
    </li>
  );
}

/** 크루 영역이 지금 무엇을 그려야 하는가 */
export type FriendBoardStatus = "loading" | "failed" | "ready";

/**
 * 표시 전용 본문 — 조회가 끝난 뒤의 그리기만 담당한다.
 * 셸에서 분리해 둬야 표시 규칙을 테스트로 덮을 수 있다(MemberProfileBody와 같은 이유).
 *
 * ⚠️ 순위·등수를 그리지 않는다 (사용자 확정 2026-08-07).
 *
 * ⚠️ **완료 인원 요약 칩을 헤더에 두지 마라** (2026-08-21 보완 기준 2, 설계 §7.1).
 * `1 / 2명 완료`는 목업에 있었지만 승인 문서가 이미지를 이긴다 — 그 사실은
 * `PersonalTodayCard`의 비교 문구가 **한 번만** 말한다.
 *
 * ⚠️ **홈 CTA가 여기서 나갔다** (2026-08-21). 2026-08-13에는 `운동 시작하기`가 이
 * 카드 안에 있었고 네 갈래(로딩·실패·0명·정상) 전부에서 그려야 했다. 지금 그 버튼은
 * `PersonalTodayCard`에 있고 **그 카드가 홈의 첫 카드**라 조회 상태와 무관하게 늘
 * 보인다 — 여기에 두 번째 주 행동 버튼을 만들지 마라.
 */
export function FriendBoardBody({
  rows,
  poked,
  iWorkedOut,
  expanded,
  truncated,
  pokingId,
  status = "ready",
  onSelect,
  onPoke,
  onToggleExpand,
}: {
  rows: FriendRow[];
  poked: Set<string>;
  iWorkedOut: boolean;
  expanded: boolean;
  truncated: boolean;
  pokingId: string | null;
  /** 크루 영역의 상태. 생략하면 `ready` — 표시 규칙 테스트가 짧아진다. */
  status?: FriendBoardStatus;
  onSelect: (row: FriendRow) => void;
  onPoke: (row: FriendRow) => void;
  onToggleExpand: () => void;
}) {
  const visible = visibleFriendRows(rows, expanded);
  const canExpand = canExpandFriendRows(rows);
  const pokeable = pokeableFriendCount(rows, poked);
  const empty = status === "ready" && rows.length === 0;
  const summary = crewTodaySummary(rows);

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        {/* ⚠️ 제목이 **상태와 무관하게 하나**다 (2026-08-21). 옛 헤딩은 조회 상태마다
            `나의 크루` / `나의 크루 N명` / `크루와 함께하면 더 강해져요`로 갈렸는데,
            이제 이 카드는 "오늘"을 말하는 자리라 인원수가 제목에 있을 이유가 없다. */}
        <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
          <UiIcon name={empty ? "friends-add" : "friends"} size={22} />
          오늘의 크루
        </h3>
        {/* ⚠️ 완료 칩 — 2026-08-21 설계 검토에서 한 번 뺐다가 같은 날 사용자가
            목업을 보고 **되살리라고 지시했다**(보완 기준 2 철회).

            ⚠️ **조회를 늘리지 않는다.** 이미 손에 든 `rows`에서 `crewTodaySummary`로
            센다 — 내 카드의 비교 문구와 **같은 정의**라 두 숫자가 어긋날 수 없다.
            여기서 손으로 다시 세지 마라.

            ⚠️ 분모는 **크루 전체 수**다. 접힌 2명이 아니다 — 접었다 폈다에 따라
            분모가 움직이면 같은 사실이 화면 조작마다 달라 보인다.

            ⚠️ 조회 전·크루 0명에는 그리지 않는다. `0 / 0명 완료`는 정보가 아니고,
            조회 중 `0 / 0`이 떴다가 `1 / 4`로 바뀌면 크루가 생긴 것처럼 읽힌다. */}
        {status === "ready" && summary.total > 0 && (
          <span className="flex-none rounded-full border border-good/40 bg-good-weak/60 px-2.5 py-1 text-[11px] font-bold text-muted">
            <b className="text-good">{summary.done}</b> / {summary.total}명 완료
          </span>
        )}
      </div>

      {/* ⚠️ 비활성 버튼은 눌러서 이유를 물을 수 없다. 그래서 이유를 버튼 **밖에**
          먼저 둔다(2026-08-21 보완 기준 3, 설계 §7.3). 운동을 마치면 이 줄은
          사라지고 각 행의 콕이 금색으로 열린다. */}
      {status === "ready" && !iWorkedOut && pokeable > 0 && (
        <p className="mt-1 text-[11px] text-muted">
          오늘 운동을 마치면 크루를 콕 찌를 수 있어요 👉
        </p>
      )}

      {status === "loading" && (
        <ul className="mt-2.5 flex flex-col gap-1">
          <SkeletonRow />
        </ul>
      )}

      {status === "failed" && (
        <p className="mt-3 rounded-card-sm border border-line bg-surface-2 px-3 py-2.5 text-xs text-muted">
          크루 정보를 불러오지 못했어요.
        </p>
      )}

      {empty && <p className="mt-1 text-xs text-muted">아직 크루가 없어요</p>}

      {status === "ready" && visible.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1">
          {visible.map((row) => (
            <FriendRowItem
              key={row.userId}
              row={row}
              poked={poked}
              iWorkedOut={iWorkedOut}
              pokingId={pokingId}
              onSelect={onSelect}
              onPoke={onPoke}
            />
          ))}
        </ul>
      )}

      {/* ⚠️ 크루 링크는 **외곽선 버튼**이다. 금색을 쓰면 내 카드의 `오늘 운동하고
          +N XP`와 주·부가 뒤집힌다 — 홈의 주 행동은 운동이지 크루 찾기가 아니다. */}
      {empty && (
        <Link
          href="/crew"
          className="mt-3 flex h-11 items-center justify-center rounded-card-sm border border-line bg-surface-2 text-[13px] font-extrabold text-accent"
        >
          크루 찾으러 가기 ›
        </Link>
      )}

      {/* ⚠️ 전체 보기가 **카드 하단 가운데**다 (목업 배치). 헤더 오른쪽은 완료 칩이
          차지했다 — 둘을 같은 줄에 두면 375px에서 서로를 민다.
          ⚠️ 누를 게 없는데 링크만 있는 상태를 만들지 않는다(2명 이하면 아예 없다). */}
      {status === "ready" && canExpand && (
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="mt-2 flex h-9 w-full items-center justify-center text-xs font-bold text-accent"
        >
          {expanded ? "접기" : "전체 크루 보기 ›"}
        </button>
      )}

      {truncated && (
        <p className="mt-2 text-[11px] text-muted">
          기록이 많아 일부만 반영된 수치예요
        </p>
      )}
    </section>
  );
}

/**
 * 홈 `오늘의 크루` 카드 — 오늘 상태·이번 주·연속 + 콕 찌르기 + 프로필 상세.
 *
 * 설계: `docs/superpowers/specs/2026-08-21-home-personal-crew-competition-board-design.md`
 *
 * `activeUserIds`(진행 중 운동)는 홈이 이미 60초마다 조회하는 값이라 **받아 쓴다**.
 * 여기서 또 부르면 같은 질의가 홈에서 두 번 나간다.
 *
 * `iWorkedOut`도 홈이 가진 값으로 판정한다 — ⚠️ 이 카드의 세션 질의는
 * `visibility='group'`으로 좁혀 있어서 그걸로 내 오늘 여부를 판정하면, 서버는
 * 허용하는데 버튼만 흐릿한 **막다른 길**이 생긴다(서버는 내 세션 전부를 본다).
 */
export function FriendBoardCard({
  activeUserIds,
  iWorkedOut,
}: {
  activeUserIds: Set<string>;
  iWorkedOut: boolean;
}) {
  const { userId, loading, configured } = useAuth();
  const [base, setBase] = useState<FriendBoardBase | null>(null);
  const [poked, setPoked] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<FriendRow | null>(null);
  const [pokingId, setPokingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;

    void (async () => {
      try {
        const loaded = await getFriendBoardBase(userId);
        if (cancelled) return;
        setBase(loaded);
        // 이 화면에서 방금 찌른 것을 덮어쓰지 않도록 합친다 — 재조회가 늦게
        // 끝나면 낙관적으로 잠근 버튼이 도로 열릴 수 있다(크루 카드와 같은 규약).
        setPoked((prev) => new Set([...prev, ...loaded.poked]));
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId]);

  /**
   * ⚠️ 배지 조회가 여기서 **빠졌다** (2026-08-21). 옛 코드는 1인 1콜로 크루 전원의
   * 배지를 받아 행에 썸네일을 그렸는데, 압축된 행은 배지를 그리지 않는다.
   *
   * ⚠️ 그렇다고 배지가 앱에서 사라진 것이 아니다 — 행을 누르면 열리는
   * `MemberProfileSheet`가 `get_crew_member_profile`로 **자기 몫을 직접 조회**한다.
   * 그래서 빈 맵으로 행을 만들어도 상세에서는 배지·이력·누적 성과가 모두 보인다.
   */
  const rows = useMemo(
    () =>
      base
        ? buildFriendRows({
            crew: base.crew,
            activity: base.activity,
            badges: new Map(),
            activeUserIds,
          })
        : [],
    [base, activeUserIds],
  );

  const poke = useCallback(async (row: FriendRow) => {
    setPokingId(row.userId);
    try {
      await pokeUser(row.userId);
      setPoked((s) => new Set(s).add(row.userId));
      setNotice(`${row.nickname}님을 콕 찔렀어요 👉`);
    } catch (e) {
      // 이미 24시간 안에 찔렀다면 버튼을 잠가 다시 못 누르게 한다.
      if (e instanceof SocialError && e.code === "poke_cooldown") {
        setPoked((s) => new Set(s).add(row.userId));
      }
      setNotice(pokeErrorMessage(e));
    } finally {
      setPokingId(null);
      setTimeout(() => setNotice(null), 3000);
    }
  }, []);

  /**
   * ⚠️ `!configured`만 예외로 남긴다. Supabase 설정 자체가 없으면 `/record`도 동작
   * 하지 않으므로 빈 카드를 그리는 것이 오히려 거짓말이다 — 그 상태는 `AuthStatus`가
   * 말한다. 나머지 갈래(로딩·실패·0명)는 카드 **안에서** 갈린다.
   */
  if (!configured) return null;

  return (
    <>
      <FriendBoardBody
        rows={rows}
        poked={poked}
        iWorkedOut={iWorkedOut}
        expanded={expanded}
        truncated={base?.truncated ?? false}
        pokingId={pokingId}
        status={!ready ? "loading" : failed ? "failed" : "ready"}
        onSelect={setSelected}
        onPoke={(row) => void poke(row)}
        onToggleExpand={() => setExpanded((v) => !v)}
      />

      {notice && (
        <p className="-mt-1 px-1 text-xs font-bold text-accent">{notice}</p>
      )}

      {/* ⚠️ **이 시트를 떼지 마라.** 홈 행에서 누적 성과·이력·배지를 없앤 것은
          정보를 지운 것이 아니라 여기로 옮긴 것이다(설계 §7.4). 시트는 자기
          데이터를 `get_crew_member_profile`로 직접 조회한다. */}
      {selected && (
        <MemberProfileSheet
          userId={selected.userId}
          nickname={selected.nickname}
          avatarUrl={selected.avatarUrl}
          streak={selected.streak}
          viewerId={userId ?? undefined}
          source="home"
          stats={{
            workoutCount: selected.workoutCount,
            totalMinutes: selected.totalMinutes,
            weekDays: selected.weekDays,
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
