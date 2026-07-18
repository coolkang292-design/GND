# 챌린지 사진 인증 필수 + 레벨 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 챌린지는 사진 인증한 운동만 집계(목표·참여율·레벨 전부)하고, 챌린지 기간 전용 불독 5단계 레벨(주 5일+ → 업, 5일 공백 → 다운)을 표시한다.

**Architecture:** 집계 게이트는 `getPeriodStatsByUser` 한 곳의 PostgREST `workout_images!inner` 조건부 embed로 구현(피드 사진 필터와 동일 패턴). 레벨은 DB 저장 없이 순수 도메인 함수(`domain/level.ts`)가 기간 내 운동일 배열에서 계산 — `PeriodStats.workoutDayKeys`를 새로 노출해 연결한다. DB 변경은 0014(`challenges.photo_required` 컬럼) 하나이고 사용자가 SQL Editor로 수동 적용하는 게이트가 Task 4에 있다.

**Tech Stack:** Next.js App Router + TS strict, Supabase(PostgREST·RLS), Vitest, pnpm. 스펙: `docs/superpowers/specs/2026-07-18-challenge-photo-levels-design.md`

**공통 규칙:** 작업 디렉터리 `C:\Users\SAMSUNG\workout-app`, 브랜치 main. 커밋 메시지는 한국어 + 마지막에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 트레일러. `git add .` 금지 — 파일 명시. `.claude/` 절대 커밋 금지. 커밋 메시지에 큰따옴표 금지(PS 5.1 파싱 이슈 — Bash 툴로 커밋할 것).

---

### Task 1: 레벨 도메인 함수 (TDD)

**Files:**
- Create: `src/lib/domain/level.ts`
- Test: `src/lib/domain/level.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/lib/domain/level.test.ts` 전체:

```ts
import { describe, expect, it } from "vitest";
import { LEVEL_NAMES, challengeLevel, levelLabel } from "./level";

const START = "2026-07-01"; // 7일 블록: 01~07 / 08~14 / 15~21 / 22~28
const END = "2026-07-28";

const addDaysForTest = (key: string, n: number): string => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

describe("levelLabel", () => {
  it("이름 5개와 라벨 형식", () => {
    expect(LEVEL_NAMES).toHaveLength(5);
    expect(levelLabel(1)).toBe("Lv.1 잠만보 불독");
    expect(levelLabel(5)).toBe("Lv.5 개노답 탈출");
  });
  it("범위 밖은 클램프", () => {
    expect(levelLabel(0)).toBe("Lv.1 잠만보 불독");
    expect(levelLabel(9)).toBe("Lv.5 개노답 탈출");
  });
});

describe("challengeLevel — 7일 블록 5일+ 업 / 5일 공백 다운 (스펙 §4.1)", () => {
  it("운동 없음 → Lv.1", () => {
    expect(challengeLevel([], START, END, "2026-07-10")).toBe(1);
  });
  it("첫 블록 5일 → Lv.2", () => {
    expect(
      challengeLevel(
        ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"],
        START, END, "2026-07-06",
      ),
    ).toBe(2);
  });
  it("블록 4일이면 업 없음", () => {
    expect(
      challengeLevel(
        ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"],
        START, END, "2026-07-07",
      ),
    ).toBe(1);
  });
  it("블록당 최대 1회 — 7일 전부 운동해도 +1", () => {
    expect(
      challengeLevel(
        ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05", "2026-07-06", "2026-07-07"],
        START, END, "2026-07-08",
      ),
    ).toBe(2);
  });
  it("블록 경계에 걸친 4+1일은 업 없음 (공백도 5일 미만이라 다운 없음)", () => {
    expect(
      challengeLevel(
        ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-08"],
        START, END, "2026-07-09",
      ),
    ).toBe(1);
  });
  it("5개 블록 전부 5일 → Lv.5 캡 (1+5=6이 아니라 5)", () => {
    const keys: string[] = [];
    for (let b = 0; b < 5; b++)
      for (let d = 0; d < 5; d++) keys.push(addDaysForTest("2026-07-01", b * 7 + d));
    expect(challengeLevel(keys, "2026-07-01", "2026-08-04", "2026-08-04")).toBe(5);
  });
  it("업 후 5일 공백 → 다운", () => {
    expect(
      challengeLevel(
        ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"],
        START, END, "2026-07-10", // 마지막 운동 07-05로부터 5일 경과
      ),
    ).toBe(1);
  });
  it("Lv.1에서 공백은 그대로 (floor)", () => {
    expect(challengeLevel(["2026-07-01"], START, END, "2026-07-06")).toBe(1);
  });
  it("시작~첫 운동 사이 공백은 다운 미적용", () => {
    expect(challengeLevel(["2026-07-10"], START, END, "2026-07-10")).toBe(1);
  });
  it("잘린 마지막 블록(3일)에선 5일 불가 → 업 없음", () => {
    expect(
      challengeLevel(
        ["2026-07-08", "2026-07-09", "2026-07-10"],
        "2026-07-01", "2026-07-10", "2026-07-10",
      ),
    ).toBe(1);
  });
  it("종료 후엔 endDate 기준 고정 — 종료 뒤 공백은 다운 아님", () => {
    expect(
      challengeLevel(
        ["2026-07-24", "2026-07-25", "2026-07-26", "2026-07-27", "2026-07-28"],
        START, END, "2026-08-20",
      ),
    ).toBe(2);
  });
  it("다운 후 다른 블록에서 5일 채우면 다시 업 (2→1→2)", () => {
    expect(
      challengeLevel(
        [
          "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05", // 블록1 5일 → 2
          // 05→10 공백 5일 → 1
          "2026-07-10", "2026-07-11", "2026-07-12", "2026-07-13", "2026-07-14", // 블록2 5일 → 2
        ],
        START, END, "2026-07-14",
      ),
    ).toBe(2);
  });
  it("시작 전이면 Lv.1", () => {
    expect(challengeLevel([], START, END, "2026-06-30")).toBe(1);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/domain/level.test.ts`
Expected: FAIL — `Cannot find module './level'`

- [ ] **Step 3: 구현** — `src/lib/domain/level.ts` 전체:

```ts
/**
 * 챌린지 레벨 도메인 순수 함수 (스펙 §4).
 * 챌린지 기간 전용: 시작 시 Lv.1, 시작일 기준 7일 블록에 5일+ 운동 → +1(블록당 1회),
 * 운동일 간격 5일+(스트릭 소멸 규칙 재사용) → -1. 범위 1~5, 표시 전용(순위 점수 무관).
 */

import { STREAK_EXPIRY_DAYS } from "./streak";

export const LEVEL_MIN = 1;
export const LEVEL_MAX = 5;
/** 블록(7일) 안에서 레벨업에 필요한 운동일 수 */
export const LEVEL_UP_DAYS = 5;

export const LEVEL_NAMES = [
  "잠만보 불독",
  "산책 시작",
  "쇠질 입문",
  "근육 불독",
  "개노답 탈출",
] as const;

const clamp = (n: number) => Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, n));

/** "Lv.3 쇠질 입문" (범위 밖 입력은 클램프) */
export function levelLabel(level: number): string {
  const lv = clamp(level);
  return `Lv.${lv} ${LEVEL_NAMES[lv - 1]}`;
}

/** "YYYY-MM-DD" 두 날짜의 달력 일수 차이 (to - from) */
function daysBetween(fromKey: string, toKey: string): number {
  const toUtc = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(toKey) - toUtc(fromKey)) / 86_400_000);
}

function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * 챌린지 기간 내 운동일들로 현재 레벨 계산.
 * 이벤트(업/다운)를 날짜순으로 적용하며 매 단계 1~5로 클램프한다.
 * todayKey가 endDate를 지나면 endDate 기준으로 고정(시상대 최종 레벨).
 */
export function challengeLevel(
  dayKeys: string[],
  startDate: string,
  endDate: string,
  todayKey: string,
): number {
  if (todayKey < startDate) return LEVEL_MIN;
  const effectiveEnd = todayKey < endDate ? todayKey : endDate;

  const keys = [...new Set(dayKeys)]
    .filter((k) => k >= startDate && k <= effectiveEnd)
    .sort();

  // order: 같은 날짜에선 다운(공백 만료)이 복귀 운동의 업보다 시간상 선행
  type Ev = { day: string; delta: 1 | -1; order: 0 | 1 };
  const events: Ev[] = [];

  // 레벨업: 블록별 5번째 운동일 (블록당 최대 1회)
  const counts = new Map<number, number>();
  for (const k of keys) {
    const block = Math.floor(daysBetween(startDate, k) / 7);
    const n = (counts.get(block) ?? 0) + 1;
    counts.set(block, n);
    if (n === LEVEL_UP_DAYS) events.push({ day: k, delta: 1, order: 1 });
  }

  // 레벨다운: 운동일 사이 공백 + 마지막 운동일~기준일 공백 (각 1회)
  for (let i = 1; i < keys.length; i++) {
    if (daysBetween(keys[i - 1], keys[i]) >= STREAK_EXPIRY_DAYS) {
      events.push({
        day: addDays(keys[i - 1], STREAK_EXPIRY_DAYS),
        delta: -1,
        order: 0,
      });
    }
  }
  const last = keys.at(-1);
  if (last && daysBetween(last, effectiveEnd) >= STREAK_EXPIRY_DAYS) {
    events.push({ day: addDays(last, STREAK_EXPIRY_DAYS), delta: -1, order: 0 });
  }

  events.sort((a, b) =>
    a.day < b.day ? -1 : a.day > b.day ? 1 : a.order - b.order,
  );

  let level = LEVEL_MIN;
  for (const e of events) {
    if (e.day > effectiveEnd) break;
    level = clamp(level + e.delta);
  }
  return level;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/lib/domain/level.test.ts`
Expected: 15 passed

- [ ] **Step 5: 회귀·정적 검사**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint 0 errors(기존 scripts 경고 1건 무관) · typecheck 통과 · 165 passed (150+15)

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/level.ts src/lib/domain/level.test.ts
git commit -m "기능: 챌린지 레벨 도메인 — 7일 블록 5일+ 업·5일 공백 다운 (TDD 15케이스)"
```

---

### Task 2: PeriodStats.workoutDayKeys 노출 + EMPTY_STATS 중복 제거

**Files:**
- Modify: `src/lib/challenge.ts` (PeriodStats·EMPTY_STATS·foldPeriodStats)
- Modify: `src/app/(tabs)/challenge/page.tsx:40-50` (로컬 EMPTY_STATS 제거)
- Test: `src/lib/challenge.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가** — `src/lib/challenge.test.ts`에 append (import에 `foldPeriodStats`, `type PeriodSessionRow`가 없으면 추가):

```ts
describe("foldPeriodStats — workoutDayKeys (레벨 재료)", () => {
  const row = (userId: string, completedAt: string): PeriodSessionRow => ({
    userId,
    completedAt,
    exercises: [],
  });

  it("기간 내 운동일을 오름차순 dayKey 배열로 노출한다 (중복 세션은 1일)", () => {
    const stats = foldPeriodStats(
      [
        row("u1", "2026-07-03T10:00:00+09:00"),
        row("u1", "2026-07-01T09:00:00+09:00"),
        row("u1", "2026-07-01T20:00:00+09:00"), // 같은 날 중복 세션
        row("u1", "2026-06-30T10:00:00+09:00"), // 기간 밖 → 제외
      ],
      "2026-07-01",
      "2026-07-28",
      "Asia/Seoul",
    );
    expect(stats.get("u1")!.workoutDayKeys).toEqual(["2026-07-01", "2026-07-03"]);
    expect(stats.get("u1")!.workoutDays).toBe(2);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/challenge.test.ts`
Expected: FAIL — `workoutDayKeys` 타입/값 없음

- [ ] **Step 3: 구현** — `src/lib/challenge.ts` 세 곳:

① `PeriodStats` 타입에 필드 추가 (`workoutDays` 아래):

```ts
  workoutDays: number; // 아무 운동이든 한 날 수 (참여율용)
  /** 기간 내 운동일 dayKey 오름차순 — 챌린지 레벨 계산 재료 */
  workoutDayKeys: string[];
```

② `EMPTY_STATS`를 export로 바꾸고 필드 추가:

```ts
export const EMPTY_STATS: PeriodStats = {
  workoutDays: 0,
  workoutDayKeys: [],
  ...(이하 기존 필드 그대로)
};
```

③ `foldPeriodStats` 결과 조립부(`result.set(userId, {...})`)에 추가:

```ts
      workoutDays: e.days.size,
      workoutDayKeys: [...e.days].sort(),
```

- [ ] **Step 4: page.tsx 중복 제거** — `src/app/(tabs)/challenge/page.tsx` 상단의 로컬 `const EMPTY_STATS: PeriodStats = {...}` 블록(40~50행)을 삭제하고, 기존 `@/lib/challenge` import 목록에 `EMPTY_STATS`를 추가한다. `type PeriodStats` import는 유지.

- [ ] **Step 5: 통과·회귀 확인**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 통과 — 166 passed. typecheck가 다른 EMPTY_STATS류 픽스처 누락을 잡으면(예: 테스트 픽스처의 PeriodStats 리터럴) 해당 객체에 `workoutDayKeys: []`만 추가.

- [ ] **Step 6: Commit**

```bash
git add src/lib/challenge.ts src/lib/challenge.test.ts "src/app/(tabs)/challenge/page.tsx"
git commit -m "기능: PeriodStats.workoutDayKeys 노출 + EMPTY_STATS 단일화 — 레벨 계산 재료"
```

---

### Task 3: photo_required 타입·생성·집계 게이트

**Files:**
- Modify: `src/lib/types.ts` (Challenge)
- Modify: `src/lib/challenge.ts` (createChallenge·getPeriodStatsByUser·getActiveChallengeRanking)
- Modify: `src/app/(tabs)/challenge/page.tsx` (stats 로드 호출부)

⚠️ 이 태스크의 코드는 **0014 적용 전에도 컴파일·기존 동작에 안전**하다: 기존 챌린지 행엔 컬럼이 없어 `ch.photo_required`가 `undefined` → 파라미터 기본값 `false`로 동작. 단 **챌린지 생성 실행(런타임)은 Task 4의 0014 적용 후에만** 가능(insert에 새 컬럼 포함).

- [ ] **Step 1: 타입** — `src/lib/types.ts`의 `Challenge`에 추가 (`status` 위):

```ts
  /** 사진 인증한 운동만 집계 (0014) — 새 챌린지는 항상 true */
  photo_required: boolean;
```

- [ ] **Step 2: 생성** — `src/lib/challenge.ts` `createChallenge`의 insert 객체에 추가:

```ts
      end_date: input.endDate,
      photo_required: true, // 스펙 §3.2 — 새 챌린지는 전부 사진 인증 필수
```

- [ ] **Step 3: 집계 게이트** — `getPeriodStatsByUser` 시그니처에 `photoRequired = false` 추가하고 select를 조건부로:

```ts
export async function getPeriodStatsByUser(
  groupId: string,
  startDate: string,
  endDate: string,
  timeZone: string,
  photoRequired = false,
): Promise<Map<string, PeriodStats>> {
```

기존 `.select("user_id, completed_at, workout_exercises(...)")` 호출을 다음으로 교체:

```ts
  // photoRequired: workout_images!inner = 사진 인증 세션만 서버에서 필터
  // (세션당 1장 unique(0005)라 조인 중복 없음 — 피드 사진 필터와 동일 패턴, 스펙 §3.3)
  const select =
    "user_id, completed_at, workout_exercises(exercise_type, exercise_name, body_part, workout_sets(weight_kg, reps, distance_meters, duration_seconds, is_completed))" +
    (photoRequired ? ", workout_images!inner(image_path)" : "");

  const { data, error } = await supabase
    .from("workout_sessions")
    .select(select)
```

`DbRow` 타입·매핑은 변경 없음(추가 embed는 매핑에서 무시됨).

- [ ] **Step 4: 호출부 2곳** —

`src/lib/challenge.ts` `getActiveChallengeRanking`:

```ts
    getPeriodStatsByUser(groupId, ch.start_date, ch.end_date, DEFAULT_TIMEZONE, ch.photo_required),
```

`src/app/(tabs)/challenge/page.tsx` (현재 164행 부근):

```ts
          setStats(
            await getPeriodStatsByUser(g.id, ch.start_date, ch.end_date, tz, ch.photo_required),
          );
```

- [ ] **Step 5: 검증**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 통과 (166 passed — 이 태스크는 신규 단위 테스트 없음, 게이트 동작은 Task 4 실 DB 스크립트가 검증)

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/challenge.ts "src/app/(tabs)/challenge/page.tsx"
git commit -m "기능: challenges.photo_required 게이트 — 사진 세션만 집계 (호출부 전달 포함)"
```

---

### Task 4: 0014 마이그레이션 + 실 DB 검증 (사용자 게이트 포함)

**Files:**
- Create: `supabase/migrations/0014_challenge_photo_required.sql`
- Create: `scripts/challenge-photo-test.mjs`

**PART 1 — 파일 작성 후 정지:**

- [ ] **Step 1: 마이그레이션 파일** — `supabase/migrations/0014_challenge_photo_required.sql`:

```sql
-- ============================================================
-- 0014: challenges.photo_required — 새 챌린지 사진 인증 필수
-- 설계: docs/superpowers/specs/2026-07-18-challenge-photo-levels-design.md
-- 실행: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run (1회)
-- ============================================================
-- 기존 챌린지 = false(기존 규칙 유지). 새 챌린지는 앱이 true로 insert.
-- RLS·함수 변경 없음: finalize_challenge는 점수를 계산하지 않는다.
alter table public.challenges
  add column if not exists photo_required boolean not null default false;
```

- [ ] **Step 2: 실 DB 검증 스크립트** — `scripts/challenge-photo-test.mjs` 작성. `scripts/rls-test.mjs`의 기존 인프라(익명 유저 생성·크루 픽스처·정리 패턴)를 읽고 같은 방식으로 작성한다. 검증 케이스 4개:

1. **컬럼 존재·기본값**: 익명 유저가 크루 생성 → `challenges` insert(photo_required 미지정) → select 시 `photo_required === false`
2. **true insert**: `photo_required: true`로 insert한 챌린지가 select에서 `true`
3. **필터 동작**: 완료 세션 A(사진 없음)·B(사진 있음 — `workout_images`에 `session_id`+`image_path` insert) 생성 후, `workout_images!inner(image_path)` embed 포함 조회 → **B만 반환**, embed 없는 조회 → A·B 모두 반환
4. **집계 등가성**: 같은 조회를 `getPeriodStatsByUser`가 쓰는 select 문자열(Task 3의 것과 동일)로 실행해 photoRequired on/off의 행 수가 3번과 일치

출력 형식은 rls-test.mjs와 동일한 통과/실패 카운트(`✅ n/4`). 실패 시 exit 1.

- [ ] **Step 3: PART 1 Commit**

```bash
git add supabase/migrations/0014_challenge_photo_required.sql scripts/challenge-photo-test.mjs
git commit -m "DB: 0014 challenges.photo_required + 실 DB 검증 스크립트"
```

- [ ] **Step 4: 🛑 사용자 게이트** — 여기서 정지하고 컨트롤러에 보고. 사용자가 0014를 Supabase SQL Editor에 적용하고 "적용 완료"를 확인해줄 때까지 PART 2 진행 금지.

**PART 2 — 적용 확인 후:**

- [ ] **Step 5: 실 DB 검증 실행**

Run: `node scripts/challenge-photo-test.mjs`
Expected: 4/4 passed

- [ ] **Step 6: RLS 회귀**

Run: `node scripts/rls-test.mjs`
Expected: 107/107 (0014는 additive라 기존 정책 무영향 확인)

- [ ] **Step 7: 수정이 생겼으면 Commit** (스크립트 수정 없이 통과했으면 생략)

```bash
git add scripts/challenge-photo-test.mjs
git commit -m "검증: 0014 적용 확인 — photo_required 필터 4케이스 실 DB 통과"
```

---

### Task 5: 사진 필수 UI — 챌린지 헤더 배지 + 생성 시트 안내

**Files:**
- Modify: `src/app/(tabs)/challenge/page.tsx` (헤더)
- Modify: `src/components/challenge/setup-sheet.tsx` (create 모드 안내)

- [ ] **Step 1: 헤더 배지** — `page.tsx` header의 기간 `<p>` 바로 아래에 추가:

```tsx
        {challenge?.photo_required && (
          <span className="mt-1.5 inline-block rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-bold text-accent">
            📷 사진 인증 필수 — 사진 없는 운동은 집계되지 않아요
          </span>
        )}
```

- [ ] **Step 2: 생성 시트 안내** — `setup-sheet.tsx`에서 `mode`를 이미 prop으로 받고 있는지 확인 후, 시트 본문 최상단(타이틀 아래 첫 요소)에 추가:

```tsx
      {mode === "create" && (
        <p className="rounded-card-sm bg-accent/10 px-3 py-2 text-[11.5px] font-bold text-accent">
          📷 이 챌린지는 사진 인증한 운동만 집계돼요
        </p>
      )}
```

(새 챌린지는 전부 필수이므로 create 모드에 조건 없이 고정 표시 — 스펙 §3.4)

- [ ] **Step 3: 검증**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 통과

브라우저(`pnpm dev`): 챌린지 탭 — 기존 챌린지(photo_required=false)에는 배지가 **없어야** 함. [＋ 새 챌린지 만들기] 시트에 안내 문구 표시.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(tabs)/challenge/page.tsx" src/components/challenge/setup-sheet.tsx
git commit -m "UI: 사진 인증 필수 배지(챌린지 헤더) + 생성 시트 안내 문구"
```

---

### Task 6: 레벨 표시 UI — active 내 레벨 + 시상대 최종 레벨

**Files:**
- Modify: `src/app/(tabs)/challenge/page.tsx`

- [ ] **Step 1: 레벨 계산 헬퍼** — `page.tsx`에 import 추가:

```ts
import { challengeLevel, levelLabel } from "@/lib/domain/level";
```

`ChallengeScreen` 본문, `participantInputs` 계산 아래에 추가:

```ts
  // 챌린지 레벨 (스펙 §4) — 표시 전용, 순위 점수와 무관
  const levelOf = (uid: string): number =>
    challenge
      ? challengeLevel(
          stats?.get(uid)?.workoutDayKeys ?? [],
          challenge.start_date,
          challenge.end_date,
          todayKey,
        )
      : 1;
```

- [ ] **Step 2: active 히어로 카드 — 내 레벨만** (🔒 기간 중 타인 비공개 정책 준수). 히어로 카드의 `<p className="text-xs font-bold opacity-80">{challenge.name}</p>`를 다음으로 교체:

```tsx
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold opacity-80">{challenge.name}</p>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-extrabold">
                {levelLabel(levelOf(userId))}
              </span>
            </div>
```

- [ ] **Step 3: 시상대(ResultView) — 전원 최종 레벨**. `ResultView` props에 `levelOf: (id: string) => number` 추가, 호출부는:

```tsx
        <ResultView
          participants={participantInputs}
          goals={goals}
          profileOf={profileOf}
          myUserId={userId}
          levelOf={levelOf}
        />
```

상세 순위 카드의 닉네임 줄에서 `gndLabel` 스팬 뒤에 추가:

```tsx
                  <span className="ml-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted">
                    {levelLabel(levelOf(r.userId))}
                  </span>
```

- [ ] **Step 4: 검증**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 통과

브라우저: active 챌린지가 있으면 히어로 카드 우상단에 `Lv.N ...` 뱃지. (기존 챌린지는 photo_required=false라 레벨도 전체 세션 기준으로 계산됨 — 정상)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(tabs)/challenge/page.tsx"
git commit -m "UI: 챌린지 레벨 표시 — active 내 레벨 뱃지·시상대 최종 레벨"
```

---

### Task 7: 전체 검증 → 배포 → PROGRESS.md

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 전체 검증** (dev 서버 종료 상태)

```bash
pnpm test          # 기대: 166 passed
pnpm lint && pnpm typecheck
pnpm build
node scripts/rls-test.mjs                  # 기대: 107/107
node scripts/briefing-integration-test.mjs # 기대: 8/8
node scripts/challenge-photo-test.mjs      # 기대: 4/4
```

- [ ] **Step 2: 프로덕션 배포**

```bash
pnpm dlx vercel deploy --prod --yes
```

Expected: READY, https://gnd-one.vercel.app 접근 시 307→/home 200

- [ ] **Step 3: PROGRESS.md 갱신 + 최종 커밋** — ⚠️ 섹션 "다음 작업"에 완료 반영(챌린지 사진 인증·레벨 완료, 다음 = 핵심 E2E → 3명 4주 실사용), 적용 마이그레이션 0001~**0014**, 검증 기준선(unit 166 · RLS 107 · briefing 8/8 · challenge-photo 4/4), 산출물 목록에 기능 2종 추가. 폰 확인 대기 항목: ① 새 챌린지 생성 시 📷 안내·배지 ② active 히어로 내 레벨 뱃지 ③ 사진 없는 운동이 새 챌린지 집계에서 빠지는지.

```bash
git add PROGRESS.md
git commit -m "문서: 챌린지 사진 인증 필수·레벨 시스템 완료 기록 — DB 0014 적용"
```

---

## Self-Review 결과 (계획 작성 후 점검)

- **스펙 커버리지**: §3.1→T4, §3.2→T3, §3.3→T3+T4, §3.4→T5, §4.1→T1, §4.2→T2+T6, §4.3→T6, §5→T1·T2·T4·T7, §6 게이트→T4 PART 구조, §7 비범위 반영 ✓
- **타입 일관성**: `workoutDayKeys`(T2 정의→T6 사용), `photo_required`(T3 정의→T4·T5 사용), `challengeLevel(dayKeys, start, end, todayKey)`(T1 정의→T6 호출) ✓
- **주의**: 테스트 수 기대치(165/166)는 실측 우선 — 개수가 다르면 실측값으로 보고하되 실패가 없어야 함.
