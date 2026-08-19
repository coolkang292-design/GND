"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth-provider";
import { Avatar } from "@/components/avatar";
import { MemberProfileSheet } from "@/components/crew/member-profile-sheet";
import { isPhotoAvatar } from "@/lib/domain/avatar-source";
import {
  getFriendBadges,
  getFriendBoardBase,
  type FriendBoardBase,
} from "@/lib/friends";
import {
  buildFriendRows,
  buildMyRow,
  canExpandFriendRows,
  formatTotalMinutes,
  pokeableFriendCount,
  visibleFriendRows,
  type FriendBadges,
  type FriendCrewInput,
  type FriendRow,
} from "@/lib/domain/friend-board";
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
 * 상태 배지 — 목업의 "● 오늘 완료 / ● 운동 전"을 색 + 글자로 옮긴 것.
 * 색은 테마 토큰을 그대로 쓴다(good=초록, warn=주황, accent=골드).
 * ⚠️ 색만으로 구별하지 않는다 — 색 옆에 항상 **글자**가 있다.
 *
 * ⚠️ 2026-08-08에 이 알약이 **지표 줄의 첫 칸**으로 들어갔다(사용자 지시 "운동 상태는
 * 위로 올리고"). 이름 줄로 올리는 것도 검토했는데 실측에서 닉네임이 82px 중 50px로
 * 잘려 못 썼다 — 그 수치는 `FriendRowItem` 주석에 있다.
 *
 * ⚠️ `done`이 **`완료`**다. `오늘 완료`는 지표 칸에서 18px 잘렸다(실측) — 사용자가
 * 화면을 보고 줄이라고 지시했다(2026-08-08). 앞에 `상태` 라벨이 붙어 `상태 완료`로
 * 읽히므로 "오늘"이 없어도 오늘 상태임이 흐려지지 않는다. 되살리면 다시 잘린다.
 * `운동 전`·`운동 중`은 첫 칸을 1.25fr로 넓혀서 그대로 들어간다.
 */
const STATUS_STYLE: Record<
  FriendRow["status"],
  { label: string; className: string }
> = {
  done: { label: "완료", className: "bg-good-weak text-good" },
  active: { label: "운동 중", className: "bg-warn/15 text-warn" },
  idle: { label: "운동 전", className: "bg-surface text-muted" },
};

/**
 * 지표 칩 — `28회 · 21분 · 🏅6 · 🔥5`처럼 이어 붙이면 **각 숫자가 뭔지 알 수 없다**
 * (2026-08-07 사용자 지적). 값마다 무엇을 센 것인지 글자로 적는다.
 *
 * `tone`은 상태 칸만 쓴다 — 나머지 세 칸은 색을 입히지 않는다. 다 색칠하면
 * 상태의 색이 정보를 잃는다.
 */
function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  /** 칩 배경·글자색을 덮어쓴다. 없으면 기본(회색 바탕 + 본문색) */
  tone?: string;
}) {
  return (
    <span
      className={`flex min-w-0 items-baseline justify-center gap-1 rounded-full px-1.5 py-1 ${
        tone ?? "bg-surface"
      }`}
    >
      <span className="flex-none text-[10px] font-bold text-faint">
        {label}
      </span>
      <span
        className={`truncate text-[11.5px] font-extrabold ${tone ? "" : "text-text"}`}
      >
        {value}
      </span>
    </span>
  );
}

/**
 * 한 사람의 행 — **나와 친구가 같은 컴포넌트를 쓴다.**
 *
 * ⚠️ 따로 만들지 마라. 같은 화면에서 내 숫자와 친구 숫자를 비교하는 것이 이 카드의
 * 목적인데, 행을 두 벌로 두면 지표 라벨·배지 규칙·상태 알약이 시간이 지나며 갈린다.
 * 다른 것은 **콕 버튼 하나뿐**이라 그것만 `row.isMe`로 가른다.
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
    <li className="rounded-card border border-line bg-surface-2 p-3">
      {/* ⚠️ **상태 알약은 이 줄에 없다** — 지표 줄 첫 칸으로 갔다 (2026-08-08 사용자
          지시 "운동 상태는 위로 올리고 찌름은 프로필 밑으로", 설계 §6).

          375px 실측이 이 배치의 근거다. 닉네임이 온전히 보이려면 내 행 82px,
          친구 행 81px가 필요한데 `flex-1`인 닉네임이 남는 폭 전부를 양보한다:

          | 이름 줄 구성 | 내 행 | 친구 행 |
          |---|---|---|
          | 닉네임+단계+상태+콕 | 46/82 | **0/81** ← 닉네임이 사라진다 |
          | 닉네임+단계+상태    | 50/82 | 68/81 |
          | 닉네임+단계+콕+`›`  | 82/82 | 75/81 |
          | 닉네임+단계+콕      | 82/82 | **81/81** ← 지금 |

          그래서 상태는 지표 줄로 내리고, 장식용 `›` 화살표는 **뺐다**. 화살표 8px가
          정확히 마지막 글자 몫이었다. 되돌리려면 먼저 재 보라 —
          `friend-board-card.test.tsx`가 상태·`›`의 부재를 단언한다.

          ⚠️ 콕 버튼은 이 버튼의 **형제**다. 이름 줄 안(`<button>` 내부)에 넣으면
          버튼이 중첩된다(크루 카드가 같은 이유로 이렇게 돼 있다). */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => onSelect(row)}
          aria-label={`${row.nickname} 성과 보기`}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          {/* ⚠️⚠️ **여기는 이모지 자리가 아니다.** 2026-08-07 사용자 요청으로
              **현재 레벨의 캐릭터**를 그린다 — 성장 카드·프로필 시트와 같은
              원천이라 셋이 안 갈린다. object-top이 없으면 원형으로 깎을 때
              얼굴이 잘린다.

              ⚠️ 2026-08-19에 프로필 사진이 생기면서 **사진이 있을 때만** 그것으로
              덮는다. 캐릭터를 통째로 걷어내지 않는 이유가 여기다 — 안 올린
              사람에게는 08-07 결정이 그대로 남아야 하고, 그래야 레벨을 올려
              캐릭터가 진화하는 재미가 안 죽는다.

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
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="truncate text-[14px] font-extrabold">
              {row.nickname}
            </span>
            {/* ⚠️ 내 행이라는 것을 **글자로** 말한다. 아바타는 내 캐릭터지만
                친구도 같은 그림일 수 있어 그것만으로는 구별이 안 된다. */}
            {row.isMe && (
              <span className="flex-none rounded-full bg-accent px-1.5 py-[1px] text-[10.5px] font-extrabold text-accent-ink">
                나
              </span>
            )}
            {/* 목업의 골드 알약 — accent(#e8b84b)가 그 색이다.
                ⚠️ **단계명이 앞, 레벨이 뒤**다 (2026-08-08 사용자 지시 —
                "개노답 LV2 이 순으로"). 순서를 뒤집지 마라.
                ⚠️ 레벨과 단계를 **한 알약**에 담는다. 둘로 쪼개면 요소가 하나 늘어
                좁은 폰에서 닉네임이 더 잘린다.
                단계명은 `row.stageName`(= `getLevelProgress`)이라 성장 카드·프로필
                시트와 같은 원천이다. 조회가 추가로 나가지 않는다. */}
            <span className="flex-none rounded-full border border-accent/40 bg-accent-weak px-1.5 py-[1px] text-[10.5px] font-extrabold text-accent">
              {row.stageName} Lv.{row.level}
            </span>
          </span>
        </button>

        {/* ⚠️ 내 행에는 콕이 **아무 모양으로도** 없다 — 버튼도, "✅ 찌름"도.
            자기 자신은 찌를 수 없다(2026-08-07 사용자 지시). 서버 `poke_user`도
            막지만, 누를 수 없는 버튼을 그려 놓고 에러 토스트로 알리는 것은
            화면이 거짓말을 하는 것이다.
            `flex-none`이 아니라 자리 자체가 없으므로, 내 행에서는 닉네임이 그만큼
            더 넓어진다(82/82).

            ⚠️ 상대의 오늘 운동 여부로는 버튼을 숨기지 않는다 (2026-08-07 사용자 지시).
            서버 `poke_user`에 그런 규칙이 없다 — 0028이 건 조건은 *내가* 오늘
            했는가 하나뿐이다. 옛 크루 카드의 화면 규칙을 그대로 옮겼던 탓에
            **오늘 운동을 마친 친구는 영영 못 찌르는** 상태였다. */}
        {row.isMe ? null : poked.has(row.userId) ? (
          <span
            aria-label={`${row.nickname} 찌름 완료`}
            className="flex-none rounded-full bg-surface px-2.5 py-1 text-[11px] font-bold text-faint opacity-70"
          >
            ✅ 찌름
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onPoke(row)}
            disabled={!iWorkedOut || pokingId === row.userId}
            aria-label={`${row.nickname} 찌르기`}
            className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
              iWorkedOut
                ? "bg-accent text-accent-ink"
                : "bg-surface text-faint opacity-60"
            }`}
          >
            👉 콕
          </button>
        )}
      </div>

      {/* 지표 줄 — **4칸 고정 그리드**다 (2026-08-07 사용자 요청 "일자로 고정",
          2026-08-08에 상태가 첫 칸으로 들어와 3칸 → 4칸).
          flex-wrap이면 닉네임 길이·값 자릿수에 따라 줄이 밀려 친구마다 행
          높이가 달라진다. 그리드라 같은 칸이 친구끼리도 세로로 맞는다.
          ⚠️ 연속 0일에도 칩을 **그린다** — 빼면 그 행만 칸이 밀린다.
          ⚠️ 상태 칸만 색을 입힌다 — 네 칸을 다 색칠하면 상태의 색이 정보를 잃는다.
          ⚠️ **첫 칸만 1.25배 넓다.** 4등분(68px)이면 `운동 전`이 7px 잘린다(실측).
             1.25fr로 80px가 되면 세 문구가 모두 들어간다. */}
      <div className="mt-2 grid grid-cols-[1.25fr_1fr_1fr_1fr] gap-1">
        <StatChip
          label="상태"
          value={STATUS_STYLE[row.status].label}
          tone={STATUS_STYLE[row.status].className}
        />
        <StatChip label="운동" value={`${row.workoutCount}회`} />
        <StatChip label="시간" value={formatTotalMinutes(row.totalMinutes)} />
        <StatChip label="연속" value={`${row.streak}일`} />
      </div>

      {/* 배지 줄 — 🏅 이모지 하나에 숫자를 붙이는 대신 **실제 배지 그림**을
          쓴다(2026-08-07 사용자 지적). 키는 이미 받아 온 것이라 조회가 없다. */}
      {/* ⚠️ 여백이 `mt-2 … pt-2`다 (2026-08-13). 옛 `2.5`에서 줄였다 — 375×812
          실측에서 크루 3명일 때 `운동 시작하기`가 접힘선을 **12px 넘겼다**(824px).
          행 하나에서 6px씩, 네 행이면 24px가 빠져 796px로 들어온다. 되돌리려면
          먼저 재라: 이 카드의 목적이 "크루 상태를 본 순간 버튼을 누르는 것"이라
          버튼이 접힘선 밖으로 나가면 카드를 합친 이유가 사라진다. */}
      <div className="mt-2 flex items-center gap-1.5 border-t border-line/60 pt-2">
        {row.badgeCount === null ? (
          <span className="text-[10.5px] text-faint">배지 불러오는 중…</span>
        ) : row.badgeCount === 0 ? (
          <span className="text-[10.5px] text-faint">아직 배지가 없어요</span>
        ) : (
          <>
            {row.badgeKeys.map((key) => (
              <Image
                key={key}
                src={`/badges/${key}.png`}
                alt=""
                width={26}
                height={26}
                sizes="26px"
                className="h-[26px] w-[26px] flex-none"
              />
            ))}
            {row.badgeCount > row.badgeKeys.length && (
              <span className="text-[10.5px] font-bold text-faint">
                +{row.badgeCount - row.badgeKeys.length}
              </span>
            )}
            <span className="ml-auto text-[10.5px] font-bold text-muted">
              배지 {row.badgeCount}개
            </span>
          </>
        )}
      </div>
    </li>
  );
}

/** 목록이 오기 전 자리를 잡아 두는 한 행 — 실제 행과 **같은 구조**라 높이가 같다 */
function SkeletonRow() {
  return (
    <li
      aria-hidden
      className="animate-pulse rounded-card border border-line bg-surface-2 p-3"
    >
      <div className="flex items-center gap-2.5">
        <div className="h-11 w-11 flex-none rounded-full bg-surface" />
        <div className="h-3.5 flex-1 rounded-full bg-surface" />
      </div>
      <div className="mt-2.5 grid grid-cols-[1.25fr_1fr_1fr_1fr] gap-1">
        <div className="h-[26px] rounded-full bg-surface" />
        <div className="h-[26px] rounded-full bg-surface" />
        <div className="h-[26px] rounded-full bg-surface" />
        <div className="h-[26px] rounded-full bg-surface" />
      </div>
      <div className="mt-2.5 border-t border-line/60 pt-2.5">
        <div className="h-[26px] w-24 rounded-full bg-surface" />
      </div>
    </li>
  );
}

/** 친구 영역이 지금 무엇을 그려야 하는가 */
export type FriendBoardStatus = "loading" | "failed" | "ready";

/**
 * 표시 전용 본문 — 조회가 끝난 뒤의 그리기만 담당한다.
 * 셸에서 분리해 둬야 표시 규칙을 테스트로 덮을 수 있다(MemberProfileBody와 같은 이유).
 *
 * ⚠️ 순위·등수를 그리지 않는다 (사용자 확정 2026-08-07).
 *
 * ⚠️ `myRow`는 `rows` **밖**에 있다 (2026-08-07 사용자 지시). 섞으면 세 가지가
 * 한꺼번에 틀어진다 — 헤딩의 `친구 N명`이 나를 세고, 접힌 3행 중 한 자리를 내가
 * 차지해 친구 하나가 밀려나며, `pokeableFriendCount`가 찌를 수 없는 나를 센다.
 *
 * ⚠️⚠️ **`cta`는 네 갈래(로딩·실패·0명·정상) 전부에서 그려진다** (2026-08-13 개편,
 * 설계 §4.1). 홈의 유일한 `운동 시작하기`가 이 안에 들어왔기 때문에, 어느 한
 * 갈래에서라도 빠지면 **친구 조회가 느리거나 실패했다는 이유로 운동 시작 버튼이
 * 사라진다.** 갈래마다 `return`을 따로 두지 마라 — 그렇게 하다 생기는 사고다.
 * `friend-board-card.test.tsx`가 네 갈래를 각각 단언한다.
 */
export function FriendBoardBody({
  rows,
  myRow,
  poked,
  iWorkedOut,
  expanded,
  truncated,
  pokingId,
  status = "ready",
  cta,
  onSelect,
  onPoke,
  onToggleExpand,
}: {
  rows: FriendRow[];
  /** 내 행. 조회 전이면 `null` — 그동안 친구 목록만 그린다. */
  myRow: FriendRow | null;
  poked: Set<string>;
  iWorkedOut: boolean;
  expanded: boolean;
  truncated: boolean;
  pokingId: string | null;
  /** 친구 영역의 상태. 생략하면 `ready` — 표시 규칙 테스트가 짧아진다. */
  status?: FriendBoardStatus;
  /**
   * 카드 맨 아래에 그릴 주 행동 버튼(`StartWorkoutCta`).
   *
   * ⚠️ 선택 prop이 아니다. 넘기지 않으면 홈에서 운동 시작 버튼이 사라진다.
   */
  cta: ReactNode;
  onSelect: (row: FriendRow) => void;
  onPoke: (row: FriendRow) => void;
  onToggleExpand: () => void;
}) {
  const visible = visibleFriendRows(rows, expanded);
  const canExpand = canExpandFriendRows(rows);
  const pokeable = pokeableFriendCount(rows, poked);
  const empty = status === "ready" && rows.length === 0;

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        {/* 옛 표기는 `👥`였다 (2026-08-07 2차 시안으로 교체). 옆 글자가 같은 뜻을
            말하므로 `alt=""`다.
            ⚠️ 헤딩이 상태마다 다르다. 조회 전에는 **숫자를 적지 않는다** — 0을
            적었다가 3으로 바뀌면 "친구가 없어졌다 생겼다"로 읽힌다. */}
        {/* ⚠️ **`친구`가 아니라 `크루`다** (2026-08-13 사용자 지시). 이 카드의
            대상은 상호 수락으로 맺어진 크루(`crew_links`)이고, 링크도 `/crew`로
            간다 — `친구`라고 부르면 화면의 두 말이 어긋난다. 이 카드 안의 문구를
            크루로 통일했다(초대 카드의 `친구 초대하기`는 앱 밖 사람을 부르는
            말이라 그대로 둔다). */}
        <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
          <UiIcon name={empty ? "friends-add" : "friends"} size={22} />
          {empty
            ? "크루와 함께하면 더 강해져요"
            : status === "ready"
              ? `나의 크루 ${rows.length}명`
              : "나의 크루"}
        </h3>
        {/* 누를 게 없는데 링크만 있는 상태를 만들지 않는다 */}
        {status === "ready" && canExpand && (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            className="text-xs font-bold text-accent"
          >
            {expanded ? "접기" : "전체 크루 보기 ›"}
          </button>
        )}
      </div>

      {status === "ready" && !iWorkedOut && pokeable > 0 && (
        <p className="mt-1 text-[11px] text-muted">
          오늘 운동을 마치면 크루를 콕 찌를 수 있어요 👉
        </p>
      )}

      {/* ── 친구 영역 — 네 갈래 중 하나만 그린다. CTA는 이 밖에 있다 ── */}
      {status === "loading" && (
        <ul className="mt-2.5 flex flex-col gap-1">
          <SkeletonRow />
        </ul>
      )}

      {status === "failed" && (
        <p className="mt-3 rounded-card-sm border border-line bg-surface-2 px-3 py-2.5 text-xs text-muted">
          친구 정보를 불러오지 못했어요.
        </p>
      )}

      {/* 옛 `NoFriendsCard`가 여기로 들어왔다 (2026-08-13). 별도 카드로 두면
          그 갈래에서 카드가 통째로 갈아치워져 **CTA가 사라진다.** */}
      {empty && (
        <p className="mt-1 text-xs text-muted">
          아직 크루가 없어요. 닉네임으로 크루를 찾아 서로의 기록을 확인해 보세요.
        </p>
      )}

      {/* ⚠️ **친구가 0명이어도 내 행은 그린다** (2026-08-13에 테스트가 잡았다).
          옛 구현은 `rows.length === 0`이면 카드를 `NoFriendsCard`로 통째로 갈아쳐서
          **내 기록도 같이 사라졌다.** 친구가 없다는 것이 내 운동 횟수·연속일·배지를
          숨길 이유는 없다. 그래서 목록은 "그릴 행이 하나라도 있으면" 그린다. */}
      {status === "ready" && (myRow !== null || visible.length > 0) && (
        <ul className="mt-2.5 flex flex-col gap-1">
          {/* ⚠️ 내 행이 **맨 위**다 (2026-08-07 사용자 지시). 정렬 대상이 아니라
              고정이다 — 내 최근 운동일에 따라 자리가 오르내리면 매번 눈으로 찾아야 한다. */}
          {myRow && (
            <FriendRowItem
              row={myRow}
              poked={poked}
              iWorkedOut={iWorkedOut}
              pokingId={pokingId}
              onSelect={onSelect}
              onPoke={onPoke}
            />
          )}
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

      {/* ⚠️ 크루 링크는 **외곽선 버튼**이다. 금색을 쓰면 바로 아래 `운동 시작하기`와
          주·부가 뒤집힌다 — 홈의 주 행동은 운동이지 친구 찾기가 아니다. */}
      {empty && (
        <Link
          href="/crew"
          className="mt-3 flex h-11 items-center justify-center rounded-card-sm border border-line bg-surface-2 text-[13px] font-extrabold text-accent"
        >
          크루 찾으러 가기 ›
        </Link>
      )}

      {truncated && (
        <p className="mt-2 text-[11px] text-muted">
          기록이 많아 일부만 반영된 수치예요
        </p>
      )}

      {/* ⚠️ 조건 없이 그린다. 위 네 갈래 중 무엇이 그려졌든 여기까지 온다. */}
      {cta}
    </section>
  );
}

/**
 * 홈 친구 목록 — 레벨·누적 기록·배지·오늘 상태 + 콕 찌르기.
 *
 * 설계: `docs/superpowers/specs/2026-08-07-home-friend-board-and-challenge-consolidation-design.md`
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
  me,
  cta,
}: {
  activeUserIds: Set<string>;
  iWorkedOut: boolean;
  /**
   * 카드 맨 아래 주 행동 버튼 (2026-08-13 개편, 설계 §4.1).
   *
   * ⚠️ 홈의 **유일한** `운동 시작하기`가 이 카드 안으로 들어왔다. 그래서 이 카드는
   * 조회 상태와 무관하게 **항상 렌더된다** — 아래 early-return을 되살리지 마라.
   */
  cta: ReactNode;
  /**
   * 내 행의 재료 (2026-08-07 사용자 지시). 조회 전이면 `null` — 그동안 친구 목록만
   * 그린다.
   *
   * ⚠️ **홈이 이미 가진 값을 내려받는다.** 여기서 `getMyProfile`·`getProgressSummary`를
   * 다시 부르면 홈에서 같은 질의가 두 번 나간다 — `activeUserIds`·`iWorkedOut`이
   * 같은 이유로 prop이다.
   */
  me: FriendCrewInput | null;
}) {
  const { userId, loading, configured } = useAuth();
  const [base, setBase] = useState<FriendBoardBase | null>(null);
  const [badges, setBadges] = useState<Map<string, FriendBadges>>(
    () => new Map(),
  );
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

        // 배지는 1인 1콜이라 늦다. 목록을 먼저 그리고 나중에 채운다 —
        // 그동안 자리는 "—"가 차지하므로 행 높이가 안 변한다.
        //
        // ⚠️ 내 id도 같이 넣는다. `get_crew_member_profile`은 **자기 자신을 허용**한다
        //    (`db-current-schema.sql:1255` — `p_target_id <> auth.uid()`일 때만 크루를
        //    따진다). 안 넣으면 내 행만 "배지 불러오는 중…"에서 영영 안 바뀐다.
        const counts = await getFriendBadges([
          userId,
          ...loaded.crew.map((m) => m.id),
        ]);
        if (!cancelled) setBadges(counts);
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

  const rows = useMemo(
    () =>
      base
        ? buildFriendRows({
            crew: base.crew,
            activity: base.activity,
            badges,
            activeUserIds,
          })
        : [],
    [base, badges, activeUserIds],
  );

  // 내 행 — 친구와 **같은** activity·badges 맵에서 나온다. 다른 경로로 만들면
  // 같은 화면에서 나와 친구를 비교할 수 없다.
  const myRow = useMemo(
    () =>
      base && me
        ? buildMyRow({ me, activity: base.activity, badges, activeUserIds })
        : null,
    [base, me, badges, activeUserIds],
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
   * ⚠️ **여기서 `ready`·`failed`·`0명`으로 갈라져 `return`하지 마라** (2026-08-13).
   *
   * 옛 구현은 판정 전 `return null`, 실패 시 문구 한 줄, 친구 0명이면
   * `NoFriendsCard`로 **카드를 통째로 갈아치웠다.** 홈의 유일한 `운동 시작하기`가
   * 이 카드 안으로 들어온 지금 그렇게 하면 **로딩·실패·친구 0명에서 운동 시작
   * 버튼이 사라진다.** 그래서 상태는 `status`로 넘기고 갈래는 카드 **안에서** 갈린다.
   *
   * 옛 주석의 "깜빡임 방지"는 이제 `SkeletonRow`가 한다 — 빈 화면 대신 같은 높이의
   * 자리를 먼저 잡으므로 목록이 도착해도 레이아웃이 튀지 않는다.
   *
   * `!configured`만 예외로 남긴다. Supabase 설정 자체가 없으면 `/record`도 동작하지
   * 않으므로 버튼만 남겨 두는 것이 오히려 거짓말이다 — 그 상태는 `AuthStatus`가 말한다.
   */
  if (!configured) return null;

  return (
    <>
      <FriendBoardBody
        rows={rows}
        myRow={myRow}
        poked={poked}
        iWorkedOut={iWorkedOut}
        expanded={expanded}
        truncated={base?.truncated ?? false}
        pokingId={pokingId}
        status={!ready ? "loading" : failed ? "failed" : "ready"}
        cta={cta}
        onSelect={setSelected}
        onPoke={(row) => void poke(row)}
        onToggleExpand={() => setExpanded((v) => !v)}
      />

      {notice && (
        <p className="-mt-1 px-1 text-xs font-bold text-accent">{notice}</p>
      )}

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
