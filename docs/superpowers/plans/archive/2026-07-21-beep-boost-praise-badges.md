# 비프음 증폭 + 칭찬 알림 + 배지 시스템 Implementation Plan

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** 휴식 비프음을 2배로 키우고, 같은 구성의 직전 운동보다 성과가 좋아지면 크루에게 "칭찬해주세요" 알림을 보내며 본인은 달력 화면에 쌓이는 배지를 얻게 한다.

**Architecture:** 판정은 순수 도메인 함수(`findComparableSession`)가 맡고, 배지 지급 규칙은 SQL definer RPC(`mark_record_beaten`) 한 곳에만 둔다. TS 배지 카탈로그는 표시용 메타만 갖는다. 달력 화면 상단에 배지 진열대를 붙이고 미획득 배지는 잠금 표시한다.

**Tech Stack:** Next.js 15 App Router · TypeScript · Supabase(Postgres/RLS/definer RPC) · vitest · Tailwind

**설계 문서:** `docs/superpowers/specs/2026-07-21-beep-boost-praise-badges-design.md`

**중요 전제:**
- 저장소 `C:\Users\SAMSUNG\workout-app`, 브랜치 `main`. `.claude/`는 untracked로 두고 절대 커밋하지 않는다.
- **DB 0001~0019는 적용 완료 — 재실행 금지.** 이번 신규는 `0020`뿐이고 Task 5 이후 사용자가 SQL Editor에 1회 적용한다.
- 검증 명령: `pnpm test` · `pnpm typecheck` · `pnpm lint` · `pnpm build`. build 전에는 dev 서버를 끈다.

---

### Task 1: 휴식 비프음 2배

**Files:**
- Modify: `src/lib/rest-countdown-audio.ts:3-5`
- Test: `src/lib/rest-countdown-audio.test.ts:59-63`

- [ ] **Step 1: 기존 단언을 새 음량으로 바꿔 실패시키기**

`src/lib/rest-countdown-audio.test.ts`의 첫 테스트에서 1번째 램프 단언을 바꾼다.

```ts
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      0.5,
      10.01,
    );
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run src/lib/rest-countdown-audio.test.ts`
Expected: FAIL — 1번째 호출이 `0.25`로 왔다는 diff.

- [ ] **Step 3: 음량 상수 2배로 올리기**

`src/lib/rest-countdown-audio.ts`의 상수와 주석을 바꾼다.

```ts
const BEEP_FREQUENCY_HZ = 880;
// 음악 재생 중에도 비프음이 묻히지 않도록 키운 음량.
// 0.06 → 0.25(2026-07-19) → 0.5(2026-07-21, 음악에 여전히 가려진다는 사용자 신고).
// 사인파 단일 오실레이터라 0.5에서도 클리핑이 없다.
const BEEP_GAIN = 0.5;
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run src/lib/rest-countdown-audio.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/rest-countdown-audio.ts src/lib/rest-countdown-audio.test.ts
git commit -m "feat: double rest countdown beep volume"
```

---

### Task 2: 비교 대상 세션 찾기 (도메인 TDD)

**Files:**
- Modify: `src/lib/domain/record-beaten.ts` (파일 끝에 추가)
- Test: `src/lib/domain/record-beaten.test.ts` (파일 끝에 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/domain/record-beaten.test.ts` 맨 위 import에 `findComparableSession`을 추가한다.

```ts
import {
  effortTotals,
  findComparableSession,
  recordBeatenNote,
} from "./record-beaten";
```

파일 끝에 아래 describe 블록을 추가한다.

```ts
describe("findComparableSession", () => {
  function candidate(
    id: string,
    completedAt: string,
    exerciseNames: string[],
    isTabata = false,
  ) {
    return { id, completedAt: new Date(completedAt), exerciseNames, isTabata };
  }

  it("같은 종목 집합의 세션을 찾는다", () => {
    const found = findComparableSession(
      ["벤치프레스", "스쿼트"],
      [candidate("a", "2026-07-01T10:00:00Z", ["벤치프레스", "스쿼트"])],
    );
    expect(found?.id).toBe("a");
  });

  it("순서가 달라도 같은 집합이면 찾는다", () => {
    const found = findComparableSession(
      ["벤치프레스", "스쿼트"],
      [candidate("a", "2026-07-01T10:00:00Z", ["스쿼트", "벤치프레스"])],
    );
    expect(found?.id).toBe("a");
  });

  it("종목이 하나라도 다르면 비교하지 않는다", () => {
    expect(
      findComparableSession(
        ["벤치프레스", "스쿼트"],
        [
          candidate("a", "2026-07-01T10:00:00Z", ["벤치프레스"]),
          candidate("b", "2026-07-02T10:00:00Z", [
            "벤치프레스",
            "스쿼트",
            "데드리프트",
          ]),
        ],
      ),
    ).toBeNull();
  });

  it("조건을 만족하는 후보 중 가장 최근 것을 고른다", () => {
    const found = findComparableSession(
      ["벤치프레스"],
      [
        candidate("old", "2026-07-01T10:00:00Z", ["벤치프레스"]),
        candidate("new", "2026-07-05T10:00:00Z", ["벤치프레스"]),
        candidate("mid", "2026-07-03T10:00:00Z", ["벤치프레스"]),
      ],
    );
    expect(found?.id).toBe("new");
  });

  it("타바타 세션은 후보에서 제외한다", () => {
    const found = findComparableSession(
      ["버피"],
      [
        candidate("tabata", "2026-07-05T10:00:00Z", ["버피"], true),
        candidate("normal", "2026-07-01T10:00:00Z", ["버피"]),
      ],
    );
    expect(found?.id).toBe("normal");
  });

  it("후보가 없으면 null", () => {
    expect(findComparableSession(["벤치프레스"], [])).toBeNull();
  });

  it("이번 운동에 종목이 없으면 비교하지 않는다", () => {
    expect(
      findComparableSession([], [candidate("a", "2026-07-01T10:00:00Z", [])]),
    ).toBeNull();
  });

  it("같은 종목이 중복돼도 집합으로 비교한다", () => {
    const found = findComparableSession(
      ["벤치프레스", "벤치프레스"],
      [candidate("a", "2026-07-01T10:00:00Z", ["벤치프레스"])],
    );
    expect(found?.id).toBe("a");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run src/lib/domain/record-beaten.test.ts`
Expected: FAIL — `findComparableSession is not a function` 혹은 import 오류.

- [ ] **Step 3: 최소 구현 추가**

`src/lib/domain/record-beaten.ts` 파일 끝에 추가한다.

```ts
/** 기록 갱신 비교 후보 (설계 2026-07-21) */
export type ComparableCandidate = {
  id: string;
  completedAt: Date;
  exerciseNames: string[];
  isTabata: boolean;
};

function sameComposition(a: string[], b: string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const name of setA) {
    if (!setB.has(name)) return false;
  }
  return true;
}

/**
 * 종목 구성이 똑같은 내 가장 최근 완료 세션. 구성이 같아야 총량 비교가
 * 공정하다(종목을 추가하면 볼륨은 당연히 늘어난다). 타바타는 세트 실적이
 * 0이라 비교 대상이 되면 판정을 무의미하게 만들므로 제외한다.
 */
export function findComparableSession(
  currentExerciseNames: string[],
  candidates: ComparableCandidate[],
): ComparableCandidate | null {
  if (currentExerciseNames.length === 0) return null;

  let best: ComparableCandidate | null = null;
  for (const candidate of candidates) {
    if (candidate.isTabata) continue;
    if (!sameComposition(currentExerciseNames, candidate.exerciseNames)) {
      continue;
    }
    if (
      best === null ||
      candidate.completedAt.getTime() > best.completedAt.getTime()
    ) {
      best = candidate;
    }
  }
  return best;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run src/lib/domain/record-beaten.test.ts`
Expected: PASS (기존 11케이스 + 신규 8케이스)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/record-beaten.ts src/lib/domain/record-beaten.test.ts
git commit -m "feat: find comparable session for record beaten judgement"
```

---

### Task 3: 완료 흐름을 새 판정에 연결

**Files:**
- Modify: `src/app/(tabs)/record/page.tsx:29` (import), `src/app/(tabs)/record/page.tsx:614-648` (판정 블록)

`getCompletedSessions`는 이미 이 파일에서 import 중이므로 추가 import가 필요 없다.

- [ ] **Step 1: import에 findComparableSession 추가**

29번 줄을 바꾼다.

```ts
import {
  effortTotals,
  findComparableSession,
  recordBeatenNote,
} from "@/lib/domain/record-beaten";
```

- [ ] **Step 2: 판정 블록 교체**

`handleFinish` 안의 `// 기록 갱신 판정 — 복사 예정표 운동만...` 주석부터 그 `try/catch` 블록 끝까지(614~648행)를 아래로 통째로 바꾼다.

```tsx
      // 기록 갱신 판정 — 복사 원본이 있으면 그것과, 없으면 같은 구성의 내
      // 직전 운동과 비교한다. 판정·RPC 실패는 완료 흐름을 막지 않는다.
      let recordNote: string | null = null;
      try {
        let compareSessionId: string | null = draft.sourceSessionId;
        if (!compareSessionId) {
          const past = await getCompletedSessions(userId);
          const match = findComparableSession(
            draft.exercises.map((ex) => ex.name),
            past
              .filter((row) => row.id !== s.id)
              .map((row) => ({
                id: row.id,
                completedAt: row.completedAt,
                exerciseNames: row.exerciseNames,
                isTabata: row.tabataMinutes !== null,
              })),
          );
          compareSessionId = match?.id ?? null;
        }
        if (compareSessionId) {
          const original = await getSessionLogExercises(compareSessionId);
          recordNote = recordBeatenNote(
            effortTotals(
              original.map((ex) => ({
                exerciseType: ex.exerciseType,
                measure: ex.measure,
                sets: ex.sets.map((set) => ({
                  ...set,
                  isCompleted: set.done,
                })),
              })),
            ),
            effortTotals(
              draft.exercises.map((ex) => ({
                exerciseType: ex.exerciseType,
                measure: ex.measure,
                sets: ex.sets.map((set) => ({
                  weightKg: set.weightKg,
                  reps: set.reps,
                  distanceKm: set.distanceKm,
                  durationMin: set.durationMin,
                  isCompleted: set.done,
                })),
              })),
            ),
          );
          if (recordNote) await markRecordBeaten(s.id, recordNote);
        }
      } catch {
        recordNote = null;
      }
```

- [ ] **Step 3: 타입·린트·전체 테스트 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 타입 오류 0 · 린트 오류 0 · 기존 테스트 전부 통과

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(tabs)/record/page.tsx"
git commit -m "feat: judge record beaten against same-composition previous workout"
```

---

### Task 4: 배지 카탈로그 도메인 (TDD)

**Files:**
- Create: `src/lib/domain/badges.ts`
- Test: `src/lib/domain/badges.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/domain/badges.test.ts`를 만든다.

```ts
import { describe, expect, it } from "vitest";

import { BADGE_CATALOG, badgeShelf, earnedBadgeCount } from "./badges";

describe("badgeShelf", () => {
  it("카탈로그 순서를 그대로 유지한다", () => {
    expect(badgeShelf([]).map((b) => b.key)).toEqual(
      BADGE_CATALOG.map((b) => b.key),
    );
  });

  it("획득하지 않은 배지는 earnedAt이 null이다", () => {
    expect(badgeShelf([]).every((b) => b.earnedAt === null)).toBe(true);
  });

  it("획득한 배지에 획득 일시를 채운다", () => {
    const earnedAt = new Date("2026-07-21T10:00:00Z");
    const shelf = badgeShelf([{ badgeKey: "record_beaten_1", earnedAt }]);
    const first = shelf.find((b) => b.key === "record_beaten_1");
    expect(first?.earnedAt).toEqual(earnedAt);
    expect(shelf.find((b) => b.key === "record_beaten_5")?.earnedAt).toBeNull();
  });

  it("카탈로그에 없는 배지 키가 와도 깨지지 않는다", () => {
    const shelf = badgeShelf([
      { badgeKey: "unknown_badge", earnedAt: new Date("2026-07-21T10:00:00Z") },
    ]);
    expect(shelf).toHaveLength(BADGE_CATALOG.length);
    expect(shelf.every((b) => b.earnedAt === null)).toBe(true);
  });

  it("모든 배지에 이모지와 이름이 있다", () => {
    expect(
      badgeShelf([]).every((b) => b.emoji.length > 0 && b.name.length > 0),
    ).toBe(true);
  });
});

describe("earnedBadgeCount", () => {
  it("카탈로그에 있는 배지만 센다", () => {
    const earnedAt = new Date("2026-07-21T10:00:00Z");
    expect(
      earnedBadgeCount([
        { badgeKey: "record_beaten_1", earnedAt },
        { badgeKey: "unknown_badge", earnedAt },
      ]),
    ).toBe(1);
  });

  it("없으면 0", () => {
    expect(earnedBadgeCount([])).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run src/lib/domain/badges.test.ts`
Expected: FAIL — `Failed to resolve import "./badges"`

- [ ] **Step 3: 카탈로그 구현**

`src/lib/domain/badges.ts`를 만든다.

```ts
/**
 * 배지 카탈로그 (설계 2026-07-21).
 *
 * 여기는 **표시용 메타만** 갖는다. 취득 임계값은 SQL(0020의
 * mark_record_beaten)이 단일 원천이다. 양쪽에 규칙을 두면 어긋날 때
 * 조용히 틀리기 때문이다.
 *
 * 배지를 늘릴 땐 이 배열에 한 줄 + 마이그레이션에 취득 규칙 한 줄.
 */
export type BadgeMeta = {
  key: string;
  emoji: string;
  name: string;
  description: string;
};

export const BADGE_CATALOG: readonly BadgeMeta[] = [
  {
    key: "record_beaten_1",
    emoji: "🏅",
    name: "첫 기록 갱신",
    description: "지난 기록을 처음으로 넘었어요",
  },
  {
    key: "record_beaten_5",
    emoji: "💪",
    name: "기록 갱신 5회",
    description: "기록을 5번 갱신했어요",
  },
  {
    key: "record_beaten_10",
    emoji: "🔥",
    name: "기록 갱신 10회",
    description: "기록을 10번 갱신했어요",
  },
] as const;

/** DB에서 읽어온 내 획득 배지 */
export type EarnedBadge = {
  badgeKey: string;
  earnedAt: Date;
};

/** 진열대 한 칸 — earnedAt이 null이면 미획득(잠금) */
export type BadgeShelfItem = BadgeMeta & {
  earnedAt: Date | null;
};

export function badgeShelf(earned: EarnedBadge[]): BadgeShelfItem[] {
  const earnedAtByKey = new Map(earned.map((b) => [b.badgeKey, b.earnedAt]));
  return BADGE_CATALOG.map((meta) => ({
    ...meta,
    earnedAt: earnedAtByKey.get(meta.key) ?? null,
  }));
}

export function earnedBadgeCount(earned: EarnedBadge[]): number {
  const keys = new Set(BADGE_CATALOG.map((meta) => meta.key));
  return earned.filter((badge) => keys.has(badge.badgeKey)).length;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run src/lib/domain/badges.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/badges.ts src/lib/domain/badges.test.ts
git commit -m "feat: badge catalog domain"
```

---

### Task 5: 0020 마이그레이션 작성 (사용자 적용 게이트)

**Files:**
- Create: `supabase/migrations/0020_badges.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/0020_badges.sql`을 만든다.

```sql
-- 0020: 배지 시스템 + 칭찬 CTA 알림
-- 설계: docs/superpowers/specs/2026-07-21-beep-boost-praise-badges-design.md
-- ① user_badges 테이블(본인 select만) ② notifications type에 badge_earned 추가
-- ③ mark_record_beaten 교체 — 칭찬 문구 + 배지 지급 + 본인 배지 알림
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만)

-- ── 획득 배지 (지급은 definer RPC만) ────────────────────────

create table if not exists public.user_badges (
  user_id uuid not null
    references public.profiles (id) on delete cascade,
  badge_key text not null,
  session_id uuid references public.workout_sessions (id) on delete set null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);

alter table public.user_badges enable row level security;
revoke all on public.user_badges from anon, authenticated;
-- select만 준다. insert/update/delete 권한이 없으므로 앱에서 배지를 위조할 수 없고,
-- 지급은 security definer 함수 경로로만 일어난다.
grant select on public.user_badges to authenticated;

drop policy if exists "user_badges_own_select" on public.user_badges;
create policy "user_badges_own_select" on public.user_badges
  for select to authenticated
  using (user_id = auth.uid());

-- ── notifications.type에 badge_earned 추가 (0018과 같은 이름 무관 교체) ──

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.notifications'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%workout_started%';
  if v_conname is not null then
    execute format(
      'alter table public.notifications drop constraint %I',
      v_conname
    );
  end if;
end $$;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'workout_started', 'cheer_received', 'poke', 'reaction_received',
    'rank_change', 'record_viewed', 'morning_briefing',
    'challenge_started', 'challenge_ended', 'record_beaten', 'badge_earned'
  ));

-- ── 기록 갱신 마킹 + 칭찬 알림 + 배지 지급 ──────────────────

create or replace function public.mark_record_beaten(
  p_session_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session workout_sessions%rowtype;
  v_nickname text;
  v_beaten_count int;
  v_tier record;
  v_inserted int;
  v_awarded int := 0;
begin
  select * into v_session
  from workout_sessions
  where id = p_session_id;

  if not found or v_session.user_id <> auth.uid() then
    raise exception 'not_owner';
  end if;
  if v_session.status <> 'completed' or v_session.deleted_at is not null then
    raise exception 'invalid_status';
  end if;
  if v_session.record_note is not null then
    raise exception 'already_marked';
  end if;
  if p_note is null
     or length(trim(p_note)) = 0
     or length(p_note) > 40 then
    raise exception 'invalid_note';
  end if;

  update workout_sessions
  set record_note = p_note
  where id = p_session_id;

  select nickname into v_nickname
  from profiles
  where id = v_session.user_id;

  -- 크루에게 칭찬 요청 알림 (→ 0016 트리거가 푸시 발송)
  insert into notifications (user_id, actor_id, type, reference_id, title, body)
  select distinct
    gm.user_id,
    v_session.user_id,
    'record_beaten',
    p_session_id,
    '🏅 기록 갱신! 칭찬해주세요',
    coalesce(v_nickname, '크루원') || '님이 지난 기록을 넘었어요 — '
      || p_note || '. 칭찬 한마디 남겨주세요! 👏'
  from group_members gm
  where gm.user_id <> v_session.user_id
    and gm.group_id in (
      select group_id
      from group_members
      where user_id = v_session.user_id
    );

  -- 배지 지급 — 임계값은 여기가 단일 원천이다.
  select count(*) into v_beaten_count
  from workout_sessions
  where user_id = v_session.user_id
    and status = 'completed'
    and deleted_at is null
    and record_note is not null;

  for v_tier in
    select t.badge_key, t.threshold
    from (values
      ('record_beaten_1', 1),
      ('record_beaten_5', 5),
      ('record_beaten_10', 10)
    ) as t(badge_key, threshold)
    where v_beaten_count >= t.threshold
  loop
    insert into user_badges (user_id, badge_key, session_id)
    values (v_session.user_id, v_tier.badge_key, p_session_id)
    on conflict (user_id, badge_key) do nothing;

    get diagnostics v_inserted = row_count;
    v_awarded := v_awarded + v_inserted;
  end loop;

  -- 새로 얻은 배지가 있을 때만 본인에게 1건 알린다.
  if v_awarded > 0 then
    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    values (
      v_session.user_id,
      v_session.user_id,
      'badge_earned',
      p_session_id,
      '🏅 배지 획득!',
      '새 배지를 얻었어요 — 기록 탭 달력에서 확인해 보세요'
    );
  end if;
end;
$$;

revoke all on function public.mark_record_beaten(uuid, text) from public, anon;
grant execute on function public.mark_record_beaten(uuid, text) to authenticated;
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/migrations/0020_badges.sql
git commit -m "feat: 0020 badges table, praise notification and badge award"
```

- [ ] **Step 3: 사용자에게 적용 요청 (게이트)**

사용자에게 다음을 그대로 요청하고, 적용 완료 응답을 받기 전에는 Task 8·9를 실행하지 않는다.

> `supabase/migrations/0020_badges.sql` 전체를 Supabase SQL Editor에 붙여넣고 Run 해주세요 (1회만). 0001~0019는 이미 적용돼 있으니 절대 다시 실행하지 마세요.

Task 6·7은 0020 적용 없이도 진행할 수 있다.

---

### Task 6: 배지 알림 푸시 URL 매핑

**Files:**
- Modify: `src/lib/domain/push.ts:8-14`
- Test: `src/lib/domain/push.test.ts:20-34`

- [ ] **Step 1: 실패하는 테스트 케이스 추가**

`src/lib/domain/push.test.ts`의 `it.each` 목록에 한 줄을 추가한다(`["record_beaten", "/feed"],` 바로 다음).

```ts
    ["badge_earned", "/record"],
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run src/lib/domain/push.test.ts`
Expected: FAIL — `badge_earned`가 `/home`으로 매핑됨.

- [ ] **Step 3: 매핑 추가**

`src/lib/domain/push.ts`의 상수를 바꾼다.

```ts
// 알림 유형별 푸시 탭 이동 목적지 (설계 §3)
const PUSH_URL_BY_TYPE: Record<string, string> = {
  reaction_received: "/feed",
  record_beaten: "/feed",
  badge_earned: "/record",
  rank_change: "/challenge",
  challenge_started: "/challenge",
  challenge_ended: "/challenge",
};
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run src/lib/domain/push.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/push.ts src/lib/domain/push.test.ts
git commit -m "feat: route badge earned push to record tab"
```

---

### Task 7: 배지 조회 I/O + 달력 화면 진열대

**Files:**
- Create: `src/lib/badges.ts`
- Create: `src/components/record/badge-shelf.tsx`
- Modify: `src/components/record/calendar-view.tsx` (import · 렌더)

- [ ] **Step 1: 조회 I/O 작성**

`src/lib/badges.ts`를 만든다.

```ts
import type { EarnedBadge } from "@/lib/domain/badges";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** 내 획득 배지 (0020) — RLS가 본인 행만 돌려준다 */
export async function getMyBadges(): Promise<EarnedBadge[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("user_badges")
    .select("badge_key, earned_at")
    .order("earned_at", { ascending: true });
  if (error) throw error;

  type Row = { badge_key: string; earned_at: string };

  return ((data ?? []) as Row[]).map((row) => ({
    badgeKey: row.badge_key,
    earnedAt: new Date(row.earned_at),
  }));
}
```

- [ ] **Step 2: 진열대 컴포넌트 작성**

`src/components/record/badge-shelf.tsx`를 만든다. 시트 마크업은 `exercise-reorder-sheet.tsx`의 패턴을 따른다.

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  badgeShelf,
  earnedBadgeCount,
  type BadgeShelfItem,
  type EarnedBadge,
} from "@/lib/domain/badges";
import { getMyBadges } from "@/lib/badges";

function earnedLabel(earnedAt: Date): string {
  return `${earnedAt.getFullYear()}년 ${earnedAt.getMonth() + 1}월 ${earnedAt.getDate()}일 획득`;
}

/** 달력 화면 배지 진열대 — 미획득은 잠금 표시 (설계 2026-07-21) */
export function BadgeShelf() {
  const [earned, setEarned] = useState<EarnedBadge[] | null>(null);
  const [selected, setSelected] = useState<BadgeShelfItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyBadges()
      .then((list) => {
        if (!cancelled) setEarned(list);
      })
      .catch(() => {
        // 배지 조회 실패가 달력 본체를 막아서는 안 된다 — 영역만 숨긴다.
        if (!cancelled) setEarned(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (earned === null) return null;

  const shelf = badgeShelf(earned);

  return (
    <>
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="mb-2.5 flex items-baseline justify-between">
          <h3 className="text-base font-extrabold">배지</h3>
          <p className="text-[11px] text-muted">
            {earnedBadgeCount(earned)} / {shelf.length}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {shelf.map((badge) => (
            <button
              key={badge.key}
              type="button"
              onClick={() => setSelected(badge)}
              aria-label={`${badge.name}${badge.earnedAt ? " 획득" : " 미획득"}`}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-extrabold ${
                badge.earnedAt
                  ? "border-accent bg-accent-weak text-accent"
                  : "border-line bg-surface-2 text-faint opacity-60"
              }`}
            >
              <span className="text-sm">{badge.earnedAt ? badge.emoji : "🔒"}</span>
              {badge.name}
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setSelected(null)}
            aria-hidden
          />
          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-[22px] border-t border-line bg-surface p-4 pb-8 shadow-card">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <p className="text-center text-3xl">
              {selected.earnedAt ? selected.emoji : "🔒"}
            </p>
            <h3 className="mt-2 text-center text-base font-extrabold">
              {selected.name}
            </h3>
            <p className="mt-1 text-center text-sm text-muted">
              {selected.description}
            </p>
            <p className="mt-2 text-center text-xs text-faint">
              {selected.earnedAt
                ? earnedLabel(selected.earnedAt)
                : "아직 획득하지 못했어요"}
            </p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mt-4 w-full rounded-card border border-line bg-surface-2 py-3 text-sm font-bold"
            >
              닫기
            </button>
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 3: 달력 화면에 붙이기**

`src/components/record/calendar-view.tsx`의 import 목록 마지막(`import { ExercisePicker } from "./exercise-picker";` 바로 앞)에 추가한다.

```ts
import { BadgeShelf } from "./badge-shelf";
```

그리고 월간 요약 `</section>`과 `{/* 달력 그리드 */}` 주석 사이에 한 줄을 넣는다.

```tsx
      </section>

      <BadgeShelf />

      {/* 달력 그리드 */}
```

- [ ] **Step 4: 검증**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 타입 오류 0 · 린트 오류 0 · 전체 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add src/lib/badges.ts src/components/record/badge-shelf.tsx src/components/record/calendar-view.tsx
git commit -m "feat: badge shelf on the calendar screen"
```

---

### Task 8: 실 DB 검증 스크립트 (0020 적용 후)

**전제:** Task 5 Step 3의 0020 적용이 끝났다는 사용자 확인을 받은 뒤에만 실행한다.

**Files:**
- Create: `scripts/badge-test.mjs`

- [ ] **Step 1: 스크립트 작성**

`scripts/badge-test.mjs`를 만든다. 하니스는 `scripts/record-beaten-test.mjs`와 같은 형태이며, 픽스처는 실행마다 고유 닉네임을 쓰고 `finally`에서 크루 → 계정 순으로 정리한다(교훈 13 — 0017 닉네임 유니크 때문에 정리를 빠뜨리면 다음 실행이 깨진다).

```js
// 0020 검증: 배지 지급 — 임계값 도달·중복 방지·위조 차단·본인 알림.
// 실행: node scripts/badge-test.mjs
// 사전조건: 0016·0018·0020이 적용되어 있어야 한다.
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

async function anonUser() {
  const response = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const json = await response.json();
  if (!json.access_token) throw new Error(`익명 가입 실패: ${JSON.stringify(json)}`);
  return { id: json.user.id, token: json.access_token };
}

async function deleteAuthUser(userId) {
  return fetch(`${URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

/** 완료 상태 세션 1개를 만들고 id를 돌려준다 */
async function completedSession(user, groupId) {
  const draft = await api(user.token, "POST", "/rest/v1/workout_sessions", {
    user_id: user.id,
    group_id: groupId,
    timezone: "Asia/Seoul",
  });
  const sessionId = draft.json?.[0]?.id;
  if (!sessionId) throw new Error(`세션 생성 실패: ${JSON.stringify(draft.json)}`);
  await api(user.token, "POST", "/rest/v1/rpc/start_workout", {
    p_session_id: sessionId,
  });
  const done = await api(user.token, "POST", "/rest/v1/rpc/complete_workout", {
    p_session_id: sessionId,
  });
  if (done.status !== 200) throw new Error(`완료 실패: ${JSON.stringify(done.json)}`);
  return sessionId;
}

let userA = null;
let userB = null;
let groupId = null;

try {
  console.log("-- 0020 badge verification --");
  userA = await anonUser();
  userB = await anonUser();

  for (const [user, nick] of [
    [userA, `배지A${RUN}`],
    [userB, `배지B${RUN}`],
  ]) {
    const profile = await api(user.token, "POST", "/rest/v1/profiles", {
      id: user.id,
      nickname: nick,
      avatar_url: "🧔",
      weekly_goal: 3,
    });
    if (profile.status !== 201) {
      throw new Error(`프로필 생성 실패: ${JSON.stringify(profile.json)}`);
    }
  }

  const group = await api(userA.token, "POST", "/rest/v1/rpc/create_group", {
    p_name: `배지크루${RUN}`,
  });
  groupId = group.json?.id;
  if (!groupId) throw new Error(`크루 생성 실패: ${JSON.stringify(group.json)}`);
  const join = await api(userB.token, "POST", "/rest/v1/rpc/join_group_with_code", {
    p_code: group.json.invite_code,
  });
  if (join.status !== 200) throw new Error("크루 참여 실패");

  // ── 1회차 갱신 → record_beaten_1 지급 ──
  const first = await completedSession(userA, groupId);
  const mark1 = await api(userA.token, "POST", "/rest/v1/rpc/mark_record_beaten", {
    p_session_id: first,
    p_note: "볼륨 +10kg",
  });
  check(
    "1회차 마킹 성공",
    mark1.status === 204 || mark1.status === 200,
    JSON.stringify(mark1.json),
  );

  const afterFirst = await api(
    userA.token,
    "GET",
    "/rest/v1/user_badges?select=badge_key",
  );
  check(
    "첫 갱신에 record_beaten_1 지급",
    afterFirst.status === 200 &&
      afterFirst.json?.length === 1 &&
      afterFirst.json[0].badge_key === "record_beaten_1",
    JSON.stringify(afterFirst.json),
  );

  const badgeNotif = await api(
    userA.token,
    "GET",
    "/rest/v1/notifications?type=eq.badge_earned&select=title,body",
  );
  check(
    "본인에게 badge_earned 알림 1건",
    badgeNotif.status === 200 && badgeNotif.json?.length === 1,
    JSON.stringify(badgeNotif.json),
  );

  const praise = await api(
    userB.token,
    "GET",
    `/rest/v1/notifications?type=eq.record_beaten&reference_id=eq.${first}&select=title,body`,
  );
  check(
    "크루원에게 칭찬 요청 알림",
    praise.status === 200 &&
      praise.json?.length === 1 &&
      praise.json[0].title.includes("칭찬해주세요") &&
      praise.json[0].body.includes("칭찬 한마디"),
    JSON.stringify(praise.json),
  );

  // ── 2~4회차: 새 배지 없음 (중복 지급·중복 알림 방지) ──
  for (let i = 2; i <= 4; i++) {
    const sessionId = await completedSession(userA, groupId);
    await api(userA.token, "POST", "/rest/v1/rpc/mark_record_beaten", {
      p_session_id: sessionId,
      p_note: `볼륨 +${i}kg`,
    });
  }

  const afterFour = await api(
    userA.token,
    "GET",
    "/rest/v1/user_badges?select=badge_key",
  );
  check(
    "4회차까지는 배지가 1개 그대로",
    afterFour.json?.length === 1,
    JSON.stringify(afterFour.json),
  );

  const notifAfterFour = await api(
    userA.token,
    "GET",
    "/rest/v1/notifications?type=eq.badge_earned&select=id",
  );
  check(
    "이미 가진 배지는 알림을 다시 보내지 않음",
    notifAfterFour.json?.length === 1,
    JSON.stringify(notifAfterFour.json),
  );

  // ── 5회차 → record_beaten_5 추가 지급 ──
  const fifth = await completedSession(userA, groupId);
  await api(userA.token, "POST", "/rest/v1/rpc/mark_record_beaten", {
    p_session_id: fifth,
    p_note: "볼륨 +50kg",
  });

  const afterFive = await api(
    userA.token,
    "GET",
    "/rest/v1/user_badges?select=badge_key&order=badge_key",
  );
  check(
    "5회차에 record_beaten_5 추가 지급",
    afterFive.json?.length === 2 &&
      afterFive.json.some((b) => b.badge_key === "record_beaten_5"),
    JSON.stringify(afterFive.json),
  );

  // ── 위조·격리 ──
  const forged = await api(userB.token, "POST", "/rest/v1/user_badges", {
    user_id: userB.id,
    badge_key: "record_beaten_10",
  });
  check(
    "직접 insert 차단",
    forged.status >= 400,
    `${forged.status} ${JSON.stringify(forged.json)}`,
  );

  const otherBadges = await api(
    userB.token,
    "GET",
    "/rest/v1/user_badges?select=badge_key",
  );
  check(
    "타인 배지는 보이지 않음",
    otherBadges.status === 200 && otherBadges.json?.length === 0,
    JSON.stringify(otherBadges.json),
  );
} finally {
  if (groupId) {
    await api(SERVICE_KEY, "DELETE", `/rest/v1/groups?id=eq.${groupId}`);
  }
  if (userA) await deleteAuthUser(userA.id);
  if (userB) await deleteAuthUser(userB.id);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: 실행**

Run: `node scripts/badge-test.mjs`
Expected: `9/9 passed`

실패하면 0020이 적용됐는지부터 확인한다(`user_badges` 조회가 404면 미적용).

- [ ] **Step 3: 커밋**

```bash
git add scripts/badge-test.mjs
git commit -m "test: real db badge award verification"
```

---

### Task 9: 기존 기록 갱신 스크립트의 문구 단언 갱신

**Files:**
- Modify: `scripts/record-beaten-test.mjs` (크루 알림 단언)

- [ ] **Step 1: 단언에 칭찬 문구 추가**

`"크루원(B)에게 record_beaten 알림 생성"` check를 바꾼다.

```js
  check(
    "크루원(B)에게 칭찬 요청 알림 생성",
    notifs.status === 200 &&
      notifs.json?.length === 1 &&
      notifs.json[0].body.includes("볼륨 +12.5kg") &&
      notifs.json[0].body.includes("칭찬 한마디") &&
      notifs.json[0].title.includes("칭찬해주세요"),
    JSON.stringify(notifs.json),
  );
```

- [ ] **Step 2: 실행**

Run: `node scripts/record-beaten-test.mjs`
Expected: `8/8 passed`

- [ ] **Step 3: 커밋**

```bash
git add scripts/record-beaten-test.mjs
git commit -m "test: assert praise wording in record beaten notification"
```

---

### Task 10: 전체 게이트 + 기록 갱신

**Files:**
- Modify: `PROGRESS.md` (최상단에 이번 작업 항목 추가)

- [ ] **Step 1: 단위·정적 게이트**

dev 서버가 떠 있으면 먼저 끈다(교훈 8 — 좀비면 `taskkill /PID <pid> /F`).

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: 전체 통과 · 린트 오류 0 · 빌드 성공

- [ ] **Step 2: 실 DB 게이트**

Run:
```bash
node scripts/rls-test.mjs
node scripts/workout-plan-test.mjs
node scripts/challenge-photo-test.mjs
node scripts/briefing-integration-test.mjs
node scripts/push-rls-test.mjs
node scripts/record-beaten-test.mjs
node scripts/badge-test.mjs
```
Expected: 107 · 15/15 · 8/8 · 8/8 · 8/8 · 8/8 · 9/9

- [ ] **Step 3: 실기기 확인 (사용자)**

사용자에게 아래 3가지를 확인해 달라고 요청한다. dev 서버(`pnpm exec next dev -H 0.0.0.0`) 또는 배포 주소 둘 다 가능하되, 푸시는 홈 화면 설치 앱에서만 온다.

1. 음악을 틀어둔 채 웨이트 세트를 완료 → 휴식 5·4·3·2초 삠과 1초 삐임이 음악 너머로 들린다. (아이폰은 벨소리 모드)
2. 같은 종목 구성으로 직전보다 더 많이 한 운동을 완료 → 완료 화면 축하 문구 · 피드 🏅 배지 · 크루원 폰에 "칭찬해주세요" 알림.
3. 기록 탭 달력 상단에 배지 진열대가 보이고, 첫 배지가 잠금(🔒)에서 획득 상태로 바뀐다.

- [ ] **Step 4: PROGRESS.md 갱신**

`PROGRESS.md`의 `# GND 진행 기록` 아래 첫 `##` 섹션 바로 앞에 새 섹션을 추가한다. 실측값(테스트 개수·커밋 해시)은 실행 결과로 채운다.

```markdown
## ✅ 2026-07-21 — 비프음 2배 + 칭찬 알림 + 배지 시스템

- **문서**: 설계 `docs/superpowers/specs/2026-07-21-beep-boost-praise-badges-design.md` · 계획 `docs/superpowers/plans/archive/2026-07-21-beep-boost-praise-badges.md`.
- **비프음**: `BEEP_GAIN` 0.25 → 0.5 (음악에 여전히 묻힌다는 사용자 신고). 사인파 단일 오실레이터라 클리핑 없음.
- **판정 확대**: 복사 예정표뿐 아니라 **종목 구성이 똑같은 내 직전 완료 세션**과 비교한다. `findComparableSession` TDD 8케이스(집합 일치·순서 무관·최근 우선·타바타 제외·자기 자신 제외). 타바타는 세트 실적이 0이라 후보에서 뺀다.
- **칭찬 CTA**: 크루 알림이 `🏅 기록 갱신! 칭찬해주세요` / `…님이 지난 기록을 넘었어요 — {문구}. 칭찬 한마디 남겨주세요! 👏`로 바뀜.
- **배지**: **0020** 적용 ✅ — `user_badges`(본인 select만, 지급은 definer RPC 전용) + `notifications.type`에 `badge_earned` + `mark_record_beaten`이 갱신 횟수 1·5·10 도달 시 배지 지급 후 본인에게 1건 알림. **취득 임계값은 SQL이 단일 원천**이고 `lib/domain/badges.ts`는 표시 메타만 갖는다. 기록 탭 달력 상단 진열대에 미획득은 🔒로 표시.
- **배지 늘리는 법**: `src/lib/domain/badges.ts` 카탈로그에 한 줄 + 새 마이그레이션에 취득 규칙 한 줄.
- **검증**: unit __/__ · typecheck · lint 0 · build · RLS 107 · 예정표 15 · 사진 8 · 브리핑 8 · 푸시 8 · 기록갱신 8 · **배지 9/9** · 실기기 3항목.
```

- [ ] **Step 5: 커밋**

```bash
git add PROGRESS.md
git commit -m "docs: record beep boost, praise notification and badge system"
```

- [ ] **Step 6: 배포 (사용자 승인 후)**

사용자가 배포를 원하면 실행한다.

Run: `pnpm dlx vercel deploy --prod --yes`
Expected: `● Ready` (target production)

확인: `https://gnd-one.vercel.app/record` HTTP 200

---

## 참고 — 이 계획이 손대지 않는 것

- 배지 알림 토글(6번째 알림 설정) · 피드 세션 딥링크 · 종목별 PR 배지 · 배지 공유 이미지 · 크루원 배지 열람
- `0001`~`0019` 마이그레이션 (적용 완료 — 재실행 금지)
- 타바타 음원 파일 (음원 안의 비프음은 이번 범위가 아니다)
