# 인터벌 뒤 이어하기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 인터벌 계획의 앞 4개는 음원 인터벌로, 5번째부터는 음원이 끝난 뒤 **같은 세션**에서 일반 종목으로 이어서 하게 한다. 기록은 1개다.

**Architecture:** "인터벌 블록 = 앞 4개" 규칙을 `src/lib/domain/tabata.ts`의 순수 함수에만 둔다. 기록 화면은 계획의 뒤 종목을 인터벌 시트에 실어 draft 뒤에 붙인다. 음원이 끝나면 블록만 완료로 표시하고, 세트 간 휴식과 같은 `startRest`를 한 번 부른 뒤 기존 운동중 화면으로 넘어간다. 지난 기록 조회 두 곳은 인터벌 세션을 **따로** 조회해 블록 행만 뺀다. 서버 함수와 권한은 바꾸지 않는다.

**Tech Stack:** Next.js (App Router) · React · TypeScript · Supabase(PostgREST) · Vitest + Testing Library · pnpm

**설계:** `docs/superpowers/specs/2026-09-29-interval-follow-up-design.md`

**⚠️ 커밋 규칙 (사용자 전역 지침):** 검증 → **개발 서버 화면 확인** → 커밋 순서다. 이 계획은 태스크마다 커밋하지 않는다. Task 10에서 **확인이 끝난 파일만 지정해** 한 번 커밋한다(`git add .` 금지).

**실행 중 달라진 것 (2026-09-29):**
- Task 7: 로컬 타입 이름을 `SessionRow` → `RecentSessionRow`로 바꿨다. `supabase-deps.ts`가 이미 `SessionRow`를 import한다.
- Task 10에서 추가: 개발 서버에서 AI 코치가 섞인 세션의 인터벌 종목을 일반 세트로 분석했다("푸시업 30회 → 2회, 크게 줄었다"). `tabata.ts`에 `coachSessionRows`(테스트 3건)를 더하고 `readSessionExercises`에 연결했다. 설계 §6·§10을 고쳤다.

**⚠️ 줄 번호를 믿지 마라:** `page.tsx`는 4,000줄이 넘고 같은 날 다른 작업이 커밋한 적이 있다. 자리는 **함수 이름과 아래에 인용한 기존 코드**로 찾는다.

---

## 파일 구조

| 파일 | 책임 | 변경 |
|---|---|---|
| `src/lib/domain/tabata.ts` | 인터벌 규칙의 **유일한** 자리 | 함수 9개와 문구 추가, `tabataResumeFromSession`이 앞 4개만 보게 |
| `src/lib/domain/tabata.test.ts` | 위 규칙 테스트 | 추가 |
| `src/components/record/tabata-sheet.tsx` | 인터벌 준비 화면 | `followUpNames` 표시 |
| `src/components/record/tabata-sheet.test.tsx` | 〃 | 추가 |
| `src/app/(tabs)/record/page.tsx` | 기록 화면 배선 | 계획 → 시트 → draft, 음원 종료 분기, 무동작 조건, 블록 잠금, 기록 갱신 제외, 배너 |
| `src/components/record/calendar-view.tsx` | 달력 | 계획 카드 표시, 편집할 때 이어하기 보존, 시트에 이어하기 전달 |
| `src/components/record/calendar-view.test.tsx` | 〃 | 추가 |
| `src/lib/workout.ts` | `getPreviousExerciseRecords` | 인터벌 세션을 따로 조회, 블록 행 제외 |
| `src/lib/ai-coach/supabase-deps.ts` | AI 코치 `readHistory` | 같은 규칙 |
| `supabase/migrations/0113_interval_plan_contract_comment.sql` | 스키마 설명 | 새 파일 (comment만) |
| `docs/chatgpt-plan-rules.md` | ChatGPT 작성 규칙 | 새 파일 |
| `docs/superpowers/specs/2026-09-29-interval-follow-up-design.md` | 설계 | §6·§7 정정 |
| `src/lib/domain/release-notes.data.json` | 새 소식 | 한 항목 추가 (발송 안 함) |

---

### Task 1: 설계 정정 — DB 규칙 제외, 조회를 둘로 나눔

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-interval-follow-up-design.md` (§6 지난 기록 조회 문단, §7 전체)

- [ ] **Step 1: §6 표 아래 "지난 기록 조회 제한(20·40세션)은 그대로 둔다…" 문단을 바꾼다**

기존:
```markdown
지난 기록 조회 제한(20·40세션)은 그대로 둔다. 인터벌 세션이 제한 안에 들어오지만, 주 7회 기준
3주치라 주간 루틴의 종목은 모두 잡힌다.
```
새로:
```markdown
지난 기록 조회는 **일반 세션과 인터벌 세션을 따로** 가져온다(각각 20·40세션 한도). 한 조회로
합치면 인터벌 세션이 한도를 먹는다. 예: 주 7회(인터벌 4 + 웨이트 3)면 AI 코치의 40세션이
8주가 아니라 약 5.7주에서 찬다. 따로 가져오면 **일반 세션 조회 결과는 지금과 한 줄도 같고**,
인터벌 세션에서는 4번 이후 행만 쓴다. 뒤 종목이 없는 순수 인터벌 세션은 아무 행도 남지 않아
AI 코치 입력에서 빠진다(지금과 같음).
```

- [ ] **Step 2: §7 전체를 바꾼다**

기존 §7(`## 7. DB — 0113 (사용자 Run)`부터 `## 8.` 직전까지)을 아래로 바꾼다:
````markdown
## 7. DB — 0113 (사용자 Run) — **열 설명만** 바꾼다

```sql
comment on column public.workout_plans.tabata_minutes is
  '인터벌(음원) 코스 분수 4|8|16. null이면 일반 계획. 값이 있으면 exercises 앞 4개가 '
  '인터벌 종목(각 1세트, 맨몸, 20초 운동/10초 휴식으로 번갈아 돈다)이고, 5번째부터는 '
  '인터벌이 끝난 뒤 같은 세션에서 이어서 하는 일반 종목이다. 인터벌 전에 할 운동은 '
  '같은 날 별도 계획(더 이른 scheduled_at)으로 넣는다. 종목 이름은 exercise_catalog에 '
  '있는 이름을 쓴다(docs/chatgpt-plan-rules.md).';
```

⚠️ 설계를 확정할 때 넣었던 `CHECK (tabata_minutes is null or jsonb_array_length(exercises) >= 4)`는
**구현 계획 조사에서 뺐다** (2026-09-29):

1. 앱의 "지난 인터벌 기록 → 계획 복사"(`handleScheduleFromPast`)는 지워진 커스텀 종목이 있으면
   1~3개짜리 인터벌 계획을 저장한다(`picked.length === 0`일 때만 막는다). 제약이 이 경로를 저장 실패로 바꾼다.
2. `scripts/workout-plan-test.mjs`가 1종목짜리 인터벌 계획을 저장해 코스 분수를 검사한다.
3. 얻는 것이 없다. 1~3개짜리는 시트가 빈칸(3/4)으로 열어 채우게 한다. "앞 4개가 인터벌인가"는
   어차피 DB가 판정할 수 없다.

그래서 0113은 **열 설명만** 바꾼다. 데이터·제약·권한은 그대로이고, 배포 전후 아무 때나 Run해도 된다.
````

- [ ] **Step 3: 검토** — 문서에 `CHECK`가 "뺐다"는 맥락으로만 남았는지 확인한다.

Run: `grep -n "CHECK\|>= 4" docs/superpowers/specs/2026-09-29-interval-follow-up-design.md`
Expected: §7 안의 "뺐다" 문단에만 나온다.

---

### Task 2: 도메인 규칙 — `tabata.ts`

**Files:**
- Modify: `src/lib/domain/tabata.ts`
- Test: `src/lib/domain/tabata.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/domain/tabata.test.ts` 맨 위 import를 이렇게 바꾼다:
```ts
import { describe, expect, it } from "vitest";
import type { CatalogExercise } from "@/lib/types";
import type { LocalExercise } from "@/lib/workout";

import {
  INTERVAL_COPY,
  TABATA_EXERCISE_COUNT,
  TABATA_ROUND_SECONDS,
  TABATA_TRACKS,
  asTabataMinutes,
  completeIntervalBlock,
  hasIntervalFollowUps,
  intervalBlockNames,
  intervalBlockPending,
  intervalPlanLine,
  isIntervalBlockExercise,
  isIntervalBlockIndex,
  mergeRecentSessions,
  splitIntervalPlan,
  tabataDraftExercises,
  tabataResumeFromSession,
  tabataPickFromNames,
  tabataRepsForMinutes,
  tabataTrackForMinutes,
  withoutIntervalBlock,
} from "./tabata";
```

파일 끝에 붙인다(`catalogItem`은 이 파일 위쪽에 이미 있다):
```ts
/**
 * 인터벌 뒤 이어하기 (설계 2026-09-29 §4) — "인터벌 블록 = 앞 4개".
 *
 * 계획은 ChatGPT가 DB에 직접 쓴다. 예전에는 목록 **전체**에서 카탈로그에 있는
 * 이름 4개를 골라서, 수요일 계획은 `Scapular Push-up Plus`(카탈로그에 없음)
 * 대신 8번째 `YTW`(덤벨)가 인터벌에 끼어들었다.
 */
function localExercise(name: string, done: boolean[]): LocalExercise {
  return {
    key: `k-${name}`,
    name,
    bodyPart: "코어",
    exerciseType: "bodyweight",
    measure: "reps",
    isCustom: false,
    sets: done.map((d, i) => ({
      key: `s-${name}-${i}`,
      weightKg: 0,
      reps: 4,
      distanceKm: 0,
      durationMin: 0,
      done: d,
    })),
  } as LocalExercise;
}

describe("인터벌 블록 = 앞 4개 (2026-09-29)", () => {
  it("계획을 인터벌 4개와 이어하기로 가른다", () => {
    const names = ["리버스 런지", "Scapular Push-up Plus", "마운틴 클라이머", "점핑잭", "흉추 익스텐션", "YTW"];
    expect(splitIntervalPlan(names)).toEqual({
      block: ["리버스 런지", "Scapular Push-up Plus", "마운틴 클라이머", "점핑잭"],
      followUps: ["흉추 익스텐션", "YTW"],
    });
    expect(splitIntervalPlan(names.slice(0, 4)).followUps).toEqual([]);
    expect(splitIntervalPlan(names.slice(0, 3))).toEqual({ block: names.slice(0, 3), followUps: [] });
  });

  it("카탈로그 대조는 앞 4개 이름만 — 없는 이름을 뒤에서 채우지 않는다 (수요일 재현)", () => {
    const catalog = ["리버스 런지", "마운틴 클라이머", "점핑잭", "YTW"].map(catalogItem);
    const names = ["리버스 런지", "Scapular Push-up Plus", "마운틴 클라이머", "점핑잭", "흉추 익스텐션", "YTW"];
    const picked = tabataPickFromNames(intervalBlockNames(names), catalog);
    expect(picked.map((p) => p.name)).toEqual(["리버스 런지", "마운틴 클라이머", "점핑잭"]);
  });

  it("지난 인터벌 기록을 되살릴 때도 앞 4개만 본다", () => {
    const catalog = ["리버스 런지", "마운틴 클라이머", "점핑잭", "YTW"].map(catalogItem);
    const resumed = tabataResumeFromSession({
      session: {
        tabataMinutes: 8,
        exerciseNames: ["리버스 런지", "Scapular Push-up Plus", "마운틴 클라이머", "점핑잭", "YTW"],
      },
      catalog,
    });
    expect(resumed?.picked.map((p) => p.name)).toEqual(["리버스 런지", "마운틴 클라이머", "점핑잭"]);
  });

  it("인터벌 세션의 0~3번만 블록이다 — 일반 세션은 어느 자리도 블록이 아니다", () => {
    expect(isIntervalBlockIndex(8, 0)).toBe(true);
    expect(isIntervalBlockIndex(8, TABATA_EXERCISE_COUNT - 1)).toBe(true);
    expect(isIntervalBlockIndex(8, TABATA_EXERCISE_COUNT)).toBe(false);
    expect(isIntervalBlockIndex(null, 0)).toBe(false);
    expect(isIntervalBlockIndex(undefined, 0)).toBe(false);
  });

  it("인터벌 세션에서 자리를 모르면(null) 블록으로 본다 — 모르면 비교에서 빼는 쪽이 안전하다", () => {
    expect(isIntervalBlockIndex(8, null)).toBe(true);
    expect(isIntervalBlockIndex(null, null)).toBe(false);
  });

  it("기록 비교에 쓸 종목에서 인터벌 블록을 뺀다 — 순수 인터벌은 아무것도 안 남는다", () => {
    const eight = ["a", "b", "c", "d", "e", "f"];
    expect(withoutIntervalBlock(8, eight)).toEqual(["e", "f"]);
    expect(withoutIntervalBlock(8, eight.slice(0, 4))).toEqual([]);
    expect(withoutIntervalBlock(null, eight)).toEqual(eight);
  });

  it("이어하기가 있는지 — 인터벌이고 종목이 4개를 넘을 때만", () => {
    const four = ["a", "b", "c", "d"].map((n) => localExercise(n, [false]));
    const six = [...four, localExercise("e", [false]), localExercise("f", [false])];
    expect(hasIntervalFollowUps({ tabataMinutes: 8, exercises: six })).toBe(true);
    expect(hasIntervalFollowUps({ tabataMinutes: 8, exercises: four })).toBe(false);
    expect(hasIntervalFollowUps({ tabataMinutes: null, exercises: six })).toBe(false);
  });

  it("음원이 끝나면 블록 4종의 세트만 완료 — 이어하기는 그대로 미완료", () => {
    const six = [
      ...["a", "b", "c", "d"].map((n) => localExercise(n, [false])),
      localExercise("e", [false, false]),
      localExercise("f", [false]),
    ];
    const out = completeIntervalBlock(six);
    expect(out.slice(0, 4).every((ex) => ex.sets.every((s) => s.done))).toBe(true);
    expect(out[4].sets.map((s) => s.done)).toEqual([false, false]);
    expect(out[5].sets.map((s) => s.done)).toEqual([false]);
    // 원본은 건드리지 않는다
    expect(six[0].sets[0].done).toBe(false);
  });

  it("무동작 감지를 끌 때는 블록이 아직 남아 있을 때뿐이다", () => {
    const pending = [
      ...["a", "b", "c", "d"].map((n) => localExercise(n, [false])),
      localExercise("e", [false]),
    ];
    expect(intervalBlockPending({ tabataMinutes: 8, exercises: pending })).toBe(true);
    expect(intervalBlockPending({ tabataMinutes: 8, exercises: completeIntervalBlock(pending) })).toBe(false);
    expect(intervalBlockPending({ tabataMinutes: null, exercises: pending })).toBe(false);
  });

  it("운동 중 블록 종목은 빼거나 옮길 수 없다 — 이어하기는 된다", () => {
    const draft = {
      tabataMinutes: 8,
      exercises: [
        ...["a", "b", "c", "d"].map((n) => localExercise(n, [true])),
        localExercise("e", [false]),
      ],
    };
    expect(isIntervalBlockExercise(draft, "k-a")).toBe(true);
    expect(isIntervalBlockExercise(draft, "k-d")).toBe(true);
    expect(isIntervalBlockExercise(draft, "k-e")).toBe(false);
    expect(isIntervalBlockExercise(draft, "없는-key")).toBe(false);
    expect(isIntervalBlockExercise({ ...draft, tabataMinutes: null }, "k-a")).toBe(false);
  });

  it("배너·카드 한 줄 — 블록 이름 뒤에 이어하기 개수", () => {
    expect(intervalPlanLine(["a", "b", "c", "d", "e", "f"])).toBe("a · b · c · d · 이어서 2종목");
    expect(intervalPlanLine(["a", "b", "c", "d"])).toBe("a · b · c · d");
  });

  it("일반·인터벌 세션 조회를 최신순 하나로 합친다", () => {
    const regular = [
      { id: "r1", completed_at: "2026-09-27T22:00:00+00:00" },
      { id: "r2", completed_at: "2026-09-20T22:00:00+00:00" },
    ];
    const interval = [{ id: "i1", completed_at: "2026-09-24T22:05:00+00:00" }];
    expect(mergeRecentSessions(regular, interval).map((s) => s.id)).toEqual(["r1", "i1", "r2"]);
  });

  it("안내 문구", () => {
    expect(INTERVAL_COPY.followUpLead).toBe("인터벌 뒤에 이어서");
    expect(INTERVAL_COPY.followUpCount(4)).toBe("이어서 4종목");
    expect(INTERVAL_COPY.followUpAfterEnd(4)).toBe("음원이 끝나면 이어서 4종목을 해요.");
    expect(INTERVAL_COPY.followUpStart).toBe("인터벌 끝! 숨 고르고 이어서 해요 💪");
    expect(INTERVAL_COPY.blockLocked).toBe("인터벌 종목은 운동 중에 빼거나 옮길 수 없어요");
  });
});
```

- [ ] **Step 2: 실패하는지 확인한다**

Run: `pnpm exec vitest run src/lib/domain/tabata.test.ts`
Expected: FAIL — `splitIntervalPlan` 등이 export되지 않았다는 오류.

- [ ] **Step 3: 구현한다**

`src/lib/domain/tabata.ts`의 `INTERVAL_COPY`에 다섯 줄을 추가한다(`session:` 줄 아래):
```ts
  session: (minutes: TabataMinutes) => `전신 인터벌 ${minutes}분`,
  // ── 인터벌 뒤 이어하기 (설계 2026-09-29) ──
  followUpLead: "인터벌 뒤에 이어서",
  followUpCount: (count: number) => `이어서 ${count}종목`,
  followUpAfterEnd: (count: number) => `음원이 끝나면 이어서 ${count}종목을 해요.`,
  followUpStart: "인터벌 끝! 숨 고르고 이어서 해요 💪",
  blockLocked: "인터벌 종목은 운동 중에 빼거나 옮길 수 없어요",
} as const;
```

`tabataResumeFromSession`의 한 줄을 바꾼다:
```ts
  // 기존
  const picked = tabataPickFromNames(input.session.exerciseNames, input.catalog);
  // 새로 — 인터벌 세션의 5번째부터는 이어하기 종목이다 (2026-09-29)
  const picked = tabataPickFromNames(
    intervalBlockNames(input.session.exerciseNames),
    input.catalog,
  );
```

파일 끝에 붙인다:
```ts
// ── 인터벌 뒤 이어하기 (설계 2026-09-29 §4) ─────────────────────────
//
// `tabata_minutes`가 있는 계획·draft·세션에서 **0~3번 = 인터벌 블록**,
// 4번~ = 음원이 끝난 뒤 같은 세션에서 이어서 하는 일반 종목이다.
// 계획은 ChatGPT가 DB에 직접 쓰고(`docs/chatgpt-plan-rules.md`), draft·세션은
// 앱이 쓴다. 세션은 `saveSessionExercises`가 draft 순서대로 `sort_order: i`를
// 넣으므로 이 규칙이 저장까지 이어진다.
//
// ⚠️ 숫자 4를 다른 파일에 쓰지 마라. 여기 함수들을 거친다.

/** 인터벌 계획·세션의 종목 이름 중 **블록만** — 카탈로그 대조는 이것만 한다 */
export function intervalBlockNames(names: readonly string[]): string[] {
  return names.slice(0, TABATA_EXERCISE_COUNT);
}

/** 인터벌 계획을 블록과 이어하기로 가른다. 4개 이하면 이어하기가 없다 */
export function splitIntervalPlan<T>(exercises: readonly T[]): {
  block: T[];
  followUps: T[];
} {
  return {
    block: exercises.slice(0, TABATA_EXERCISE_COUNT),
    followUps: exercises.slice(TABATA_EXERCISE_COUNT),
  };
}

/**
 * 이 자리가 인터벌 블록인가.
 *
 * 인터벌 세션에서 자리(`sort_order`)를 모르면 **블록으로 본다.** 블록의
 * "반복"은 실제 횟수가 아니라 라운드 수라서, 모르는 행을 기록 비교에 넣으면
 * 가짜 기록 갱신이 뜬다. 모르면 빼는 쪽이 안전하다.
 * (2026-09-29 실측: 운영의 인터벌 세션 종목 116행은 전부 sort_order 0~3이다.)
 */
export function isIntervalBlockIndex(
  tabataMinutes: number | null | undefined,
  index: number | null | undefined,
): boolean {
  if (tabataMinutes === null || tabataMinutes === undefined) return false;
  if (index === null || index === undefined) return true;
  return index < TABATA_EXERCISE_COUNT;
}

/**
 * 세트 기록 비교에 쓸 종목 — 인터벌 블록을 뺀다.
 *
 * 원칙: **인터벌 블록은 세트 기록 비교의 양쪽 어디에도 쓰지 않는다.** 8분
 * 코스의 "4회"는 라운드 수라, 지난 일반 기록이 3회면 "1회 더 하셨어요"가 뜬다.
 */
export function withoutIntervalBlock<T>(
  tabataMinutes: number | null | undefined,
  exercises: readonly T[],
): T[] {
  return exercises.filter(
    (_, index) => !isIntervalBlockIndex(tabataMinutes, index),
  );
}

type IntervalDraftLike = {
  tabataMinutes: number | null;
  exercises: readonly { key: string; sets: readonly { done: boolean }[] }[];
};

/** 음원이 끝난 뒤 이어서 할 종목이 있는가 */
export function hasIntervalFollowUps(draft: IntervalDraftLike): boolean {
  return (
    draft.tabataMinutes !== null &&
    draft.exercises.length > TABATA_EXERCISE_COUNT
  );
}

/**
 * 인터벌 블록이 아직 안 끝났는가 — 무동작 감지를 끄는 조건이다.
 *
 * 예전에는 "인터벌 세션이면" 세션 **내내** 껐다. 이어하기는 사람이 세트를
 * 누르는 일반 운동이라 그동안은 감지가 켜져 있어야 한다.
 */
export function intervalBlockPending(draft: IntervalDraftLike): boolean {
  if (draft.tabataMinutes === null) return false;
  return draft.exercises
    .slice(0, TABATA_EXERCISE_COUNT)
    .some((exercise) => exercise.sets.some((set) => !set.done));
}

/** 음원이 끝났다 — 블록 4종의 세트만 완료로. 이어하기는 건드리지 않는다 */
export function completeIntervalBlock(
  exercises: readonly LocalExercise[],
): LocalExercise[] {
  return exercises.map((exercise, index) =>
    index < TABATA_EXERCISE_COUNT
      ? { ...exercise, sets: exercise.sets.map((set) => ({ ...set, done: true })) }
      : exercise,
  );
}

/**
 * 운동 중 이 종목이 인터벌 블록인가 — 빼기·건너뛰기·옮기기를 막는 데 쓴다.
 *
 * 블록이 빠지거나 자리를 바꾸면 저장되는 `sort_order`가 밀려서 이어하기
 * 종목이 0~3번에 들어가고, 그 기록은 영영 "인터벌"로 취급된다.
 */
export function isIntervalBlockExercise(
  draft: { tabataMinutes: number | null; exercises: readonly { key: string }[] },
  exKey: string,
): boolean {
  const index = draft.exercises.findIndex((exercise) => exercise.key === exKey);
  return index >= 0 && isIntervalBlockIndex(draft.tabataMinutes, index);
}

/** 배너·카드의 한 줄 — `푸시업 · 버드독 · 데드버그 · 크런치 · 이어서 4종목` */
export function intervalPlanLine(names: readonly string[]): string {
  const { block, followUps } = splitIntervalPlan(names);
  const head = block.join(" · ");
  return followUps.length > 0
    ? `${head} · ${INTERVAL_COPY.followUpCount(followUps.length)}`
    : head;
}

/**
 * 일반 세션 조회와 인터벌 세션 조회를 최신순 하나로 (2026-09-29).
 *
 * 둘을 **따로** 조회하는 이유: 한 조회로 합치면 인터벌 세션이 한도(20·40)를
 * 먹어 일반 기록이 밀려난다. 따로 가져오면 일반 쪽 결과는 예전과 같다.
 */
export function mergeRecentSessions<S extends { completed_at: string }>(
  regular: readonly S[],
  interval: readonly S[],
): S[] {
  return [...regular, ...interval].sort(
    (a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at),
  );
}
```

- [ ] **Step 4: 통과하는지 확인한다**

Run: `pnpm exec vitest run src/lib/domain/tabata.test.ts`
Expected: PASS (기존 테스트 포함 전부)

---

### Task 3: 인터벌 시트 — 이어하기 한 줄

**Files:**
- Modify: `src/components/record/tabata-sheet.tsx`
- Test: `src/components/record/tabata-sheet.test.tsx`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tabata-sheet.test.tsx`의 `setup` 헬퍼에 `followUpNames`를 받게 한다:
```ts
function setup(
  over: {
    pastSessions?: CalendarSession[];
    initialPicked?: CatalogExercise[];
    initialMinutes?: TabataMinutes;
    followUpNames?: readonly string[];
    onBegin?: (
      picked: CatalogExercise[],
      minutes: TabataMinutes,
    ) => Promise<boolean>;
  } = {},
) {
  return render(
    <TabataSheet
      open
      catalog={CATALOG}
      pastSessions={over.pastSessions ?? []}
      pastLoading={false}
      initialPicked={over.initialPicked}
      initialMinutes={over.initialMinutes}
      followUpNames={over.followUpNames}
      onClose={vi.fn()}
      onCreateCustom={vi.fn()}
      onBegin={over.onBegin ?? vi.fn()}
      onComplete={vi.fn()}
      onCancelWorkout={vi.fn()}
    />,
  );
}
```

파일 끝에 붙인다:
```ts
describe("TabataSheet — 인터벌 뒤 이어하기 (2026-09-29)", () => {
  it("계획에 이어하기가 있으면 준비 화면에 이름과 안내를 보여 준다", () => {
    setup({
      initialPicked: FOUR,
      initialMinutes: 8,
      followUpNames: ["흉추 익스텐션", "도어웨이 가슴 스트레칭", "Wall Slide", "YTW"],
    });
    const box = screen.getByTestId("interval-follow-ups");
    expect(box.textContent).toContain("인터벌 뒤에 이어서");
    expect(box.textContent).toContain("흉추 익스텐션 · 도어웨이 가슴 스트레칭 · Wall Slide · YTW");
    expect(screen.getByText(/음원이 끝나면 이어서 4종목을 해요/)).toBeTruthy();
    expect(screen.queryByText(/자동으로 기록되고/)).toBeNull();
  });

  it("이어하기가 없으면 예전 안내 그대로", () => {
    setup({ initialPicked: FOUR, initialMinutes: 8 });
    expect(screen.queryByTestId("interval-follow-ups")).toBeNull();
    expect(screen.getByText(/자동으로 기록되고/)).toBeTruthy();
  });

  it("이어하기가 있어도 시작 조건은 인터벌 4개 그대로다", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const onBegin = vi.fn().mockResolvedValue(true);
    setup({ initialPicked: FOUR, initialMinutes: 8, followUpNames: ["흉추 익스텐션"], onBegin });
    fireEvent.click(screen.getByRole("button", { name: "전신 인터벌 시작" }));
    await waitFor(() => expect(onBegin).toHaveBeenCalledWith(FOUR, 8));
  });
});
```

- [ ] **Step 2: 실패하는지 확인한다**

Run: `pnpm exec vitest run src/components/record/tabata-sheet.test.tsx`
Expected: 새 describe 3건 FAIL(`interval-follow-ups` 없음). 타입 검사에서 `followUpNames` prop 없음 오류가 날 수도 있다.

- [ ] **Step 3: 구현한다**

`TabataProps`에서 `initialMinutes?: TabataMinutes;` 아래에 추가한다:
```ts
  /**
   * 인터벌이 끝난 뒤 같은 세션에서 이어서 할 종목 이름 (설계 2026-09-29).
   * 계획의 5번째부터다. 여기서는 **보여 주기만** 한다 — 고르는 것은 인터벌 4종뿐이다.
   */
  followUpNames?: readonly string[];
```

`TabataSheetBody` 구조분해에 `followUpNames = [],`를 추가한다(`initialMinutes,` 아래).

안내 문단의 삼항을 바꾼다:
```tsx
              {onPlan
                ? " 그날 기록 화면에서 바로 시작할 수 있어요."
                : followUpNames.length > 0
                  ? ` ${INTERVAL_COPY.followUpAfterEnd(followUpNames.length)}`
                  : " 음원이 끝나면 자동으로 기록되고, 인증샷만 찍으면 돼요."}
```

`picked.map(...)` 목록 `</div>`와 `+ 운동 고르기` 버튼 사이에 넣는다:
```tsx
            {followUpNames.length > 0 && (
              <div
                data-testid="interval-follow-ups"
                className="mt-2 rounded-card-sm border border-line bg-surface-2 px-3 py-2"
              >
                <p className="text-[11px] font-extrabold text-muted">
                  {INTERVAL_COPY.followUpLead}
                </p>
                <p className="mt-0.5 break-words text-sm font-bold">
                  {followUpNames.join(" · ")}
                </p>
              </div>
            )}
```

- [ ] **Step 4: 통과하는지 확인한다**

Run: `pnpm exec vitest run src/components/record/tabata-sheet.test.tsx`
Expected: PASS (기존 테스트 포함)

---

### Task 4: 기록 화면 — 계획 → 시트 → draft

**Files:**
- Modify: `src/app/(tabs)/record/page.tsx` (`TabataPrefill` 타입, `handleLoadPlan`, `beginTabata`, `handleScheduleFromPast`, `<TabataSheet` 렌더, tabata import)

- [ ] **Step 1: tabata import에 새 함수를 더한다**

`from "@/lib/domain/tabata";` import 목록에 추가한다:
```ts
  completeIntervalBlock,
  hasIntervalFollowUps,
  intervalBlockNames,
  intervalBlockPending,
  intervalPlanLine,
  isIntervalBlockExercise,
  isIntervalBlockIndex,
  splitIntervalPlan,
  withoutIntervalBlock,
```
(`PlanExercise`는 이미 `@/lib/domain/workout-plan`에서 import되어 있다. 없으면 `type PlanExercise`를 추가한다.)

- [ ] **Step 2: `TabataPrefill`에 `followUps`를 추가한다**

`openPicker?: boolean;` 아래:
```ts
  /**
   * 인터벌이 끝난 뒤 같은 세션에서 이어서 할 종목 (설계 2026-09-29).
   * 계획의 5번째부터다(`splitIntervalPlan`). 없으면 순수 인터벌.
   */
  followUps?: PlanExercise[];
```

- [ ] **Step 3: `handleLoadPlan`의 인터벌 분기를 바꾼다**

기존:
```ts
    if (plan.tabataMinutes) {
      const picked = tabataPickFromNames(
        plan.exercises.map((exercise) => exercise.name),
        catalog,
      );
```
새로:
```ts
    if (plan.tabataMinutes) {
      /*
        앞 4개 = 인터벌, 5번째부터 = 이어하기 (설계 2026-09-29).
        ⚠️ 카탈로그 대조는 **앞 4개만** 한다. 예전에는 목록 전체에서 4개를
           골라서, 없는 이름을 뒤 종목(YTW 덤벨)으로 채웠다.
      */
      const { block, followUps } = splitIntervalPlan(plan.exercises);
      const picked = tabataPickFromNames(
        block.map((exercise) => exercise.name),
        catalog,
      );
```
같은 분기의 `openTabataSheet({ ... })` 호출 인자에 `followUps,`를 추가한다(`planId: plan.id,` 아래).

- [ ] **Step 4: `beginTabata`가 이어하기를 draft 뒤에 붙인다**

기존:
```ts
    const scheduledPlanId = tabataPrefill?.planId ?? null;
    setDraft((d) => ({
      ...emptyDraft(d.restSeconds),
      exercises: tabataDraftExercises(picked, localId, minutes),
```
새로:
```ts
    const scheduledPlanId = tabataPrefill?.planId ?? null;
    // 인터벌 뒤 이어하기 (2026-09-29) — 블록 뒤에 붙인다. 순서가 곧 규칙이다
    // (`saveSessionExercises`가 이 순서로 sort_order를 넣는다).
    const followUps = toDraftExercises(tabataPrefill?.followUps ?? [], localId);
    setDraft((d) => ({
      ...emptyDraft(d.restSeconds),
      exercises: [...tabataDraftExercises(picked, localId, minutes), ...followUps],
```

- [ ] **Step 5: 지난 기록 → 계획 복사도 앞 4개만 본다 (`handleScheduleFromPast`)**

기존:
```ts
        const logged = await getSessionExerciseNames(sessionId);
        const picked = tabataPickFromNames(logged, catalog);
```
새로:
```ts
        const logged = await getSessionExerciseNames(sessionId);
        // 섞인 세션의 5번째부터는 이어하기다 — 복사는 인터벌만 옮긴다 (설계 §10 한계)
        const picked = tabataPickFromNames(intervalBlockNames(logged), catalog);
```

- [ ] **Step 6: 시트에 이어하기 이름을 넘긴다**

`<TabataSheet` 렌더(기록 화면 쪽)에서 `initialMinutes={tabataPrefill?.minutes}` 아래:
```tsx
            followUpNames={tabataPrefill?.followUps?.map((exercise) => exercise.name)}
```

- [ ] **Step 7: 타입 검사**

Run: `pnpm typecheck`
Expected: 오류 0. 이 시점에는 import해 놓고 아직 안 쓴 함수가 있어 lint 경고가 날 수 있다. Task 5·6에서 쓴다.

---

### Task 5: 기록 화면 — 음원 종료 분기, 무동작 조건, 블록 잠금

**Files:**
- Modify: `src/app/(tabs)/record/page.tsx` (`completeTabata`, `useIdleGuard` 호출, `removeExercise`, `handleSkipExercise`, `ExerciseReorderSheet`의 `onMove`)

- [ ] **Step 1: `completeTabata`를 바꾼다**

기존:
```ts
  async function completeTabata() {
    setDraft((d) => ({
      ...d,
      exercises: d.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((set) => ({ ...set, done: true })),
      })),
    }));
    await handleFinish();
  }
```
새로:
```ts
  async function completeTabata() {
    const current = draftRef.current;
    if (hasIntervalFollowUps(current)) {
      /*
        인터벌 뒤 이어하기 (설계 2026-09-29 §5) — 음원이 끝나도 운동을 끝내지 않는다.

        ① 블록 4종만 ✓
        ② 활동 시각을 새로 찍는다. 안 찍으면 음원 8분 동안 화면을 안 만진 것이
           곧바로 '무동작 정지'로 잡힌다 — 무동작 감지는 블록이 끝나는 이 순간 켜진다
        ③ 세트를 끝냈을 때와 **같은** 휴식 1회 — 같은 `startRest`, 같은 시간 규칙
           (처방이 없으면 평소 휴식 시간)
        ④ 초점을 첫 이어하기 종목으로

        시트는 `handleEnded`가 이 뒤에 닫는다. `onPlayingChange(false)`가 먼저
        불려 `intervalPlaying`이 false라 운동중 화면이 바로 뜬다.
      */
      const exercises = completeIntervalBlock(current.exercises);
      setDraft((d) => ({ ...d, exercises: completeIntervalBlock(d.exercises) }));
      markActivity();
      const lastBlock = splitIntervalPlan(exercises).block.at(-1);
      const lastSet = lastBlock?.sets.at(-1);
      if (lastBlock && lastSet) {
        startRest(
          `${lastBlock.key}:${lastSet.key}`,
          restSecondsForExercise(undefined, current.restSeconds),
        );
      }
      refocusPending(exercises);
      showToast(INTERVAL_COPY.followUpStart);
      return;
    }
    setDraft((d) => ({
      ...d,
      exercises: d.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((set) => ({ ...set, done: true })),
      })),
    }));
    await handleFinish();
  }
```

- [ ] **Step 2: 무동작 감지 조건을 바꾼다**

기존:
```ts
      guarded: shouldGuardIdle({
        exercises: draft.exercises,
        isTabata: draft.tabataMinutes !== null,
      }),
```
새로:
```ts
      guarded: shouldGuardIdle({
        exercises: draft.exercises,
        // 인터벌 **블록이 남아 있는 동안만** 끈다 (2026-09-29). 예전에는 인터벌
        // 세션 내내 껐는데, 이어하기는 사람이 세트를 누르는 일반 운동이다.
        isTabata: intervalBlockPending(draft),
      }),
```

- [ ] **Step 3: 블록 잠금 — `removeExercise`**

함수 맨 앞에 넣는다:
```ts
  function removeExercise(exKey: string) {
    // 블록이 빠지면 저장 순서가 밀려 이어하기가 0~3번(= 인터벌)으로 기록된다
    if (isIntervalBlockExercise(draftRef.current, exKey)) {
      showToast(INTERVAL_COPY.blockLocked);
      return;
    }
    markActivity();
```

- [ ] **Step 4: 블록 잠금 — `handleSkipExercise`**

`const target = ...; if (!target) return;` 바로 아래에 넣는다:
```ts
    if (isIntervalBlockExercise(draftRef.current, exKey)) {
      showToast(INTERVAL_COPY.blockLocked);
      return;
    }
```

- [ ] **Step 5: 블록 잠금 — 순서 바꾸기 시트의 `onMove`**

기존:
```tsx
              onMove={(from, to) =>
                setDraft((d) => ({
                  ...d,
                  exercises: moveItem(d.exercises, from, to),
                }))
              }
```
새로:
```tsx
              onMove={(from, to) => {
                const tabata = draftRef.current.tabataMinutes;
                if (isIntervalBlockIndex(tabata, from) || isIntervalBlockIndex(tabata, to)) {
                  showToast(INTERVAL_COPY.blockLocked);
                  return;
                }
                setDraft((d) => ({
                  ...d,
                  exercises: moveItem(d.exercises, from, to),
                }));
              }}
```
(`onRemove={removeExercise}`는 Step 3이 막는다.)

**교체(`replaceFocusedExercise`)는 따로 막지 않는다.** 교체는 초점이 있는(= 미완료) 종목에만 열리는데, 음원이 끝나면 블록 4종은 모두 완료 상태다. 완료한 세트가 있는 종목은 도메인(`replaceExercise`)이 이미 거절한다("이미 완료한 세트가 있어 바꿀 수 없어요"). 게다가 교체는 **자리를 유지**하므로 설령 일어나도 "앞 4개" 규칙은 깨지지 않는다.

- [ ] **Step 6: 타입 검사**

Run: `pnpm typecheck`
Expected: 오류 0

---

### Task 6: 기록 화면 — 기록 갱신 판정에서 블록 제외, 배너 문구

**Files:**
- Modify: `src/app/(tabs)/record/page.tsx` (`handleFinish`의 기록 갱신 블록, `today-interval-start` 배너)

- [ ] **Step 1: 기록 갱신 판정**

기존(`let recordNote: string | null = null;` 아래):
```ts
        const names = draft.exercises.map((ex) => ex.name);
        const previousByName = await getPreviousExerciseRecords(
          userId,
          names,
          sessionId,
        );

        const improvements: ExerciseImprovement[] = [];
        for (const ex of draft.exercises) {
```
새로:
```ts
        /*
          인터벌 블록은 비교하지 않는다 (설계 2026-09-29). 블록의 "반복"은 라운드
          수(8분 = 각 4)라, 지난 일반 기록이 그보다 작으면 가짜 갱신이 뜬다.
          순수 인터벌이면 비교할 것이 없어 아래가 빈손으로 끝난다.
        */
        const comparable = withoutIntervalBlock(draft.tabataMinutes, draft.exercises);
        const names = comparable.map((ex) => ex.name);
        const previousByName = await getPreviousExerciseRecords(
          userId,
          names,
          sessionId,
        );

        const improvements: ExerciseImprovement[] = [];
        for (const ex of comparable) {
```

- [ ] **Step 2: 오늘 인터벌 배너 문구**

기존(`data-testid="today-interval-start"` 버튼 안):
```tsx
                  {todayIntervalPlan.exercises
                    .map((item) => item.name)
                    .join(" · ")}
```
새로:
```tsx
                  {intervalPlanLine(
                    todayIntervalPlan.exercises.map((item) => item.name),
                  )}
```

- [ ] **Step 3: lint·typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: 오류 0. Task 4 Step 1에서 import한 함수가 전부 쓰였는지 확인한다(`completeIntervalBlock`·`hasIntervalFollowUps`·`intervalBlockNames`·`intervalBlockPending`·`intervalPlanLine`·`isIntervalBlockExercise`·`isIntervalBlockIndex`·`splitIntervalPlan`·`withoutIntervalBlock`). 안 쓴 것이 있으면 import에서 뺀다.

---

### Task 7: 지난 기록 조회 두 곳

**Files:**
- Modify: `src/lib/workout.ts` (`getPreviousExerciseRecords`)
- Modify: `src/lib/ai-coach/supabase-deps.ts` (`readHistory`)

규칙은 Task 2의 `isIntervalBlockIndex`·`mergeRecentSessions`가 테스트로 고정한다. 두 조회는 그 함수만 부른다. 실제 조회 결과는 Task 10의 개발 서버 확인 ⑦로 본다(이 두 함수에는 Supabase 목 테스트가 없다).

- [ ] **Step 1: `getPreviousExerciseRecords`**

파일 위 import에 추가한다:
```ts
import { isIntervalBlockIndex, mergeRecentSessions } from "@/lib/domain/tabata";
```
(이미 `@/lib/domain/tabata`에서 import하는 줄이 있으면 거기에 더한다.)

함수의 doc 주석과 첫 조회를 바꾼다. 기존:
```ts
/**
 * 오늘 한 종목들의 **직전 기록**을 한 번에 가져온다 (설계 2026-07-21).
 * 쿼리 2회로 끝낸다. 방금 완료한 세션과 타바타 세션은 후보에서 뺀다 —
 * 타바타는 세트 실적이 0이라 정상 기록을 가린다.
 */
```
새로:
```ts
/**
 * 오늘 한 종목들의 **직전 기록**을 한 번에 가져온다 (설계 2026-07-21).
 * 방금 완료한 세션은 후보에서 뺀다.
 *
 * 인터벌 세션 (2026-09-29): 예전에는 통째로 뺐다. 이제 **블록(0~3번)만** 뺀다.
 * 블록의 반복은 라운드 수라 정상 기록을 가리지만, 음원 뒤 이어하기 종목(4번~)은
 * 진짜 기록이다. 일반·인터벌을 **따로** 조회한다 — 한 조회로 합치면 인터벌이
 * 한도를 먹어 일반 기록이 밀려난다. 일반 쪽 결과는 예전과 같다.
 */
```

기존:
```ts
  const { data: sessions, error: sErr } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .is("tabata_minutes", null)
    .neq("id", excludeSessionId)
    .order("completed_at", { ascending: false })
    .limit(PREVIOUS_RECORD_SESSION_LIMIT);
  if (sErr) throw sErr;

  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) return result;

  const { data: exercises, error: eErr } = await supabase
    .from("workout_exercises")
    .select("session_id, exercise_name, exercise_type, measure, workout_sets(*)")
    .in("session_id", sessionIds)
    .in("exercise_name", exerciseNames);
  if (eErr) throw eErr;

  type Row = {
    session_id: string;
    exercise_name: string;
    exercise_type: ExerciseType;
    measure: "reps" | "time" | null;
    workout_sets: WorkoutSet[] | null;
  };
```
새로:
```ts
  type SessionRow = {
    id: string;
    completed_at: string;
    tabata_minutes: number | null;
  };
  const recent = (interval: boolean) => {
    const query = supabase
      .from("workout_sessions")
      .select("id, completed_at, tabata_minutes")
      .eq("user_id", userId)
      .eq("status", "completed")
      .is("deleted_at", null)
      .neq("id", excludeSessionId);
    return (
      interval
        ? query.not("tabata_minutes", "is", null)
        : query.is("tabata_minutes", null)
    )
      .order("completed_at", { ascending: false })
      .limit(PREVIOUS_RECORD_SESSION_LIMIT);
  };
  const [regular, interval] = await Promise.all([recent(false), recent(true)]);
  if (regular.error) throw regular.error;
  if (interval.error) throw interval.error;
  const sessions = mergeRecentSessions(
    (regular.data ?? []) as SessionRow[],
    (interval.data ?? []) as SessionRow[],
  );

  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length === 0) return result;
  const tabataOf = new Map(sessions.map((s) => [s.id, s.tabata_minutes]));

  const { data: exercises, error: eErr } = await supabase
    .from("workout_exercises")
    .select(
      "session_id, exercise_name, exercise_type, measure, sort_order, workout_sets(*)",
    )
    .in("session_id", sessionIds)
    .in("exercise_name", exerciseNames);
  if (eErr) throw eErr;

  type Row = {
    session_id: string;
    exercise_name: string;
    exercise_type: ExerciseType;
    measure: "reps" | "time" | null;
    sort_order: number | null;
    workout_sets: WorkoutSet[] | null;
  };
```

반복문 맨 앞(`const rank = ...` 앞)에 넣는다:
```ts
  for (const row of (exercises ?? []) as Row[]) {
    // 인터벌 블록 행은 라운드 수라 비교하지 않는다 — 이어하기(4번~)만 쓴다
    if (isIntervalBlockIndex(tabataOf.get(row.session_id), row.sort_order)) continue;
    const rank = recencyOf.get(row.session_id);
```

- [ ] **Step 2: AI 코치 `readHistory`**

`src/lib/ai-coach/supabase-deps.ts` import에 추가한다:
```ts
import { isIntervalBlockIndex, mergeRecentSessions } from "@/lib/domain/tabata";
```

`readHistory` 본문 전체를 바꾼다:
```ts
    async readHistory(excludeSessionId, sinceMs) {
      /*
        일반·인터벌 세션을 **따로** 조회한다 (2026-09-29, getPreviousExerciseRecords와
        같은 규칙). 인터벌 세션에서는 블록(0~3번)을 빼고 이어하기(4번~)만 쓴다.
        블록만 있던 순수 인터벌 세션은 남는 종목이 없으므로 **통째로 뺀다** —
        예전과 같은 입력이 되게 한다(빈 세션이 끼면 빈도 계산이 달라진다).
      */
      type SessionRow = {
        id: string;
        completed_at: string;
        tabata_minutes: number | null;
      };
      const recent = (interval: boolean) => {
        const query = user
          .from("workout_sessions")
          .select("id, completed_at, tabata_minutes")
          .eq("user_id", userId)
          .eq("status", "completed")
          .is("deleted_at", null)
          .neq("id", excludeSessionId)
          .gte("completed_at", new Date(sinceMs).toISOString());
        return (
          interval
            ? query.not("tabata_minutes", "is", null)
            : query.is("tabata_minutes", null)
        )
          .order("completed_at", { ascending: false })
          .limit(HISTORY_SESSION_LIMIT);
      };
      const [regular, interval] = await Promise.all([recent(false), recent(true)]);
      if (regular.error) throw regular.error;
      if (interval.error) throw interval.error;
      const rows = mergeRecentSessions(
        (regular.data ?? []) as SessionRow[],
        (interval.data ?? []) as SessionRow[],
      );
      if (rows.length === 0) return [];
      const tabataOf = new Map(rows.map((r) => [r.id, r.tabata_minutes]));

      const { data: exercises, error: exError } = await user
        .from("workout_exercises")
        .select(EXERCISE_SELECT)
        .in(
          "session_id",
          rows.map((r) => r.id),
        );
      if (exError) throw exError;

      const bySession = new Map<string, ExerciseRow[]>();
      for (const row of (exercises ?? []) as unknown as ExerciseRow[]) {
        if (isIntervalBlockIndex(tabataOf.get(row.session_id!), row.sort_order)) {
          continue;
        }
        const list = bySession.get(row.session_id!) ?? [];
        list.push(row);
        bySession.set(row.session_id!, list);
      }
      return rows
        .filter((r) => r.tabata_minutes === null || bySession.has(r.id))
        .map(
          (r): HistorySession => ({
            completedAtMs: Date.parse(r.completed_at),
            exercises: (bySession.get(r.id) ?? [])
              .sort(bySortOrder)
              .map(toAnalysisExercise),
          }),
        );
    },
```

- [ ] **Step 3: 타입 검사와 AI 코치 테스트**

Run: `pnpm typecheck && pnpm exec vitest run src/lib/ai-coach`
Expected: 오류 0, AI 코치 테스트 PASS(가짜 deps를 쓰므로 영향 없음)

---

### Task 8: 달력 — 카드 표시, 편집할 때 이어하기 보존

**Files:**
- Modify: `src/components/record/calendar-view.tsx` (tabata import, 계획 카드, `saveIntervalPlan`, `<TabataSheet`)
- Test: `src/components/record/calendar-view.test.tsx`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`calendar-view.test.tsx`에서 `INTERVAL_PLAN_PICKED` 정의 바로 아래에 추가한다:
```ts
/** 인터벌 뒤 이어하기가 붙은 계획 (2026-09-29, ChatGPT가 넣는 모양) */
const INTERVAL_PLAN_WITH_FOLLOW_UPS = {
  ...INTERVAL_PLAN_PICKED,
  id: "plan-interval-follow-ups",
  exercises: [
    ...INTERVAL_PLAN_PICKED.exercises,
    {
      name: "흉추 익스텐션",
      bodyPart: "등" as const,
      exerciseType: "bodyweight" as const,
      measure: "reps" as const,
      isCustom: true,
      sets: [{ weightKg: 0, reps: 10, distanceKm: 0, durationMin: 0 }],
    },
  ],
};
```

`describe("CalendarView — 계획한 운동 수정 (2026-08-28)"` 안, 기존 테스트 "인터벌 예정표의 수정은 계획한 종목·코스를 채운 인터벌 시트를 연다" 바로 뒤에 넣는다:
```ts
  it("인터벌 예정표 카드는 이어하기를 따로 보여 주고, 고쳐 저장해도 이어하기가 남는다 (2026-09-29)", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([INTERVAL_PLAN_WITH_FOLLOW_UPS]);
    await setup(BODYWEIGHT_CATALOG);

    fireEvent.click(screen.getByRole("button", { name: "8월 15일" }));
    expect(screen.getByTestId("plan-follow-ups").textContent).toBe(
      "인터벌 뒤에 이어서: 흉추 익스텐션",
    );

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    // 시트에도 보존된다는 것을 보여 준다
    expect((await screen.findByTestId("interval-follow-ups")).textContent).toContain(
      "흉추 익스텐션",
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "8월 15일 예정표로 저장" }),
    );

    await waitFor(() => expect(mocks.updateWorkoutPlan).toHaveBeenCalled());
    const saved = mocks.updateWorkoutPlan.mock.calls[0][0].exercises as Array<{
      name: string;
      sets: unknown[];
    }>;
    expect(saved.map((e) => e.name)).toEqual([
      ...BODYWEIGHT_CATALOG.map((c) => c.name),
      "흉추 익스텐션",
    ]);
    expect(saved[4].sets).toEqual([
      { weightKg: 0, reps: 10, distanceKm: 0, durationMin: 0 },
    ]);
  });
```

- [ ] **Step 2: 실패하는지 확인한다**

Run: `pnpm exec vitest run src/components/record/calendar-view.test.tsx`
Expected: 새 테스트 FAIL(`plan-follow-ups` 없음)

- [ ] **Step 3: 구현한다**

`@/lib/domain/tabata` import에 `splitIntervalPlan`을 추가한다(`INTERVAL_COPY`·`tabataDraftExercises`·`tabataResumeFromSession`은 이미 있다).

계획 카드. 기존:
```tsx
                      <p className="mt-0.5 break-words text-sm font-bold">
                        {selectedPlan.exercises.map((exercise) => exercise.name).join(" · ")}
                      </p>
```
새로:
```tsx
                      <p className="mt-0.5 break-words text-sm font-bold">
                        {(selectedPlan.tabataMinutes
                          ? splitIntervalPlan(selectedPlan.exercises).block
                          : selectedPlan.exercises
                        )
                          .map((exercise) => exercise.name)
                          .join(" · ")}
                      </p>
                      {selectedPlan.tabataMinutes &&
                        splitIntervalPlan(selectedPlan.exercises).followUps.length > 0 && (
                          <p
                            data-testid="plan-follow-ups"
                            className="mt-0.5 break-words text-[12.5px] font-bold text-muted"
                          >
                            {`${INTERVAL_COPY.followUpLead}: ${splitIntervalPlan(
                              selectedPlan.exercises,
                            )
                              .followUps.map((exercise) => exercise.name)
                              .join(" · ")}`}
                          </p>
                        )}
```

`saveIntervalPlan`. 기존:
```ts
      const exercises = toPlanExercises(
        tabataDraftExercises(picked, localId, minutes),
      );
```
새로:
```ts
      /*
        인터벌 뒤 이어하기는 이 시트가 고치지 않는다 — **뒤에 그대로 붙여** 보존한다
        (설계 2026-09-29 §6). 예전에는 4종만 저장해 이어하기가 사라졌다.
      */
      const existing = target.planId
        ? plans.find((item) => item.id === target.planId)
        : undefined;
      const exercises = [
        ...toPlanExercises(tabataDraftExercises(picked, localId, minutes)),
        ...(existing ? splitIntervalPlan(existing.exercises).followUps : []),
      ];
```

`intervalPrefill` `useMemo` 바로 아래에 추가한다:
```ts
  /** 고치는 인터벌 계획의 이어하기 이름 — 시트가 "보존된다"를 보여 준다 */
  const intervalFollowUpNames = useMemo(() => {
    const plan = intervalPlanTarget
      ? plans.find((item) => item.id === intervalPlanTarget.planId)
      : undefined;
    return plan
      ? splitIntervalPlan(plan.exercises).followUps.map((exercise) => exercise.name)
      : [];
  }, [intervalPlanTarget, plans]);
```

달력의 `<TabataSheet`에서 `initialMinutes={intervalPrefill?.minutes}` 아래에 추가한다:
```tsx
        followUpNames={intervalFollowUpNames}
```

- [ ] **Step 4: 통과하는지 확인한다**

Run: `pnpm exec vitest run src/components/record/calendar-view.test.tsx`
Expected: PASS (기존 테스트 포함)

---

### Task 9: 스키마 설명 0113, ChatGPT 규칙, 새 소식

**Files:**
- Create: `supabase/migrations/0113_interval_plan_contract_comment.sql`
- Create: `docs/chatgpt-plan-rules.md`
- Modify: `src/lib/domain/release-notes.data.json` (맨 앞에 한 항목)

- [ ] **Step 1: 마이그레이션 파일**

`supabase/migrations/0113_interval_plan_contract_comment.sql`:
```sql
-- 0113: 인터벌 계획의 형식을 열 설명에 적는다 (설계 2026-09-29 §7)
-- 적용: 사용자가 Supabase SQL Editor에서 이 파일 전체를 한 번 Run한다.
--
-- ✅ 앱 배포 전후 아무 때나 Run해도 된다. 설명(comment)만 바꾼다 —
--    데이터·제약·권한·함수는 그대로다.
--
-- 왜: 계획은 앱 밖에서도 들어온다. ChatGPT가 플러그인으로 workout_plans에 직접
--     넣는다(2026-09-27, 16행). 그쪽은 앱 코드를 못 보고 **스키마만** 본다.
--     그래서 규칙을 스키마에 적는다. 전문은 docs/chatgpt-plan-rules.md.
--
-- ⚠️ "인터벌 계획은 종목 4개 이상" CHECK는 **넣지 않았다**:
--    ① 앱의 "지난 인터벌 기록 → 계획 복사"는 지워진 커스텀 종목이 있으면
--       1~3개로 저장한다(handleScheduleFromPast). 제약이 그 경로를 저장 실패로 바꾼다
--    ② scripts/workout-plan-test.mjs가 1종목짜리 인터벌 계획을 저장한다
--    ③ 얻는 것이 없다. 1~3개짜리는 시트가 빈칸(3/4)으로 열어 채우게 한다
--    "앞 4개가 인터벌인가"는 DB가 판정할 수 없다.

comment on column public.workout_plans.tabata_minutes is
  '인터벌(음원) 코스 분수 4|8|16. null이면 일반 계획. 값이 있으면 exercises 앞 4개가 '
  '인터벌 종목(각 1세트, 맨몸, 20초 운동/10초 휴식으로 번갈아 돈다)이고, 5번째부터는 '
  '인터벌이 끝난 뒤 같은 세션에서 이어서 하는 일반 종목이다. 인터벌 전에 할 운동은 '
  '같은 날 별도 계획(더 이른 scheduled_at)으로 넣는다. 종목 이름은 exercise_catalog에 '
  '있는 이름을 쓴다(docs/chatgpt-plan-rules.md).';

notify pgrst, 'reload schema';
```
⚠️ Postgres에서 줄바꿈으로 이어 쓴 문자열 리터럴은 **자동으로 이어 붙는다**(SQL 표준). 이게 문법 오류를 내면 한 줄 문자열로 합친다.

- [ ] **Step 2: ChatGPT 규칙 문서**

`docs/chatgpt-plan-rules.md`:
````markdown
# GND 운동 계획 작성 규칙 (ChatGPT 붙여넣기용)

> 사용자가 ChatGPT 프로젝트 지침에 이 파일의 "붙여넣기" 블록을 그대로 넣는다.
> 규칙이 바뀌면 여기와 `0113` 열 설명을 같이 고친다. 근거: `docs/superpowers/specs/2026-09-29-interval-follow-up-design.md`

## 붙여넣기

```
GND 운동 계획(public.workout_plans)을 넣거나 고칠 때 규칙:

1. 하루에 계획을 여러 개 넣어도 된다. 계획 1개 = 운동 시작 1번 = 기록 1개다.
2. 인터벌(음원) 계획은 tabata_minutes = 4, 8, 16 중 하나.
   - exercises 배열의 앞 4개가 인터벌 종목이다. 각 종목은 세트 1개, 맨몸 동작만.
     (20초 운동 / 10초 휴식으로 4종목이 번갈아 돈다. 덤벨·기구 운동을 넣지 않는다.)
   - 인터벌이 끝난 뒤 이어서 할 운동(교정·스트레칭·보강)은 5번째부터 넣는다.
     앱은 음원이 끝나면 휴식 1번 뒤 이 종목들로 넘어가고, 전부 한 기록으로 남는다.
   - 인터벌 **전에** 할 운동(워밍업 등)은 5번째에 넣지 말고, 같은 날 **별도 계획**
     (tabata_minutes = null, scheduled_at이 인터벌보다 이르게)으로 넣는다.
3. 인터벌이 아닌 계획은 tabata_minutes = null. 종목 수 1~50.
4. 종목 이름은 public.exercise_catalog에 있는 이름을 그대로 쓴다.
   없는 운동은 먼저 exercise_catalog에 is_custom = true, created_by = 사용자 id로
   만든다(name 40자 이내, body_part·exercise_type·measure는 아래 값만).
5. exercises 각 원소 모양:
   {"name": "...", "bodyPart": "가슴|등|하체|어깨|팔|코어|유산소",
    "exerciseType": "weight|bodyweight|cardio", "measure": "reps|time|null",
    "isCustom": true|false,
    "sets": [{"weightKg": 0, "reps": 10, "distanceKm": 0, "durationMin": 0}]}
   - 인터벌 종목의 reps는 앱이 코스 길이로 다시 채우므로 아무 값이나 괜찮다.
```
````

- [ ] **Step 3: 새 소식 한 항목** (`release-notes.data.json` 배열 맨 앞, 기존 항목 모양을 따른다. 발송은 하지 않는다)

```json
  {
    "id": "2026-09-29-interval-follow-up",
    "date": "2026-09-29",
    "title": "인터벌이 끝나면 이어서 다른 운동을 할 수 있어요",
    "summary": "🔥 음원 인터벌 뒤에 교정·스트레칭을 붙여 둔 계획은, 인터벌이 끝나도 운동이 끝나지 않고 이어서 진행돼요",
    "highlights": [
      "**인터벌 뒤에 할 운동을 같은 운동으로 이어서 해요.** 음원이 끝나면 휴식 한 번 뒤 운동중 화면으로 넘어가고, 다 마치면 기록은 하나로 남아요.",
      "**인터벌 종목은 기록 갱신 비교에서 빠져요.** 인터벌의 횟수는 라운드 수라, 지난 일반 기록과 비교하면 틀린 '기록 갱신'이 뜨던 문제를 고쳤어요."
    ]
  },
```
⚠️ 추가하기 전에 파일의 첫 항목에서 필드 이름을 확인한다. 위와 다르면(예: 다른 필수 필드가 있으면) 기존 모양을 따른다.

- [ ] **Step 4: 새 소식 테스트**

Run: `pnpm exec vitest run src/lib/domain/release-notes`
Expected: PASS (새 소식 형식 검사가 있으면 통과)

---

### Task 10: 게이트, 개발 서버 화면 확인, 커밋

**⛔ 사용자 전역 지침: 화면을 눈으로 확인하기 전에는 커밋·배포하지 않는다.** 브라우저를 조작할 수단이 이 세션에 없으면 개발 서버만 띄워 두고, 아래 표를 사용자에게 넘긴 뒤 **답을 기다린다.**

- [ ] **Step 1: 전체 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: lint 0 errors · typecheck OK · 테스트 전부 통과(건수를 적는다) · build OK

- [ ] **Step 2: 픽스처 A에 오늘 계획 2개를 넣는다** (운영 DB, 픽스처 계정만)

scratchpad에 스크립트를 만든다(`dev-fixture.mjs`처럼 `.env.local`을 읽는다). 픽스처 A(`dev-fixture-a@gnd.local`)의 id로 `workout_plans`에 넣는다.
- **섞인 계획:** `tabata_minutes: 4`(4분이라 빨리 끝난다), `plan_date`는 오늘 KST, `title: "개발 확인 · 인터벌 뒤 이어하기"`, exercises는 인터벌 4종(`푸시업`·`마운틴 클라이머`·`점핑잭`·`크런치`, 각 세트 1개, reps 0)과 이어하기 2종(`버드독` 세트 2개 reps 10, `데드버그` 세트 1개 reps 10). 전부 기본 카탈로그 이름이다.
- **순수 인터벌 계획:** 같은 날, `tabata_minutes: 4`, 인터벌 4종만.

- [ ] **Step 3: 개발 서버로 확인한다** (`pnpm dev`, 픽스처 A로 `/login`)

음원 끝으로 넘기기: 인터벌이 재생되는 중에 콘솔에서
`const a = document.querySelector("audio"); a.currentTime = a.duration - 2;`

| # | 조작 | 기대 결과 |
|---|---|---|
| ① | 기록 탭을 연다 | 배너 `🔥 오늘은 전신 인터벌이에요` 아래 줄이 `푸시업 · 마운틴 클라이머 · 점핑잭 · 크런치 · 이어서 2종목` |
| ② | 배너를 누른다 | 시트에 `인터벌 뒤에 이어서 / 버드독 · 데드버그`, 안내 `음원이 끝나면 이어서 2종목을 해요.` |
| ③ | 시작 → 음원 끝으로 넘긴다 | 운동이 **끝나지 않고** 토스트 `인터벌 끝! 숨 고르고 이어서 해요 💪`, 운동중 화면이 **휴식 화면**(평소 휴식 시간)으로 뜨고 다음 운동이 `버드독` |
| ④ | 휴식을 건너뛴다 | 입력 화면이 `버드독 1세트`. 진행 표시가 인터벌 4세트 완료를 반영한다(예: `4 / 7`) |
| ⑤ | 최소화 → 목록에서 `푸시업`의 삭제를 누른다 | 토스트 `인터벌 종목은 운동 중에 빼거나 옮길 수 없어요`, 푸시업이 **그대로** 있다 |
| ⑥ | 버드독 2세트 → 데드버그 1세트 완료 | 평소처럼 완료 화면으로 넘어간다. 기록 탭 달력 그날 기록 **1개**, 종목 **6개**, `🔥 전신 인터벌 4분` 표시 |
| ⑦ | 같은 방식으로 섞인 계획을 하나 더 만들고, 버드독 reps를 12로 올려 완료한다 | 완료 화면 기록 갱신에 **버드독**이 뜬다(이어하기가 지난 기록이 됐다). 인터벌 종목(푸시업 등)은 갱신 문구에 **안 뜬다** |
| ⑧ | 순수 인터벌 계획 시작 → 음원 끝 | **예전처럼 바로 완료 화면** |
| ⑨ | 달력에서 섞인 계획(새로 하나 만든 것) → 카드 | `인터벌 뒤에 이어서: 버드독 · 데드버그` 줄 → `수정` → 시트에 이어하기 박스 → 저장 → 카드에 이어하기가 **남아 있다** |
| ⑩ | 375px 너비 | 배너·시트·카드 줄이 넘치지 않는다 |
| ⑪ | 휴식이 끝난 뒤 1분 동안 아무것도 안 한다 | (무동작 기준 시간 전까지) 정지 창이 **안 뜬다**. 기준 시간을 넘기면 평소처럼 뜬다 — 이어하기 동안 감지가 켜져 있다는 뜻 |

이상이 있으면 **멈추고 고친 뒤 Step 1부터 다시** 한다.

- [ ] **Step 4: 픽스처 정리** — Step 2에서 만든 계획 중 남은 것을 지운다(픽스처 A의 그날 `title`로 한정해서). 세션 기록은 픽스처 기록이라 둔다.

- [ ] **Step 5: 커밋** (확인이 끝난 파일만 지정)

```bash
git add src/lib/domain/tabata.ts src/lib/domain/tabata.test.ts \
  src/components/record/tabata-sheet.tsx src/components/record/tabata-sheet.test.tsx \
  "src/app/(tabs)/record/page.tsx" \
  src/components/record/calendar-view.tsx src/components/record/calendar-view.test.tsx \
  src/lib/workout.ts src/lib/ai-coach/supabase-deps.ts \
  supabase/migrations/0113_interval_plan_contract_comment.sql \
  docs/chatgpt-plan-rules.md src/lib/domain/release-notes.data.json \
  docs/superpowers/specs/2026-09-29-interval-follow-up-design.md \
  docs/superpowers/plans/2026-09-29-interval-follow-up.md
git diff --cached | grep -nE "(sk-|eyJ|service_role|OPENROUTER_API_KEY=|password=)" || echo "secret scan clean"
git commit -m "$(cat <<'EOF'
feat(record): 인터벌 뒤 이어하기 — 음원이 끝나면 같은 세션에서 다음 종목으로

인터벌 계획의 앞 4개는 음원 인터벌, 5번째부터는 음원이 끝난 뒤 같은 세션에서
이어서 하는 일반 종목이다. 휴식 1회(세트 간 휴식과 같은 규칙) 뒤 운동중
화면으로 넘어가고 기록은 1개다. 인터벌 블록은 기록 갱신·지난 기록 비교에서 뺀다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: 사용자 Run, 배포, 운영 확인, 기록

- [ ] **Step 1: 사용자에게 Run 두 건을 요청한다** (SQL Editor, 순서 무관, 배포 전후 무관)

1. `supabase/migrations/0113_interval_plan_contract_comment.sql` 전체
2. 데이터 보정(파일로 남기지 않음 — 사용자 계정 한정 1회):
```sql
insert into public.exercise_catalog (name, body_part, exercise_type, measure, is_custom, created_by)
select v.name, v.body_part, v.exercise_type, v.measure, true, p.id
from public.profiles p
cross join (values
  ('Scapular Push-up Plus', '어깨', 'bodyweight', 'reps'),
  ('흉추 익스텐션', '등', 'bodyweight', 'reps'),
  ('도어웨이 가슴 스트레칭', '가슴', 'bodyweight', 'time'),
  ('Wall Slide', '어깨', 'bodyweight', 'reps')
) as v(name, body_part, exercise_type, measure)
where p.nickname = '오뎅끼데스까'
on conflict (created_by, name) where created_by is not null do nothing
returning name;
```
Run 뒤 읽기 전용으로 확인한다: 오뎅끼데스까 계정에서 이 4개 이름이 `custom(mine)`으로 보인다(`scratchpad/odenki-catalog.mjs`와 같은 방식).

- [ ] **Step 2: 배포 승인을 받는다** — 게이트 결과·화면 확인 표·Run 상태를 보여 주고 묻는다. 승인하면 **푸시는 따로 묻지 않는다**(전역 지침).

- [ ] **Step 3: 푸시 → 원격 확인**

```bash
git push origin main
git fetch origin --prune
git rev-list --left-right --count origin/main...main   # 0 0
git ls-remote --symref origin HEAD
```

- [ ] **Step 4: 배포** — 프로젝트 `CLAUDE.md`의 절차대로 한다. 검증된 로컬 `main`에서 `git archive HEAD`로 `.git` 없는 복사본을 만들고, `.vercel`과 필요한 환경 파일만 복사한 뒤 그 폴더에서 `vercel --prod`. deploy-guard 훅이 뜨면 항목마다 실제로 답할 수 있는지 점검한다.

- [ ] **Step 5: 운영 실물 확인**

- `https://gnd-one.vercel.app/record` 번들에 `인터벌 뒤에 이어서`·`인터벌 끝! 숨 고르고 이어서 해요`가 있다
- `/whats-new`에 새 항목이 있다
- 오뎅끼데스까의 다음 평일 계획(읽기 전용 조회): 앞 4개가 인터벌 종목이고, 수요일 앞 4개 이름이 전부 카탈로그에 있다(Run 2 뒤)
- `[미검증]` 실제 아이폰에서 음원이 끝난 뒤 휴식 끝 비프: 비프 준비는 사용자 탭 안에서 해야 하는데, 음원 종료 시점에는 탭이 없다. 토스트는 뜬다.

- [ ] **Step 6: 기록** — `PROGRESS.md` 맨 위에 항목을 추가한다(배포 id·게이트·화면 확인·Run 상태·`[미검증]`). `docs/superpowers/HANDOFF-2026-09-29-interval-follow-up.md`를 쓰고 커밋·푸시한다. **알림 발송 없음.**
