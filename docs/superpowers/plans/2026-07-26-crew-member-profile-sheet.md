# 크루원 프로필 시트 (레벨·배지 보기) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 피드·홈 크루 카드에서 크루원의 이름/아바타를 누르면 그 사람의 레벨과 배지 현황을 바텀시트로 볼 수 있게 한다.

**Architecture:** `user_progress`·`user_badges`가 둘 다 본인 전용 RLS라, 같은 그룹인지 검사하는 정의자(security definer) RPC `get_crew_member_profile` **하나**가 레벨과 배지를 함께 돌려준다. 클라이언트는 그 값을 기존 `getLevelProgress`·`badgeShelf` 도메인 함수에 통과시켜 표시하므로, 내 화면과 남의 화면이 같은 계산을 쓴다. 시트는 공통 컴포넌트 하나를 피드와 크루 카드가 공유한다.

**Tech Stack:** Next.js 16(App Router)·React 19·TypeScript·Tailwind v4·Supabase(Postgres RPC·RLS)·vitest. DB는 SQL Editor에 **수동 Run**.

**설계 문서:** `docs/superpowers/specs/2026-07-26-crew-member-profile-sheet-design.md`

---

## 0. 콜드 에이전트 필독

- 프로덕션 **https://gnd-one.vercel.app**. 저장소 `workout-app`, 브랜치 `main`.
- **게이트(모든 커밋 전):** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- **마이그레이션:** 0025까지 운영 적용됨 → **수정 금지**. 이 계획은 **0026**을 쓴다. 에이전트는 DDL을 실행할 수 없으므로 파일을 만든 뒤 **사용자에게 SQL Editor Run을 요청**하고 기다린다.
- **커밋 시점:** 자동 검증 통과 → **사용자 실기기 확인** → 그다음 커밋·배포. (Task 7)
- 테스트 관례: 순수 도메인은 `src/lib/domain/*.test.ts`, 컴포넌트는 `renderToStaticMarkup` SSR (`src/components/**/*.test.tsx`).

**실측 참고 위치**

| 대상 | 위치 |
|---|---|
| 레벨 파생 계산 | `src/lib/domain/progression.ts` → `getLevelProgress(totalXp)` |
| 내 레벨 조회 | `src/lib/progression.ts:23` `getProgressSummary()` |
| 레벨 카드 UI 원본 | `src/components/profile/current-stage-card.tsx` |
| 배지 도메인 | `src/lib/domain/badges.ts` → `badgeShelf()`·`earnedBadgeCount()`·`BADGE_CATALOG`(3개) |
| 배지 칩 UI 원본 | `src/components/record/badge-shelf.tsx:50-65` |
| 피드 카드 | `src/components/feed/feed-item.tsx` (사진형 67-85행 / 일반형 103-123행) |
| 피드 페이지 | `src/app/(tabs)/feed/page.tsx:124-130` |
| 크루 카드 칩 | `src/components/crew-card.tsx:87-114` |
| 그룹 소속 검사 SQL | `supabase/migrations/0001_identity_crew.sql:61` `shares_group_with(uid)` |
| 실 DB 스크립트 관례 | `scripts/badge-test.mjs` (헬퍼·픽스처 정리 패턴) |

---

## 1. 파일 구조

| 구분 | 파일 | 책임 |
|---|---|---|
| Create | `supabase/migrations/0026_crew_member_profile.sql` | 권한 검사 + 레벨·배지 단일 조회 RPC |
| Modify | `src/lib/progression.ts` | `CrewMemberProfile` 타입 + `getCrewMemberProfile()` — RPC 호출과 도메인 계산 연결 |
| Create | `src/components/crew/member-profile-sheet.tsx` | 시트 셸(조회·에러·닫기) + `MemberProfileBody`(순수 표시) |
| Create | `src/components/crew/member-profile-sheet.test.tsx` | 표시 로직 SSR 검증 |
| Modify | `src/components/feed/feed-item.tsx` | 이름·아바타를 버튼화, `onProfileClick` 위임 |
| Modify | `src/components/feed/feed-item.test.tsx` | 새 필수 prop 반영 |
| Modify | `src/app/(tabs)/feed/page.tsx` | 선택 상태 1개 + 시트 1개 렌더 |
| Modify | `src/components/crew-card.tsx` | 멤버 칩을 형제 버튼 2개로 분리 + 시트 렌더 |
| Create | `scripts/crew-profile-check.mjs` | 실 DB 권한·데이터 검증 |

**표시 계산은 `MemberProfileBody`에 몰고, 조회·에러는 `MemberProfileSheet`가 갖는다.** 이렇게 나눠야 데이터가 effect로 들어오는 컴포넌트에서도 표시 로직을 SSR 테스트로 덮을 수 있다.

---

## Task 1: 마이그레이션 0026 — get_crew_member_profile RPC

**Files:**
- Create: `supabase/migrations/0026_crew_member_profile.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 0026: 크루원 프로필 — 같은 그룹이면 서로의 레벨·배지를 읽는다
-- 설계: docs/superpowers/specs/2026-07-26-crew-member-profile-sheet-design.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0022~0025는 수정 금지.
--
-- 왜 RPC인가:
--  · user_progress·user_badges는 본인 전용 RLS(0022·0020)라 남의 행이 안 내려온다.
--  · 레벨과 배지를 한 번에 돌려줘 시트가 왕복 1회로 열리고,
--    권한 검사(shares_group_with)가 한 곳에만 존재한다.
--
-- 반환의 current_level·current_stage는 서버 캐시값이다. 화면 표시는 클라이언트가
-- total_xp로 다시 계산한다(내 화면과 같은 함수를 쓰기 위해). 두 값이 어긋나면
-- 캐시가 깨진 것이므로 scripts/crew-profile-check.mjs가 이를 교차 검증한다.

create or replace function public.get_crew_member_profile(p_target_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_progress user_progress%rowtype;
  v_badges jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_target_id <> auth.uid() and not shares_group_with(p_target_id) then
    raise exception 'not_crew';
  end if;

  -- 행이 없으면(운동 이력 0인 신규 유저) 전 필드 null → 아래 coalesce가 0 XP로 만든다
  select * into v_progress
  from user_progress
  where user_id = p_target_id;

  select coalesce(
           jsonb_agg(
             jsonb_build_object('badgeKey', b.badge_key, 'earnedAt', b.earned_at)
             order by b.earned_at
           ),
           '[]'::jsonb
         )
    into v_badges
  from user_badges b
  where b.user_id = p_target_id;

  return jsonb_build_object(
    'totalXp',      coalesce(v_progress.total_xp, 0),
    'currentLevel', coalesce(v_progress.current_level, 1),
    'currentStage', coalesce(v_progress.current_stage, 1),
    'badges',       v_badges
  );
end $$;

revoke all on function public.get_crew_member_profile(uuid) from public, anon;
grant execute on function public.get_crew_member_profile(uuid) to authenticated;
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/migrations/0026_crew_member_profile.sql
git commit -m "feat: 0026 크루원 레벨·배지 조회 RPC"
```

- [ ] **Step 3: 사용자에게 Run 요청 후 대기**

사용자에게 이렇게 요청한다:

> `supabase/migrations/0026_crew_member_profile.sql` 전체를 Supabase SQL Editor에 붙여넣고 Run 해주세요. 적용되면 알려주세요 — 이후 Task부터 실제 조회가 가능합니다.

**적용 확인 전까지 Task 6(실 DB 검증)을 실행하지 않는다.** Task 2~5는 적용 없이도 작성·타입검사·단위테스트가 가능하다.

---

## Task 2: 클라이언트 조회 함수

**Files:**
- Modify: `src/lib/progression.ts`

- [ ] **Step 1: import 추가**

`src/lib/progression.ts` 최상단 import 블록을 아래로 바꾼다 (기존 2줄 + 1줄 추가):

```ts
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getLevelProgress } from "@/lib/domain/progression";
import type { EarnedBadge } from "@/lib/domain/badges";
```

- [ ] **Step 2: 파일 끝에 타입과 함수 추가**

```ts
export interface CrewMemberProfile {
  totalXp: number;
  currentLevel: number;
  currentStage: number;
  stageName: string;
  characterPath: string;
  nextLevelRequiredXp: number | null;
  xpToNextLevel: number;
  levelProgressPercent: number;
  badges: EarnedBadge[];
}

type CrewProfileRow = {
  totalXp?: number;
  currentLevel?: number;
  currentStage?: number;
  badges?: { badgeKey: string; earnedAt: string }[];
};

/**
 * 크루원 한 명의 레벨·배지 (0026 정의자 RPC).
 * 크루가 아니면 RPC가 'not_crew'를 raise한다 — 호출부가 문구를 고른다.
 *
 * 레벨·단계는 RPC가 준 캐시값 대신 total_xp로 다시 계산한다. 내 정보 화면
 * (getProgressSummary)과 같은 함수를 써야 두 화면의 숫자가 어긋나지 않는다.
 */
export async function getCrewMemberProfile(
  targetId: string,
): Promise<CrewMemberProfile> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_crew_member_profile", {
    p_target_id: targetId,
  });
  if (error) throw error;

  const row = (data ?? {}) as CrewProfileRow;
  const totalXp = row.totalXp ?? 0;
  const p = getLevelProgress(totalXp);
  return {
    totalXp,
    currentLevel: p.currentLevel,
    currentStage: p.currentStageIndex,
    stageName: p.stageName,
    characterPath: p.characterPath,
    nextLevelRequiredXp: p.nextLevelRequiredXp,
    xpToNextLevel: p.xpToNextLevel,
    levelProgressPercent: p.percent,
    badges: (row.badges ?? []).map((b) => ({
      badgeKey: b.badgeKey,
      earnedAt: new Date(b.earnedAt),
    })),
  };
}
```

- [ ] **Step 3: 타입 검사**

Run: `pnpm typecheck`
Expected: 오류 0건

- [ ] **Step 4: 커밋**

```bash
git add src/lib/progression.ts
git commit -m "feat: 크루원 레벨·배지 조회 클라 함수"
```

---

## Task 3: 프로필 시트 컴포넌트 (TDD)

**Files:**
- Create: `src/components/crew/member-profile-sheet.test.tsx`
- Create: `src/components/crew/member-profile-sheet.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/crew/member-profile-sheet.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemberProfileBody, MemberProfileSheet } from "./member-profile-sheet";
import type { CrewMemberProfile } from "@/lib/progression";

function profile(over: Partial<CrewMemberProfile> = {}): CrewMemberProfile {
  return {
    totalXp: 7220,
    currentLevel: 17,
    currentStage: 4,
    stageName: "물고가개",
    characterPath: "/characters/char-4.png",
    nextLevelRequiredXp: 7600,
    xpToNextLevel: 380,
    levelProgressPercent: 52.5,
    badges: [
      { badgeKey: "record_beaten_1", earnedAt: new Date("2026-07-20T10:00:00+09:00") },
      { badgeKey: "record_beaten_5", earnedAt: new Date("2026-07-24T10:00:00+09:00") },
    ],
    ...over,
  };
}

describe("MemberProfileBody — 레벨", () => {
  it("단계·레벨·누적 XP·진행률·남은 XP를 표시한다", () => {
    const html = renderToStaticMarkup(<MemberProfileBody profile={profile()} />);
    expect(html).toContain("물고가개 Lv.17");
    expect(html).toContain("누적 7,220 XP");
    expect(html).toContain('aria-valuenow="53"'); // 52.5 반올림
    expect(html).toContain("다음 레벨까지 380 XP");
  });

  it("최고 레벨이면 남은 XP 대신 달성 문구", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody
        profile={profile({
          currentLevel: 35,
          nextLevelRequiredXp: null,
          xpToNextLevel: 0,
          levelProgressPercent: 100,
        })}
      />,
    );
    expect(html).toContain("최고 레벨");
    expect(html).not.toContain("다음 레벨까지");
  });
});

describe("MemberProfileBody — 배지", () => {
  it("획득 배지는 이모지와 이름, 미획득은 자물쇠로 표시한다", () => {
    const html = renderToStaticMarkup(<MemberProfileBody profile={profile()} />);
    expect(html).toContain("첫 기록 갱신");
    expect(html).toContain("기록 갱신 5회");
    expect(html).toContain("기록 갱신 10회"); // 미획득도 진열한다
    expect(html).toContain("🔒");
    expect(html).toContain("2 / 3");
  });

  it("배지가 하나도 없으면 안내 문구를 보여준다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody profile={profile({ badges: [] })} />,
    );
    expect(html).toContain("아직 획득한 배지가 없어요");
    expect(html).toContain("0 / 3");
  });

  it("카탈로그에 없는 배지 키는 표시하지 않는다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileBody
        profile={profile({
          badges: [{ badgeKey: "future_badge_99", earnedAt: new Date() }],
        })}
      />,
    );
    expect(html).not.toContain("future_badge_99");
    expect(html).toContain("0 / 3");
  });
});

describe("MemberProfileSheet", () => {
  it("닉네임·스트릭·다이얼로그 역할·닫기 버튼을 렌더한다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileSheet
        userId="friend-1"
        nickname="낭만송곳니"
        avatarUrl="🐶"
        streak={12}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("낭만송곳니");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="member-profile-title"');
    expect(html).toContain("🔥12");
    expect(html).toContain("닫기");
  });

  it("스트릭이 없으면 불꽃을 표시하지 않는다", () => {
    const html = renderToStaticMarkup(
      <MemberProfileSheet
        userId="friend-1"
        nickname="낭만송곳니"
        avatarUrl={null}
        onClose={() => {}}
      />,
    );
    expect(html).not.toContain("🔥");
    expect(html).toContain("👤"); // 아바타 없으면 기본 얼굴
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/components/crew/member-profile-sheet.test.tsx`
Expected: FAIL — `Failed to resolve import "./member-profile-sheet"`

- [ ] **Step 3: 컴포넌트 구현**

`src/components/crew/member-profile-sheet.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { badgeShelf, earnedBadgeCount } from "@/lib/domain/badges";
import {
  getCrewMemberProfile,
  type CrewMemberProfile,
} from "@/lib/progression";

/**
 * 시트 본문 — 조회가 끝난 뒤의 표시만 담당한다.
 * 셸에서 분리해 둬야 표시 로직을 SSR 테스트로 덮을 수 있다.
 */
export function MemberProfileBody({ profile }: { profile: CrewMemberProfile }) {
  const pct = Math.min(100, Math.round(profile.levelProgressPercent));
  const maxed = profile.nextLevelRequiredXp === null;
  // 카탈로그에 없는 badge_key는 badgeShelf가 자연히 걸러낸다 —
  // 배지가 46개로 늘어도 이 컴포넌트는 그대로다.
  const shelf = badgeShelf(profile.badges);
  const owned = earnedBadgeCount(profile.badges);

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

      <div className="mt-4 border-t border-line pt-3.5">
        <div className="flex items-baseline justify-between">
          <h4 className="text-sm font-extrabold">배지</h4>
          <p className="text-[11px] text-muted">
            {owned} / {shelf.length}
          </p>
        </div>
        {owned === 0 && (
          <p className="mt-1.5 text-[11.5px] text-muted">
            아직 획득한 배지가 없어요
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {shelf.map((badge) => (
            <span
              key={badge.key}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-extrabold ${
                badge.earnedAt
                  ? "border-accent bg-accent-weak text-accent"
                  : "border-line bg-surface-2 text-faint opacity-60"
              }`}
            >
              <span className="text-sm">
                {badge.earnedAt ? badge.emoji : "🔒"}
              </span>
              {badge.name}
            </span>
          ))}
        </div>
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
  onClose,
}: {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  streak?: number;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<CrewMemberProfile | null>(null);
  const [failure, setFailure] = useState<"not_crew" | "failed" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailure(null);
    getCrewMemberProfile(userId)
      .then((p) => {
        if (!cancelled) setProfile(p);
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
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-3 h-11 w-full rounded-card border border-line bg-surface-2 text-sm font-extrabold text-accent"
            >
              다시 시도
            </button>
          </>
        )}

        {!failure && !profile && (
          <p aria-busy="true" className="mt-4 text-[12.5px] text-muted">
            불러오는 중…
          </p>
        )}

        {!failure && profile && <MemberProfileBody profile={profile} />}

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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/components/crew/member-profile-sheet.test.tsx`
Expected: PASS — 7 tests

- [ ] **Step 5: 게이트 + 커밋**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint 0건, 타입 0건, 전체 테스트 PASS

```bash
git add src/components/crew/member-profile-sheet.tsx src/components/crew/member-profile-sheet.test.tsx
git commit -m "feat: 크루원 프로필 시트 컴포넌트"
```

---

## Task 4: 피드 카드 진입점

**Files:**
- Modify: `src/components/feed/feed-item.tsx`
- Modify: `src/components/feed/feed-item.test.tsx`
- Modify: `src/app/(tabs)/feed/page.tsx`

- [ ] **Step 1: 진입점 테스트 추가**

`src/components/feed/feed-item.test.tsx`의 기존 `describe("FeedItemCard", ...)` 블록 **안**에 아래 테스트를 추가한다. 기존 테스트의 `<FeedItemCard item={...} userId="me" />` 호출에도 `onProfileClick={() => {}}`를 넣어야 한다(필수 prop이 된다).

```tsx
  it("사진 카드에서 닉네임을 프로필 버튼으로 감싼다", () => {
    const html = renderToStaticMarkup(
      <FeedItemCard
        item={feedItem("https://example.com/workout.jpg")}
        userId="me"
        onProfileClick={() => {}}
      />,
    );
    expect(html).toContain('aria-label="오빙크 프로필 보기"');
  });

  it("일반 카드에서도 닉네임을 프로필 버튼으로 감싼다", () => {
    const html = renderToStaticMarkup(
      <FeedItemCard item={feedItem(null)} userId="me" onProfileClick={() => {}} />,
    );
    expect(html).toContain('aria-label="오빙크 프로필 보기"');
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/components/feed/feed-item.test.tsx`
Expected: FAIL — `aria-label="오빙크 프로필 보기"`를 찾지 못함 (타입 오류도 함께)

- [ ] **Step 3: `feed-item.tsx` props 확장**

15행의 `type Props`를 아래로 바꾼다:

```tsx
type Props = {
  item: FeedItem;
  userId: string;
  /** 닉네임·아바타 탭 — 호출부가 프로필 시트를 연다 */
  onProfileClick: () => void;
};
```

41행 함수 시그니처를 아래로 바꾼다:

```tsx
export function FeedItemCard({ item, userId, onProfileClick }: Props) {
```

- [ ] **Step 4: 사진 카드 오버레이 버튼화**

67-81행의 `<div className="absolute inset-x-0 bottom-0 ...">` 안, 아바타+닉네임 묶음(`<div className="flex min-w-0 items-center gap-2">`)을 아래 버튼으로 교체한다. 반응 바는 카드 하단 별도 영역이라 겹치지 않는다.

```tsx
            <button
              type="button"
              onClick={onProfileClick}
              aria-label={`${item.nickname} 프로필 보기`}
              className="flex min-w-0 items-center gap-2 text-left"
            >
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/20 text-base backdrop-blur">
                {item.avatarUrl ?? "👤"}
              </span>
              <p className="truncate text-sm font-extrabold">
                {item.nickname}
                {item.userId === userId && (
                  <span className="ml-1 opacity-75">(나)</span>
                )}
                {item.streak > 0 && (
                  <span className="ml-1.5 text-xs">🔥{item.streak}</span>
                )}
              </p>
            </button>
```

- [ ] **Step 5: 일반 카드 헤더 버튼화**

103-123행의 `<div className="flex items-center gap-2.5 px-4 pt-3.5">` 블록 전체를 아래로 교체한다. 완료 시각 줄은 버튼 밖에 두어 탭 영역이 과하게 넓어지지 않게 한다.

```tsx
      <div className="flex items-center gap-2.5 px-4 pt-3.5">
        <button
          type="button"
          onClick={onProfileClick}
          aria-label={`${item.nickname} 프로필 보기`}
          className="flex min-w-0 items-center gap-2.5 text-left"
        >
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-surface-2 text-lg">
            {item.avatarUrl ?? "👤"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold">
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
        </button>
      </div>
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm vitest run src/components/feed/feed-item.test.tsx`
Expected: PASS — 3 tests

- [ ] **Step 7: 피드 페이지에 시트 배선**

`src/app/(tabs)/feed/page.tsx`:

import 블록에 추가:

```tsx
import { MemberProfileSheet } from "@/components/crew/member-profile-sheet";
```

23행 `const [ready, setReady] = useState(false);` 아래에 상태 추가:

```tsx
  // 시트는 화면당 1개만 띄운다 — 카드마다 두면 DOM이 항목 수만큼 늘어난다
  const [selected, setSelected] = useState<FeedItem | null>(null);
```

124-130행의 `<FeedItemCard ...>`에 콜백을 넘긴다:

```tsx
              {g.items.map((item) => (
                <FeedItemCard
                  key={item.sessionId}
                  item={item}
                  userId={userId!}
                  onProfileClick={() => setSelected(item)}
                />
              ))}
```

143행 `</div>` 직전(최상위 `<div>` 닫기 직전)에 시트를 렌더한다:

```tsx
      {selected && (
        <MemberProfileSheet
          userId={selected.userId}
          nickname={selected.nickname}
          avatarUrl={selected.avatarUrl}
          streak={selected.streak}
          onClose={() => setSelected(null)}
        />
      )}
```

- [ ] **Step 8: 게이트 + 커밋**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: 전부 통과

```bash
git add src/components/feed/feed-item.tsx src/components/feed/feed-item.test.tsx "src/app/(tabs)/feed/page.tsx"
git commit -m "feat: 피드에서 크루원 프로필 시트 열기"
```

---

## Task 5: 홈 크루 카드 진입점

**Files:**
- Modify: `src/components/crew-card.tsx`

멤버 칩은 지금 `div` 안에 "👉 콕" 버튼이 들어 있다. 칩 전체를 버튼으로 감싸면 **버튼 안에 버튼**이 되어 HTML이 깨진다. 이름 영역과 콕 버튼을 **형제 버튼 2개**로 나눈다 — `stopPropagation`이 필요 없어진다.

- [ ] **Step 1: import·상태 추가**

`src/components/crew-card.tsx` import 블록에 추가:

```tsx
import { MemberProfileSheet } from "@/components/crew/member-profile-sheet";
```

25행 `const [refreshKey, setRefreshKey] = useState(0);` 아래에 추가:

```tsx
  const [selected, setSelected] = useState<Profile | null>(null);
```

- [ ] **Step 2: 멤버 칩을 형제 버튼 2개로 분리**

87-114행의 `<div className="mt-3 flex flex-wrap gap-2">` 블록 전체를 아래로 교체한다:

```tsx
      <div className="mt-3 flex flex-wrap gap-2">
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 pr-2.5 pl-1"
          >
            <button
              type="button"
              onClick={() => setSelected(m)}
              aria-label={`${m.nickname} 프로필 보기`}
              className="flex items-center gap-1.5"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-sm">
                {m.avatar_url ?? "👤"}
              </span>
              <span className="text-xs font-bold">
                {m.nickname}
                {m.id === userId && (
                  <span className="ml-0.5 text-faint">(나)</span>
                )}
                {workedOut.has(m.id) && <span className="ml-0.5">✅</span>}
              </span>
            </button>
            {m.id !== userId && !workedOut.has(m.id) && (
              <button
                onClick={() => void poke(m)}
                aria-label={`${m.nickname} 찌르기`}
                className="ml-0.5 rounded-full bg-accent-weak px-1.5 py-0.5 text-[11px] font-bold text-accent"
              >
                👉 콕
              </button>
            )}
          </div>
        ))}
      </div>
```

- [ ] **Step 3: 시트 렌더**

`copyInvite` 버튼(`</button>`)과 `</section>` 사이에 추가한다:

```tsx
      {selected && (
        <MemberProfileSheet
          userId={selected.id}
          nickname={selected.nickname}
          avatarUrl={selected.avatar_url}
          onClose={() => setSelected(null)}
        />
      )}
```

> 크루 카드는 스트릭 값을 갖고 있지 않으므로 `streak`을 넘기지 않는다. 시트는 스트릭 줄을 생략한다(설계 §5.1).

- [ ] **Step 4: 게이트 + 커밋**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: 전부 통과

```bash
git add src/components/crew-card.tsx
git commit -m "feat: 홈 크루 카드에서 프로필 시트 열기"
```

---

## Task 6: 실 DB 검증 스크립트

**전제:** Task 1 Step 3의 0026 적용이 끝나 있어야 한다.

**Files:**
- Create: `scripts/crew-profile-check.mjs`

- [ ] **Step 1: 스크립트 작성**

```js
// 0026 검증: 크루원 프로필 RPC — 권한·데이터·캐시 정합성.
// 실행: node scripts/crew-profile-check.mjs
// 사전조건: 0020·0022·0026이 적용되어 있어야 한다.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error(".env.local에 Supabase 설정이 없습니다");
}

const RUN = Date.now().toString(36).slice(-5);
let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (ok) passed++;
  else failed++;
}

async function api(token, method, path, body, prefer = "return=representation") {
  const service = token === SERVICE_KEY;
  const response = await fetch(`${URL}${path}`, {
    method,
    headers: {
      apikey: service ? SERVICE_KEY : ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    // 본문 없는 응답
  }
  return { status: response.status, json };
}

async function anonUser(nick) {
  const response = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const json = await response.json();
  if (!json.access_token) throw new Error("익명 가입 실패: " + JSON.stringify(json));
  const user = { token: json.access_token, id: json.user.id };
  await api(user.token, "POST", "/rest/v1/profiles", {
    id: user.id,
    nickname: `${nick}-${RUN}`,
    weekly_goal: 3,
  });
  return user;
}

async function deleteAuthUser(userId) {
  return fetch(`${URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

let userA = null;
let userB = null;
let userC = null;
let groupAB = null;
let groupC = null;

try {
  // ── 픽스처: A·B는 같은 크루, C는 다른 크루 ──
  userA = await anonUser("cpA");
  userB = await anonUser("cpB");
  userC = await anonUser("cpC");

  const gAB = await api(userA.token, "POST", "/rest/v1/rpc/create_group", {
    p_name: `프로필테스트-${RUN}`,
  });
  groupAB = gAB.json?.id ?? gAB.json?.[0]?.id;
  const inviteAB = gAB.json?.invite_code ?? gAB.json?.[0]?.invite_code;
  await api(userB.token, "POST", "/rest/v1/rpc/join_group_with_code", {
    p_code: inviteAB,
  });

  const gC = await api(userC.token, "POST", "/rest/v1/rpc/create_group", {
    p_name: `남의크루-${RUN}`,
  });
  groupC = gC.json?.id ?? gC.json?.[0]?.id;

  // ── 1) 신규 유저(진행 행 없음) → 0 XP·Lv.1 ──
  const fresh = await api(userA.token, "POST", "/rest/v1/rpc/get_crew_member_profile", {
    p_target_id: userB.id,
  });
  check(
    "진행 행 없으면 0 XP·Lv.1·빈 배지",
    fresh.status === 200 &&
      fresh.json?.totalXp === 0 &&
      fresh.json?.currentLevel === 1 &&
      Array.isArray(fresh.json?.badges) &&
      fresh.json.badges.length === 0,
    JSON.stringify(fresh.json),
  );

  // ── 2) B에게 진행·배지를 심고 조회 ──
  await api(SERVICE_KEY, "POST", "/rest/v1/user_progress", {
    user_id: userB.id,
    total_xp: 7220,
    current_level: 17,
    current_stage: 4,
  });
  await api(SERVICE_KEY, "POST", "/rest/v1/user_badges", {
    user_id: userB.id,
    badge_key: "record_beaten_1",
  });
  await api(SERVICE_KEY, "POST", "/rest/v1/user_badges", {
    user_id: userB.id,
    badge_key: "record_beaten_5",
  });

  const seen = await api(userA.token, "POST", "/rest/v1/rpc/get_crew_member_profile", {
    p_target_id: userB.id,
  });
  check(
    "크루원의 누적 XP를 읽는다",
    seen.status === 200 && seen.json?.totalXp === 7220,
    JSON.stringify(seen.json),
  );
  check(
    "크루원의 배지 2개를 획득순으로 읽는다",
    seen.json?.badges?.length === 2 &&
      seen.json.badges[0].badgeKey === "record_beaten_1" &&
      seen.json.badges[1].badgeKey === "record_beaten_5",
    JSON.stringify(seen.json?.badges),
  );

  // ── 3) 캐시 정합성: RPC의 current_level이 level_definitions 컷과 일치 ──
  const cut = await api(
    userA.token,
    "GET",
    "/rest/v1/level_definitions?select=level&required_total_xp=lte.7220&order=required_total_xp.desc&limit=1",
  );
  check(
    "current_level이 level_definitions 컷과 일치",
    seen.json?.currentLevel === cut.json?.[0]?.level,
    `rpc=${seen.json?.currentLevel} cut=${JSON.stringify(cut.json)}`,
  );

  // ── 4) 권한: 다른 크루는 거부 ──
  const outsider = await api(userC.token, "POST", "/rest/v1/rpc/get_crew_member_profile", {
    p_target_id: userB.id,
  });
  check(
    "크루가 아니면 not_crew",
    outsider.status >= 400 && JSON.stringify(outsider.json).includes("not_crew"),
    `${outsider.status} ${JSON.stringify(outsider.json)}`,
  );

  // ── 5) 본인 조회는 허용 ──
  const self = await api(userB.token, "POST", "/rest/v1/rpc/get_crew_member_profile", {
    p_target_id: userB.id,
  });
  check(
    "본인 조회 허용",
    self.status === 200 && self.json?.totalXp === 7220,
    JSON.stringify(self.json),
  );

  // ── 6) RPC 밖의 직접 접근은 여전히 막힌다 ──
  const direct = await api(
    userA.token,
    "GET",
    `/rest/v1/user_progress?user_id=eq.${userB.id}&select=total_xp`,
  );
  check(
    "타인 user_progress 직접 select 0건",
    direct.status === 200 && direct.json?.length === 0,
    JSON.stringify(direct.json),
  );

  const directBadges = await api(
    userA.token,
    "GET",
    `/rest/v1/user_badges?user_id=eq.${userB.id}&select=badge_key`,
  );
  check(
    "타인 user_badges 직접 select 0건",
    directBadges.status === 200 && directBadges.json?.length === 0,
    JSON.stringify(directBadges.json),
  );
} finally {
  if (groupAB) await api(SERVICE_KEY, "DELETE", `/rest/v1/groups?id=eq.${groupAB}`);
  if (groupC) await api(SERVICE_KEY, "DELETE", `/rest/v1/groups?id=eq.${groupC}`);
  if (userA) await deleteAuthUser(userA.id);
  if (userB) await deleteAuthUser(userB.id);
  if (userC) await deleteAuthUser(userC.id);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: 실행**

Run: `node scripts/crew-profile-check.mjs`
Expected: `8/8 passed`

`create_group` 응답이 배열인지 객체인지는 환경에 따라 다를 수 있어 스크립트가 양쪽을 받는다. 만약 `groupAB`가 undefined로 나오면 응답을 출력해 형태를 확인하고 접근 경로만 고친다.

- [ ] **Step 3: 픽스처 정리 확인**

Run: `node -e "console.log('테스트 계정은 finally 블록에서 삭제됨')"`

실패로 중단된 경우를 대비해 Supabase 대시보드에서 `cpA-`·`cpB-`·`cpC-` 접두 닉네임이 남아 있지 않은지 확인한다. **실계정 4개(오뎅끼데스까·스칼레또·낭만송곳니 등)는 절대 건드리지 않는다.**

- [ ] **Step 4: 커밋**

```bash
git add scripts/crew-profile-check.mjs
git commit -m "test: 크루원 프로필 RPC 실 DB 검증"
```

---

## Task 7: 최종 게이트 · 실기기 확인 · 배포

- [ ] **Step 1: 전체 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: lint 0건 · 타입 0건 · 테스트 전부 PASS(기존 423 + 신규 9) · 빌드 성공

- [ ] **Step 2: 사용자 실기기 확인 요청**

사용자에게 아래를 요청하고 **응답을 기다린다**:

> 폰에서 확인해주세요:
> 1. 피드에서 크루원 닉네임/아바타 탭 → 시트에 캐릭터·`{단계} Lv.N`·진행바·배지가 뜨는지
> 2. 홈 "내 크루" 카드에서 멤버 이름 탭 → 같은 시트가 뜨는지
> 3. "👉 콕" 버튼이 **여전히 찌르기로 동작**하는지 (프로필이 열리면 안 됨)
> 4. 사진 카드에서 🔥👏👍 반응이 정상 동작하는지 (프로필이 열리면 안 됨)
> 5. 본인 프로필을 눌렀을 때도 시트가 정상적으로 뜨는지

- [ ] **Step 3: 실기기 확인 후 배포**

```bash
pnpm dlx vercel deploy --prod --yes
```

- [ ] **Step 4: 배포 번들 실검증**

배포 URL에서 `/feed`·`/home`이 200인지 확인하고, 배포된 청크에서 아래 문자열을 grep으로 찾는다:

- `프로필 보기`
- `크루원만 볼 수 있어요`
- `아직 획득한 배지가 없어요`

- [ ] **Step 5: PROGRESS.md 갱신 + 커밋**

`PROGRESS.md` 최상단에 섹션을 추가한다 — 기능 요약·마이그레이션 0026 적용 여부·검증 실측치(unit 수·실 DB 8/8)·커밋 해시.

```bash
git add PROGRESS.md
git commit -m "docs: 크루원 프로필 시트 진행 기록"
```

---

## 2. Self-Review 체크리스트

- [ ] 0026은 신규 파일이며 0022~0025를 수정하지 않았다
- [ ] `shares_group_with` 검사를 통과하지 못하면 `not_crew` — 실 DB로 검증됨(Task 6 §4)
- [ ] 타인의 XP 원장(`xp_transactions`)·불꽃 보호권은 RPC 반환에 **없다**
- [ ] 레벨·단계 표시는 `getLevelProgress(totalXp)` 한 곳에서만 계산된다 (내 화면과 동일)
- [ ] 배지 표시는 클라 `BADGE_CATALOG` 기준 — SQL에 카탈로그가 하드코딩되지 않았다
- [ ] 크루 카드에서 "👉 콕" 버튼이 프로필 버튼 **안에 중첩되지 않는다**(형제 관계)
- [ ] 피드 시트는 화면당 1개만 렌더된다(항목마다 X)
- [ ] 테스트 계정(`cpA-`·`cpB-`·`cpC-`) 정리됨, 실계정 미접촉

## 3. 인수인계 메모

- **Task 1 → Task 6 사이에 사용자의 SQL Run이 끼어 있다.** 적용 전에 Task 6을 돌리면 전부 실패한다. Task 2~5는 적용과 무관하게 진행 가능.
- **배지가 46개로 늘어날 때(2026-07-25 설계)** 이 기능에서 고칠 곳은 `src/lib/domain/badges.ts`의 카탈로그뿐이다. RPC·시트·진열 로직은 그대로 동작한다. 단 `user_badges`의 PK가 `period_key` 추가로 바뀌면 RPC의 `jsonb_build_object`에 `periodKey`를 더할지 그때 판단한다(월간 배지를 남의 프로필에도 보일 것인가의 문제).
- **2026-07-24 계획서 Phase 2**(`get_crew_member_progress`, 레벨만)는 이 작업으로 **대체됐다**. 그 계획서의 Phase 1(루틴)·Phase 3(친구 신청)을 나중에 착수할 때 마이그레이션 번호를 **0027부터** 다시 배정해야 한다.
