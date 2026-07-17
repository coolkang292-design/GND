# 꾸준왕 열람권 + 홈 위젯 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 주(KST 월요일 시작) 5일 운동 시 24시간짜리 1회 열람권을 획득해 크루원 1명의 성과·챌린지 순위를 열람(👀 알림)하고, 홈에 스트릭 카드·소멸 경고·주간 stat 위젯을 추가한다.

**Architecture:** A안(파생 상태) — 열람권 테이블 없이 `view_record` RPC(0012)가 열람 순간 운동 기록으로 자격을 판정·기록·알림. 클라이언트는 같은 판정을 순수 함수(`lib/domain/viewing-pass.ts`, TDD)로 재현해 홈 카드 상태를 표시. 성과 시트는 기존 크루 공개 데이터(`getPeriodStatsByUser`+`goal-score`)로 계산.

**Tech Stack:** Next.js 16 App Router · TS strict · Tailwind v4 · Vitest · Supabase (RPC security definer)

**스펙:** `docs/superpowers/specs/2026-07-17-king-viewing-pass-home-widgets-design.md`

**전제:** DB 0001~0011 적용 완료. `record_views`·`record_viewed` 알림 타입·`notification_settings.record_views`·`notify()`·`shares_group_with()`는 0011에 이미 있음. 마이그레이션은 사용자가 SQL Editor에 수동 적용(CLI 없음).

**파일 구조:**

| 파일 | 역할 |
|---|---|
| Create `supabase/migrations/0012_record_view_rpc.sql` | view_record RPC + record_views 직접 쓰기 회수 |
| Create `src/lib/domain/viewing-pass.ts` (+`.test.ts`) | 열람권 판정 순수 함수 (TDD) |
| Modify `src/lib/social.ts` | 에러 코드 4종 추가·`viewRecord`·`getMyRecordViewAts`·`getCrewPerformance` |
| Modify `src/lib/challenge.ts` | `getActiveChallengeRanking(groupId)` 헬퍼 |
| Create `src/components/home/streak-card.tsx` | 스트릭 카드 + 소멸 경고 배너 |
| Create `src/components/home/weekly-stats.tsx` | 주간 stat 3칸 |
| Create `src/components/home/king-card.tsx` | 꾸준왕 카드 + 크루원 선택 + 성과 시트 |
| Create `src/components/home/home-client.tsx` | 홈 전체 클라 래퍼(내 세션 1회 fetch 공유) |
| Modify `src/app/(tabs)/home/page.tsx` | HomeClient로 교체 |
| Modify `scripts/rls-test.mjs` | 0012 부정 경로 검증 추가 |
| Modify `PROGRESS.md` | 산출물 기록 |

---

### Task 1: 마이그레이션 0012 — view_record RPC

**Files:**
- Create: `supabase/migrations/0012_record_view_rpc.sql`

- [ ] **Step 1: SQL 파일 작성**

```sql
-- ============================================================
-- 0012: 꾸준왕 열람권 — view_record RPC (A안: 파생 상태)
-- 주(KST 월요일 시작) 5일(고유 날짜) 운동 → 5일째 완료 시각부터
-- 24시간 유효·1회 사용 열람권. 테이블 없이 열람 순간 판정.
-- 스펙: docs/superpowers/specs/2026-07-17-king-viewing-pass-home-widgets-design.md
-- 실행: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run (1회)
-- ============================================================

-- 직접 쓰기 회수 — 이후 record_views 기록은 view_record RPC만.
-- (0011의 select 정책 "record_views_select_related"는 유지)
revoke insert on public.record_views from authenticated;
drop policy if exists "record_views_insert_own" on public.record_views;

create or replace function public.view_record(p_target_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_fifth_at timestamptz;
  v_nick text;
  v_wants boolean;
  v_challenge_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_target_id = auth.uid() then
    raise exception 'self_view';
  end if;
  if not shares_group_with(p_target_id) then
    raise exception 'not_crew';
  end if;

  -- 이번 주(KST 월요일 00:00~) 내 완료 세션을 KST 날짜로 접어,
  -- 5번째 고유 날짜를 만든 첫 완료 시각 = 열람권 획득 시각
  select day_first into v_fifth_at from (
    select min(completed_at) as day_first,
           row_number() over (order by min(completed_at)) as rn
    from workout_sessions
    where user_id = auth.uid()
      and status = 'completed' and deleted_at is null
      and completed_at >=
        date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
    group by (completed_at at time zone 'Asia/Seoul')::date
  ) d where rn = 5;

  if v_fifth_at is null then
    raise exception 'not_eligible';
  end if;
  if now() >= v_fifth_at + interval '24 hours' then
    raise exception 'pass_expired';
  end if;
  if exists (
    select 1 from record_views
    where viewer_id = auth.uid() and viewed_at >= v_fifth_at
  ) then
    raise exception 'pass_used';
  end if;

  -- 둘이 함께 속한 크루의 진행 중 챌린지 (없으면 null)
  select c.id into v_challenge_id
  from challenges c
  where c.status = 'active'
    and exists (select 1 from group_members gm
                where gm.group_id = c.group_id and gm.user_id = auth.uid())
    and exists (select 1 from group_members gm
                where gm.group_id = c.group_id and gm.user_id = p_target_id)
  limit 1;

  insert into record_views (viewer_id, target_id, challenge_id)
  values (auth.uid(), p_target_id, v_challenge_id);

  -- 행 없음 = 알림 on (0011 notification_settings 관례)
  select coalesce(ns.record_views, true) into v_wants
  from (select true) one
  left join notification_settings ns on ns.user_id = p_target_id;

  if v_wants then
    select nickname into v_nick from profiles where id = auth.uid();
    perform notify(
      p_target_id, auth.uid(), 'record_viewed', null,
      coalesce(v_nick, '크루원') || '님이 회원님의 기록을 확인했어요 👀',
      null
    );
  end if;
end $$;
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/migrations/0012_record_view_rpc.sql
git commit -m "feat: 0012 view_record RPC - 주5일 열람권 자격 판정·기록·알림, 직접 쓰기 회수"
```

- [ ] **Step 3: 사용자에게 SQL Editor 적용 요청**

사용자에게 안내: "`supabase/migrations/0012_record_view_rpc.sql` 파일 열기 → 전체 복사 → Supabase Dashboard → SQL Editor → 붙여넣기 → Run. 'Success. No rows returned'가 나오면 완료." 적용 여부는 Task 6(RLS 테스트) 전까지만 확인되면 됨 — Task 2~5는 로컬 작업이라 병행 가능.

---

### Task 2: 도메인 TDD — `viewing-pass.ts`

**Files:**
- Create: `src/lib/domain/viewing-pass.test.ts`
- Create: `src/lib/domain/viewing-pass.ts`

기준 시각: 2026-07-13(월)이 KST 주 시작 → UTC로 `2026-07-12T15:00:00Z`. KST 순간은 `+09:00` 표기로 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, it } from "vitest";
import {
  KING_DAYS,
  PASS_HOURS,
  viewingPassStatus,
  weekWorkoutDays,
} from "./viewing-pass";

const TZ = "Asia/Seoul";
const d = (iso: string) => new Date(iso);
// 이번 주: 2026-07-13(월) 00:00 KST ~ / now 기본값: 금요일 저녁
const NOW = d("2026-07-17T19:00:00+09:00");

describe("weekWorkoutDays — 이번 주(월요일 시작) 고유 운동일", () => {
  it("빈 입력 → 0일, fifthAt 없음", () => {
    expect(weekWorkoutDays([], NOW, TZ)).toEqual({ days: [], fifthAt: null });
  });

  it("하루 2세션은 1일로 센다", () => {
    const r = weekWorkoutDays(
      [d("2026-07-14T07:00:00+09:00"), d("2026-07-14T21:00:00+09:00")],
      NOW,
      TZ,
    );
    expect(r.days).toEqual(["2026-07-14"]);
  });

  it("지난 주 세션은 제외 — 월요일 00:00 KST 직전은 지난 주", () => {
    const r = weekWorkoutDays(
      [d("2026-07-12T14:59:59Z"), d("2026-07-12T15:00:00Z")], // KST 일 23:59:59 / 월 00:00
      NOW,
      TZ,
    );
    expect(r.days).toEqual(["2026-07-13"]);
  });

  it("5번째 고유 날짜의 '첫' 세션 시각이 fifthAt", () => {
    const r = weekWorkoutDays(
      [
        d("2026-07-13T08:00:00+09:00"),
        d("2026-07-14T08:00:00+09:00"),
        d("2026-07-15T08:00:00+09:00"),
        d("2026-07-16T08:00:00+09:00"),
        d("2026-07-17T06:00:00+09:00"), // 5일째 첫 세션 ← fifthAt
        d("2026-07-17T20:00:00+09:00"),
      ],
      NOW,
      TZ,
    );
    expect(r.days).toHaveLength(KING_DAYS);
    expect(r.fifthAt).toEqual(d("2026-07-17T06:00:00+09:00"));
  });
});

const FIVE_DAYS = [
  d("2026-07-13T08:00:00+09:00"),
  d("2026-07-14T08:00:00+09:00"),
  d("2026-07-15T08:00:00+09:00"),
  d("2026-07-16T08:00:00+09:00"),
  d("2026-07-17T06:00:00+09:00"),
];
const FIFTH_AT = d("2026-07-17T06:00:00+09:00");
const EXPIRES_AT = new Date(FIFTH_AT.getTime() + PASS_HOURS * 3_600_000);

describe("viewingPassStatus — 열람권 상태", () => {
  it("4일이면 progress + daysDone", () => {
    const s = viewingPassStatus(FIVE_DAYS.slice(0, 4), [], NOW, TZ);
    expect(s).toEqual({
      state: "progress",
      daysDone: 4,
      acquiredAt: null,
      expiresAt: null,
    });
  });

  it("5일 달성 & 24h 이내 & 미사용 → available", () => {
    const s = viewingPassStatus(FIVE_DAYS, [], NOW, TZ);
    expect(s.state).toBe("available");
    expect(s.acquiredAt).toEqual(FIFTH_AT);
    expect(s.expiresAt).toEqual(EXPIRES_AT);
  });

  it("만료 시각 정각부터 expired (now >= expiresAt)", () => {
    expect(viewingPassStatus(FIVE_DAYS, [], EXPIRES_AT, TZ).state).toBe("expired");
    expect(
      viewingPassStatus(FIVE_DAYS, [], new Date(EXPIRES_AT.getTime() - 1), TZ).state,
    ).toBe("available");
  });

  it("획득 이후 열람 기록이 있으면 used", () => {
    const s = viewingPassStatus(FIVE_DAYS, [d("2026-07-17T07:00:00+09:00")], NOW, TZ);
    expect(s.state).toBe("used");
  });

  it("획득 이전(지난 열람권) 기록은 무시 → available", () => {
    const s = viewingPassStatus(FIVE_DAYS, [d("2026-07-10T07:00:00+09:00")], NOW, TZ);
    expect(s.state).toBe("available");
  });

  it("6일째 운동해도 fifthAt(획득 시각)은 5일째 그대로 — 재발급 없음", () => {
    const withSixth = [...FIVE_DAYS, d("2026-07-18T08:00:00+09:00")];
    const s = viewingPassStatus(
      withSixth,
      [],
      d("2026-07-18T09:00:00+09:00"),
      TZ,
    );
    expect(s.acquiredAt).toEqual(FIFTH_AT);
  });

  it("주가 바뀌면 progress로 리셋 — 지난 주 5일은 무효", () => {
    const nextMonday = d("2026-07-20T10:00:00+09:00");
    const s = viewingPassStatus(FIVE_DAYS, [], nextMonday, TZ);
    expect(s).toEqual({
      state: "progress",
      daysDone: 0,
      acquiredAt: null,
      expiresAt: null,
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test viewing-pass`
Expected: FAIL — "Cannot find module './viewing-pass'" 또는 함수 미정의.

- [ ] **Step 3: 최소 구현**

```ts
/**
 * 꾸준왕 열람권 도메인 순수 함수 (스펙 2026-07-17-king-viewing-pass).
 * 주(월요일 시작, tz) 5일(고유 날짜) 운동 → 5일째 첫 완료 시각부터
 * 24시간 유효·1회 사용. 서버(0012 view_record)와 같은 판정을 재현한다.
 */

import { dayKey, weekRange } from "./time";

export const KING_DAYS = 5;
export const PASS_HOURS = 24;

export type ViewingPassState = "progress" | "available" | "used" | "expired";

export type ViewingPassStatus = {
  state: ViewingPassState;
  daysDone: number;
  acquiredAt: Date | null; // 5일째를 만든 첫 완료 시각
  expiresAt: Date | null; // acquiredAt + 24h
};

/** 이번 주(tz 월요일 시작) 고유 운동일 dayKey 목록과 5일째 달성 순간 */
export function weekWorkoutDays(
  completedAts: Date[],
  now: Date,
  timeZone: string,
): { days: string[]; fifthAt: Date | null } {
  const { start, end } = weekRange(now, timeZone);
  const inWeek = completedAts
    .filter((d) => d >= start && d < end)
    .sort((a, b) => a.getTime() - b.getTime());

  const seen = new Set<string>();
  let fifthAt: Date | null = null;
  for (const instant of inWeek) {
    const key = dayKey(instant, timeZone);
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size === KING_DAYS && !fifthAt) fifthAt = instant;
  }
  return { days: [...seen].sort(), fifthAt };
}

/** 열람권 상태 — usedViewAts: 내 record_views.viewed_at 목록 */
export function viewingPassStatus(
  completedAts: Date[],
  usedViewAts: Date[],
  now: Date,
  timeZone: string,
): ViewingPassStatus {
  const { days, fifthAt } = weekWorkoutDays(completedAts, now, timeZone);
  if (!fifthAt) {
    return { state: "progress", daysDone: days.length, acquiredAt: null, expiresAt: null };
  }
  const expiresAt = new Date(fifthAt.getTime() + PASS_HOURS * 3_600_000);
  if (usedViewAts.some((v) => v >= fifthAt)) {
    return { state: "used", daysDone: days.length, acquiredAt: fifthAt, expiresAt };
  }
  if (now >= expiresAt) {
    return { state: "expired", daysDone: days.length, acquiredAt: fifthAt, expiresAt };
  }
  return { state: "available", daysDone: days.length, acquiredAt: fifthAt, expiresAt };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test viewing-pass`
Expected: PASS (11 tests). 이어서 `pnpm test` 전체 — 기존 104 + 11 = **115 tests** 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/viewing-pass.ts src/lib/domain/viewing-pass.test.ts
git commit -m "feat: viewing-pass 도메인 TDD - 주5일 판정·24h 열람권 상태"
```

---

### Task 3: I/O — social.ts 확장 + 챌린지 랭킹 헬퍼

**Files:**
- Modify: `src/lib/social.ts` (에러 코드 배열·타입, 파일 끝에 함수 추가)
- Modify: `src/lib/challenge.ts` (파일 끝에 헬퍼 추가)

- [ ] **Step 1: social.ts 에러 코드 4종 추가**

`SocialErrorCode` 유니언과 `SOCIAL_ERROR_CODES` 배열 두 곳 모두에 추가 (기존 `"pokes_disabled"` 뒤):

```ts
  | "not_eligible"
  | "pass_expired"
  | "pass_used"
  | "self_view";
```

```ts
  "not_eligible",
  "pass_expired",
  "pass_used",
  "self_view",
```

주의: `toSocialError`는 `message.includes(code)` 매칭 — `not_crew`는 기존 코드 재사용이라 추가 불필요.

- [ ] **Step 2: challenge.ts 끝에 랭킹 헬퍼 추가**

import 추가: `plannedDaysForPeriod`, `rankParticipants`, `type RankedParticipant`를 `@/lib/domain/goal-score`에서 (기존 import에 병합), `DEFAULT_TIMEZONE`을 `@/lib/domain/time`에서.

```ts
// ── 진행 중 챌린지 랭킹 스냅샷 (꾸준왕 성과 시트용) ────────────────

export type ChallengeRanking = { name: string; list: RankedParticipant[] };

function periodDaysCount(startDate: string, endDate: string): number {
  const toUtc = (v: string) => {
    const [y, m, d] = v.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(endDate) - toUtc(startDate)) / 86_400_000) + 1;
}

/** 진행 중(active) 챌린지의 현재 순위 — 없으면 null */
export async function getActiveChallengeRanking(
  groupId: string,
): Promise<ChallengeRanking | null> {
  const ch = await getCurrentChallenge(groupId);
  if (!ch || ch.status !== "active") return null;

  const [goals, stats] = await Promise.all([
    getChallengeGoals(ch.id),
    getPeriodStatsByUser(groupId, ch.start_date, ch.end_date, DEFAULT_TIMEZONE),
  ]);
  const days = periodDaysCount(ch.start_date, ch.end_date);
  const userIds = [...new Set(goals.map((g) => g.user_id))];

  const list = rankParticipants(
    userIds.map((uid) => {
      const userGoals = goals.filter((g) => g.user_id === uid);
      const s = stats.get(uid) ?? EMPTY_STATS;
      return {
        userId: uid,
        goals: userGoals.map((g) => ({
          type: g.goal_type,
          target: Number(g.target_value),
          actual: actualForGoal(s, g.goal_type, g.qualifier),
        })),
        workoutDays: s.workoutDays,
        plannedDays: plannedDaysForPeriod(userGoals[0]?.planned_days ?? 5, days),
        allGoalsCompletedAtMs: null,
      };
    }),
  );
  return { name: ch.name, list };
}
```

(모듈 내 `EMPTY_STATS`·`actualForGoal`·`getCurrentChallenge`·`getChallengeGoals`·`getPeriodStatsByUser`는 같은 파일에 이미 있음.)

- [ ] **Step 3: social.ts 끝에 열람 함수 3종 추가**

import 추가: `viewingPassStatus`류는 불필요(컴포넌트 몫). `weekWorkoutDays`를 `@/lib/domain/viewing-pass`에서, `getActiveChallengeRanking`을 `@/lib/challenge`에서.

```ts
// ── 꾸준왕 열람권 (0012 view_record) ─────────────────────────

export async function viewRecord(targetId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("view_record", {
    p_target_id: targetId,
  });
  if (error) throw toSocialError(error);
}

/** 내 열람 기록 viewed_at 목록(최신순) — 열람권 사용 여부 판정용 */
export async function getMyRecordViewAts(userId: string): Promise<Date[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("record_views")
    .select("viewed_at")
    .eq("viewer_id", userId)
    .order("viewed_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map((r) => new Date(r.viewed_at as string));
}

export type CrewPerformance = {
  weekDays: number; // 대상의 이번 주 운동일
  streak: number;
  challenge: { name: string; rate: number; rank: number; total: number } | null;
};

/** 열람 성공 후 대상 성과 계산 — 크루 공개 완료 세션 + 챌린지 랭킹 */
export async function getCrewPerformance(
  targetId: string,
  groupId: string,
): Promise<CrewPerformance> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("completed_at")
    .eq("user_id", targetId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .not("completed_at", "is", null);
  if (error) throw error;

  const instants = (data ?? []).map((r) => new Date(r.completed_at as string));
  const now = new Date();
  const { days } = weekWorkoutDays(instants, now, DEFAULT_TIMEZONE);
  const streak = currentStreak(
    workoutDayKeys(instants, DEFAULT_TIMEZONE),
    dayKey(now, DEFAULT_TIMEZONE),
  );

  const ranking = await getActiveChallengeRanking(groupId);
  const mine = ranking?.list.find((r) => r.userId === targetId) ?? null;
  return {
    weekDays: days.length,
    streak,
    challenge:
      ranking && mine
        ? {
            name: ranking.name,
            rate: Math.round(mine.achievement),
            rank: mine.rank,
            total: ranking.list.length,
          }
        : null,
  };
}
```

(`currentStreak`·`workoutDayKeys`·`dayKey`·`DEFAULT_TIMEZONE`은 social.ts에 이미 import돼 있음.)

- [ ] **Step 4: 타입 확인**

Run: `pnpm typecheck`
Expected: 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/social.ts src/lib/challenge.ts
git commit -m "feat: viewRecord I/O·챌린지 랭킹 헬퍼 - 열람 RPC·성과 계산"
```

---

### Task 4: 홈 위젯 — 스트릭 카드·경고 배너·주간 stat

**Files:**
- Create: `src/components/home/streak-card.tsx`
- Create: `src/components/home/weekly-stats.tsx`
- Create: `src/components/home/home-client.tsx`
- Modify: `src/app/(tabs)/home/page.tsx`

- [ ] **Step 1: streak-card.tsx 작성**

```tsx
"use client";

import {
  currentStreak,
  streakStage,
  workoutDayKeys,
  type StreakStage,
} from "@/lib/domain/streak";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";

const STAGE_MESSAGES: Partial<Record<StreakStage, string>> = {
  d4: "어제는 쉬었어요 — 불꽃은 아직 살아있어요 (소멸 D-4)",
  d3: "이틀째 휴식 중 — 오늘 한 번 어때요? (소멸 D-3)",
  d2: "불꽃이 흔들려요 — 사흘째 미운동이에요 (소멸 D-2)",
  d1: "오늘 안 하면 내일 불꽃이 꺼져요! (소멸 D-1)",
};

function weekdayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return "일월화수목금토"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** 🔥 스트릭 카드 + 소멸 경고 배너 (목업 streakcard·warn) */
export function StreakCard({ completedAts }: { completedAts: Date[] }) {
  const tz = DEFAULT_TIMEZONE;
  const now = new Date();
  const keys = workoutDayKeys(completedAts, tz);
  const todayKey = dayKey(now, tz);
  const streak = currentStreak(keys, todayKey);
  const stage = streakStage(keys, todayKey);
  const keySet = new Set(keys);

  // 최근 7일(오늘 포함) 요일 점
  const dots = Array.from({ length: 7 }, (_, i) => {
    const k = dayKey(new Date(now.getTime() - (6 - i) * 86_400_000), tz);
    return { key: k, done: keySet.has(k) };
  });

  const sub =
    stage === "none"
      ? "운동을 시작하면 불꽃이 켜져요"
      : stage === "today_done"
        ? "오늘 완료! 🔥"
        : stage === "expired"
          ? "불꽃이 꺼졌어요 — 오늘 다시 시작!"
          : STAGE_MESSAGES[stage] ?? "";

  const warning = streak > 0 ? STAGE_MESSAGES[stage] : undefined;

  return (
    <>
      <section className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
        <span className="text-3xl">{streak > 0 ? "🔥" : "🪵"}</span>
        <div className="flex-1">
          <p className="text-[15px] font-extrabold">
            {streak > 0 ? `스트릭 ${streak}일 유지 중` : "스트릭 없음"}
          </p>
          <p className="mt-0.5 text-xs text-muted">{sub}</p>
          <div className="mt-2 flex gap-1.5">
            {dots.map((d) => (
              <span key={d.key} className="flex flex-col items-center gap-0.5">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    d.done ? "bg-accent" : "bg-surface-2 border border-line"
                  }`}
                />
                <span className="text-[10px] text-faint">
                  {weekdayLabel(d.key)}
                </span>
              </span>
            ))}
          </div>
        </div>
      </section>
      {warning && (
        <p className="rounded-card-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs font-bold text-amber-600 dark:text-amber-400">
          ⚠️ {warning}
        </p>
      )}
    </>
  );
}
```

- [ ] **Step 2: weekly-stats.tsx 작성**

```tsx
"use client";

import { currentStreak, workoutDayKeys } from "@/lib/domain/streak";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";
import { weekWorkoutDays } from "@/lib/domain/viewing-pass";

/** 주간 stat 3칸 — 이번 주 운동일 / 목표 달성률 / 스트릭 (목업 stat3) */
export function WeeklyStats({
  completedAts,
  weeklyGoal,
}: {
  completedAts: Date[];
  weeklyGoal: number;
}) {
  const tz = DEFAULT_TIMEZONE;
  const now = new Date();
  const { days } = weekWorkoutDays(completedAts, now, tz);
  const streak = currentStreak(
    workoutDayKeys(completedAts, tz),
    dayKey(now, tz),
  );
  const rate =
    weeklyGoal > 0
      ? Math.min(100, Math.round((days.length / weeklyGoal) * 100))
      : 0;

  const Stat = ({ v, k }: { v: React.ReactNode; k: string }) => (
    <div className="rounded-card-sm border border-line bg-surface px-2 py-3 text-center">
      <p className="text-lg font-extrabold">{v}</p>
      <p className="mt-0.5 text-[11px] text-muted">{k}</p>
    </div>
  );

  return (
    <div className="grid grid-cols-3 gap-2">
      <Stat
        v={
          <>
            {days.length}
            <span className="text-sm text-muted"> / {weeklyGoal}</span>
          </>
        }
        k="이번 주 운동"
      />
      <Stat v={`${rate}%`} k="목표 달성률" />
      <Stat v={`${streak}일`} k="🔥 스트릭" />
    </div>
  );
}
```

- [ ] **Step 3: home-client.tsx 작성 (내 세션 1회 fetch 공유)**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { AuthStatus } from "@/components/auth-status";
import { CrewCard } from "@/components/crew-card";
import { ActiveWorkoutCards } from "@/components/feed/active-workout-cards";
import { NotificationBell } from "@/components/notification-bell";
import { CrewLatestWorkout } from "@/components/crew-latest-workout";
import { StreakCard } from "@/components/home/streak-card";
import { WeeklyStats } from "@/components/home/weekly-stats";
import { KingCard } from "@/components/home/king-card";
import { getMyProfile } from "@/lib/crew";
import { getMyRecordViewAts } from "@/lib/social";
import { getCompletedSessions } from "@/lib/workout";

/** 홈 전체 — 내 완료 세션을 한 번만 조회해 위젯들이 공유한다 */
export function HomeClient() {
  const { userId, loading, configured } = useAuth();
  const [completedAts, setCompletedAts] = useState<Date[] | null>(null);
  const [weeklyGoal, setWeeklyGoal] = useState(3);
  const [viewAts, setViewAts] = useState<Date[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [sessions, profile, views] = await Promise.all([
          getCompletedSessions(userId),
          getMyProfile(userId),
          getMyRecordViewAts(userId),
        ]);
        if (cancelled) return;
        setCompletedAts(sessions.map((s) => s.completedAt));
        if (profile) setWeeklyGoal(profile.weekly_goal);
        setViewAts(views);
      } catch {
        if (!cancelled) setCompletedAts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId, refreshKey]);

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between pt-2 pb-1">
        <div>
          <h1 className="text-[19px] font-extrabold tracking-tight">GND</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            오늘도 GND 탈출하자 🔥
          </p>
        </div>
        <NotificationBell />
      </header>

      <Link
        href="/record"
        className="block rounded-[22px] bg-gradient-to-br from-accent to-[#0B6E66] p-5 text-accent-ink shadow-card"
      >
        <p className="text-xs font-bold opacity-80">오늘의 운동</p>
        <h2 className="mt-1 text-xl font-extrabold">운동 시작하기</h2>
        <p className="mt-1 text-sm opacity-90">
          30초면 기록할 수 있어요. 친구들이 기다리고 있어요.
        </p>
      </Link>

      {completedAts && (
        <>
          <StreakCard completedAts={completedAts} />
          <WeeklyStats completedAts={completedAts} weeklyGoal={weeklyGoal} />
        </>
      )}

      <ActiveWorkoutCards />

      <CrewCard />

      {completedAts && (
        <KingCard
          completedAts={completedAts}
          viewAts={viewAts}
          onViewed={() => setRefreshKey((k) => k + 1)}
        />
      )}

      <div className="mt-1 flex items-center justify-between px-0.5">
        <h3 className="text-sm font-extrabold">최근 친구 활동</h3>
        <Link href="/feed" className="text-xs font-bold text-accent">
          피드 전체
        </Link>
      </div>
      <CrewLatestWorkout />

      <AuthStatus />
    </div>
  );
}
```

주의: `KingCard`는 Task 5에서 만든다 — 이 Step에서는 컴파일을 위해 Task 5의 Step 1을 먼저 하거나, 두 Task를 같은 브랜치 흐름에서 이어서 진행한 뒤 함께 검증한다 (커밋은 Task별로 분리).

- [ ] **Step 4: home/page.tsx 교체**

```tsx
import { HomeClient } from "@/components/home/home-client";

export default function HomePage() {
  return <HomeClient />;
}
```

- [ ] **Step 5: (Task 5 완료 후) 검증·커밋**

Run: `pnpm lint && pnpm typecheck`
Expected: 오류 0. (`react-hooks/set-state-in-effect` 주의 — setState는 전부 async 콜백 안이라 안전, 교훈 4)

```bash
git add src/components/home/streak-card.tsx src/components/home/weekly-stats.tsx src/components/home/home-client.tsx "src/app/(tabs)/home/page.tsx"
git commit -m "feat: 홈 위젯 - 스트릭 카드·소멸 경고 배너·주간 stat 3칸, 홈 클라 래퍼"
```

---

### Task 5: 꾸준왕 카드 + 성과 시트

**Files:**
- Create: `src/components/home/king-card.tsx`

- [ ] **Step 1: king-card.tsx 작성**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DEFAULT_TIMEZONE } from "@/lib/domain/time";
import {
  KING_DAYS,
  viewingPassStatus,
} from "@/lib/domain/viewing-pass";
import { getCrewProfiles, getMyGroups } from "@/lib/crew";
import {
  getCrewPerformance,
  viewRecord,
  SocialError,
  type CrewPerformance,
} from "@/lib/social";
import type { Profile } from "@/lib/types";

const ERROR_MESSAGES: Record<string, string> = {
  not_eligible: "이번 주 5일을 채우면 열람권이 생겨요",
  pass_expired: "열람권이 만료됐어요 — 다음 주에 다시!",
  pass_used: "이번 주 열람권은 이미 사용했어요",
  not_crew: "열람할 수 없는 대상이에요",
  self_view: "열람할 수 없는 대상이에요",
};

/** 꾸준왕 카드 — 열람권 상태·크루원 선택·성과 시트 (스펙 §4.3) */
export function KingCard({
  completedAts,
  viewAts,
  onViewed,
}: {
  completedAts: Date[];
  viewAts: Date[];
  onViewed: () => void;
}) {
  const { userId } = useAuth();
  const [members, setMembers] = useState<Profile[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Profile | null>(null);
  const [viewing, setViewing] = useState(false);
  const [perf, setPerf] = useState<{ who: Profile; data: CrewPerformance } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const status = viewingPassStatus(
    completedAts,
    viewAts,
    new Date(),
    DEFAULT_TIMEZONE,
  );

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const groups = await getMyGroups();
        const g = groups[0];
        if (!g || cancelled) return;
        setGroupId(g.id);
        const crew = await getCrewProfiles(g.id);
        if (!cancelled) setMembers(crew.filter((m) => m.id !== userId));
      } catch {
        /* 크루 없음 — 카드에 목록만 안 뜸 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function confirmView() {
    if (!confirmTarget || !groupId) return;
    setViewing(true);
    try {
      await viewRecord(confirmTarget.id);
      const data = await getCrewPerformance(confirmTarget.id, groupId);
      setPerf({ who: confirmTarget, data });
      setConfirmTarget(null);
      setPicking(false);
    } catch (e) {
      const code = e instanceof SocialError ? e.code : null;
      setNotice(ERROR_MESSAGES[code ?? ""] ?? "열람하지 못했어요");
      setConfirmTarget(null);
      setTimeout(() => setNotice(null), 3000);
    } finally {
      setViewing(false);
    }
  }

  const hoursLeft = status.expiresAt
    ? Math.max(0, Math.ceil((status.expiresAt.getTime() - Date.now()) / 3_600_000))
    : 0;

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold">🏅 꾸준왕 열람권</h3>
        <span className="text-xs text-muted">주 {KING_DAYS}일 달성 보상</span>
      </div>

      {status.state === "progress" && (
        <p className="mt-2 text-[13px] text-muted">
          이번 주 <b className="text-text">{status.daysDone}</b> / {KING_DAYS}일 —{" "}
          {KING_DAYS - status.daysDone}일 더 운동하면 크루원 성과를 열람할 수
          있어요 🎟️
        </p>
      )}

      {status.state === "available" && (
        <>
          <p className="mt-2 text-[13px] font-bold text-accent">
            🎟️ 열람권 보유 · {hoursLeft}시간 남음
          </p>
          <p className="mt-0.5 text-xs text-muted">
            크루원 1명의 성과와 챌린지 순위를 1회 열람할 수 있어요.
          </p>
          {!picking ? (
            <button
              onClick={() => setPicking(true)}
              className="mt-3 w-full rounded-card-sm bg-accent py-2.5 text-sm font-extrabold text-accent-ink"
            >
              크루원 성과 열람하기
            </button>
          ) : (
            <div className="mt-3 flex flex-col gap-1.5">
              {members.length === 0 && (
                <p className="text-xs text-muted">열람할 크루원이 없어요</p>
              )}
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setConfirmTarget(m)}
                  className="flex items-center gap-2 rounded-card-sm border border-line bg-surface-2 px-3 py-2 text-left"
                >
                  <span className="text-lg">{m.avatar_url ?? "👤"}</span>
                  <span className="flex-1 text-sm font-bold">{m.nickname}</span>
                  <span className="text-xs font-bold text-accent">성과 ›</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {status.state === "used" && (
        <p className="mt-2 text-[13px] text-muted">
          이번 주 열람권을 사용했어요 ✅ 다음 주에 {KING_DAYS}일을 채우면 또
          받을 수 있어요.
        </p>
      )}

      {status.state === "expired" && (
        <p className="mt-2 text-[13px] text-muted">
          열람권이 소멸됐어요 ⏳ 다음 주에 {KING_DAYS}일을 채우면 다시 받아요.
        </p>
      )}

      {notice && (
        <p className="mt-2 text-xs font-bold text-accent">{notice}</p>
      )}

      {/* 확인 모달 */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-sm rounded-card bg-surface p-5">
            <p className="text-[15px] font-extrabold">
              {confirmTarget.nickname}님의 성과를 열람할까요?
            </p>
            <p className="mt-1.5 text-xs text-muted">
              열람권은 1회용이에요. 열람하면{" "}
              {confirmTarget.nickname}님에게 확인 알림이 가요 👀
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmTarget(null)}
                disabled={viewing}
                className="flex-1 rounded-card-sm border border-line py-2.5 text-sm font-bold"
              >
                취소
              </button>
              <button
                onClick={() => void confirmView()}
                disabled={viewing}
                className="flex-1 rounded-card-sm bg-accent py-2.5 text-sm font-extrabold text-accent-ink"
              >
                {viewing ? "열람 중…" : "열람하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 성과 시트 */}
      {perf && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="w-full max-w-md rounded-t-[22px] bg-surface p-5 pb-8">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{perf.who.avatar_url ?? "👤"}</span>
              <div>
                <p className="text-lg font-extrabold">{perf.who.nickname}님</p>
                <p className="text-xs text-muted">꾸준왕 열람권으로 확인 👀</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-card-sm border border-line bg-surface-2 px-2 py-3 text-center">
                <p className="text-lg font-extrabold">{perf.data.weekDays}일</p>
                <p className="mt-0.5 text-[11px] text-muted">이번 주 운동</p>
              </div>
              <div className="rounded-card-sm border border-line bg-surface-2 px-2 py-3 text-center">
                <p className="text-lg font-extrabold">{perf.data.streak}일</p>
                <p className="mt-0.5 text-[11px] text-muted">🔥 스트릭</p>
              </div>
            </div>
            {perf.data.challenge && (
              <div className="mt-2 rounded-card-sm border border-accent/40 bg-accent-weak px-3 py-3">
                <p className="text-xs font-bold text-muted">
                  🔓 {perf.data.challenge.name}
                </p>
                <p className="mt-1 text-sm font-extrabold">
                  달성률 {perf.data.challenge.rate}% · 현재{" "}
                  {perf.data.challenge.rank}위 / {perf.data.challenge.total}명
                </p>
              </div>
            )}
            <button
              onClick={() => {
                setPerf(null);
                onViewed();
              }}
              className="mt-4 w-full rounded-card-sm bg-accent py-2.5 text-sm font-extrabold text-accent-ink"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: 검증**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 전부 통과 (unit 115).

- [ ] **Step 3: 커밋**

```bash
git add src/components/home/king-card.tsx
git commit -m "feat: 꾸준왕 카드 - 열람권 상태·크루원 선택·확인 모달·성과 시트(챌린지 잠금 해제)"
```

(Task 4 Step 5의 홈 위젯 커밋을 아직 안 했다면 이 시점에 순서대로 두 커밋을 만든다.)

---

### Task 6: RLS 테스트 확장 (0012 적용 후)

**Files:**
- Modify: `scripts/rls-test.mjs` (마지막 요약 출력 블록 직전에 섹션 추가)

**전제:** 사용자가 0012를 SQL Editor로 적용 완료. 미적용이면 이 Task 전에 재요청.

**한계(기록):** 정상 열람(5일 자격 통과) 경로는 자동 테스트 불가 — completed_at이 서버시간이라 익명 API로 5개 고유 날짜를 만들 수 없다. 자격 판정 로직 자체는 Task 2 unit이 검증하고 SQL은 같은 규칙의 이식이므로, 정상 경로는 실사용(실제로 5일 채웠을 때)에서 확인한다. 여기서는 차단 경로만 검증.

- [ ] **Step 1: 테스트 섹션 추가**

파일 끝부분의 최종 요약(`passed`/`failed` 출력) 블록 **바로 앞**에 추가. 이 시점에 A·B는 같은 크루이고 완료 세션은 전부 오늘(1일)뿐이다:

```js
console.log("\n── 0012: 꾸준왕 열람권 view_record ──");

// 직접 insert 차단 (0012에서 권한 회수)
const rvDirect = await api(A.token, "POST", "/rest/v1/record_views", {
  viewer_id: A.id,
  target_id: B.id,
});
check(
  "record_views 직접 insert 차단",
  rvDirect.status >= 400,
  `status=${rvDirect.status}`,
);

// 본인 열람 기록 select는 여전히 가능 (0011 select 정책 유지)
const rvSel = await api(A.token, "GET", `/rest/v1/record_views?viewer_id=eq.${A.id}`);
check("본인 record_views select 허용", rvSel.status === 200);

// 자격 미달 — A는 오늘 하루만 운동(5일 미만)
const vr1 = await api(A.token, "POST", "/rest/v1/rpc/view_record", {
  p_target_id: B.id,
});
check(
  "5일 미달 시 not_eligible",
  vr1.status >= 400 && JSON.stringify(vr1.json).includes("not_eligible"),
  JSON.stringify(vr1.json),
);

// 본인 열람 금지
const vr2 = await api(A.token, "POST", "/rest/v1/rpc/view_record", {
  p_target_id: A.id,
});
check(
  "본인 열람 self_view 거절",
  vr2.status >= 400 && JSON.stringify(vr2.json).includes("self_view"),
);

// 크루 밖 대상 거절 — 크루 없는 신규 유저 C
const C = await anonUser();
const vr3 = await api(C.token, "POST", "/rest/v1/rpc/view_record", {
  p_target_id: A.id,
});
check(
  "크루 밖 not_crew 거절",
  vr3.status >= 400 && JSON.stringify(vr3.json).includes("not_crew"),
);
```

주의: 스크립트에 이미 `C` 변수가 있으면(다른 섹션에서 사용) `C2` 등으로 이름을 바꿔 충돌 방지 — 추가 전에 `C =` 검색으로 확인할 것.

- [ ] **Step 2: 실행**

Run: `node scripts/rls-test.mjs`
Expected: 기존 102 + 신규 5 = **107/107 통과** (응원 쿨다운 대기 포함 약 40초).

- [ ] **Step 3: 커밋**

```bash
git add scripts/rls-test.mjs
git commit -m "test: RLS 0012 - record_views 직접 쓰기 차단·view_record 부정 경로 5케이스"
```

---

### Task 7: 최종 검증 + 문서 갱신

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: dev 서버 종료 확인 후 전체 검증** (교훈 8: build와 dev 서버 동시 실행 금지)

Run: `pnpm test` → 115 통과
Run: `pnpm lint` → 오류 0
Run: `pnpm typecheck` → 오류 0
Run: `pnpm build` → 성공

- [ ] **Step 2: 실기기 확인 안내** (사용자, dev 서버 `pnpm exec next dev -H 0.0.0.0` 재시작 후)

1. 홈에 스트릭 카드(요일 점)·주간 stat 3칸 표시
2. 스트릭 있는 계정에서 하루 쉬면 경고 배너(D-4) 표시
3. 꾸준왕 카드 진행 상태(n/5일) 표시
4. (5일 채운 계정이 있으면) 열람권 → 크루원 열람 → 성과 시트·상대 👀 알림

- [ ] **Step 3: PROGRESS.md 갱신**

⚠️ 섹션을 "꾸준왕 열람권+홈 위젯 구현 완료·실기기 확인 대기"로 교체하고, 산출물 섹션(파일 목록·검증 수치·마이그레이션 0012 적용 확인)을 추가한다. DB 적용 현황에 `0012: 적용 완료 ✅` 줄 추가.

- [ ] **Step 4: 커밋**

```bash
git add PROGRESS.md
git commit -m "docs: 꾸준왕 열람권+홈 위젯 산출물 기록"
```
