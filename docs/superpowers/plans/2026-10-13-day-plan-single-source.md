# 하루 계획 단일화 (운동 탭 = 달력 오늘) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운동 탭의 시작 전 목록과 달력에서 오늘을 눌렀을 때의 목록이 **같은 계획 하나**로 보이게 한다.

**Architecture:** 하루에 일반 계획(프로그램 회차·인터벌이 아닌 계획)은 **최대 하나**로 둔다. 일반 계획을 만들거나 더하는 모든 경로가 `addToDayPlan` 하나를 거치고, 이 함수는 "그날 일반 계획이 있으면 붙이고 없으면 만든다". 이미 생긴 중복은 같은 모듈의 `consolidateDayPlans`가 읽을 때 합친다. 운동 탭의 시작 전 목록은 그 계획을 그리는 화면 버퍼일 뿐 독립 원본이 아니다 — 읽을 때 DB가 이기고, 고치면 0.6초 안에 DB에 쓴다. 인터벌·프로그램 회차는 별도 카드로 두고 운동 탭에도 같은 카드를 보인다. 운동을 완료하면 세트를 하나도 안 한 종목은 오늘 계획에 남긴다.

**Tech Stack:** Next.js(App Router) · React · TypeScript · Supabase(`workout_plans`) · Vitest · Testing Library. DB 변경 없음.

**사용자 결정 (2026-10-13)**
1. 운동 탭 목록과 달력 오늘 목록은 하나의 운동 계획처럼 같아야 한다.
2. 인터벌·프로그램 회차는 지금처럼 별도 카드, 운동 탭에도 같은 카드를 보인다.
3. 일부만 하고 완료하면 세트를 하나도 안 한 종목은 오늘 계획에 남긴다.

**왜 이렇게 하나 (제1원리 분석 요약)**
- 0102(2026-09-04)가 하루 계획 여러 개를 허용했지만, 운동 탭은 2026-10-05 동기화에서 "오늘 계획 한 줄"만 묶는다(`todayCandidate`). 계획이 둘이면 운동 탭이 하나를 숨긴다 — 신고된 화면이 이것이다.
- 계획을 쓰는 곳이 7군데이고 그중 5군데가 그날 계획이 있어도 **새 행을 만든다**: 운동 탭 push `create`(`record/page.tsx:1011`), 지난 기록 예정(`record/page.tsx:2450`), 달력 새 계획 3곳(`calendar-view.tsx:1010·1045·1071`). 동기화를 아무리 다듬어도 대상이 둘이면 어긋난다.
- 그래서 "어디서 추가하든 하나의 규칙으로 같은 행에 쓴다"를 근본 해결로 삼는다. 입구(운동 탭·달력)는 둘 다 필요하므로 그대로 둔다.
- 0102의 "오전·오후 일반 계획을 따로"는 이 결정으로 사라진다(사용자 결정 1). 인터벌·프로그램은 예외로 남는다.

**알려진 한계 (받아들인 것)**
- 두 기기가 같은 순간에 그날 첫 계획을 만들면 행이 둘 생길 수 있다. 다음 읽기의 `consolidateDayPlans`가 합친다. DB 제약은 지난 날짜의 기존 중복 때문에 걸 수 없어 두지 않는다.
- 합칠 때 같은 이름의 종목은 먼저 만든 계획의 세트를 남긴다.
- **추천 운동 담기(`suggestedForDayKey`)는 그대로 둔다.** 앱이 담아 준 제안은 사용자가 한 종목이라도 고치기 전까지 계획이 아니다 — 계획으로 쓰면 운동 안 한 날이 월간 완료율의 분모에 들어간다(2026-10-07 월간 요약). 그 상태에서는 운동 탭에만 보이고 달력에는 안 보인다. 고치는 순간 계획이 된다(기존 규칙).
- 일부만 하고 남긴 계획은 자정이 지나면 지난 계획으로 잠긴다(0116).

---

## 파일 구조

| 파일 | 역할 | 상태 |
|---|---|---|
| `src/lib/domain/day-plan.ts` | 순수 규칙: 일반 계획 판정, 합치기, 중복 정리 계획, 완료 후 남길 종목 | 새로 |
| `src/lib/domain/day-plan.test.ts` | 위 규칙 테스트 | 새로 |
| `src/lib/day-plan-store.ts` | DB 조합: `consolidateDayPlans`·`addToDayPlan`·`settlePlanAfterWorkout`·`consolidateUpcomingPlans` | 새로 |
| `src/lib/day-plan-store.test.ts` | `@/lib/workout-plan`을 mock해서 조합 테스트 | 새로 |
| `src/lib/domain/workout-import.ts` | 이름 정규화 함수 export (중복 판정 규칙 하나로) | 수정 |
| `src/lib/domain/workout-plan.ts` | `SyncPlan`에 `programEnrollmentId`, `todayCandidate` 일반 계획만, pull `absorb`·`special` 분기, push 프로그램 금지 | 수정 |
| `src/lib/domain/workout-plan.test.ts` | 위 판정 테스트 갱신·추가 | 수정 |
| `src/components/record/today-plan-cards.tsx` | 운동 탭의 인터벌·프로그램 카드 | 새로 |
| `src/components/record/today-plan-cards.test.tsx` | 카드 렌더·클릭 테스트 | 새로 |
| `src/app/(tabs)/record/page.tsx` | push/pull/완료/지난 기록 예정/계획 불러오기 연결 | 수정 |
| `src/components/record/calendar-view.tsx` | 새 계획 3곳·수정 저장·날짜 이동·중복 정리·버튼 문구 | 수정 |
| `src/components/record/calendar-view.test.tsx` | 달력 동작 테스트 갱신·추가 | 수정 |
| `src/lib/domain/release-notes.data.json` | 새소식 항목 | 수정 |
| `PROGRESS.md`, `docs/superpowers/HANDOFF-2026-10-13-day-plan-single-source.md` | 인수인계 | 수정·새로 |

---

### Task 0: 현재 상태 확인 (읽기만)

**Files:** 없음

- [ ] **Step 1: 작업 브랜치 만들기**

```bash
cd /c/Users/SAMSUNG/workout-app
git status --short          # 추적 파일 변경이 없어야 한다 (미추적 tmp_*.png 등은 무관)
git switch -c fix/day-plan-single-source
```

- [ ] **Step 2: 기준 테스트가 초록인지 확인**

Run: `pnpm test -- src/lib/domain/workout-plan.test.ts src/components/record/calendar-view.test.tsx`
Expected: PASS (실패하면 이 계획 전에 원인을 먼저 본다)

- [ ] **Step 3: (선택) 운영 중복 규모 확인 — 사용자가 SQL Editor에서 Run, 읽기 전용**

```sql
select plan_date >= (now() at time zone 'Asia/Seoul')::date as upcoming,
       count(*) as days_with_duplicates
from (
  select user_id, plan_date
  from public.workout_plans
  where program_enrollment_id is null and tabata_minutes is null
  group by 1, 2
  having count(*) > 1
) d
group by 1;
```

Expected: 숫자만 기록한다. 결과와 관계없이 아래 작업은 같다(오늘·미래 중복은 읽을 때 합쳐진다, 지난 중복은 0116 잠금으로 손대지 않는다).

---

### Task 1: 이름 정규화 함수를 하나로

**Files:**
- Modify: `src/lib/domain/workout-import.ts:82-84`

- [ ] **Step 1: `normalizedName`을 export하고 이름을 분명히 한다**

`src/lib/domain/workout-import.ts`에서

```ts
function normalizedName(name: string): string {
  return name.trim().toLocaleLowerCase("ko-KR");
}
```

를 아래로 바꾸고, 같은 파일 안의 `normalizedName(` 호출 2곳을 `normalizedExerciseName(`으로 바꾼다.

```ts
/**
 * 종목 이름 비교 규칙 — 지난 기록 불러오기와 계획 합치기가 **같은 규칙**을 쓴다.
 * 두 벌로 두면 한쪽만 고쳐졌을 때 "이미 있는 운동"의 기준이 갈린다.
 */
export function normalizedExerciseName(name: string): string {
  return name.trim().toLocaleLowerCase("ko-KR");
}
```

- [ ] **Step 2: 기존 테스트 확인**

Run: `pnpm test -- src/lib/domain/workout-import`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/domain/workout-import.ts
git commit -m "refactor(plan): export exercise name normalizer for plan merging"
```

---

### Task 2: 하루 계획 규칙 (순수 함수)

**Files:**
- Create: `src/lib/domain/day-plan.ts`
- Test: `src/lib/domain/day-plan.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/domain/day-plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  datesNeedingMerge,
  isGeneralPlan,
  mergePlanExercises,
  pickDayGeneralPlan,
  planDayMerge,
  remainingAfterWorkout,
} from "./day-plan";
import type { PlanExercise } from "./workout-plan";

function ex(name: string, reps = 10): PlanExercise {
  return {
    name,
    bodyPart: "하체",
    exerciseType: "bodyweight",
    measure: "reps",
    isCustom: false,
    sets: [{ weightKg: 0, reps, distanceKm: 0, durationMin: 0 }],
  };
}

function plan(
  id: string,
  over: Partial<{
    planDate: string;
    tabataMinutes: number | null;
    programEnrollmentId: string | null;
    exercises: PlanExercise[];
  }> = {},
) {
  return {
    id,
    planDate: "2026-10-13",
    tabataMinutes: null,
    programEnrollmentId: null,
    exercises: [ex(`${id}-종목`)],
    ...over,
  };
}

describe("isGeneralPlan", () => {
  it("인터벌·프로그램 회차가 아니면 일반 계획이다", () => {
    expect(isGeneralPlan(plan("a"))).toBe(true);
    expect(isGeneralPlan(plan("b", { tabataMinutes: 8 }))).toBe(false);
    expect(isGeneralPlan(plan("c", { programEnrollmentId: "e1" }))).toBe(false);
  });
});

describe("pickDayGeneralPlan", () => {
  it("인터벌·프로그램을 건너뛰고 첫 일반 계획을 고른다", () => {
    const general = plan("g");
    expect(
      pickDayGeneralPlan([
        plan("i", { tabataMinutes: 4 }),
        plan("p", { programEnrollmentId: "e1" }),
        general,
      ]),
    ).toBe(general);
  });

  it("일반 계획이 없으면 null", () => {
    expect(pickDayGeneralPlan([plan("i", { tabataMinutes: 4 })])).toBeNull();
  });
});

describe("mergePlanExercises", () => {
  it("이름이 겹치지 않는 종목만 뒤에 붙인다 (대소문자·앞뒤 공백 무시)", () => {
    const result = mergePlanExercises(
      [ex("점프 스쿼트", 25)],
      [ex(" 점프 스쿼트 ", 5), ex("풀업")],
    );
    expect(result.exercises.map((e) => e.name)).toEqual(["점프 스쿼트", "풀업"]);
    expect(result.exercises[0].sets[0].reps).toBe(25);
    expect(result.skippedCount).toBe(1);
  });
});

describe("planDayMerge", () => {
  it("일반 계획이 하나 이하면 할 일이 없다", () => {
    expect(planDayMerge([plan("a"), plan("i", { tabataMinutes: 4 })])).toBeNull();
  });

  it("첫 일반 계획에 나머지를 합치고 나머지는 지운다 — 신고 화면 재현", () => {
    const jump = plan("a", { exercises: [ex("점프 스쿼트", 25)] });
    const pull = plan("b", { exercises: [ex("풀업", 4), ex("밴드 레터럴 레이즈", 12)] });
    const program = plan("p", { programEnrollmentId: "e1" });
    expect(planDayMerge([jump, program, pull])).toEqual({
      keepId: "a",
      exercises: [ex("점프 스쿼트", 25), ex("풀업", 4), ex("밴드 레터럴 레이즈", 12)],
      deleteIds: ["b"],
    });
  });
});

describe("datesNeedingMerge", () => {
  it("오늘 이후 날짜 중 일반 계획이 둘 이상인 날만 고른다", () => {
    expect(
      datesNeedingMerge(
        [
          plan("old1", { planDate: "2026-10-12" }),
          plan("old2", { planDate: "2026-10-12" }),
          plan("t1"),
          plan("t2"),
          plan("f1", { planDate: "2026-10-20" }),
          plan("fi", { planDate: "2026-10-20", tabataMinutes: 8 }),
        ],
        "2026-10-13",
      ),
    ).toEqual(["2026-10-13"]);
  });
});

describe("remainingAfterWorkout", () => {
  const planned = [ex("점프 스쿼트"), ex("풀업"), ex("밴드 레터럴 레이즈")];

  it("세트를 하나라도 끝낸 종목은 빼고 나머지를 남긴다", () => {
    expect(
      remainingAfterWorkout(planned, [
        { name: "점프 스쿼트", sets: [{ done: true }, { done: false }] },
        { name: "풀업", sets: [{ done: false }] },
      ]).map((e) => e.name),
    ).toEqual(["풀업", "밴드 레터럴 레이즈"]);
  });

  it("다 했으면 빈 배열", () => {
    expect(
      remainingAfterWorkout(
        planned,
        planned.map((e) => ({ name: e.name, sets: [{ done: true }] })),
      ),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- src/lib/domain/day-plan.test.ts`
Expected: FAIL — `Failed to resolve import "./day-plan"`

- [ ] **Step 3: 구현**

`src/lib/domain/day-plan.ts`:

```ts
/**
 * 하루 계획 규칙 (사용자 결정 2026-10-13).
 *
 * 신고: 달력 오늘 칸에는 계획이 둘(점프 스쿼트 / 풀업·밴드 레터럴 레이즈)인데
 * 운동 탭에는 점프 스쿼트만 보였다. 0102가 하루 계획 여러 개를 허용했고, 운동
 * 탭은 그중 한 줄만 묶는다. 계획을 쓰는 7곳 중 5곳이 그날 계획이 있어도 새 행을
 * 만들었다.
 *
 * 결정: 하루 **일반 계획은 하나**. 인터벌·프로그램 회차는 구조가 달라(코스로
 * 열림 / 회차 진행률) 따로 둔다. 어디서 더하든 이 파일의 규칙으로 같은 행에 쓴다.
 *
 * ⚠️ DB 타입을 모른다 — `@/lib/day-plan-store.ts`가 조합한다.
 */
import { normalizedExerciseName } from "./workout-import";
import type { PlanExercise } from "./workout-plan";

export type DayPlanLike = {
  id: string;
  planDate: string;
  tabataMinutes: number | null;
  programEnrollmentId: string | null;
  exercises: PlanExercise[];
};

/**
 * ⚠️ `=== null`로 쓰지 마라. 0059·0066 이전 행과 테스트 고정값(`calendar-view.test`의
 *    `PLAN`)에는 두 필드가 **아예 없다**(undefined). 엄격 비교면 그 계획이 전부
 *    "특별 계획"으로 분류돼 운동 탭 목록에서 사라진다.
 */
export function isGeneralPlan(plan: {
  tabataMinutes?: number | null;
  programEnrollmentId?: string | null;
}): boolean {
  return !plan.tabataMinutes && !plan.programEnrollmentId;
}

/** 그날의 일반 계획. 목록은 조회가 정한 안정된 순서(예정 시각 → 만든 순서)다 */
export function pickDayGeneralPlan<P extends DayPlanLike>(plans: P[]): P | null {
  return plans.find(isGeneralPlan) ?? null;
}

/** 이름이 겹치지 않는 종목만 뒤에 붙인다 — 겹치면 원래 계획의 세트가 남는다 */
export function mergePlanExercises(
  base: PlanExercise[],
  added: PlanExercise[],
): { exercises: PlanExercise[]; skippedCount: number } {
  const known = new Set(base.map((item) => normalizedExerciseName(item.name)));
  const exercises = [...base];
  let skippedCount = 0;
  for (const item of added) {
    const name = normalizedExerciseName(item.name);
    if (!name || known.has(name)) {
      skippedCount += 1;
      continue;
    }
    known.add(name);
    exercises.push(item);
  }
  return { exercises, skippedCount };
}

export type DayPlanMerge = {
  keepId: string;
  exercises: PlanExercise[];
  deleteIds: string[];
};

/** 같은 날 일반 계획이 둘 이상이면 첫 것에 합칠 계획. 아니면 null */
export function planDayMerge<P extends DayPlanLike>(plans: P[]): DayPlanMerge | null {
  const general = plans.filter(isGeneralPlan);
  if (general.length < 2) return null;
  const [keep, ...rest] = general;
  let exercises = keep.exercises;
  for (const other of rest) {
    exercises = mergePlanExercises(exercises, other.exercises).exercises;
  }
  return { keepId: keep.id, exercises, deleteIds: rest.map((item) => item.id) };
}

/**
 * 합쳐야 할 날짜 — **오늘 이후만**. 지난 계획은 0116이 수정·삭제를 막는다
 * (놓친 계획을 지워 월간 완료율이 오르는 구멍). 건드리면 DB가 거절한다.
 */
export function datesNeedingMerge<P extends DayPlanLike>(
  plans: P[],
  todayKey: string,
): string[] {
  const counts = new Map<string, number>();
  for (const plan of plans) {
    if (!isGeneralPlan(plan) || plan.planDate < todayKey) continue;
    counts.set(plan.planDate, (counts.get(plan.planDate) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([date]) => date)
    .sort();
}

/**
 * 운동을 완료한 뒤 오늘 계획에 남길 종목 (사용자 결정 2026-10-13).
 *
 * 세트를 **하나라도** 끝낸 종목은 한 것으로 본다. 하나도 안 한 종목만 남는다 —
 * 하루 한 계획이 되면서, 예전처럼 통째로 지우면 "오전에 절반만"이 나머지까지
 * 지운다.
 */
export function remainingAfterWorkout(
  planned: PlanExercise[],
  workout: { name: string; sets: { done: boolean }[] }[],
): PlanExercise[] {
  const done = new Set(
    workout
      .filter((item) => item.sets.some((set) => set.done))
      .map((item) => normalizedExerciseName(item.name)),
  );
  return planned.filter((item) => !done.has(normalizedExerciseName(item.name)));
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test -- src/lib/domain/day-plan.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/day-plan.ts src/lib/domain/day-plan.test.ts
git commit -m "feat(plan): one general plan per day — pure merge rules"
```

---

### Task 3: 하루 계획 저장소 (DB 조합)

**Files:**
- Create: `src/lib/day-plan-store.ts`
- Test: `src/lib/day-plan-store.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/day-plan-store.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanExercise } from "@/lib/domain/workout-plan";
import type { WorkoutPlan } from "@/lib/workout-plan";

const mocks = vi.hoisted(() => ({
  getWorkoutPlansByDate: vi.fn(),
  getWorkoutPlanById: vi.fn(),
  createWorkoutPlan: vi.fn(),
  updateWorkoutPlan: vi.fn(),
  deleteWorkoutPlan: vi.fn(),
}));
vi.mock("@/lib/workout-plan", () => mocks);

import {
  addToDayPlan,
  consolidateDayPlans,
  consolidateUpcomingPlans,
  settlePlanAfterWorkout,
} from "./day-plan-store";

function ex(name: string): PlanExercise {
  return {
    name,
    bodyPart: "하체",
    exerciseType: "bodyweight",
    measure: "reps",
    isCustom: false,
    sets: [{ weightKg: 0, reps: 10, distanceKm: 0, durationMin: 0 }],
  };
}

function plan(id: string, over: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return {
    id,
    userId: "u1",
    planDate: "2026-10-13",
    sourceSessionId: null,
    exercises: [ex(`${id}-종목`)],
    tabataMinutes: null,
    title: null,
    scheduledAt: null,
    programEnrollmentId: null,
    programWeek: null,
    programSession: null,
    programTemplateVersion: null,
    createdAt: "c",
    updatedAt: "u",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateWorkoutPlan.mockImplementation(async (input) =>
    plan(input.planId, { exercises: input.exercises, updatedAt: "u2" }),
  );
  mocks.createWorkoutPlan.mockImplementation(async (input) =>
    plan("new", { planDate: input.planDate, exercises: input.exercises }),
  );
  mocks.deleteWorkoutPlan.mockResolvedValue(undefined);
});

describe("consolidateDayPlans", () => {
  it("일반 계획이 둘이면 첫 것에 합치고, 고친 뒤에 나머지를 지운다", async () => {
    const jump = plan("a", { exercises: [ex("점프 스쿼트")] });
    const pull = plan("b", { exercises: [ex("풀업")] });
    const interval = plan("i", { tabataMinutes: 8 });
    mocks.getWorkoutPlansByDate.mockResolvedValue([jump, interval, pull]);

    const result = await consolidateDayPlans("u1", "2026-10-13");

    expect(mocks.updateWorkoutPlan).toHaveBeenCalledWith({
      planId: "a",
      sourceSessionId: null,
      exercises: [ex("점프 스쿼트"), ex("풀업")],
      tabataMinutes: null,
    });
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("b");
    // 고치기가 지우기보다 먼저다 — 지우기만 성공하고 고치기가 실패하면 종목이 사라진다
    expect(mocks.updateWorkoutPlan.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteWorkoutPlan.mock.invocationCallOrder[0],
    );
    expect(result.map((p) => p.id)).toEqual(["a", "i"]);
  });

  it("중복이 없으면 쓰지 않는다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([plan("a")]);
    await consolidateDayPlans("u1", "2026-10-13");
    expect(mocks.updateWorkoutPlan).not.toHaveBeenCalled();
    expect(mocks.deleteWorkoutPlan).not.toHaveBeenCalled();
  });
});

describe("addToDayPlan", () => {
  it("그날 일반 계획이 없으면 만든다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([plan("i", { tabataMinutes: 4 })]);
    const result = await addToDayPlan({
      userId: "u1",
      planDate: "2026-10-13",
      exercises: [ex("풀업")],
    });
    expect(result.created).toBe(true);
    expect(mocks.createWorkoutPlan).toHaveBeenCalledWith({
      userId: "u1",
      planDate: "2026-10-13",
      sourceSessionId: null,
      exercises: [ex("풀업")],
    });
    expect(result.dayPlans.map((p) => p.id)).toEqual(["i", "new"]);
  });

  it("있으면 새로 만들지 않고 그 계획에 붙인다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([
      plan("a", { exercises: [ex("점프 스쿼트")] }),
    ]);
    const result = await addToDayPlan({
      userId: "u1",
      planDate: "2026-10-13",
      exercises: [ex("풀업"), ex("점프 스쿼트")],
    });
    expect(mocks.createWorkoutPlan).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: false, skippedCount: 1 });
    expect(result.plan.exercises.map((e) => e.name)).toEqual(["점프 스쿼트", "풀업"]);
  });

  it("더할 것이 전부 이미 있으면 쓰지 않는다", async () => {
    mocks.getWorkoutPlansByDate.mockResolvedValue([
      plan("a", { exercises: [ex("풀업")] }),
    ]);
    const result = await addToDayPlan({
      userId: "u1",
      planDate: "2026-10-13",
      exercises: [ex("풀업")],
    });
    expect(mocks.updateWorkoutPlan).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: false, skippedCount: 1 });
  });
});

describe("settlePlanAfterWorkout", () => {
  it("하나도 안 한 종목만 남긴다", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(
      plan("a", { exercises: [ex("점프 스쿼트"), ex("풀업")] }),
    );
    await settlePlanAfterWorkout("a", [
      { name: "점프 스쿼트", sets: [{ done: true }] },
      { name: "풀업", sets: [{ done: false }] },
    ]);
    expect(mocks.updateWorkoutPlan).toHaveBeenCalledWith({
      planId: "a",
      sourceSessionId: null,
      exercises: [ex("풀업")],
      tabataMinutes: null,
    });
    expect(mocks.deleteWorkoutPlan).not.toHaveBeenCalled();
  });

  it("다 했으면 지운다", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(plan("a", { exercises: [ex("풀업")] }));
    await settlePlanAfterWorkout("a", [{ name: "풀업", sets: [{ done: true }] }]);
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("a");
  });

  it("계획 종목을 하나도 안 했으면 그대로 둔다", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(plan("a", { exercises: [ex("풀업")] }));
    await settlePlanAfterWorkout("a", [{ name: "푸시업", sets: [{ done: true }] }]);
    expect(mocks.updateWorkoutPlan).not.toHaveBeenCalled();
    expect(mocks.deleteWorkoutPlan).not.toHaveBeenCalled();
  });

  it("인터벌·프로그램 회차는 예전처럼 통째로 지운다 — 회차 진행률은 세션이 센다", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(plan("p", { programEnrollmentId: "e1" }));
    await settlePlanAfterWorkout("p", []);
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("p");
  });

  it("이미 없어진 계획이면 아무것도 안 한다", async () => {
    mocks.getWorkoutPlanById.mockResolvedValue(null);
    await settlePlanAfterWorkout("x", []);
    expect(mocks.deleteWorkoutPlan).not.toHaveBeenCalled();
  });
});

describe("consolidateUpcomingPlans", () => {
  it("오늘 이후 중복 날짜만 합치고 전체 목록을 갈아 끼운다", async () => {
    const old1 = plan("o1", { planDate: "2026-10-12" });
    const old2 = plan("o2", { planDate: "2026-10-12" });
    const t1 = plan("t1");
    const t2 = plan("t2");
    mocks.getWorkoutPlansByDate.mockResolvedValue([t1, t2]);

    const result = await consolidateUpcomingPlans(
      "u1",
      [old1, old2, t1, t2],
      "2026-10-13",
    );

    expect(mocks.getWorkoutPlansByDate).toHaveBeenCalledTimes(1);
    expect(mocks.deleteWorkoutPlan).toHaveBeenCalledWith("t2");
    expect(result.map((p) => p.id)).toEqual(["o1", "o2", "t1"]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- src/lib/day-plan-store.test.ts`
Expected: FAIL — `Failed to resolve import "./day-plan-store"`

- [ ] **Step 3: 구현**

`src/lib/day-plan-store.ts`:

```ts
/**
 * 하루 계획 저장소 (사용자 결정 2026-10-13) — 규칙은 `domain/day-plan.ts`.
 *
 * 일반 계획을 **만들거나 더하는 곳은 전부** `addToDayPlan`을 부른다. 운동 탭
 * push, 달력 새 계획(검색·설정·루틴·지난 기록), 날짜 이동 합치기가 여기를 거친다.
 * `createWorkoutPlan`을 일반 계획에 직접 부르면 그날 계획이 둘이 되고, 운동 탭은
 * 하나만 보여 준다 — 2026-10-13 신고가 그것이었다. 인터벌 계획만 예외로 직접 만든다.
 *
 * ⚠️ 쓰는 순서는 언제나 **고치기 → 지우기**다. 반대로 하면 지우기만 성공했을 때
 *    종목이 사라진다. 고치기만 성공하면 다음 읽기에서 같은 이름이 걸러져 다시 합쳐진다.
 */
import {
  datesNeedingMerge,
  isGeneralPlan,
  mergePlanExercises,
  pickDayGeneralPlan,
  planDayMerge,
  remainingAfterWorkout,
} from "@/lib/domain/day-plan";
import type { PlanExercise } from "@/lib/domain/workout-plan";
import {
  createWorkoutPlan,
  deleteWorkoutPlan,
  getWorkoutPlanById,
  getWorkoutPlansByDate,
  updateWorkoutPlan,
  type WorkoutPlan,
} from "@/lib/workout-plan";

/** 그날 계획 전부를 읽고, 일반 계획이 둘 이상이면 하나로 합친 결과를 돌려준다 */
export async function consolidateDayPlans(
  userId: string,
  planDate: string,
): Promise<WorkoutPlan[]> {
  const plans = await getWorkoutPlansByDate(userId, planDate);
  return applyDayMerge(plans);
}

async function applyDayMerge(plans: WorkoutPlan[]): Promise<WorkoutPlan[]> {
  const merge = planDayMerge(plans);
  if (!merge) return plans;
  const keep = plans.find((plan) => plan.id === merge.keepId)!;
  const saved = await updateWorkoutPlan({
    planId: keep.id,
    sourceSessionId: keep.sourceSessionId,
    exercises: merge.exercises,
    tabataMinutes: null,
  });
  for (const id of merge.deleteIds) await deleteWorkoutPlan(id);
  return plans
    .filter((plan) => !merge.deleteIds.includes(plan.id))
    .map((plan) => (plan.id === saved.id ? saved : plan));
}

export type DayPlanAddResult = {
  /** 종목이 들어간 그날의 일반 계획 */
  plan: WorkoutPlan;
  /** 그날 계획 전부 (합친 뒤) — 달력이 이 날짜를 통째로 갈아 끼운다 */
  dayPlans: WorkoutPlan[];
  created: boolean;
  skippedCount: number;
};

/** 그날 일반 계획이 있으면 붙이고, 없으면 만든다 */
export async function addToDayPlan(input: {
  userId: string;
  planDate: string;
  exercises: PlanExercise[];
  sourceSessionId?: string | null;
}): Promise<DayPlanAddResult> {
  const dayPlans = await consolidateDayPlans(input.userId, input.planDate);
  const general = pickDayGeneralPlan(dayPlans);
  if (!general) {
    const plan = await createWorkoutPlan({
      userId: input.userId,
      planDate: input.planDate,
      sourceSessionId: input.sourceSessionId ?? null,
      exercises: input.exercises,
    });
    return { plan, dayPlans: [...dayPlans, plan], created: true, skippedCount: 0 };
  }
  const merged = mergePlanExercises(general.exercises, input.exercises);
  if (merged.exercises.length === general.exercises.length) {
    return { plan: general, dayPlans, created: false, skippedCount: merged.skippedCount };
  }
  const plan = await updateWorkoutPlan({
    planId: general.id,
    // 넘기지 않으면 null로 덮인다 — 원본 세션 연결을 잃지 않는다
    sourceSessionId: general.sourceSessionId,
    exercises: merged.exercises,
    tabataMinutes: null,
  });
  return {
    plan,
    dayPlans: dayPlans.map((item) => (item.id === plan.id ? plan : item)),
    created: false,
    skippedCount: merged.skippedCount,
  };
}

/**
 * 운동을 완료한 뒤 묶인 계획을 정리한다 (사용자 결정 2026-10-13).
 * 예전에는 무조건 지웠다(`record/page.tsx` 완료 흐름).
 */
export async function settlePlanAfterWorkout(
  planId: string,
  workout: { name: string; sets: { done: boolean }[] }[],
): Promise<void> {
  const plan = await getWorkoutPlanById(planId);
  if (!plan) return;
  if (!isGeneralPlan(plan)) {
    await deleteWorkoutPlan(plan.id);
    return;
  }
  const remaining = remainingAfterWorkout(plan.exercises, workout);
  if (remaining.length === 0) {
    await deleteWorkoutPlan(plan.id);
    return;
  }
  if (remaining.length === plan.exercises.length) return;
  await updateWorkoutPlan({
    planId: plan.id,
    sourceSessionId: plan.sourceSessionId,
    exercises: remaining,
    tabataMinutes: null,
  });
}

/**
 * 달력이 받은 전 기간 목록에서 **오늘 이후** 중복 날짜를 합친다.
 * 지난 날짜는 0116 잠금 때문에 건드리지 않는다(`datesNeedingMerge`).
 */
export async function consolidateUpcomingPlans(
  userId: string,
  plans: WorkoutPlan[],
  todayKey: string,
): Promise<WorkoutPlan[]> {
  let next = plans;
  for (const date of datesNeedingMerge(plans, todayKey)) {
    const merged = await consolidateDayPlans(userId, date);
    next = [...next.filter((plan) => plan.planDate !== date), ...merged];
  }
  return next;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test -- src/lib/day-plan-store.test.ts`
Expected: PASS (11 tests)

> `consolidateUpcomingPlans` 테스트의 기대 순서는 `[o1, o2, t1]`이다 — 합친 날짜를 뒤에 붙인다. 달력은 날짜로 묶어 그리므로 목록 순서는 화면에 영향이 없다.

- [ ] **Step 5: Commit**

```bash
git add src/lib/day-plan-store.ts src/lib/day-plan-store.test.ts
git commit -m "feat(plan): addToDayPlan / consolidate / settle — single write path for day plans"
```

---

### Task 4: 운동 탭 동기화 판정 고치기

**Files:**
- Modify: `src/lib/domain/workout-plan.ts:316-323` (`SyncPlan`), `:369-385` (`decidePlanPush`), `:387-459` (`PlanPull`·`todayCandidate`·`decidePlanPull`)
- Test: `src/lib/domain/workout-plan.test.ts:441-557`

바뀌는 판정:
1. 오늘 후보는 **일반 계획만** 고른다(예전엔 프로그램 회차도 골라 목록에 자동으로 담았다 → 이제 카드).
2. 연결된 계획이 없는데 사용자가 직접 담은 목록이 있으면 `absorb` — 오늘 계획에 합치고 연결한다(예전엔 `none` → 뒤이은 push가 새 행을 만들었다).
3. 시작 전 목록이 프로그램·인터벌 계획에 묶여 있으면 `clear`(`special`)하고 일반 계획을 담는다 — 그 회차는 카드에서 시작한다.
4. push는 프로그램 회차에 묶인 목록을 쓰지 않는다(RLS가 막기도 한다).

- [ ] **Step 1: 실패하는 테스트 추가·수정**

`src/lib/domain/workout-plan.test.ts`의 `plan` 헬퍼(442행 부근)를 `programEnrollmentId`를 받도록 바꾼다:

```ts
  const plan = (
    over: Partial<{
      id: string;
      planDate: string;
      updatedAt: string;
      tabataMinutes: number | null;
      programEnrollmentId: string | null;
    }> = {},
  ) => ({
    id: "p1",
    planDate: "2026-10-05",
    updatedAt: "t1",
    tabataMinutes: null,
    programEnrollmentId: null,
    exercises: planEx,
    ...over,
  });
```

`describe("push — …")` 안에 추가:

```ts
    it("프로그램 회차에 묶인 목록은 쓰지 않는다 — 회차는 카드에서만 시작한다", () => {
      const changed = { ...squat, sets: [{ ...squat.sets[0], reps: 12 }] };
      expect(
        decidePlanPush(
          { ...draft, scheduledPlanId: "p1", exercises: [changed], program: { week: 1 } },
          mark,
        ).kind,
      ).toBe("none");
    });
```

`describe("pull — …")` 안의 `"이미 담은 것이 있으면 오늘 계획을 덮지 않는다"`를 아래 두 개로 **바꾼다**:

```ts
    it("연결 없이 직접 담은 목록이 있으면 오늘 계획에 합친다 — 새 행을 만들지 않는다", () => {
      expect(decidePlanPull({ ...base, draft, todayPlans: [plan()] })).toEqual({ kind: "absorb" });
    });

    it("앱이 담아 준 제안은 합치지 않는다 — 고치기 전까지 계획이 아니다", () => {
      expect(
        decidePlanPull({
          ...base,
          draft: { ...draft, suggestedForDayKey: "2026-10-05" },
          todayPlans: [plan()],
        }).kind,
      ).toBe("none");
    });
```

같은 `describe` 안에 추가:

```ts
    it("프로그램 회차는 목록에 자동으로 담지 않는다 — 카드로 보인다", () => {
      const program = plan({ id: "pp", programEnrollmentId: "e1" });
      expect(decidePlanPull({ ...base, todayPlans: [program] }).kind).toBe("none");
      const general = plan({ id: "g" });
      expect(decidePlanPull({ ...base, todayPlans: [program, general] })).toEqual({
        kind: "load",
        plan: general,
      });
    });

    it("시작 전 목록이 프로그램 회차에 묶여 있으면 비우고 일반 계획을 담는다", () => {
      const program = plan({ programEnrollmentId: "e1" });
      const general = plan({ id: "g" });
      expect(
        decidePlanPull({
          ...base,
          draft: { ...draft, scheduledPlanId: "p1", program: { week: 1 } },
          todayPlans: [program, general],
          bound: program,
          mark,
        }),
      ).toEqual({ kind: "clear", reason: "special", next: general });
    });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- src/lib/domain/workout-plan.test.ts`
Expected: FAIL — 새 테스트 5개 (`absorb`·`special` 미구현, 프로그램 push가 `update`, 프로그램 자동 담기)

- [ ] **Step 3: 구현**

`src/lib/domain/workout-plan.ts` 맨 위 import에 추가:

```ts
import { isGeneralPlan } from "./day-plan";
```

> 순환 import 확인: `day-plan.ts`는 `workout-plan.ts`에서 **타입만** 가져온다(`import type`). 런타임 순환이 없다.

`SyncPlan`(317행 부근)에 필드 추가:

```ts
export type SyncPlan = {
  id: string;
  planDate: string;
  updatedAt: string;
  tabataMinutes: number | null;
  /** 프로그램 회차면 등록 id — 회차는 목록에 담지 않고 카드로 보인다 (2026-10-13) */
  programEnrollmentId: string | null;
  exercises: PlanExercise[];
};
```

`decidePlanPush` 첫 줄들을 바꾼다:

```ts
  if (draft.startedAtMs !== null || draft.tabataMinutes) return { kind: "none" };
  if (draft.suggestedForDayKey !== null) return { kind: "none" };
  // 프로그램 회차는 운동 탭이 고치지 않는다 — RLS도 막는다 (0066)
  if (draft.program) return { kind: "none" };
```

그리고 아래쪽의 `return draft.program ? { kind: "none" } : { kind: "delete", planId };`는 바로 위에서 걸렀으므로 `return { kind: "delete", planId };`로 줄인다.

`PlanPull` 타입을 바꾼다:

```ts
export type PlanPull<P extends SyncPlan> =
  | { kind: "none" }
  /** 달력(또는 다른 기기)이 묶인 계획을 고쳤다 — 목록을 계획으로 바꾼다 */
  | { kind: "adopt"; plan: P }
  /**
   * 묶인 계획이 오늘 일반 계획이 아니게 됐다 — 목록을 비운다.
   * `deleted` 달력에서 지움 · `moved` 다른 날로 옮김 · `stale` 날이 바뀜(어제 계획)
   * · `special` 시작 전 목록이 프로그램·인터벌 계획에 묶여 있음(카드에서 시작한다).
   * `next`는 비운 뒤 대신 담을 오늘 일반 계획(있으면).
   */
  | { kind: "clear"; reason: "deleted" | "moved" | "stale" | "special"; next: P | null }
  /** 빈 목록인데 오늘 일반 계획이 있다 — 담는다 */
  | { kind: "load"; plan: P }
  /**
   * 연결 없이 사용자가 직접 담은 목록이 있다 — 오늘 계획에 **합치고** 연결한다
   * (2026-10-13). 예전엔 `none`이었고, 뒤이은 push가 새 행을 만들어 하루 계획이
   * 둘이 됐다.
   */
  | { kind: "absorb" };
```

`todayCandidate`를 바꾼다:

```ts
function todayCandidate<P extends SyncPlan>(todayPlans: P[]): P | undefined {
  // 일반 계획만 — 인터벌·프로그램 회차는 운동 탭에 카드로 보인다 (2026-10-13)
  return todayPlans.find(isGeneralPlan);
}
```

`decidePlanPull`의 묶인 계획 분기(`if (draft.scheduledPlanId) { … }`)를 바꾼다:

```ts
  if (draft.scheduledPlanId) {
    const special = bound !== null && !isGeneralPlan(bound);
    if (!bound || bound.planDate !== todayKey || special) {
      const next = todayCandidate(
        todayPlans.filter((plan) => plan.id !== draft.scheduledPlanId),
      );
      return {
        kind: "clear",
        reason: !bound
          ? "deleted"
          : special
            ? "special"
            : bound.planDate > todayKey
              ? "moved"
              : "stale",
        next:
          next &&
          shouldAutoLoadTodayPlan({
            plan: next,
            todayKey,
            draftExerciseCount: 0,
            draftScheduledPlanId: null,
            active: false,
          })
            ? next
            : null,
      };
    }
    if (mark?.planId === bound.id && mark.updatedAt !== bound.updatedAt) {
      return { kind: "adopt", plan: bound };
    }
    return { kind: "none" };
  }

  if (draft.exercises.length > 0) {
    return draft.suggestedForDayKey === null ? { kind: "absorb" } : { kind: "none" };
  }
```

마지막 `const plan = todayCandidate(todayPlans); return shouldAutoLoadTodayPlan(...)` 부분은 그대로 둔다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm test -- src/lib/domain/workout-plan.test.ts src/lib/domain/day-plan.test.ts`
Expected: PASS

- [ ] **Step 5: 타입 확인 — `SyncPlan`에 필드가 늘어서 부르는 쪽이 깨지는지**

Run: `pnpm typecheck`
Expected: PASS. `WorkoutPlan`은 이미 `programEnrollmentId`를 가지므로 `record/page.tsx`의 호출은 그대로 통과해야 한다. 오류가 나면 그 파일·행을 이 Task에서 고친다.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/workout-plan.ts src/lib/domain/workout-plan.test.ts
git commit -m "fix(plan-sync): absorb unbound lists into today's plan, program sessions as cards"
```

---

### Task 5: 운동 탭의 인터벌·프로그램 카드

**Files:**
- Create: `src/components/record/today-plan-cards.tsx`
- Test: `src/components/record/today-plan-cards.test.tsx`

지금 `record/page.tsx:3865-3897`의 인터벌 배너는 **첫 번째 인터벌 하나만** 보인다. 이것을 인터벌·프로그램 계획 전부를 카드로 그리는 컴포넌트로 바꾼다. 문구·`data-testid="today-interval-start"`는 인터벌 카드에 그대로 둔다(기존 테스트·습관 유지).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/record/today-plan-cards.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkoutPlan } from "@/lib/workout-plan";
import { TodayPlanCards } from "./today-plan-cards";

// vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다 (CLAUDE.md §함정)
afterEach(() => cleanup());

function plan(id: string, over: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return {
    id,
    userId: "u1",
    planDate: "2026-10-13",
    sourceSessionId: null,
    exercises: [
      {
        name: "풀업",
        bodyPart: "등",
        exerciseType: "bodyweight",
        measure: "reps",
        isCustom: false,
        sets: [{ weightKg: 0, reps: 5, distanceKm: 0, durationMin: 0 }],
      },
    ],
    tabataMinutes: null,
    title: null,
    scheduledAt: null,
    programEnrollmentId: null,
    programWeek: null,
    programSession: null,
    programTemplateVersion: null,
    createdAt: "c",
    updatedAt: "u",
    ...over,
  };
}

describe("TodayPlanCards", () => {
  it("인터벌과 프로그램 회차를 각각 카드로 그리고, 일반 계획은 그리지 않는다", () => {
    render(
      <TodayPlanCards
        plans={[
          plan("g"),
          plan("i", { tabataMinutes: 8 }),
          plan("p", { programEnrollmentId: "e1", title: "풀업 6주" }),
        ]}
        disabled={false}
        onStart={() => {}}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByTestId("today-interval-start")).toBeTruthy();
    expect(screen.getByText("풀업 6주")).toBeTruthy();
  });

  it("누르면 그 계획으로 시작을 부른다", () => {
    const onStart = vi.fn();
    const program = plan("p", { programEnrollmentId: "e1", title: "풀업 6주" });
    render(<TodayPlanCards plans={[program]} disabled={false} onStart={onStart} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onStart).toHaveBeenCalledWith(program);
  });

  it("특별 계획이 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(
      <TodayPlanCards plans={[plan("g")]} disabled={false} onStart={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- src/components/record/today-plan-cards.test.tsx`
Expected: FAIL — `Failed to resolve import "./today-plan-cards"`

- [ ] **Step 3: 구현**

`src/components/record/today-plan-cards.tsx`:

```tsx
"use client";

import { Icon } from "@/components/ui/icon";
import { isGeneralPlan } from "@/lib/domain/day-plan";
import { intervalPlanLine } from "@/lib/domain/tabata";
import type { WorkoutPlan } from "@/lib/workout-plan";

/**
 * 운동 탭의 오늘 인터벌·프로그램 회차 카드 (사용자 결정 2026-10-13).
 *
 * 일반 계획은 운동 목록 자체가 그 계획이라 카드를 그리지 않는다. 인터벌(4·8·16분
 * 코스)과 프로그램 회차(회차 진행률)는 구조가 달라 일반 계획에 합칠 수 없어서,
 * 달력과 **같은 단위로** 여기에 카드로 보인다. 예전엔 첫 인터벌 하나만 보였고
 * 프로그램 회차는 목록에 자동으로 담겼다.
 *
 * ⚠️ 누르면 인터벌은 시트를 연다(바로 시작 안 함, 2026-08-25). 프로그램은 달력의
 *    `운동 시작하기`와 같이 바로 시작한다 — 고르는 것은 부르는 쪽(`onStart`)이 한다.
 */
export function TodayPlanCards({
  plans,
  disabled,
  onStart,
}: {
  plans: WorkoutPlan[];
  disabled: boolean;
  onStart: (plan: WorkoutPlan) => void;
}) {
  const special = plans.filter((plan) => !isGeneralPlan(plan));
  if (special.length === 0) return null;
  return (
    <>
      {special.map((plan) => {
        const interval = Boolean(plan.tabataMinutes);
        const names = plan.exercises.map((item) => item.name);
        return (
          <button
            key={plan.id}
            type="button"
            data-testid={interval ? "today-interval-start" : "today-program-start"}
            disabled={disabled}
            onClick={() => onStart(plan)}
            className="mb-3 flex w-full items-center justify-between gap-3 rounded-card border border-accent/55 bg-surface px-4 py-3.5 text-left disabled:opacity-60"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-black text-text">
                {interval && <Icon name="interval" size={17} className="text-accent" />}
                {interval ? "오늘은 전신 인터벌이에요" : (plan.title ?? "오늘 프로그램 회차")}
              </span>
              {/* break-keep: 375px에서 단어 중간이 끊겼다 (2026-09-29) */}
              <span className="mt-0.5 block break-keep text-[11.5px] leading-4 text-muted">
                {interval ? intervalPlanLine(names) : names.join(" · ")}
              </span>
            </span>
            <span className="flex-none text-xs font-extrabold text-accent">
              시작하기
            </span>
          </button>
        );
      })}
    </>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test -- src/components/record/today-plan-cards.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/record/today-plan-cards.tsx src/components/record/today-plan-cards.test.tsx
git commit -m "feat(record): show today's interval and program plans as cards"
```

---

### Task 6: 운동 탭 연결 (`record/page.tsx`)

**Files:**
- Modify: `src/app/(tabs)/record/page.tsx` — import(218-225), 상태(558-559), `pushPlanNow`(1006-1050), `pullPlanNow`(1063-1112), `handleScheduleFromPast`(2410-2470), `handleLoadPlan`(2587-2605), `handleFinish`(2874-2880), 카드 렌더(3865-3897)

이 파일은 4,500행이고 테스트가 없다. 바꾼 뒤 **Task 9의 화면 확인**이 이 Task의 검증이다. 한 Step씩 typecheck로 확인한다.

- [ ] **Step 1: import·상태**

import에 추가:

```ts
import {
  addToDayPlan,
  settlePlanAfterWorkout,
} from "@/lib/day-plan-store";
import { TodayPlanCards } from "@/components/record/today-plan-cards";
```

`@/lib/workout-plan` import에서 `createWorkoutPlan`은 인터벌 복사(`handleScheduleFromPast`의 코스 분기)에서만 남는다 — 지우지 않는다.

`todayIntervalPlan` 상태(558-559행)를 바꾼다(위 주석은 카드 컴포넌트 설명으로 옮겨 갔으므로 한 줄로 줄인다):

```ts
  /** 오늘 계획 전부 — 인터벌·프로그램 회차 카드를 그린다 (2026-10-13) */
  const [todayPlans, setTodayPlans] = useState<WorkoutPlan[]>([]);
```

Run: `pnpm typecheck` — `todayIntervalPlan`을 쓰던 곳(1072, 3865-3885)에서 오류가 난다. 다음 Step들에서 고친다.

- [ ] **Step 2: `pushPlanNow`의 `create` 분기를 `addToDayPlan`으로**

1010-1028행의 `if (push.kind === "create") { … }`를 바꾼다:

```ts
    if (push.kind === "create") {
      // 그날 일반 계획이 있으면 붙이고 없으면 만든다 (2026-10-13) — 예전엔 언제나
      // 새 행을 만들어, 달력에 계획이 둘이 되고 운동 탭은 하나만 보였다
      const result = await addToDayPlan({
        userId,
        planDate: dayKey(new Date(), resolveTimeZone()),
        sourceSessionId: d.sourceSessionId,
        exercises: push.exercises,
      });
      // 쓰는 사이에 달력에서 다른 계획을 불러왔으면 덮지 않는다
      if (draftRef.current.scheduledPlanId !== null) {
        if (result.created) await deleteWorkoutPlan(result.plan.id);
        return;
      }
      if (result.created) {
        setDraft((current) => ({ ...current, scheduledPlanId: result.plan.id }));
        rememberPlanSync({
          planId: result.plan.id,
          updatedAt: result.plan.updatedAt,
          json: planExercisesKey(push.exercises),
        });
        return;
      }
      // 합쳤다 — 목록을 합친 계획으로 바꾼다. 달력 오늘 칸과 같은 목록이 된다
      const exercises = toDraftExercises(result.plan.exercises, localId);
      setDraft((current) => ({
        ...current,
        scheduledPlanId: result.plan.id,
        sourceSessionId: result.plan.sourceSessionId,
        exercises,
      }));
      rememberPlanSync({
        planId: result.plan.id,
        updatedAt: result.plan.updatedAt,
        json: planExercisesKey(toPlanExercises(exercises)),
      });
      setTodayPlans(result.dayPlans);
      showToast("오늘 계획에 합쳤어요");
      return;
    }
```

- [ ] **Step 3: `pullPlanNow` — 중복 정리, 카드 상태, `absorb`·`special`**

1063-1072행을 바꾼다:

```ts
  async function pullPlanNow() {
    const todayKey = dayKey(new Date(), resolveTimeZone());
    // 오늘 일반 계획이 둘 이상이면 먼저 하나로 합친다 (2026-10-13 이전에 생긴 중복)
    const todayPlans = await consolidateDayPlans(userId, todayKey);
    const d = draftRef.current;
    const bound = d.scheduledPlanId
      ? (todayPlans.find((plan) => plan.id === d.scheduledPlanId) ??
        (await getWorkoutPlanById(d.scheduledPlanId)))
      : null;
    setTodayPlanExists(todayPlans.length > 0);
    setTodayPlans(todayPlans);
```

import에 `consolidateDayPlans`를 추가한다(`@/lib/day-plan-store`). `getWorkoutPlansByDate` import가 더 안 쓰이면 지운다(typecheck/lint가 알려 준다).

`if (pull.kind === "clear") { … }` 블록 안의 토스트 분기는 `special`에 말하지 않는다(카드가 바로 위에 보인다) — 기존 `else if` 둘은 그대로 두면 된다.

`if (pull.kind === "load") await handleLoadPlan(pull.plan);` 아래에 추가:

```ts
    // 연결 없이 직접 담은 목록 — 오늘 계획에 합친다 (push의 create가 그 일을 한다)
    if (pull.kind === "absorb") await pushPlanNow();
```

> `pullPlanNow`는 `enqueuePlanSync` 줄 안에서 돈다. 그 안에서 `pushPlanNow`를 **직접** 부른다 — 다시 줄에 세우면 자기 뒤에 서서 교착한다.

- [ ] **Step 4: 지난 기록 예정 (`handleScheduleFromPast`)**

2450-2456행의 `createWorkoutPlan` 호출을 코스 여부로 가른다:

```ts
      // 인터벌은 따로 둔다(코스로 열림). 일반 기록은 그날 계획에 붙인다 (2026-10-13)
      const plan = course
        ? await createWorkoutPlan({
            userId,
            planDate,
            sourceSessionId: sessionId,
            exercises: toPlanExercises(exercises),
            tabataMinutes: course,
          })
        : (
            await addToDayPlan({
              userId,
              planDate,
              sourceSessionId: sessionId,
              exercises: toPlanExercises(exercises),
            })
          ).plan;
```

토스트 문구는 그대로 둔다. 반환값 `plan`은 달력이 받아 `applySavedPlan`에 넣는다(Task 7 Step 2에서 날짜 단위로 다시 읽게 바꾼다).

- [ ] **Step 5: `handleLoadPlan` — 오늘 계획이 저장돼 있으면 묻지 않는다**

2595-2602행의 확인창 조건을 바꾼다:

```ts
    if (
      draft.exercises.length > 0 &&
      draft.scheduledPlanId !== plan.id &&
      // 목록이 오늘 계획에 묶여 있으면 지워지는 것이 없다 — 계획은 DB에 남고,
      // 이 운동을 마치면 운동 탭으로 돌아온다 (2026-10-13)
      draft.scheduledPlanId === null &&
      !window.confirm("준비 중인 운동 목록을 지우고 예정표로 바꿀까요?")
    ) {
      return false;
    }
    // 기다리던 쓰기를 먼저 내보낸다 — 0.6초 안에 고친 세트가 사라지지 않게
    await flushPlanSync();
```

- [ ] **Step 6: 완료 — 안 한 종목은 남긴다**

2874-2880행을 바꾼다:

```ts
      let planCleanupFailed = false;
      if (draft.scheduledPlanId) {
        try {
          // 세트를 하나도 안 한 종목은 오늘 계획에 남긴다 (사용자 결정 2026-10-13)
          await settlePlanAfterWorkout(draft.scheduledPlanId, draft.exercises);
        } catch {
          planCleanupFailed = true;
        }
      }
```

완료 흐름 끝(2977-2979행 `if (planCleanupFailed) { showToast(…) }` 블록 **바로 뒤**, `} catch (e) {` 앞)에 추가:

```ts
      // 남긴 종목·카드를 다시 그린다 — 다음 운동 탭 진입까지 기다리지 않는다
      void enqueuePlanSync(pullPlanNow);
```

`handleCancel`(2985행)에도 같은 줄을 `showToast("운동을 취소했어요");` 바로 뒤에 추가한다 — 계획에서 시작한 운동을 취소하면 계획은 그대로 남는데, 목록이 비워진 채로 다음 탭 전환까지 기다리게 된다.

> 위치 확인: 두 곳 모두 `setDraft(emptyDraft(...))`가 먼저 실행된다(2965행·2996행). 그래야 pull이 빈 목록으로 판단해 오늘 일반 계획을 `load`한다. `setDraft`는 `draftRef`를 동기 갱신한다(1094행 주석과 같은 규약).

- [ ] **Step 7: 카드 렌더**

3851-3897행(주석 + `{todayIntervalPlan && !active && (<button …>)}`)을 바꾼다:

```tsx
          {/*
            오늘 인터벌·프로그램 회차 카드 (2026-10-13) — 달력 오늘 칸과 같은 단위.
            일반 계획은 아래 목록 자체다. 운동 중에는 안 보인다.
          */}
          {!active && (
            <TodayPlanCards
              plans={todayPlans}
              disabled={busy}
              onStart={(plan) => {
                // 인터벌은 시트를 연다(바로 시작 안 함, 2026-08-25), 프로그램은 바로 시작
                void handleLoadPlan(plan, plan.tabataMinutes ? undefined : { startNow: true });
              }}
            />
          )}
```

- [ ] **Step 8: 정적 검사**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 전부 PASS. lint의 기존 경고 4개는 그대로(새 경고 0).

- [ ] **Step 9: Commit**

```bash
git add "src/app/(tabs)/record/page.tsx"
git commit -m "fix(record): workout tab mirrors today's single plan; keep undone exercises after finish"
```

---

### Task 7: 달력 연결 (`calendar-view.tsx`)

**Files:**
- Modify: `src/components/record/calendar-view.tsx` — import(67-74), 첫 조회(311-330), `handleMovePlan`(573-598), `handleSavePlanEdit`(903-913), `applySavedPlan`(929-936), `handleNewPlanPick`(1000-1020), `handleNewPlanConfigured`(1037-1055), `handleNewPlanFromRoutine`(1061-1083), `handleNewPlanFromPast`(1085-1100), 버튼(1363)·피커 문구(1810-1835)
- Test: `src/components/record/calendar-view.test.tsx`

- [ ] **Step 1: 실패하는 테스트 추가**

`calendar-view.test.tsx`의 `vi.mock("@/lib/workout-plan", …)`(58-64행) 아래에 저장소 mock을 추가하고, `mocks`(vi.hoisted)에 `addToDayPlan`·`consolidateUpcomingPlans`를 더한다:

```ts
vi.mock("@/lib/day-plan-store", () => ({
  addToDayPlan: mocks.addToDayPlan,
  consolidateUpcomingPlans: mocks.consolidateUpcomingPlans,
}));
```

`beforeEach`(84-97행)에 기본 동작을 추가한다. `addToDayPlan` 기본 mock은 **`createWorkoutPlan` mock을 그대로 부른다** — 그래서 빈 날짜에 새 계획을 만드는 기존 테스트(419·458·1389행의 `createWorkoutPlan` 기대)는 고치지 않아도 그대로 통과한다:

```ts
  mocks.consolidateUpcomingPlans.mockReset();
  mocks.consolidateUpcomingPlans.mockImplementation(
    async (_userId: string, plans: unknown[]) => plans,
  );
  mocks.addToDayPlan.mockReset();
  mocks.addToDayPlan.mockImplementation(async (input) => {
    const plan = await mocks.createWorkoutPlan({
      userId: input.userId,
      planDate: input.planDate,
      sourceSessionId: input.sourceSessionId ?? null,
      exercises: input.exercises,
    });
    return { plan, dayPlans: [plan], created: true, skippedCount: 0 };
  });
```

파일 끝에 추가 (고정값 `PLAN`(285행, 8월 16일·스쿼트·러닝), `INTERVAL_PLAN_PICKED`(1092행, 8월 15일·8분), `BODYWEIGHT_CATALOG`, `setup()`은 파일에 이미 있다. 오늘은 2026-08-15로 고정돼 있다):

```ts
describe("CalendarView — 하루 계획 하나 (2026-10-13)", () => {
  it("수정 저장 뒤에도 같은 날 인터벌 계획이 화면에 남는다 — 날짜로 거르던 버그", async () => {
    const general = { ...PLAN, id: "plan-general", planDate: "2026-08-15" };
    mocks.getWorkoutPlans.mockResolvedValue([general, INTERVAL_PLAN_PICKED]);
    mocks.updateWorkoutPlan.mockImplementation(async (input) => ({
      ...general,
      ...input,
      id: input.planId,
    }));
    await setup(BODYWEIGHT_CATALOG);

    fireEvent.click(screen.getByRole("button", { name: new RegExp("^8월 15일,") }));
    // 카드는 조회 순서대로 그린다 — 첫 `수정`이 일반 계획이다
    expect(screen.getAllByRole("button", { name: "수정" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "수정" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "이대로 저장하기" }));

    await waitFor(() => expect(mocks.updateWorkoutPlan).toHaveBeenCalled());
    // 저장 뒤 그날이 다시 열린다(`openDate`) — 카드가 여전히 2장
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "수정" })).toHaveLength(2),
    );
  });

  it("일반 계획이 있는 날은 상단 버튼이 `이 날 계획에 운동 더하기`다", async () => {
    mocks.getWorkoutPlans.mockResolvedValue([{ ...PLAN, id: "plan-general" }]);
    await setup();

    fireEvent.click(screen.getByRole("button", { name: new RegExp("^8월 16일,") }));

    expect(screen.getByText("➕ 이 날 계획에 운동 더하기")).toBeTruthy();
    // 부정 확인 — 옛 문구가 없어야 한다
    expect(screen.queryByText("➕ 새 운동 계획 만들기")).toBeNull();
  });

  it("그날 계획이 있으면 새 행을 만들지 않고 addToDayPlan으로 붙인다", async () => {
    const general = { ...PLAN, id: "plan-general" };
    mocks.getWorkoutPlans.mockResolvedValue([general]);
    mocks.addToDayPlan.mockImplementation(async (input) => {
      const plan = {
        ...general,
        exercises: [...general.exercises, ...input.exercises],
      };
      return { plan, dayPlans: [plan], created: false, skippedCount: 0 };
    });
    await setup(BODYWEIGHT_CATALOG);

    fireEvent.click(screen.getByRole("button", { name: new RegExp("^8월 16일,") }));
    fireEvent.click(screen.getByText("➕ 이 날 계획에 운동 더하기"));
    expect(screen.getByText("8월 16일 계획에 운동 더하기")).toBeTruthy();
    fireEvent.click(screen.getByText("운동 직접 고르기"));
    fireEvent.click(screen.getByText(BODYWEIGHT_CATALOG[0].name));
    fireEvent.click(screen.getByText("8월 16일 계획에 1개 담기"));

    await waitFor(() => expect(mocks.addToDayPlan).toHaveBeenCalled());
    expect(mocks.addToDayPlan.mock.calls[0][0].planDate).toBe("2026-08-16");
    expect(mocks.createWorkoutPlan).not.toHaveBeenCalled();
  });
});
```

> 첫 테스트에서 `수정` 버튼이 2개가 아니면(카드 순서·인터벌 카드의 버튼 이름이 다르면) 이 파일의 "인터벌 예정표의 수정은…" 테스트(1393행)가 인터벌 카드의 `수정`을 어떻게 누르는지 보고 맞춘다 — 합격 기준은 "저장 뒤에도 그날 카드 2장"이다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- src/components/record/calendar-view.test.tsx`
Expected: 새 3개 FAIL

- [ ] **Step 3: 구현 — import·첫 조회**

import 추가:

```ts
import { addToDayPlan, consolidateUpcomingPlans } from "@/lib/day-plan-store";
import { isGeneralPlan } from "@/lib/domain/day-plan";
```

첫 조회(330행 부근)의 `setPlans(savedPlans);`를 바꾼다:

```ts
        // 오늘 이후 같은 날 일반 계획이 둘이면 하나로 합친다 (2026-10-13 이전 중복).
        // 실패해도 달력은 그린다 — 합치기는 다음에 다시 시도된다.
        // ⚠️ 오늘은 **프로필 시간대로** 구한다. 264행 `todayKey`는 이 시점에 아직
        //    초기 시간대라, 자정 근처에 하루 어긋난 날짜를 "지난 날"로 볼 수 있다.
        const plansToShow = await consolidateUpcomingPlans(
          userId,
          savedPlans,
          dayKey(new Date(), profile?.timezone || timeZone),
        ).catch((error) => {
          console.warn("[calendar] 같은 날 계획 합치기 실패", error);
          return savedPlans;
        });
        if (cancelled) return;
        setPlans(plansToShow);
```

- [ ] **Step 4: 구현 — 날짜 단위로 갈아 끼우는 함수**

`applySavedPlan`(929행) 바로 위에 추가:

```ts
  /** 그날 계획을 통째로 갈아 끼운다 — `addToDayPlan`이 합치며 지운 행까지 반영한다 */
  function applyDayPlans(planDate: string, dayPlans: WorkoutPlan[]) {
    setPlans((current) => [
      ...current.filter((plan) => plan.planDate !== planDate),
      ...dayPlans,
    ]);
    setPlanPickerDate(null);
    showPlanToast("운동 계획을 저장했어요");
  }
```

- [ ] **Step 5: 구현 — 새 계획 3곳**

`handleNewPlanPick`·`handleNewPlanConfigured`·`handleNewPlanFromRoutine`의 `applySavedPlan(await createWorkoutPlan({ userId, planDate: planPickerDate, sourceSessionId: null, exercises: X }))`를 각각 아래로 바꾼다 (`X`는 그 함수가 넘기던 값 그대로: `newPlanExercises(items)` / `planExercisesFromPicks(picks)` / `routine.exercises`):

```ts
      const result = await addToDayPlan({
        userId,
        planDate: planPickerDate,
        exercises: X,
      });
      applyDayPlans(planPickerDate, result.dayPlans);
```

- [ ] **Step 6: 구현 — 지난 기록**

`handleNewPlanFromPast`의 `applySavedPlan(await onScheduleSession(…))`를 바꾼다 — `onScheduleSession`은 Task 6 Step 4에서 그날 계획에 붙이게 됐으므로, 그날을 다시 읽어 갈아 끼운다:

```ts
      const saved = await onScheduleSession(
        sessionId,
        planPickerDate,
        source?.tabataMinutes,
      );
      // 붙였으면 그날 다른 행이 지워졌을 수 있다 — 저장된 그날 계획 전부로 갈아 끼운다
      applyDayPlans(
        planPickerDate,
        (await getWorkoutPlans(userId)).filter(
          (plan) => plan.planDate === saved.planDate,
        ),
      );
```

- [ ] **Step 7: 구현 — 수정 저장은 id로**

`handleSavePlanEdit`의 909-912행을 바꾼다:

```ts
      // ⚠️ id로 갈아 끼운다 (0101) — 날짜로 거르면 같은 날 다른 계획(인터벌·
      //    프로그램 회차)이 화면에서 사라진다 (2026-10-13 발견)
      setPlans((current) => [
        ...current.filter((plan) => plan.id !== saved.id),
        saved,
      ]);
```

- [ ] **Step 8: 구현 — 날짜 이동은 합치기**

`handleMovePlan`의 `const moved = await moveWorkoutPlan(plan.id, moveDate, false);`부터 `setSelectedDate(moveDate);`까지를 바꾼다:

```ts
      const targetHasGeneral = plans.some(
        (item) => item.planDate === moveDate && isGeneralPlan(item),
      );
      if (isGeneralPlan(plan) && targetHasGeneral) {
        // 옮길 날에 일반 계획이 있으면 거기에 합친다 — 하루 일반 계획은 하나 (2026-10-13).
        // 붙이기가 성공한 뒤에 원래 것을 지운다(지우기 먼저면 실패 시 종목이 사라진다)
        const result = await addToDayPlan({
          userId,
          planDate: moveDate,
          exercises: plan.exercises,
          sourceSessionId: plan.sourceSessionId,
        });
        await deleteWorkoutPlan(plan.id);
        setPlans((current) => [
          ...current.filter(
            (item) => item.id !== plan.id && item.planDate !== moveDate,
          ),
          ...result.dayPlans,
        ]);
      } else {
        const moved = await moveWorkoutPlan(plan.id, moveDate, false);
        setPlans((current) => [
          ...current.filter((item) => item.id !== moved.id),
          moved,
        ]);
      }
      setSelectedDate(moveDate);
```

- [ ] **Step 9: 구현 — 버튼·피커 문구**

1363행 버튼 문구(`➕ 새 운동 계획 만들기` 한 줄)를 그날 일반 계획 유무로 가른다. 이 버튼은 `setPlanPickerDate(selectedDate)`를 부르므로 같은 `selectedDate`로 판정한다:

```tsx
                  {plans.some(
                    (plan) => plan.planDate === selectedDate && isGeneralPlan(plan),
                  )
                    ? "➕ 이 날 계획에 운동 더하기"
                    : "➕ 새 운동 계획 만들기"}
```

피커 `heading`의 `planPickerDate` 분기(1814행 부근)도 같은 조건으로:

```ts
            : planPickerDate
              ? plans.some(
                  (plan) => plan.planDate === planPickerDate && isGeneralPlan(plan),
                )
                ? {
                    title: `${dateKeyLabel(planPickerDate)} 계획에 운동 더하기`,
                    sub: "고른 운동을 그날 계획에 붙여요",
                  }
                : {
                    title: `${dateKeyLabel(planPickerDate)} 계획 만들기`,
                    sub: "이 날 할 운동을 골라 주세요",
                  }
              : undefined
```

`createWorkoutPlan` import는 `saveIntervalPlan`(979행)이 계속 쓴다 — 지우지 않는다.

- [ ] **Step 10: 통과 확인**

Run: `pnpm test -- src/components/record/calendar-view.test.tsx`
Expected: PASS (기존 테스트 포함). 빈 날짜에 새 계획을 만드는 기존 테스트는 Step 1의 `addToDayPlan` 기본 mock이 `createWorkoutPlan` mock을 불러 주므로 그대로 통과해야 한다. 실패하면 그 테스트가 **계획이 있는 날**에 `➕ 새 운동 계획 만들기`를 누르는지 본다 — 그렇다면 문구가 `➕ 이 날 계획에 운동 더하기`로 바뀐 것이 원인이고, 테스트의 클릭 문구만 바꾼다.

- [ ] **Step 11: Commit**

```bash
git add src/components/record/calendar-view.tsx src/components/record/calendar-view.test.tsx
git commit -m "fix(calendar): add to the day's single plan; keep sibling plans on edit; merge on move"
```

---

### Task 8: 남은 `createWorkoutPlan` 호출 점검 (재발 방지)

**Files:** 없음 (확인만)

- [ ] **Step 1: 일반 계획을 직접 만드는 곳이 남았는지**

Run: `grep -rn "createWorkoutPlan(" src --include=*.ts --include=*.tsx | grep -v test`
Expected: 정확히 4줄 — `src/lib/workout-plan.ts`(정의), `src/lib/day-plan-store.ts`(`addToDayPlan`), `calendar-view.tsx`의 `saveIntervalPlan`(인터벌), `record/page.tsx`의 `handleScheduleFromPast` 코스 분기(인터벌). 이 밖의 줄이 있으면 그 호출을 `addToDayPlan`으로 바꾼다.

---

### Task 9: 개발 서버 화면 확인 (전역 규칙 — 배포 전 필수)

**Files:** 없음

사회적 기능이 아니므로 **계정 하나**(픽스처 A)로 본다. `pnpm dev`는 운영 Supabase에 붙는다 — 픽스처 계정만 쓴다.

- [ ] **Step 1: 띄우기**

```bash
cd /c/Users/SAMSUNG/workout-app
node scripts/dev-fixture.mjs create   # 이미 있으면 건너뛴다 (프로젝트 CLAUDE.md 참조)
pnpm dev
```

브라우저 390px, 픽스처 A 로그인.

- [ ] **Step 2: 확인 표 — 하나라도 다르면 멈추고 고친 뒤 Step 1부터**

| # | 조작 | 기대 (세어서 확인) |
|---|---|---|
| 1 | 운동 탭에서 운동 1개 추가 → 1초 대기 → 달력 탭 → 오늘 | 오늘 칸 계획 카드 **1장**, 종목 목록이 운동 탭과 **같다** |
| 2 | 달력 오늘 카드 `수정` → `+ 종목 추가`로 1개 → 저장 → 운동 탭 | 운동 탭 목록에 그 종목이 **보인다**, 개수 = 달력 종목 수 |
| 3 | 달력 오늘 → 상단 버튼 문구 | `➕ 이 날 계획에 운동 더하기` (일반 계획 있을 때) |
| 4 | 그 버튼으로 1개 더 → 운동 탭 | 달력 카드 여전히 **1장**, 운동 탭에 3종목 |
| 5 | 오늘 인터벌 계획 하나 만들기(`인터벌로 계획하기`) → 운동 탭 | 일반 목록 위에 **인터벌 카드 1장**, 달력 오늘 카드 **2장**(일반+인터벌) |
| 6 | 달력에서 일반 계획 `수정` → 저장 | 저장 뒤에도 인터벌 카드가 **남아 있다** |
| 7 | 운동 탭 `운동 시작` → 첫 종목 세트 1개만 완료 → `완료` | 완료 뒤 운동 탭 목록 = **안 한 종목들**, 달력 오늘 = 완료 기록 + 남은 계획 1장 |
| 8 | 남은 것 전부 완료 | 달력 오늘 일반 계획 카드 **없음** |
| 9 | 내일 계획 만들기 → 그 카드 `날짜 이동`을 오늘로 (오늘 일반 계획이 있을 때) | 오늘 카드 **1장**에 종목이 합쳐짐, 내일 칸 비어 있음 |
| 10 | (재현) 기존 중복: SQL로 픽스처 A 오늘에 일반 계획 2개를 만든 뒤 달력 열기 | 달력 오늘 **1장**으로 합쳐짐, 운동 탭 목록 = 합친 목록 |

10번 준비용 SQL (사용자가 SQL Editor에서 Run, 픽스처 A의 user_id로 바꾼다):

```sql
insert into public.workout_plans (user_id, plan_date, exercises)
values
  ('<FIXTURE_A_USER_ID>', (now() at time zone 'Asia/Seoul')::date,
   '[{"name":"점프 스쿼트","bodyPart":"하체","exerciseType":"bodyweight","measure":"reps","isCustom":false,"sets":[{"weightKg":0,"reps":25,"distanceKm":0,"durationMin":0}]}]'),
  ('<FIXTURE_A_USER_ID>', (now() at time zone 'Asia/Seoul')::date,
   '[{"name":"풀업","bodyPart":"등","exerciseType":"bodyweight","measure":"reps","isCustom":false,"sets":[{"weightKg":0,"reps":4,"distanceKm":0,"durationMin":0}]}]');
```

- [ ] **Step 3: 확인 결과를 인수인계서에 표로 남긴다** (Task 10)

---

### Task 10: 게이트·새소식·인수인계

**Files:**
- Modify: `src/lib/domain/release-notes.data.json`
- Create: `docs/superpowers/HANDOFF-2026-10-13-day-plan-single-source.md`
- Modify: `PROGRESS.md` (최상단에 항목 추가)

- [ ] **Step 1: 새소식 항목** — 파일의 기존 항목 형식을 그대로 따라 맨 앞에 추가:

```
"**운동 탭과 달력이 같은 계획을 보여줘요.** 하루 운동 계획은 하나로 모여요 — 운동 탭에서 더해도, 달력에서 더해도 같은 목록이에요. 인터벌·프로그램은 운동 탭에도 카드로 보여요. 일부만 하고 완료하면 안 한 운동은 오늘 계획에 남아요."
```

- [ ] **Step 2: 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: 전부 PASS (lint 기존 경고 4 외 새 경고 0)

- [ ] **Step 3: 인수인계서·PROGRESS.md** — Task 9 확인 표 결과, 남은 `[미검증]`(실제 폰, 두 기기 동시 생성), Task 0 Step 3 숫자를 적는다.

- [ ] **Step 4: Commit**

```bash
git add src/lib/domain/release-notes.data.json docs/superpowers/HANDOFF-2026-10-13-day-plan-single-source.md PROGRESS.md
git commit -m "docs: day plan single source handoff and release note"
```

- [ ] **Step 5: 배포는 사용자 승인 후** — 프로젝트 CLAUDE.md의 배포 절차(main 병합 → 푸시 → `.git` 없는 archive 복사본에서 `vercel --prod`) → 운영 JS에서 `이 날 계획에 운동 더하기`·`오늘 계획에 합쳤어요` 있음 확인.
