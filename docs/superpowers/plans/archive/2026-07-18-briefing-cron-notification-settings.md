# 아침 브리핑 크론 + 알림설정 토글 + 피드 사진 필터 구현 계획

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** 매일 KST 09시(±59분) 크론이 유저별 스트릭 브리핑을 인앱 알림함에 넣고, 프로필 탭에서 알림 5종을 켜고 끌 수 있으며, 피드에서 사진 인증만 모아볼 수 있다.

**Architecture:** Vercel Cron → `GET /api/briefing`(CRON_SECRET Bearer) → service_role로 데이터 수집 → 순수 함수 `buildBriefings` 판정 → 유저별 `dedupe_key` upsert(DB 멱등). 스트릭 카피는 streak-card에서 공용 모듈로 추출해 재사용. 스펙: `docs/superpowers/specs/2026-07-18-briefing-cron-notification-settings-design.md`.

**Tech Stack:** Next.js 16 App Router · TS strict · Supabase(@supabase/supabase-js admin 클라) · Vitest · Vercel Cron(Hobby).

**전제 (이미 완료):** `.env.local`과 Vercel Production에 `SUPABASE_SERVICE_ROLE_KEY`·`CRON_SECRET` 등록 완료. DB 0001~0012 적용 완료.

**환경 주의:** 검증 명령은 저장소 루트(`C:\Users\SAMSUNG\workout-app`)에서. build 전 dev 서버 종료(교훈 8). Vercel env 추가 작업이 생기면 반드시 Bash printf(교훈 9).

---

### Task 1: 스트릭 카피 공용 모듈 추출

**Files:**
- Create: `src/lib/domain/streak-messages.ts`
- Modify: `src/components/home/streak-card.tsx` (로컬 정의 제거, import로 교체)

- [ ] **Step 1: 공용 모듈 생성** — streak-card.tsx 11~67행의 정의를 그대로 옮기고 export만 붙인다.

```ts
// src/lib/domain/streak-messages.ts
/**
 * 스트릭 단계별 카피 + 날짜 로테이션 (§8 손실회피+능청 유머).
 * 데이터는 채널(홈 카드·아침 브리핑) 공용, 조립은 채널별 책임 — 완전
 * 동일 문자열을 강제하지 않는다(스펙 §2). 문구 추가·수정은 이 파일만.
 */
import type { StreakStage } from "./streak";

export const STAGE_MESSAGES: Partial<
  Record<StreakStage, ((streak: number) => string)[]>
> = {
  d4: [
    (n) =>
      `어제 쉬셨다? 어~ 그럴 수 있죠. 근데 ${n}일 불꽃은 그렇게 생각 안 하던데요? (소멸 D-4)`,
    (n) =>
      `하루 걸렀네요? 티 안 날 줄 알았죠? ${n}일 불꽃이 다 보고 있어요 (소멸 D-4)`,
    (n) =>
      `어제 뭐 하셨어요~ ${n}일 쌓아놓고 벌써 여유 부리시면 어떡해요 (소멸 D-4)`,
  ],
  d3: [
    (n) =>
      `이틀째 조용~하시네요. 쌓는 덴 ${n}일, 날리는 덴 3일이면 충분합니다? (소멸 D-3)`,
    (n) =>
      `이틀 연속 휴식이라… 어우, ${n}일 불꽃이 슬슬 서운해하는데요? (소멸 D-3)`,
    (n) =>
      `혹시 잊으셨나 해서요~ ${n}일짜리 불꽃 주인 어디 가셨어요? (소멸 D-3)`,
  ],
  d2: [
    (n) =>
      `어우~ 위험해 위험해. ${n}일 불꽃, 지금 바람 앞의 촛불이에요 (소멸 D-2)`,
    (n) =>
      `3일째라… 이쯤 되면 ${n}일 불꽃 유언 준비합니다? 살릴 거면 오늘이에요 (소멸 D-2)`,
    (n) =>
      `${n}일 모으는 데 얼마나 걸렸는지 기억하시죠? 날아가는 덴 이틀 남았어요 (소멸 D-2)`,
  ],
  d1: [
    (n) =>
      `자~ 마지막 경고입니다? 오늘 안 하면 ${n}일 전부 리셋. 후회는 셀프예요 (D-1)`,
    (n) =>
      `내일이면 ${n}일 → 0일. 이 계산 맞아요? 오늘 딱 30분이면 다 지켜요 (D-1)`,
    (n) =>
      `진짜 마지막이에요~ ${n}일 불꽃 장례식 보실 거예요, 살리실 거예요? (D-1)`,
  ],
};

export const TODAY_DONE_MESSAGES = [
  "오늘 완료! 🔥 어우~ 좀 치시는데요?",
  "오늘 완료! 🔥 이 맛에 운동하죠~",
  "오늘 완료! 🔥 불꽃이 아주 팔팔합니다",
];

export const EXPIRED_MESSAGES = [
  "불꽃 나갔습니다~ 괜찮아요, 원래 없던 걸로 해요. 오늘부터 다시 1일?",
  "불꽃 꺼진 지 좀 됐어요. 뭐 어때요, 오늘 켜면 또 1일이죠~",
];

/** 날짜 문자열 해시로 변형 하나 선택 — 같은 날엔 고정, 날마다 로테이션 */
export function pickByDay<T>(variants: T[], todayKey: string): T {
  let h = 0;
  for (const c of todayKey) h = (h * 31 + c.charCodeAt(0)) % 997;
  return variants[h % variants.length];
}
```

- [ ] **Step 2: streak-card.tsx 교체** — 로컬 `STAGE_MESSAGES`·`TODAY_DONE_MESSAGES`·`EXPIRED_MESSAGES`·`pickByDay` 정의(11~67행)를 삭제하고 import 추가. `weekdayLabel`과 컴포넌트 본문은 그대로 둔다.

```ts
import {
  EXPIRED_MESSAGES,
  pickByDay,
  STAGE_MESSAGES,
  TODAY_DONE_MESSAGES,
} from "@/lib/domain/streak-messages";
```

(기존 `import type { StreakStage }`가 streak-card에서 더 이상 안 쓰이면 — STAGE_MESSAGES 타입 표기가 모듈로 이동했으므로 — import에서 `type StreakStage`를 제거해 lint no-unused 통과.)

- [ ] **Step 3: 회귀 확인**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: 131 passed (동작 불변 — 기존 테스트가 회귀 감지), lint/typecheck 통과

- [ ] **Step 4: Commit**

```bash
git add src/lib/domain/streak-messages.ts src/components/home/streak-card.tsx
git commit -m "리팩터: 스트릭 카피를 공용 모듈로 추출 (브리핑 재사용 준비)"
```

---

### Task 2: `hourOfDay` 시간 도메인 함수 (TDD)

**Files:**
- Modify: `src/lib/domain/time.ts`
- Test: `src/lib/domain/time.test.ts` (기존 파일에 케이스 추가)

- [ ] **Step 1: 실패하는 테스트 작성** — time.test.ts 말미에 추가:

```ts
describe("hourOfDay", () => {
  it("UTC 00:30 = KST 09시", () => {
    expect(hourOfDay(new Date("2026-07-18T00:30:00Z"), "Asia/Seoul")).toBe(9);
  });
  it("UTC 23:30 = KST 다음날 08시 (날짜 경계)", () => {
    expect(hourOfDay(new Date("2026-07-17T23:30:00Z"), "Asia/Seoul")).toBe(8);
  });
});
```

(파일 상단 import에 `hourOfDay` 추가.)

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- time`
Expected: FAIL — "hourOfDay is not a function" 류

- [ ] **Step 3: 구현** — time.ts의 `dayKey` 아래에 추가 (내부 `wallClock` 재사용):

```ts
/** instant가 tz에서 가리키는 시(0~23) — 브리핑 시각 매칭용 */
export function hourOfDay(instant: Date, timeZone: string): number {
  return wallClock(instant, timeZone).hour;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test -- time`
Expected: PASS (기존 time 케이스 + 신규 2)

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/time.ts src/lib/domain/time.test.ts
git commit -m "기능: hourOfDay — tz 기준 시각 추출 (TDD 2케이스)"
```

---

### Task 3: 브리핑 도메인 함수 (TDD)

**Files:**
- Create: `src/lib/domain/briefing.ts`
- Test: `src/lib/domain/briefing.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — 스펙 §3·§9의 판정 규칙 전체:

```ts
import { describe, expect, it } from "vitest";
import {
  buildBriefings,
  crewFriendsWorkedYesterday,
  DEFAULT_BRIEF_HOUR,
  type BriefingUser,
} from "./briefing";

// 기준 시각: 2026-07-18(토) KST 09:10 = UTC 00:10. 어제 = KST 7/17.
const NOW = new Date("2026-07-18T00:10:00Z");
const TZ = "Asia/Seoul";
const kst = (s: string) => new Date(`${s}+09:00`); // "2026-07-17T20:00:00" 등

function user(over: Partial<BriefingUser>): BriefingUser {
  return {
    userId: "me",
    timezone: TZ,
    completedAts: [kst("2026-07-14T19:00:00")], // 4일 전 → d1
    morningBrief: true,
    crewMemberIds: [],
    ...over,
  };
}

describe("crewFriendsWorkedYesterday", () => {
  const byUser = new Map<string, Date[]>([
    ["me", [kst("2026-07-17T20:00:00")]],
    ["f1", [kst("2026-07-17T07:00:00")]],
    ["f2", [kst("2026-07-16T07:00:00")]], // 그저께 — 카운트 제외
    ["f3", [kst("2026-07-17T23:59:00")]], // 어제 자정 직전 — 포함
  ]);

  it("어제 운동한 친구만 센다 (그저께 제외)", () => {
    expect(
      crewFriendsWorkedYesterday("me", ["f1", "f2"], byUser, NOW, TZ),
    ).toBe(1);
  });
  it("다중 크루 중복 인원은 1명", () => {
    expect(
      crewFriendsWorkedYesterday("me", ["f1", "f1", "f3"], byUser, NOW, TZ),
    ).toBe(2);
  });
  it("본인은 제외 — 어제 나만 운동이면 0", () => {
    expect(crewFriendsWorkedYesterday("me", ["me"], byUser, NOW, TZ)).toBe(0);
  });
  it("tz 자정 경계: KST 7/18 00:00(UTC 7/17 15:00)은 어제가 아니다", () => {
    const m = new Map([["f1", [new Date("2026-07-17T15:00:00Z")]]]);
    expect(crewFriendsWorkedYesterday("me", ["f1"], m, NOW, TZ)).toBe(0);
  });
});

describe("buildBriefings — skip 판정", () => {
  it("완료 세션 없으면 no_history", () => {
    const { briefings, skipped } = buildBriefings(
      [user({ completedAts: [] })], new Map(), NOW,
    );
    expect(briefings).toHaveLength(0);
    expect(skipped).toEqual([{ userId: "me", reason: "no_history" }]);
  });
  it("morning_brief=false면 opted_out", () => {
    const { skipped } = buildBriefings(
      [user({ morningBrief: false })], new Map(), NOW,
    );
    expect(skipped[0].reason).toBe("opted_out");
  });
  it("invocationHour 7이면 전원 hour_mismatch (시간 선택 확장 대비)", () => {
    const { briefings, skipped } = buildBriefings([user({})], new Map(), NOW, 7);
    expect(briefings).toHaveLength(0);
    expect(skipped[0].reason).toBe("hour_mismatch");
  });
  it("기본값: NOW(KST 9시)면 DEFAULT_BRIEF_HOUR와 일치해 발송", () => {
    expect(DEFAULT_BRIEF_HOUR).toBe(9);
    const { briefings } = buildBriefings([user({})], new Map(), NOW);
    expect(briefings).toHaveLength(1);
  });
});

describe("buildBriefings — 제목(스트릭 단계)", () => {
  it("d1 단계: 🔥 접두 + 스트릭 수 포함 (브리핑용 조립)", () => {
    const { briefings } = buildBriefings([user({})], new Map(), NOW);
    expect(briefings[0].title.startsWith("🔥 ")).toBe(true);
    expect(briefings[0].title).toContain("1일"); // 4일 전 1회 운동 → 스트릭 1
  });
  it("expired: 소멸 유저도 재점화 카피로 발송", () => {
    const { briefings } = buildBriefings(
      [user({ completedAts: [kst("2026-07-10T19:00:00")] })], new Map(), NOW,
    );
    expect(briefings).toHaveLength(1);
    expect(briefings[0].title).toContain("불꽃");
  });
  it("today_done: 오늘 이미 완료면 칭찬 카피", () => {
    const { briefings } = buildBriefings(
      [user({ completedAts: [kst("2026-07-18T07:00:00")] })], new Map(), NOW,
    );
    expect(briefings[0].title).toContain("오늘 완료");
  });
  it("로테이션 결정성: 같은 입력이면 같은 제목", () => {
    const a = buildBriefings([user({})], new Map(), NOW).briefings[0].title;
    const b = buildBriefings([user({})], new Map(), NOW).briefings[0].title;
    expect(a).toBe(b);
  });
});

describe("buildBriefings — 본문(크루 한 줄)·dedupe_key", () => {
  const byUser = new Map<string, Date[]>([
    ["f1", [kst("2026-07-17T07:00:00")]],
    ["f2", [kst("2026-07-17T08:00:00")]],
  ]);

  it("친구 2명 어제 운동 → n명 문구", () => {
    const { briefings } = buildBriefings(
      [user({ crewMemberIds: ["me", "f1", "f2"] })], byUser, NOW,
    );
    expect(briefings[0].body).toBe("어제 크루 친구 2명이 운동했어요 💪");
  });
  it("친구는 있는데 어제 0명 → 독려 문구", () => {
    const { briefings } = buildBriefings(
      [user({ crewMemberIds: ["me", "f9"] })], byUser, NOW,
    );
    expect(briefings[0].body).toBe(
      "어제는 다들 쉬었네요. 오늘 첫 타자 어때요? 🏃",
    );
  });
  it("크루 없음(혼자 크루 포함) → 본문 null", () => {
    const { briefings } = buildBriefings(
      [user({ crewMemberIds: ["me"] })], byUser, NOW,
    );
    expect(briefings[0].body).toBeNull();
  });
  it("dedupe_key = morning_briefing:{userId}:{tz 로컬 날짜}", () => {
    const { briefings } = buildBriefings([user({})], new Map(), NOW);
    expect(briefings[0].dedupeKey).toBe("morning_briefing:me:2026-07-18");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- briefing`
Expected: FAIL — "Cannot find module './briefing'"

- [ ] **Step 3: 구현**

```ts
// src/lib/domain/briefing.ts
/**
 * 아침 브리핑 발송 판정 — 순수 함수 (스펙 §3).
 * 멱등성의 최종 보장은 DB unique(dedupe_key)가 한다. 여기서는
 * no_history/opted_out/hour_mismatch만 거른다(already_sent는 upsert 충돌로 판정).
 */
import { currentStreak, streakStage, workoutDayKeys } from "./streak";
import {
  EXPIRED_MESSAGES,
  pickByDay,
  STAGE_MESSAGES,
  TODAY_DONE_MESSAGES,
} from "./streak-messages";
import { dayKey, hourOfDay } from "./time";
import type { StreakStage } from "./streak";

export const DEFAULT_BRIEF_HOUR = 9;

export type BriefingUser = {
  userId: string;
  timezone: string;
  completedAts: Date[]; // 본인 완료 순간 전체
  morningBrief: boolean; // notification_settings.morning_brief (행 없음 = true)
  crewMemberIds: string[]; // 소속 전체 크루 멤버 합집합 (중복·본인 포함 가능)
};

export type Briefing = {
  userId: string;
  title: string;
  body: string | null;
  dedupeKey: string;
};

export type BriefingSkip = {
  userId: string;
  reason: "no_history" | "opted_out" | "hour_mismatch";
};

/**
 * 어제(유저 tz) 운동한 크루 친구 수 — user_id 중복 제거, 본인 제외,
 * 현재 멤버십 기준 (스펙 §3 집계 정의).
 */
export function crewFriendsWorkedYesterday(
  myId: string,
  crewMemberIds: string[],
  completedAtsByUser: Map<string, Date[]>,
  now: Date,
  timeZone: string,
): number {
  const yesterdayKey = dayKey(new Date(now.getTime() - 86_400_000), timeZone);
  const friends = new Set(crewMemberIds);
  friends.delete(myId);
  let n = 0;
  for (const id of friends) {
    const ats = completedAtsByUser.get(id) ?? [];
    if (ats.some((t) => dayKey(t, timeZone) === yesterdayKey)) n++;
  }
  return n;
}

/** 브리핑용 제목 조립 — 카피 데이터는 홈 카드와 공용, 조립만 채널별 (스펙 §2) */
function briefingTitle(
  stage: StreakStage,
  streak: number,
  todayKey: string,
): string {
  if (stage === "today_done") return pickByDay(TODAY_DONE_MESSAGES, todayKey);
  if (stage === "expired") return pickByDay(EXPIRED_MESSAGES, todayKey);
  const variants = STAGE_MESSAGES[stage];
  if (variants) return `🔥 ${pickByDay(variants, todayKey)(streak)}`;
  return `🔥 스트릭 ${streak}일 유지 중이에요`; // 방어 — none은 호출 전 제외됨
}

function briefingBody(friendCount: number | null): string | null {
  if (friendCount === null) return null; // 크루 친구 없음 → 본문 생략
  return friendCount >= 1
    ? `어제 크루 친구 ${friendCount}명이 운동했어요 💪`
    : "어제는 다들 쉬었네요. 오늘 첫 타자 어때요? 🏃";
}

export function buildBriefings(
  users: BriefingUser[],
  completedAtsByUser: Map<string, Date[]>,
  now: Date,
  invocationHourOverride?: number,
): { briefings: Briefing[]; skipped: BriefingSkip[] } {
  const briefings: Briefing[] = [];
  const skipped: BriefingSkip[] = [];

  for (const u of users) {
    if (u.completedAts.length === 0) {
      skipped.push({ userId: u.userId, reason: "no_history" });
      continue;
    }
    if (!u.morningBrief) {
      skipped.push({ userId: u.userId, reason: "opted_out" });
      continue;
    }
    const hour = invocationHourOverride ?? hourOfDay(now, u.timezone);
    if (hour !== DEFAULT_BRIEF_HOUR) {
      skipped.push({ userId: u.userId, reason: "hour_mismatch" });
      continue;
    }

    const todayKey = dayKey(now, u.timezone);
    const keys = workoutDayKeys(u.completedAts, u.timezone);
    const stage = streakStage(keys, todayKey);
    const streak = currentStreak(keys, todayKey);

    const hasFriends = u.crewMemberIds.some((id) => id !== u.userId);
    const friendCount = hasFriends
      ? crewFriendsWorkedYesterday(
          u.userId, u.crewMemberIds, completedAtsByUser, now, u.timezone,
        )
      : null;

    briefings.push({
      userId: u.userId,
      title: briefingTitle(stage, streak, todayKey),
      body: briefingBody(friendCount),
      dedupeKey: `morning_briefing:${u.userId}:${todayKey}`,
    });
  }
  return { briefings, skipped };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test`
Expected: 전체 PASS (131 + Task2의 2 + 이번 16 = 149)

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/briefing.ts src/lib/domain/briefing.test.ts
git commit -m "기능: 아침 브리핑 발송 판정 도메인 — TDD 16케이스 (스펙 §3)"
```

---

### Task 4: 0013 마이그레이션 + DB 통합 검증 (dedupe·ranks)

**Files:**
- Create: `supabase/migrations/0013_briefing_dedupe_ranks_setting.sql`
- Create: `scripts/briefing-integration-test.mjs`

- [ ] **Step 1: 마이그레이션 작성** — ① dedupe_key ② finalize_challenge ranks 존중(0011 446~486행 원문 유지 + 필터만 추가. 시그니처·반환형·definer·search_path 동일 → 기존 grant 보존):

```sql
-- ============================================================
-- 0013: 브리핑 멱등 키 + finalize_challenge ranks 설정 존중
-- 설계: docs/superpowers/specs/2026-07-18-briefing-cron-notification-settings-design.md
-- 실행: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run (1회)
-- ============================================================

-- ── 1. notifications.dedupe_key — 브리핑 중복 방지 (스펙 §3) ──
-- nullable + 일반 unique 인덱스: NULL은 충돌하지 않으므로 기존 알림
-- 타입(전부 NULL)에 무영향. partial index는 PostgREST on_conflict와
-- 안 맞아 일반 인덱스를 쓴다.
alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_key_uidx
  on public.notifications (dedupe_key);

-- ── 2. finalize_challenge — ranks 꺼둔 유저에게 종료 알림 생략 ──
-- 0011 §9 원문 그대로 + 알림 insert에 coalesce(ns.ranks, true) 필터.
-- (행 없음 = 알림 on 관례. 시그니처·definer·search_path 불변 → grant 유지)
create or replace function public.finalize_challenge(p_challenge_id uuid)
returns public.challenges
language plpgsql volatile security definer set search_path = public as $$
declare
  c challenges;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into c from challenges
  where id = p_challenge_id
  for update;

  if not found or not is_group_member(c.group_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  if c.status <> 'active' then
    raise exception 'invalid_status:%', c.status;
  end if;
  if c.end_date >= (now() at time zone 'Asia/Seoul')::date then
    raise exception 'not_ended_yet';
  end if;

  update challenges set status = 'ended'
  where id = p_challenge_id
  returning * into c;

  insert into notifications (user_id, actor_id, type, reference_id, title, body)
  select distinct ug.user_id, auth.uid(), 'challenge_ended', c.id,
         '챌린지 "' || c.name || '" 종료 🏁',
         '시상대에서 결과를 확인해보세요!'
  from user_goals ug
  left join notification_settings ns on ns.user_id = ug.user_id
  where ug.challenge_id = c.id
    and coalesce(ns.ranks, true);

  return c;
end $$;
```

- [ ] **Step 2: 사용자에게 적용 요청 (게이트)** — "supabase/migrations/0013_briefing_dedupe_ranks_setting.sql 열기 → 전체 복사 → Supabase SQL Editor → Run" 안내 후 "Success" 확인을 받는다. **적용 확인 전에는 다음 단계 진행 금지** (스펙 §9 배포 순서).

- [ ] **Step 3: 통합 검증 스크립트 작성** — rls-test.mjs와 같은 raw REST 패턴. dedupe(스펙 테스트 ①)와 ranks(RLS +1)를 실 DB로 검증:

```js
// scripts/briefing-integration-test.mjs
// 0013 검증: ① dedupe_key 멱등(2회 upsert → 1행)
//            ② finalize_challenge가 ranks=false 유저에게 알림 생략
// 실행: node scripts/briefing-integration-test.mjs  (.env.local 필요)
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` — ${detail}`}`);
  ok ? pass++ : fail++;
}

async function api(token, method, path, body, headers = {}) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: token === SERVICE ? SERVICE : ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function anonUser() {
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const j = await res.json();
  return { id: j.user.id, token: j.access_token };
}

// ── ① dedupe_key 멱등 ────────────────────────────────────────
const A = await anonUser();
const B = await anonUser();
await api(A.token, "POST", "/rest/v1/profiles", {
  id: A.id, nickname: "브리핑테스트A", weekly_goal: 3,
});
await api(B.token, "POST", "/rest/v1/profiles", {
  id: B.id, nickname: "브리핑테스트B", weekly_goal: 3,
});

const key = `morning_briefing:${A.id}:2026-01-01`; // 과거 날짜 — 실브리핑과 충돌 없음
const row = {
  user_id: A.id, type: "morning_briefing",
  title: "테스트", body: null, dedupe_key: key,
};
const up1 = await api(SERVICE, "POST",
  "/rest/v1/notifications?on_conflict=dedupe_key", row,
  { Prefer: "resolution=ignore-duplicates,return=representation" });
check("dedupe: 1차 upsert는 insert", up1.status === 201 && up1.json?.length === 1,
  JSON.stringify(up1));
const up2 = await api(SERVICE, "POST",
  "/rest/v1/notifications?on_conflict=dedupe_key", row,
  { Prefer: "resolution=ignore-duplicates,return=representation" });
check("dedupe: 2차 upsert는 무시(0행 반환)", up2.json?.length === 0,
  JSON.stringify(up2));
const cnt = await api(SERVICE, "GET",
  `/rest/v1/notifications?dedupe_key=eq.${encodeURIComponent(key)}&select=id`);
check("dedupe: 최종 1행", cnt.json?.length === 1, JSON.stringify(cnt.json));

// ── ② finalize_challenge ranks 존중 ──────────────────────────
const g = await api(A.token, "POST", "/rest/v1/rpc/create_group",
  { p_name: "브리핑검증크루" });
await api(B.token, "POST", "/rest/v1/rpc/join_group_with_code",
  { p_code: g.json.invite_code });
// B: 순위 알림 끔
await api(B.token, "POST", "/rest/v1/notification_settings?on_conflict=user_id",
  { user_id: B.id, ranks: false },
  { Prefer: "resolution=merge-duplicates,return=representation" });

const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const ch = await api(A.token, "POST", "/rest/v1/challenges", {
  group_id: g.json.id, name: "검증챌린지",
  start_date: yesterday, end_date: yesterday,
});
const chId = ch.json?.[0]?.id;
check("픽스처: 챌린지 생성", !!chId, JSON.stringify(ch));
for (const u of [A, B]) {
  await api(u.token, "POST", "/rest/v1/user_goals", {
    challenge_id: chId, group_id: g.json.id,
    goal_type: "weight_days", target_value: 3, unit: "일", planned_days: 3,
  });
}
const st = await api(A.token, "POST", "/rest/v1/rpc/start_challenge",
  { p_challenge_id: chId });
check("픽스처: start_challenge", st.status === 200, JSON.stringify(st.json));
const fin = await api(A.token, "POST", "/rest/v1/rpc/finalize_challenge",
  { p_challenge_id: chId });
check("픽스처: finalize_challenge", fin.status === 200, JSON.stringify(fin.json));

const nA = await api(SERVICE, "GET",
  `/rest/v1/notifications?user_id=eq.${A.id}&type=eq.challenge_ended&reference_id=eq.${chId}&select=id`);
const nB = await api(SERVICE, "GET",
  `/rest/v1/notifications?user_id=eq.${B.id}&type=eq.challenge_ended&reference_id=eq.${chId}&select=id`);
check("ranks on(A): 종료 알림 수신", nA.json?.length === 1, JSON.stringify(nA.json));
check("ranks off(B): 종료 알림 미수신", nB.json?.length === 0, JSON.stringify(nB.json));

// ── 정리 (service — 테스트 데이터 삭제) ──────────────────────
await api(SERVICE, "DELETE",
  `/rest/v1/notifications?dedupe_key=eq.${encodeURIComponent(key)}`);
await api(SERVICE, "DELETE", `/rest/v1/notifications?reference_id=eq.${chId}`);
await api(SERVICE, "DELETE", `/rest/v1/challenges?id=eq.${chId}`); // user_goals cascade
await api(SERVICE, "DELETE", `/rest/v1/groups?id=eq.${g.json.id}`); // members cascade
await api(SERVICE, "DELETE", `/rest/v1/notification_settings?user_id=eq.${B.id}`);
await api(SERVICE, "DELETE", `/rest/v1/profiles?id=in.(${A.id},${B.id})`);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail > 0 ? 1 : 0);
```

(profiles insert 필수 컬럼이 nickname·weekly_goal 외에 더 있으면 `scripts/rls-test.mjs` 64행의 픽스처 형태를 그대로 따라 맞춘다.)

- [ ] **Step 4: 실행·통과 확인**

Run: `node scripts/briefing-integration-test.mjs`
Expected: `8/8 passed` (dedupe 3 + 픽스처 3 + ranks 2), exit 0

- [ ] **Step 5: 기존 RLS 회귀**

Run: `node scripts/rls-test.mjs`
Expected: 107/107 (finalize 재정의가 기존 동작을 깨지 않음)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0013_briefing_dedupe_ranks_setting.sql scripts/briefing-integration-test.mjs
git commit -m "DB: 0013 브리핑 dedupe_key + finalize ranks 존중 — 통합 검증 스크립트 포함"
```

---

### Task 5: admin 클라이언트 + `/api/briefing` route + vercel.json

**Files:**
- Create: `src/lib/supabase/admin.ts`
- Create: `src/app/api/briefing/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: admin 클라이언트**

```ts
// src/lib/supabase/admin.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * service_role 클라이언트 — RLS 우회. **API route 전용.**
 * SUPABASE_SERVICE_ROLE_KEY는 NEXT_PUBLIC_ 접두사가 없어 클라 번들에
 * 포함되지 않는다. 클라이언트 컴포넌트에서 import 금지.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
```

- [ ] **Step 2: route 구현**

```ts
// src/app/api/briefing/route.ts
import { NextResponse } from "next/server";
import { buildBriefings, type BriefingUser } from "@/lib/domain/briefing";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * 아침 브리핑 디스패처 (스펙 §2·§3) — Vercel Cron이 매일 UTC 0시(KST 9시,
 * ±59분)에 호출. CRON_SECRET Bearer 검증. ?hour=N은 수동 검증·향후 다중
 * 슬롯용 시각 오버라이드.
 */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "env_missing" }, { status: 500 });
  }
  if (
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const hourParam = new URL(req.url).searchParams.get("hour");
  const invocationHour = hourParam === null ? undefined : Number(hourParam);

  const admin = getSupabaseAdminClient();
  const [profilesRes, sessionsRes, settingsRes, membersRes] =
    await Promise.all([
      admin.from("profiles").select("id, timezone"),
      admin
        .from("workout_sessions")
        .select("user_id, completed_at")
        .eq("status", "completed")
        .is("deleted_at", null)
        .not("completed_at", "is", null),
      admin.from("notification_settings").select("user_id, morning_brief"),
      admin.from("group_members").select("group_id, user_id"),
    ]);
  const queryError = [profilesRes, sessionsRes, settingsRes, membersRes].find(
    (r) => r.error,
  )?.error;
  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const completedAtsByUser = new Map<string, Date[]>();
  for (const row of sessionsRes.data ?? []) {
    const list = completedAtsByUser.get(row.user_id) ?? [];
    list.push(new Date(row.completed_at as string));
    completedAtsByUser.set(row.user_id, list);
  }
  const settings = new Map(
    (settingsRes.data ?? []).map((s) => [s.user_id, s.morning_brief as boolean]),
  );
  const membersByGroup = new Map<string, string[]>();
  const groupsByUser = new Map<string, string[]>();
  for (const m of membersRes.data ?? []) {
    membersByGroup.set(m.group_id, [
      ...(membersByGroup.get(m.group_id) ?? []), m.user_id,
    ]);
    groupsByUser.set(m.user_id, [
      ...(groupsByUser.get(m.user_id) ?? []), m.group_id,
    ]);
  }

  const users: BriefingUser[] = (profilesRes.data ?? []).map((p) => ({
    userId: p.id,
    timezone: (p.timezone as string) || "Asia/Seoul",
    completedAts: completedAtsByUser.get(p.id) ?? [],
    morningBrief: settings.get(p.id) ?? true,
    crewMemberIds: (groupsByUser.get(p.id) ?? []).flatMap(
      (g) => membersByGroup.get(g) ?? [],
    ),
  }));

  const { briefings, skipped } = buildBriefings(
    users, completedAtsByUser, new Date(), invocationHour,
  );

  // 유저별 insert — dedupe_key 충돌 = 이미 발송 (스펙 §3·§8: 일괄 insert 금지)
  let sent = 0;
  let alreadySent = 0;
  const errors: string[] = [];
  for (const b of briefings) {
    const { data, error } = await admin
      .from("notifications")
      .upsert(
        {
          user_id: b.userId,
          type: "morning_briefing",
          title: b.title,
          body: b.body,
          dedupe_key: b.dedupeKey,
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      )
      .select("id");
    if (error) errors.push(`${b.userId}: ${error.message}`);
    else if ((data ?? []).length > 0) sent += 1;
    else alreadySent += 1;
  }

  return NextResponse.json({ sent, alreadySent, skipped, errors });
}
```

- [ ] **Step 3: vercel.json**

```json
{
  "crons": [{ "path": "/api/briefing", "schedule": "0 0 * * *" }]
}
```

- [ ] **Step 4: 정적 검증**

Run: `pnpm lint && pnpm typecheck`
Expected: 통과

- [ ] **Step 5: 로컬 동작 검증** — dev 서버 시작(`pnpm exec next dev -H 0.0.0.0`) 후 **Bash에서**:

```bash
SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2)
curl -s -H "Authorization: Bearer $SECRET" "http://localhost:3000/api/briefing?hour=9"
# 기대: {"sent":N,"alreadySent":0,"skipped":[...],"errors":[]} — 기록 있는 유저 수만큼 sent
curl -s -H "Authorization: Bearer $SECRET" "http://localhost:3000/api/briefing?hour=9"
# 기대: 2번째 호출은 sent:0, alreadySent:N (dedupe 동작)
curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer wrong" "http://localhost:3000/api/briefing"
# 기대: 401
```

브라우저(로컬 주소)로 알림함 열어 브리핑 도착 확인(아이콘은 Task 7 전이라 ☀️).

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/admin.ts src/app/api/briefing/route.ts vercel.json
git commit -m "기능: 아침 브리핑 크론 route + service_role 클라 + vercel.json (KST 9시)"
```

---

### Task 6: 알림 설정 lib + 프로필 탭 토글 5종

**Files:**
- Create: `src/lib/notification-settings.ts`
- Modify: `src/app/(tabs)/profile/page.tsx` (플레이스홀더 → 알림 설정 섹션. 프로필 편집 등 다른 내용은 이번 범위 아님 — 헤더+알림 설정만)

- [ ] **Step 1: lib 구현**

```ts
// src/lib/notification-settings.ts
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** 행 없음 = 전부 on (0011 관례) */
export type NotificationSettings = {
  morning_brief: boolean;
  cheers: boolean;
  pokes: boolean;
  ranks: boolean;
  record_views: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  morning_brief: true,
  cheers: true,
  pokes: true,
  ranks: true,
  record_views: true,
};

export async function getNotificationSettings(
  userId: string,
): Promise<NotificationSettings> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("notification_settings")
    .select("morning_brief, cheers, pokes, ranks, record_views")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? DEFAULT_NOTIFICATION_SETTINGS;
}

/** 부분 갱신 — 행 없으면 생성(나머지 컬럼은 DB default true) */
export async function updateNotificationSettings(
  userId: string,
  patch: Partial<NotificationSettings>,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("notification_settings")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (error) throw error;
}
```

- [ ] **Step 2: 프로필 페이지 구현**

```tsx
// src/app/(tabs)/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getNotificationSettings,
  updateNotificationSettings,
  type NotificationSettings,
} from "@/lib/notification-settings";

const TOGGLES: { key: keyof NotificationSettings; label: string; desc: string }[] = [
  { key: "morning_brief", label: "아침 브리핑", desc: "매일 오전 9시 스트릭 브리핑" },
  { key: "cheers", label: "응원", desc: "크루가 보낸 응원 📣" },
  { key: "pokes", label: "찌르기", desc: "오늘 미운동 시 크루의 콕 👉" },
  { key: "ranks", label: "순위", desc: "챌린지 종료·시상대 🏁" },
  { key: "record_views", label: "성과 열람", desc: "꾸준왕이 내 성과를 볼 때 👀" },
];

export default function ProfilePage() {
  const { userId, loading, configured } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    getNotificationSettings(userId)
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId]);

  async function toggle(key: keyof NotificationSettings) {
    if (!userId) return;
    const next = !settings[key];
    setSettings((s) => ({ ...s, [key]: next })); // 낙관적
    try {
      await updateNotificationSettings(userId, { [key]: next });
    } catch {
      setSettings((s) => ({ ...s, [key]: !next })); // 실패 롤백
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="pt-2 pb-1">
        <h1 className="text-[19px] font-extrabold tracking-tight">내 정보</h1>
        <p className="mt-0.5 text-[12.5px] text-muted">알림 설정</p>
      </header>

      <section className="rounded-card border border-line bg-surface shadow-card">
        {TOGGLES.map((t, i) => (
          <div
            key={t.key}
            className={`flex items-center justify-between p-4 ${
              i > 0 ? "border-t border-line" : ""
            }`}
          >
            <div>
              <p className="text-sm font-bold">{t.label}</p>
              <p className="mt-0.5 text-xs text-muted">{t.desc}</p>
            </div>
            <button
              role="switch"
              aria-checked={settings[t.key]}
              aria-label={`${t.label} 알림`}
              disabled={!ready}
              onClick={() => void toggle(t.key)}
              className={`relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-50 ${
                settings[t.key] ? "bg-accent" : "border border-line bg-surface-2"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  settings[t.key] ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        ))}
      </section>
      <p className="px-1 text-[11px] text-faint">
        꺼두면 해당 알림이 알림함에 쌓이지 않아요. (응원·찌르기는 상대에게
        안내돼요)
      </p>
    </div>
  );
}
```

(`ScreenPlaceholder` import가 다른 곳에서 안 쓰이면 그대로 두고 profile에서만 제거. accent 배경 위 흰 점이 블랙&골드 테마에서 어색하면 기존 토큰 `bg-surface`로 조정 — 실화면 보고 판단.)

- [ ] **Step 3: 검증**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 통과 (unit 149 유지)

브라우저: 내 정보 탭 → 토글 5개 렌더 → 아침 브리핑 off → 새로고침 후에도 off 유지(행 upsert 확인). off 상태에서 Task 5의 curl 재실행(다른 날짜가 아니므로 dedupe에 걸리지만, `skipped`에 opted_out이 아닌 already… 를 보려면 내일 확인 — 대신 통합 스크립트가 이미 opted_out 경로를 도메인 unit으로 검증함).

- [ ] **Step 4: Commit**

```bash
git add src/lib/notification-settings.ts "src/app/(tabs)/profile/page.tsx"
git commit -m "기능: 프로필 탭 알림 설정 토글 5종 (행 없음=전부 on)"
```

---

### Task 7: 알림함 브리핑 카드 불독 아이콘

**Files:**
- Modify: `src/components/notification-bell.tsx` (111행 아이콘 span)

- [ ] **Step 1: 아이콘 분기** — 111행 `<span className="mt-0.5 text-lg">{TYPE_ICON[n.type]}</span>`을 다음으로 교체 (feed-item.tsx 65행과 같은 `<img>` + eslint-disable 패턴):

```tsx
{n.type === "morning_briefing" ? (
  /* eslint-disable-next-line @next/next/no-img-element */
  <img
    src="/icons/icon-192.png"
    alt="GND"
    className="mt-0.5 h-7 w-7 flex-none rounded-lg"
  />
) : (
  <span className="mt-0.5 text-lg">{TYPE_ICON[n.type]}</span>
)}
```

- [ ] **Step 2: 검증**

Run: `pnpm lint && pnpm typecheck`
Expected: 통과. 브라우저 알림함에서 Task 5가 만든 브리핑 카드에 불독 아이콘 표시 확인.

- [ ] **Step 3: Commit**

```bash
git add src/components/notification-bell.tsx
git commit -m "UI: 알림함 브리핑 카드에 앱 아이콘(불독) 표시"
```

---

### Task 8: 피드 [📷 사진만] 필터

**Files:**
- Modify: `src/lib/social.ts` (`getGroupFeed`에 photoOnly)
- Modify: `src/app/(tabs)/feed/page.tsx` (필터 칩 + 상태)

- [ ] **Step 1: 쿼리 필터** — `getGroupFeed` 시그니처에 `photoOnly = false` 추가, embed를 조건부 `!inner`로 (PostgREST inner join = 이미지 있는 세션만. 커서·정렬은 기존 completed_at 그대로 — 스펙 §7):

```ts
export async function getGroupFeed(
  groupId: string,
  myUserId: string,
  before?: string,
  photoOnly = false,
): Promise<FeedItem[]> {
  const supabase = getSupabaseBrowserClient();

  // photoOnly: workout_images!inner = 인증사진 있는 세션만 (세션당 1장
  // unique(0005)라 join 중복 없음). 정렬·커서는 전체 피드와 동일.
  const imagesEmbed = photoOnly
    ? "workout_images!inner(image_path)"
    : "workout_images(image_path)";

  let query = supabase
    .from("workout_sessions")
    .select(
      `id, user_id, title, completed_at, duration_minutes, workout_exercises(exercise_name, exercise_type, sort_order, workout_sets(weight_kg, reps, duration_seconds, distance_meters, is_completed)), ${imagesEmbed}`,
    )
    .eq("group_id", groupId)
    ...
```

(이하 기존 체인 그대로 — `.eq("status", ...)`부터 변경 없음.)

- [ ] **Step 2: 피드 페이지 칩 UI** — feed/page.tsx 수정:

state 추가 및 로드 effect가 필터를 따르게:

```tsx
const [photoOnly, setPhotoOnly] = useState(false);
```

기존 로드 effect의 deps에 `photoOnly` 추가, `getGroupFeed(g.id, userId!, undefined, photoOnly)`로 호출하고 effect 시작부에 `setReady(false); setItems([]);` 추가(필터 전환 시 로딩 상태로). `loadMore`도 `getGroupFeed(group.id, userId, before, photoOnly)` + deps에 `photoOnly`.

`<ActiveWorkoutCards />` 아래에 칩:

```tsx
<div className="flex gap-2">
  {([
    [false, "전체"],
    [true, "📷 사진만"],
  ] as const).map(([v, label]) => (
    <button
      key={label}
      onClick={() => setPhotoOnly(v)}
      className={`h-8 rounded-full border px-3.5 text-xs font-bold ${
        photoOnly === v
          ? "border-accent bg-accent/15 text-accent"
          : "border-line bg-surface text-muted"
      }`}
    >
      {label}
    </button>
  ))}
</div>
```

빈 상태 분기 추가 — `items.length === 0 && photoOnly`일 때:

```tsx
<section className="rounded-card border border-line bg-surface p-5 text-center shadow-card">
  <p className="text-sm font-bold">아직 사진 인증이 없어요</p>
  <p className="mt-1 text-xs text-muted">
    운동 완료 후 사진을 남기면 여기에 모여요 📷
  </p>
</section>
```

- [ ] **Step 3: 검증**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 통과

브라우저: 피드 → [📷 사진만] → 사진 있는 카드만 날짜 그룹으로 표시(로컬 데이터에 사진 세션 1개 이상 만들어 확인), [전체] 복귀, 더보기 동작.

- [ ] **Step 4: Commit**

```bash
git add src/lib/social.ts "src/app/(tabs)/feed/page.tsx"
git commit -m "기능: 피드 사진 인증 모아보기 필터 — workout_images inner join"
```

---

### Task 9: 전체 검증 → 배포 → 실기기 확인 안내

**Files:**
- Modify: `PROGRESS.md` (산출물·기준선 갱신 — 검증 후)

- [ ] **Step 1: 전체 검증** (dev 서버 먼저 종료 — 교훈 8)

```bash
pnpm test          # 기대: 149 passed
pnpm lint && pnpm typecheck
pnpm build         # dev 서버 종료 상태에서
node scripts/rls-test.mjs                 # 기대: 107/107
node scripts/briefing-integration-test.mjs # 기대: 전체 passed
```

- [ ] **Step 2: 프로덕션 배포** (0013은 Task 4에서 이미 적용·검증됨 — 스펙 §9 순서 충족)

```bash
pnpm dlx vercel deploy --prod --yes
```

Expected: 배포 URL 출력, https://gnd-one.vercel.app 200

- [ ] **Step 3: 프로덕션 크론 검증** (Bash)

```bash
SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2)
curl -s -H "Authorization: Bearer $SECRET" "https://gnd-one.vercel.app/api/briefing?hour=9"
```

Expected: `{"sent":...,"errors":[]}` — 프로덕션 DB 유저 기준. Vercel 대시보드 → 프로젝트 gnd → Settings → Cron Jobs에 `/api/briefing` 등록 확인.

- [ ] **Step 4: 사용자 폰 확인 요청** (통과 후 커밋 마무리 — 메모리 규칙):
  ① 알림함에 브리핑 카드 + 불독 아이콘 ② 내 정보 탭 토글 5종 on/off 유지
  ③ 피드 [📷 사진만] 필터 ④ (다음날 아침) 9시대에 브리핑 자동 도착

- [ ] **Step 5: PROGRESS.md 갱신 + 최종 커밋** — ⚠️ 섹션의 "다음 작업"을 갱신(브리핑 크론 완료, 다음 = 핵심 E2E → 3명 4주 실사용), 검증 기준선(unit 148 · RLS 107 + 통합 스크립트)·2026-07-18 산출물에 항목 추가.

```bash
git add PROGRESS.md
git commit -m "문서: 브리핑 크론·알림설정·사진 필터 완료 기록 — 다음 = 핵심 E2E"
```
