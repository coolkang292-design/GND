# 챌린지 카테고리 우선 목표 개편 Implementation Plan

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** 챌린지 목표를 카테고리 우선(웨이트·유산소·맨몸)으로 개편하고, 맨몸 시간형 운동(매달리기·플랭크)을 세트별 분 입력·목표로 지원한다.

**Architecture:** `exercise_catalog`/`workout_exercises`에 `measure`(reps|time) 컬럼을 더해 맨몸 횟수형/시간형을 구분하고, `user_goals.goal_type`을 카테고리+지표 7종으로 확장한다. 목표 실적 집계(`PeriodStats`)와 순수 함수(`actualForGoal`·`foldPeriodStats`)를 확장하고, 점수 산식은 그대로 둔다.

**Tech Stack:** Next.js 16 · TS strict · Tailwind v4 · Supabase(수동 SQL) · Vitest.

**참고 스펙:** `docs/superpowers/specs/2026-07-17-challenge-category-goals-design.md`

---

## 중요: 컴파일 순서 주의

`GoalType` union 교체(Task 2)는 `setup-sheet.tsx`·`page.tsx`를 일시적으로 타입 에러 상태로 만든다. **Vitest는 파일별 트랜스파일이라 무관한 TS 에러가 있어도 단위 테스트는 통과**한다. 그래서 Task 2~4의 TDD는 `pnpm test`로 검증하고, **전체 `pnpm typecheck`는 모든 소비자(Task 5~9)를 고친 뒤 Task 10에서 한 번에 통과**시킨다.

## File Structure

- `supabase/migrations/0008_category_goals.sql` (create) — measure 컬럼·매달리기 시드·goal_type 확장.
- `src/lib/types.ts` (modify) — `CatalogExercise.measure`·`WorkoutExercise.measure`.
- `src/lib/domain/goal-score.ts` (modify) — `GoalType` union 교체.
- `src/lib/challenge.ts` (modify) — `GOAL_TYPE_META`·`goalLabel`·`PeriodStats`·`EMPTY_STATS`·`actualForGoal`·`foldPeriodStats`(신규 순수)·`getPeriodStatsByUser`.
- `src/lib/challenge.test.ts` (create) — goalLabel·actualForGoal·foldPeriodStats TDD.
- `src/lib/workout.ts` (modify) — `LocalExercise.measure`·`defaultSets`·`saveSessionExercises`·`getSessionExerciseStructure`·`createCustomExercise`.
- `src/components/record/exercise-card.tsx` (modify) — 맨몸 시간형 세트 입력.
- `src/components/record/exercise-picker.tsx` (modify) — 커스텀 맨몸 측정단위 선택.
- `src/app/(tabs)/record/page.tsx` (modify) — measure 스레딩(addExercise·copy·handleCreateCustom).
- `src/components/challenge/setup-sheet.tsx` (rewrite) — 카테고리 우선 목표 UI.
- `src/app/(tabs)/challenge/page.tsx` (modify) — EMPTY_STATS·라벨·actualForGoal qualifier·openSheet 기본.

---

### Task 1: 마이그레이션 0008 작성

**Files:**
- Create: `supabase/migrations/0008_category_goals.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- ============================================================
-- Phase 5.2: 챌린지 목표 카테고리 우선 개편 + 맨몸 측정단위(measure)
-- 사용자 결정(2026-07-17): 목표를 웨이트/유산소/맨몸 카테고리로 나누고
-- 각 카테고리를 횟수·시간·거리·운동일로 설정. 맨몸은 횟수형/시간형 구분.
-- 실행: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run
-- ============================================================

-- ── exercise_catalog.measure (맨몸 횟수형/시간형 구분) ──
alter table public.exercise_catalog
  add column measure text
  check (measure is null or measure in ('reps', 'time'));

-- 홀드형(시간)으로 표시
update public.exercise_catalog set measure = 'time'
  where name in ('플랭크');
-- 나머지 맨몸은 횟수형
update public.exercise_catalog set measure = 'reps'
  where exercise_type = 'bodyweight' and measure is null;

-- 매달리기 신규 시드 (그립·광배 → 등)
insert into public.exercise_catalog (name, body_part, exercise_type, measure)
  values ('매달리기', '등', 'bodyweight', 'time')
  on conflict do nothing;

-- ── workout_exercises.measure (재로딩·복사 카드 렌더링용) ──
alter table public.workout_exercises
  add column measure text
  check (measure is null or measure in ('reps', 'time'));

update public.workout_exercises we
  set measure = ec.measure
  from public.exercise_catalog ec
  where we.measure is null and ec.name = we.exercise_name;

-- ── user_goals.goal_type 카테고리 우선으로 확장 ──
alter table public.user_goals drop constraint user_goals_goal_type_check;

update public.user_goals set goal_type = case goal_type
  when 'frequency' then 'weight_days'
  when 'distance'  then 'cardio_distance'
  when 'duration'  then 'cardio_time'
  when 'reps'      then 'weight_reps'
  else goal_type end;  -- 'volume'은 레거시로 유지

alter table public.user_goals add constraint user_goals_goal_type_check
  check (goal_type in (
    'weight_reps', 'weight_days',
    'cardio_distance', 'cardio_time',
    'bodyweight_reps', 'bodyweight_time', 'bodyweight_days',
    'volume'
  ));
```

- [ ] **Step 2: 커밋** (DB 적용은 Task 10에서 사용자가 수동 실행)

```bash
git add supabase/migrations/0008_category_goals.sql
git commit -m "feat(db): 0008 카테고리 목표·맨몸 measure 마이그레이션"
```

---

### Task 2: GoalType union + types.ts measure

**Files:**
- Modify: `src/lib/domain/goal-score.ts:8-13`
- Modify: `src/lib/types.ts` (CatalogExercise·WorkoutExercise)

- [ ] **Step 1: GoalType union 교체** — `goal-score.ts`의 기존 union(8-13)을 다음으로 대체

```ts
export type GoalType =
  | "weight_reps" // 웨이트 완료세트 총 반복
  | "weight_days" // 웨이트 운동일 (하루 N부위+)
  | "cardio_distance" // 유산소 거리 km
  | "cardio_time" // 유산소 지속 분
  | "bodyweight_reps" // 맨몸 횟수형 총 반복
  | "bodyweight_time" // 맨몸 시간형 지속 분
  | "bodyweight_days" // 맨몸 운동일 (하루 N종목+)
  | "volume"; // 레거시(웨이트 총볼륨) — 표시 전용
```

- [ ] **Step 2: types.ts에 measure 추가** — `CatalogExercise`에 `is_custom` 위 줄, `WorkoutExercise`에 `exercise_type` 아래 줄 추가

`CatalogExercise`(types.ts):
```ts
export type CatalogExercise = {
  id: string;
  name: string;
  body_part: BodyPart;
  exercise_type: ExerciseType;
  measure: "reps" | "time" | null; // 맨몸 횟수형/시간형 (그 외 null)
  is_custom: boolean;
  created_by: string | null;
  created_at: string;
};
```

`WorkoutExercise`(types.ts):
```ts
export type WorkoutExercise = {
  id: string;
  session_id: string;
  exercise_name: string;
  exercise_type: ExerciseType;
  measure: "reps" | "time" | null;
  sort_order: number;
  memo: string | null;
  previous_workout_exercise_id: string | null;
  created_at: string;
};
```

- [ ] **Step 3: 커밋** (typecheck는 아직 깨진 상태 — Task 10까지 미검증)

```bash
git add src/lib/domain/goal-score.ts src/lib/types.ts
git commit -m "feat: GoalType 카테고리 우선 7종 + measure 타입"
```

---

### Task 3: challenge.ts 메타·라벨·실적 (TDD)

**Files:**
- Test: `src/lib/challenge.test.ts` (create)
- Modify: `src/lib/challenge.ts` (GOAL_TYPE_META 8-17, goalLabel 27-33, PeriodStats 182-199, actualForGoal 201-222)

- [ ] **Step 1: 실패 테스트 작성** — `src/lib/challenge.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  GOAL_TYPE_META,
  actualForGoal,
  goalLabel,
  type PeriodStats,
} from "@/lib/challenge";

const STATS: PeriodStats = {
  workoutDays: 5,
  weightReps: 240,
  volumeKg: 3000,
  cardioDistanceKm: 12,
  cardioTimeMin: 90,
  bodyweightReps: 180,
  bodyweightTimeMin: 24,
  weightPartsByDay: { "2026-07-01": 3, "2026-07-02": 1, "2026-07-03": 4 },
  bodyweightKindsByDay: { "2026-07-01": 2, "2026-07-04": 3 },
};

describe("goalLabel", () => {
  it("weight_days는 부위 조건을 붙인다", () => {
    expect(goalLabel("weight_days", 3)).toBe("웨이트 운동일(하루 3부위+)");
  });
  it("bodyweight_days는 종목 조건을 붙인다", () => {
    expect(goalLabel("bodyweight_days", 2)).toBe("맨몸 운동일(하루 2종목+)");
  });
  it("일반 지표는 라벨 그대로", () => {
    expect(goalLabel("weight_reps")).toBe(GOAL_TYPE_META.weight_reps.label);
  });
});

describe("actualForGoal", () => {
  it("weight_reps", () => expect(actualForGoal(STATS, "weight_reps")).toBe(240));
  it("cardio_distance", () =>
    expect(actualForGoal(STATS, "cardio_distance")).toBe(12));
  it("cardio_time", () => expect(actualForGoal(STATS, "cardio_time")).toBe(90));
  it("bodyweight_reps", () =>
    expect(actualForGoal(STATS, "bodyweight_reps")).toBe(180));
  it("bodyweight_time", () =>
    expect(actualForGoal(STATS, "bodyweight_time")).toBe(24));
  it("weight_days는 N부위+ 인 날만 센다", () => {
    expect(actualForGoal(STATS, "weight_days", 3)).toBe(2); // 3,4 부위인 날 2개
  });
  it("bodyweight_days는 N종목+ 인 날만 센다", () => {
    expect(actualForGoal(STATS, "bodyweight_days", 3)).toBe(1); // 3종목인 날 1개
  });
  it("volume은 레거시 볼륨", () =>
    expect(actualForGoal(STATS, "volume")).toBe(3000));
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test -- challenge`
Expected: FAIL — `PeriodStats` 새 필드 없음/`actualForGoal` 분기 불일치.

- [ ] **Step 3: GOAL_TYPE_META 교체** — challenge.ts 8-17을 다음으로

```ts
export type GoalCategory = "weight" | "cardio" | "bodyweight";

export const GOAL_TYPE_META: Record<
  GoalType,
  { label: string; unit: string; defaultTarget: number; category: GoalCategory }
> = {
  weight_reps: { label: "웨이트 횟수", unit: "회", defaultTarget: 300, category: "weight" },
  weight_days: { label: "웨이트 운동일", unit: "일", defaultTarget: 12, category: "weight" },
  cardio_distance: { label: "유산소 거리", unit: "km", defaultTarget: 20, category: "cardio" },
  cardio_time: { label: "유산소 시간", unit: "분", defaultTarget: 600, category: "cardio" },
  bodyweight_reps: { label: "맨몸 횟수", unit: "회", defaultTarget: 300, category: "bodyweight" },
  bodyweight_time: { label: "맨몸 시간", unit: "분", defaultTarget: 100, category: "bodyweight" },
  bodyweight_days: { label: "맨몸 운동일", unit: "일", defaultTarget: 12, category: "bodyweight" },
  volume: { label: "웨이트 총볼륨", unit: "kg", defaultTarget: 5000, category: "weight" }, // 레거시
};
```

- [ ] **Step 4: goalLabel 교체** — challenge.ts 27-33을 다음으로

```ts
export function goalLabel(type: GoalType, qualifier?: number | null): string {
  const base = GOAL_TYPE_META[type].label;
  if (type === "weight_days") return `${base}(하루 ${qualifier ?? 1}부위+)`;
  if (type === "bodyweight_days") return `${base}(하루 ${qualifier ?? 1}종목+)`;
  return base;
}
```

- [ ] **Step 5: PeriodStats + EMPTY_STATS 교체** — challenge.ts 182-199를 다음으로

```ts
export type PeriodStats = {
  workoutDays: number; // 아무 운동이든 한 날 수 (참여율용)
  weightReps: number;
  volumeKg: number; // 레거시 표시용
  cardioDistanceKm: number;
  cardioTimeMin: number;
  bodyweightReps: number;
  bodyweightTimeMin: number;
  /** 날짜별 웨이트 완료 부위 수 — weight_days 판정 */
  weightPartsByDay: Record<string, number>;
  /** 날짜별 맨몸 완료 종목 수 — bodyweight_days 판정 */
  bodyweightKindsByDay: Record<string, number>;
};

const EMPTY_STATS: PeriodStats = {
  workoutDays: 0,
  weightReps: 0,
  volumeKg: 0,
  cardioDistanceKm: 0,
  cardioTimeMin: 0,
  bodyweightReps: 0,
  bodyweightTimeMin: 0,
  weightPartsByDay: {},
  bodyweightKindsByDay: {},
};
```

- [ ] **Step 6: actualForGoal 교체** — challenge.ts 201-222를 다음으로

```ts
export function actualForGoal(
  stats: PeriodStats,
  type: GoalType,
  qualifier?: number | null,
): number {
  const daysAtLeast = (byDay: Record<string, number>) => {
    const min = qualifier ?? 1;
    return Object.values(byDay).filter((n) => n >= min).length;
  };
  switch (type) {
    case "weight_reps":
      return stats.weightReps;
    case "weight_days":
      return daysAtLeast(stats.weightPartsByDay);
    case "cardio_distance":
      return stats.cardioDistanceKm;
    case "cardio_time":
      return stats.cardioTimeMin;
    case "bodyweight_reps":
      return stats.bodyweightReps;
    case "bodyweight_time":
      return stats.bodyweightTimeMin;
    case "bodyweight_days":
      return daysAtLeast(stats.bodyweightKindsByDay);
    case "volume":
      return stats.volumeKg;
  }
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `pnpm test -- challenge`
Expected: PASS (goalLabel·actualForGoal 전부).

- [ ] **Step 8: 커밋**

```bash
git add src/lib/challenge.ts src/lib/challenge.test.ts
git commit -m "feat: 카테고리 목표 메타·라벨·actualForGoal (TDD)"
```

---

### Task 4: foldPeriodStats 순수 집계 + getPeriodStatsByUser (TDD)

**Files:**
- Test: `src/lib/challenge.test.ts` (append)
- Modify: `src/lib/challenge.ts` (getPeriodStatsByUser 229-329 재구성 + foldPeriodStats 신규)

- [ ] **Step 1: 실패 테스트 추가** — challenge.test.ts 하단에 append (`foldPeriodStats`·`PeriodSessionRow` import 추가)

import 라인을 다음으로 교체:
```ts
import {
  GOAL_TYPE_META,
  actualForGoal,
  foldPeriodStats,
  goalLabel,
  type PeriodSessionRow,
  type PeriodStats,
} from "@/lib/challenge";
```

append:
```ts
describe("foldPeriodStats", () => {
  const rows: PeriodSessionRow[] = [
    {
      userId: "u1",
      completedAt: "2026-07-01T02:00:00Z", // KST 07-01 11시
      exercises: [
        {
          exerciseType: "weight",
          exerciseName: "벤치프레스",
          bodyPart: "가슴",
          sets: [
            { weightKg: 60, reps: 10, distanceMeters: null, durationSeconds: null, isCompleted: true },
            { weightKg: 60, reps: 8, distanceMeters: null, durationSeconds: null, isCompleted: false },
          ],
        },
        {
          exerciseType: "bodyweight",
          exerciseName: "매달리기",
          bodyPart: "등",
          sets: [
            { weightKg: null, reps: null, distanceMeters: null, durationSeconds: 180, isCompleted: true },
          ],
        },
        {
          exerciseType: "bodyweight",
          exerciseName: "푸시업",
          bodyPart: "가슴",
          sets: [
            { weightKg: null, reps: 20, distanceMeters: null, durationSeconds: null, isCompleted: true },
          ],
        },
        {
          exerciseType: "cardio",
          exerciseName: "러닝",
          bodyPart: "유산소",
          sets: [
            { weightKg: null, reps: null, distanceMeters: 5000, durationSeconds: 1800, isCompleted: true },
          ],
        },
      ],
    },
  ];

  it("카테고리별 완료 세트만 집계한다", () => {
    const m = foldPeriodStats(rows, "2026-07-01", "2026-07-31", "Asia/Seoul");
    const s = m.get("u1")!;
    expect(s.workoutDays).toBe(1);
    expect(s.weightReps).toBe(10); // 완료 세트만 (8은 미완료)
    expect(s.volumeKg).toBe(600);
    expect(s.bodyweightReps).toBe(20); // 푸시업
    expect(s.bodyweightTimeMin).toBe(3); // 매달리기 180초=3분
    expect(s.cardioDistanceKm).toBe(5);
    expect(s.cardioTimeMin).toBe(30);
    expect(s.weightPartsByDay["2026-07-01"]).toBe(1); // 가슴 1부위
    expect(s.bodyweightKindsByDay["2026-07-01"]).toBe(2); // 매달리기·푸시업
  });

  it("기간 밖(tz 기준) 세션은 제외", () => {
    const m = foldPeriodStats(rows, "2026-07-02", "2026-07-31", "Asia/Seoul");
    expect(m.get("u1")).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test -- challenge`
Expected: FAIL — `foldPeriodStats`/`PeriodSessionRow` 없음.

- [ ] **Step 3: foldPeriodStats + PeriodSessionRow 추가** — challenge.ts의 `EMPTY_STATS` 정의 바로 아래에 삽입

```ts
/** foldPeriodStats 입력 — DB 조회를 정규화한 순수 표현 */
export type PeriodSessionRow = {
  userId: string;
  completedAt: string;
  exercises: {
    exerciseType: "weight" | "bodyweight" | "cardio";
    exerciseName: string;
    bodyPart: string | null;
    sets: {
      weightKg: number | null;
      reps: number | null;
      distanceMeters: number | null;
      durationSeconds: number | null;
      isCompleted: boolean;
    }[];
  }[];
};

/** 정규화 행 → 유저별 기간 실적 (순수·TDD 대상) */
export function foldPeriodStats(
  rows: PeriodSessionRow[],
  startDate: string,
  endDate: string,
  timeZone: string,
): Map<string, PeriodStats> {
  type Acc = PeriodStats & {
    days: Set<string>;
    weightParts: Map<string, Set<string>>;
    bodyweightKinds: Map<string, Set<string>>;
  };
  const byUser = new Map<string, Acc>();

  for (const row of rows) {
    const key = dayKey(new Date(row.completedAt), timeZone);
    if (key < startDate || key > endDate) continue;

    const entry: Acc = byUser.get(row.userId) ?? {
      ...EMPTY_STATS,
      weightPartsByDay: {},
      bodyweightKindsByDay: {},
      days: new Set<string>(),
      weightParts: new Map<string, Set<string>>(),
      bodyweightKinds: new Map<string, Set<string>>(),
    };
    entry.days.add(key);

    for (const ex of row.exercises) {
      let hasCompleted = false;
      for (const s of ex.sets) {
        if (!s.isCompleted) continue;
        hasCompleted = true;
        if (ex.exerciseType === "weight") {
          entry.volumeKg += Number(s.weightKg ?? 0) * (s.reps ?? 0);
          entry.weightReps += s.reps ?? 0;
        } else if (ex.exerciseType === "bodyweight") {
          entry.bodyweightReps += s.reps ?? 0;
          entry.bodyweightTimeMin += (s.durationSeconds ?? 0) / 60;
        } else {
          entry.cardioDistanceKm += Number(s.distanceMeters ?? 0) / 1000;
          entry.cardioTimeMin += (s.durationSeconds ?? 0) / 60;
        }
      }
      if (!hasCompleted) continue;
      if (ex.exerciseType === "weight") {
        const parts = entry.weightParts.get(key) ?? new Set<string>();
        parts.add(ex.bodyPart ?? ex.exerciseType);
        entry.weightParts.set(key, parts);
      } else if (ex.exerciseType === "bodyweight") {
        const kinds = entry.bodyweightKinds.get(key) ?? new Set<string>();
        kinds.add(ex.exerciseName);
        entry.bodyweightKinds.set(key, kinds);
      }
    }
    byUser.set(row.userId, entry);
  }

  const result = new Map<string, PeriodStats>();
  for (const [userId, e] of byUser) {
    const weightPartsByDay: Record<string, number> = {};
    for (const [day, parts] of e.weightParts) weightPartsByDay[day] = parts.size;
    const bodyweightKindsByDay: Record<string, number> = {};
    for (const [day, kinds] of e.bodyweightKinds) bodyweightKindsByDay[day] = kinds.size;
    result.set(userId, {
      workoutDays: e.days.size,
      weightReps: e.weightReps,
      volumeKg: e.volumeKg,
      cardioDistanceKm: e.cardioDistanceKm,
      cardioTimeMin: e.cardioTimeMin,
      bodyweightReps: e.bodyweightReps,
      bodyweightTimeMin: e.bodyweightTimeMin,
      weightPartsByDay,
      bodyweightKindsByDay,
    });
  }
  return result;
}
```

- [ ] **Step 4: getPeriodStatsByUser를 fold 사용으로 교체** — challenge.ts의 기존 `getPeriodStatsByUser`(229-329) 본문을 다음으로

```ts
export async function getPeriodStatsByUser(
  groupId: string,
  startDate: string,
  endDate: string,
  timeZone: string,
): Promise<Map<string, PeriodStats>> {
  const supabase = getSupabaseBrowserClient();
  const fromIso = new Date(`${startDate}T00:00:00Z`);
  fromIso.setUTCDate(fromIso.getUTCDate() - 1);
  const toIso = new Date(`${endDate}T00:00:00Z`);
  toIso.setUTCDate(toIso.getUTCDate() + 2);

  const { data, error } = await supabase
    .from("workout_sessions")
    .select(
      "user_id, completed_at, workout_exercises(exercise_type, exercise_name, body_part, workout_sets(weight_kg, reps, distance_meters, duration_seconds, is_completed))",
    )
    .eq("group_id", groupId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .gte("completed_at", fromIso.toISOString())
    .lt("completed_at", toIso.toISOString());
  if (error) throw error;

  type DbRow = {
    user_id: string;
    completed_at: string;
    workout_exercises:
      | {
          exercise_type: "weight" | "bodyweight" | "cardio";
          exercise_name: string;
          body_part: string | null;
          workout_sets:
            | Pick<
                WorkoutSet,
                "weight_kg" | "reps" | "distance_meters" | "duration_seconds" | "is_completed"
              >[]
            | null;
        }[]
      | null;
  };

  const rows: PeriodSessionRow[] = ((data ?? []) as DbRow[]).map((r) => ({
    userId: r.user_id,
    completedAt: r.completed_at,
    exercises: (r.workout_exercises ?? []).map((ex) => ({
      exerciseType: ex.exercise_type,
      exerciseName: ex.exercise_name,
      bodyPart: ex.body_part,
      sets: (ex.workout_sets ?? []).map((s) => ({
        weightKg: s.weight_kg,
        reps: s.reps,
        distanceMeters: s.distance_meters,
        durationSeconds: s.duration_seconds,
        isCompleted: s.is_completed,
      })),
    })),
  }));

  return foldPeriodStats(rows, startDate, endDate, timeZone);
}
```

주의: `WorkoutSet` import는 challenge.ts 상단에 이미 있음(4번째 줄). `dayKey` import도 이미 있음.

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm test -- challenge`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/challenge.ts src/lib/challenge.test.ts
git commit -m "feat: foldPeriodStats 순수 집계 + getPeriodStatsByUser 재구성 (TDD)"
```

---

### Task 5: workout.ts measure 스레딩 + 저장

**Files:**
- Modify: `src/lib/workout.ts` (LocalExercise 35-42, defaultSets 104-109, createCustomExercise 137-157, saveSessionExercises 253-284, getSessionExerciseStructure 415-454)

- [ ] **Step 1: LocalExercise에 measure 추가** — 35-42

```ts
export type LocalExercise = {
  key: string;
  name: string;
  bodyPart: BodyPart;
  exerciseType: ExerciseType;
  measure: "reps" | "time" | null;
  isCustom: boolean;
  sets: LocalSet[];
};
```

- [ ] **Step 2: defaultSets에 measure 반영** — 104-109

```ts
export function defaultSets(
  type: ExerciseType,
  measure?: "reps" | "time" | null,
): LocalSet[] {
  if (type === "weight") return [newSet({ weightKg: 20, reps: 10 })];
  if (type === "bodyweight") {
    if (measure === "time") return [newSet({ durationMin: 1 })];
    return [newSet({ reps: 12 })];
  }
  return [newSet()]; // cardio
}
```

- [ ] **Step 3: createCustomExercise에 measure 저장** — 137-157의 입력 타입·insert에 measure 추가

```ts
export async function createCustomExercise(input: {
  name: string;
  bodyPart: BodyPart;
  exerciseType: ExerciseType;
  measure: "reps" | "time" | null;
  userId: string;
}): Promise<CatalogExercise> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("exercise_catalog")
    .insert({
      name: input.name.trim(),
      body_part: input.bodyPart,
      exercise_type: input.exerciseType,
      measure: input.measure,
      is_custom: true,
      created_by: input.userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 4: saveSessionExercises — measure 저장 + 시간형 맵핑** — insert 매핑(254-260)과 세트 매핑(268-280)을 다음으로

exercises insert 매핑:
```ts
      exercises.map((ex, i) => ({
        session_id: sessionId,
        exercise_name: ex.name,
        exercise_type: ex.exerciseType,
        body_part: ex.bodyPart,
        measure: ex.measure,
        sort_order: i,
      })),
```

세트 매핑:
```ts
  const setRows = exercises.flatMap((ex, i) => {
    const isCardio = ex.exerciseType === "cardio";
    const isTime = ex.exerciseType === "bodyweight" && ex.measure === "time";
    return ex.sets.map((s, si) => ({
      workout_exercise_id: inserted[i].id,
      set_number: si + 1,
      weight_kg: ex.exerciseType === "weight" ? s.weightKg : null,
      reps: isCardio || isTime ? null : s.reps,
      distance_meters: isCardio ? Math.round(s.distanceKm * 1000) : null,
      duration_seconds: isCardio || isTime ? Math.round(s.durationMin * 60) : null,
      is_completed: s.done,
    }));
  });
```

- [ ] **Step 5: getSessionExerciseStructure — measure 조회·반환** — 415-454

반환 타입·select·Row·map을 다음으로:
```ts
export async function getSessionExerciseStructure(sessionId: string): Promise<
  {
    name: string;
    exerciseType: ExerciseType;
    measure: "reps" | "time" | null;
    sets: LocalSet[];
  }[]
> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_exercises")
    .select("exercise_name, exercise_type, measure, sort_order, workout_sets(*)")
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: true });
  if (error) throw error;

  type Row = {
    exercise_name: string;
    exercise_type: ExerciseType;
    measure: "reps" | "time" | null;
    sort_order: number;
    workout_sets: WorkoutSet[] | null;
  };

  return ((data ?? []) as Row[]).map((row) => {
    const sets = [...(row.workout_sets ?? [])]
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) =>
        newSet({
          weightKg: Number(s.weight_kg ?? 0),
          reps: s.reps ?? 0,
          distanceKm: Number(s.distance_meters ?? 0) / 1000,
          durationMin: Math.round((s.duration_seconds ?? 0) / 60),
        }),
      );
    return {
      name: row.exercise_name,
      exerciseType: row.exercise_type,
      measure: row.measure,
      sets: sets.length > 0 ? sets : defaultSets(row.exercise_type, row.measure),
    };
  });
}
```

- [ ] **Step 6: 커밋**

```bash
git add src/lib/workout.ts
git commit -m "feat: workout.ts measure 저장·기본세트·복사 스레딩"
```

---

### Task 6: 맨몸 시간형 세트 입력 카드

**Files:**
- Modify: `src/components/record/exercise-card.tsx:27-28, 80-108`

- [ ] **Step 1: isTimeBodyweight 판정 추가** — 27-28

```ts
  const isWeight = exercise.exerciseType === "weight";
  const isCardio = exercise.exerciseType === "cardio";
  const isTimeBodyweight =
    exercise.exerciseType === "bodyweight" && exercise.measure === "time";
```

- [ ] **Step 2: 렌더 분기에 시간형 브랜치 추가** — 기존 `{isCardio ? ( ... ) : ( ...reps... )}` 구조의 여는 부분(80)을 `{isCardio ? ( ...cardio... ) : isTimeBodyweight ? (`아래 블록`) : ( ...reps... )}`로 만든다. 즉 cardio 블록 닫는 `)` 다음의 `: (`를 `: isTimeBodyweight ? (`로 바꾸고 시간형 블록 + `) : (`를 삽입.

삽입할 시간형 블록:
```tsx
      ) : isTimeBodyweight ? (
        <div className="mt-3">
          <p className="mb-2 text-xs text-muted">
            지속 시간 · 완료 체크한 기록만 집계돼요
          </p>
          {exercise.sets.map((s, si) => (
            <div key={s.key} className="mb-2 flex items-end gap-2">
              <div className="flex-1">
                <div className="mb-1 text-[11px] text-faint">시간 (분)</div>
                {numInput(s.durationMin, (v) => onUpdateSet(si, { durationMin: v }), "decimal")}
              </div>
              <button
                onClick={() => onToggleDone(si)}
                aria-label={`${si + 1}세트 완료`}
                className={`h-9 w-11 flex-none rounded-card-sm border text-sm font-bold ${
                  s.done
                    ? "border-good bg-good text-white"
                    : "border-line bg-surface-2 text-faint"
                } ${active ? "" : "opacity-60"}`}
              >
                ✓
              </button>
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            <button
              onClick={onRemoveSet}
              className="h-9 flex-1 rounded-card-sm border border-line text-xs font-bold text-muted"
            >
              – 세트
            </button>
            <button
              onClick={onAddSet}
              className="h-9 flex-1 rounded-card-sm bg-surface-2 text-xs font-bold text-accent"
            >
              + 세트
            </button>
          </div>
        </div>
      ) : (
```

검증: 파일이 여전히 유효한 JSX여야 함(cardio `)` → `: isTimeBodyweight ? (` → 시간형 블록 → `) : (` → reps 블록 → `)}`).

- [ ] **Step 3: 커밋**

```bash
git add src/components/record/exercise-card.tsx
git commit -m "feat: 맨몸 시간형 세트 입력 카드(분 단위)"
```

---

### Task 7: 커스텀 운동 측정단위 선택 (picker)

**Files:**
- Modify: `src/components/record/exercise-picker.tsx` (PickerProps 27-32, state 45-47, createCustom 57-70, 유형 select 164-177)

- [ ] **Step 1: onCreateCustom 타입에 measure 추가** — 27-32

```ts
  onCreateCustom: (input: {
    name: string;
    bodyPart: BodyPart;
    exerciseType: ExerciseType;
    measure: "reps" | "time" | null;
  }) => Promise<void>;
```

- [ ] **Step 2: 측정단위 state 추가** — 45-47 근처(customType 선언 아래)

```ts
  const [customType, setCustomType] = useState<ExerciseType>("weight");
  const [customMeasure, setCustomMeasure] = useState<"reps" | "time">("reps");
```

- [ ] **Step 3: createCustom에서 measure 전달** — 62-66

```ts
      await onCreateCustom({
        name,
        bodyPart: customPart,
        exerciseType: customType,
        measure: customType === "bodyweight" ? customMeasure : null,
      });
```

- [ ] **Step 4: 유형 select 아래에 맨몸 측정단위 select 추가** — 유형 select를 감싼 `<div className="flex-1">...</div>`(164-177) 바로 다음(닫는 `</div>` 뒤, 바깥 `</div>` 앞)에 삽입

```tsx
              {customType === "bodyweight" && (
                <div className="flex-1">
                  <label className="text-xs font-bold text-muted">측정</label>
                  <select
                    value={customMeasure}
                    onChange={(e) =>
                      setCustomMeasure(e.target.value as "reps" | "time")
                    }
                    className="mt-1 h-10 w-full rounded-card-sm border border-line bg-bg px-2 text-sm"
                  >
                    <option value="reps">횟수 (회)</option>
                    <option value="time">시간 (분)</option>
                  </select>
                </div>
              )}
```

- [ ] **Step 5: 커밋**

```bash
git add src/components/record/exercise-picker.tsx
git commit -m "feat: 커스텀 맨몸 운동 측정단위(횟수/시간) 선택"
```

---

### Task 8: record/page.tsx measure 스레딩

**Files:**
- Modify: `src/app/(tabs)/record/page.tsx` (addExercise 190-198, handleCreateCustom 210-222, copy map 305-312)

- [ ] **Step 1: addExercise에 measure 전달** — 191-198

```ts
    const ex: LocalExercise = {
      key: localId(),
      name: item.name,
      bodyPart: item.body_part,
      exerciseType: item.exercise_type,
      measure: item.measure,
      isCustom: item.is_custom,
      sets: defaultSets(item.exercise_type, item.measure),
    };
```

- [ ] **Step 2: handleCreateCustom 입력 타입에 measure 추가** — 210-214

```ts
  async function handleCreateCustom(input: {
    name: string;
    bodyPart: BodyPart;
    exerciseType: ExerciseType;
    measure: "reps" | "time" | null;
  }) {
```

- [ ] **Step 3: 복사 매핑에 measure 반영** — 305-312

```ts
      const exercises: LocalExercise[] = items.map((it) => ({
        key: localId(),
        name: it.name,
        bodyPart: byName.get(it.name)?.body_part ?? "코어",
        exerciseType: it.exerciseType,
        measure: it.measure,
        isCustom: byName.get(it.name)?.is_custom ?? false,
        sets: it.sets,
      }));
```

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(tabs)/record/page.tsx"
git commit -m "feat: record 화면 measure 스레딩(추가·복사·커스텀)"
```

---

### Task 9: 챌린지 목표 설정 시트 카테고리 우선 재작성

**Files:**
- Rewrite: `src/components/challenge/setup-sheet.tsx`

- [ ] **Step 1: setup-sheet.tsx 전체 재작성** — 파일 전체를 다음으로 교체

```tsx
"use client";

import { useState } from "react";
import type { GoalType } from "@/lib/domain/goal-score";
import {
  GOAL_TYPE_META,
  goalLabel,
  type GoalCategory,
  type GoalDraft,
} from "@/lib/challenge";

const CATEGORIES: { key: GoalCategory; label: string }[] = [
  { key: "weight", label: "웨이트" },
  { key: "cardio", label: "유산소" },
  { key: "bodyweight", label: "맨몸" },
];

/** 카테고리별 선택 가능한 지표 (레거시 volume 제외) */
const CATEGORY_TYPES: Record<GoalCategory, GoalType[]> = {
  weight: ["weight_reps", "weight_days"],
  cardio: ["cardio_distance", "cardio_time"],
  bodyweight: ["bodyweight_reps", "bodyweight_time", "bodyweight_days"],
};

/** 지표 짧은 라벨 (카테고리 우선 UI용) */
const METRIC_LABEL: Record<GoalType, string> = {
  weight_reps: "횟수",
  weight_days: "운동일(부위)",
  cardio_distance: "거리",
  cardio_time: "시간",
  bodyweight_reps: "횟수",
  bodyweight_time: "시간",
  bodyweight_days: "운동일(종목)",
  volume: "총볼륨",
};

const DAYS_TYPES: GoalType[] = ["weight_days", "bodyweight_days"];
const isDays = (t: GoalType) => DAYS_TYPES.includes(t);

/** 하루 기준 입력 기본값 (일수형 제외) */
const PER_DAY_DEFAULT: Partial<Record<GoalType, number>> = {
  weight_reps: 30,
  cardio_distance: 5,
  cardio_time: 30,
  bodyweight_reps: 30,
  bodyweight_time: 10,
};

export type SetupSubmit = {
  name: string;
  startDate: string;
  endDate: string;
  goals: GoalDraft[];
  plannedDays: number;
};

type GoalRow = {
  category: GoalCategory;
  type: GoalType;
  daysPerWeek: number;
  perDay: number;
  directTarget: number;
  qualifier: number; // 일수형: 하루 최소 부위/종목 수
};

function periodDaysOf(startDate: string, endDate: string): number {
  const toUtc = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  const diff = Math.round((toUtc(endDate) - toUtc(startDate)) / 86_400_000) + 1;
  return Number.isFinite(diff) && diff > 0 ? diff : 28;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 총량 → 하루 기준 역산 (모드 전환 시 값 보존) */
function rowFromTarget(
  type: GoalType,
  target: number,
  plannedDays: number,
  periodDays: number,
  qualifier?: number | null,
): GoalRow {
  const daysPerWeek = Math.min(
    7,
    Math.max(
      1,
      isDays(type)
        ? Math.round((target * 7) / periodDays) || plannedDays
        : plannedDays,
    ),
  );
  return {
    category: GOAL_TYPE_META[type].category,
    type,
    daysPerWeek,
    perDay: isDays(type)
      ? 0
      : round1((target * 7) / (daysPerWeek * periodDays)) ||
        PER_DAY_DEFAULT[type] ||
        1,
    directTarget: target,
    qualifier: isDays(type) ? (qualifier ?? 3) : 0,
  };
}

export function ChallengeSetupSheet({
  mode,
  defaults,
  prevGoals,
  periodDaysFixed,
  busy,
  onSubmit,
  onClose,
}: {
  mode: "create" | "goals";
  defaults: SetupSubmit;
  prevGoals: GoalDraft[] | null;
  periodDaysFixed?: number;
  busy: boolean;
  onSubmit: (value: SetupSubmit) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaults.name);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [plannedDays, setPlannedDays] = useState(defaults.plannedDays);
  const [inputMode, setInputMode] = useState<"auto" | "direct">("auto");
  const [notice, setNotice] = useState<string | null>(null);

  const periodDays =
    mode === "create"
      ? periodDaysOf(startDate, endDate)
      : (periodDaysFixed ?? periodDaysOf(startDate, endDate));

  const [rows, setRows] = useState<GoalRow[]>(() =>
    defaults.goals.map((g) =>
      rowFromTarget(g.type, g.target, defaults.plannedDays, periodDays, g.qualifier),
    ),
  );

  const weeks = periodDays / 7;

  function totalOf(row: GoalRow): number {
    if (inputMode === "direct") return row.directTarget;
    if (isDays(row.type)) {
      return Math.max(1, Math.round(row.daysPerWeek * weeks));
    }
    return round1(row.perDay * row.daysPerWeek * weeks);
  }

  function updateRow(i: number, patch: Partial<GoalRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function changeCategory(i: number, category: GoalCategory) {
    const type = CATEGORY_TYPES[category][0];
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === i
          ? {
              category,
              type,
              daysPerWeek: r.daysPerWeek || plannedDays,
              perDay: PER_DAY_DEFAULT[type] ?? 0,
              directTarget: GOAL_TYPE_META[type].defaultTarget,
              qualifier: isDays(type) ? 3 : 0,
            }
          : r,
      ),
    );
  }

  function changeMetric(i: number, type: GoalType) {
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === i
          ? {
              ...r,
              type,
              perDay: PER_DAY_DEFAULT[type] ?? r.perDay,
              directTarget: GOAL_TYPE_META[type].defaultTarget,
              qualifier: isDays(type) ? r.qualifier || 3 : 0,
            }
          : r,
      ),
    );
  }

  function addRow() {
    const type: GoalType = "weight_reps";
    setRows((rs) => [
      ...rs,
      {
        category: "weight",
        type,
        daysPerWeek: plannedDays,
        perDay: PER_DAY_DEFAULT[type] ?? 0,
        directTarget: GOAL_TYPE_META[type].defaultTarget,
        qualifier: 0,
      },
    ]);
  }

  function removeRow(i: number) {
    if (rows.length > 1) setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  function loadPrev() {
    if (!prevGoals || prevGoals.length === 0) return;
    setRows(
      prevGoals.map((g) =>
        rowFromTarget(g.type, g.target, plannedDays, periodDays, g.qualifier),
      ),
    );
    setNotice("지난 챌린지 KPI를 불러왔어요 · 숫자만 수정하세요 ↺");
  }

  function submit() {
    if (mode === "create") {
      if (!name.trim()) {
        setNotice("챌린지 이름을 입력하세요");
        return;
      }
      if (!startDate || !endDate || startDate > endDate) {
        setNotice("기간을 확인하세요 (시작일 ≤ 종료일)");
        return;
      }
    }
    const types = rows.map((r) => r.type);
    if (new Set(types).size !== types.length) {
      setNotice("같은 지표의 목표가 두 개 있어요 — 하나로 합쳐주세요");
      return;
    }
    const goals: GoalDraft[] = rows.map((r) => ({
      type: r.type,
      target: totalOf(r),
      qualifier: isDays(r.type) ? r.qualifier : undefined,
    }));
    if (goals.some((g) => !(g.target > 0))) {
      setNotice("목표값은 0보다 커야 해요");
      return;
    }
    onSubmit({ name: name.trim(), startDate, endDate, goals, plannedDays });
  }

  return (
    <>
      <button
        aria-label="닫기"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-[20px] border-t border-line bg-surface p-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <h3 className="text-base font-extrabold">
          {mode === "create" ? "새 챌린지 만들기" : "🎯 내 목표 (KPI) 설정"}
        </h3>
        <p className="mt-0.5 text-[11.5px] text-muted">
          카테고리(웨이트·유산소·맨몸)를 고르고 지표를 정하면, 종류가 달라도
          &lsquo;내 목표 대비 %&rsquo;로 공평하게 점수화해요.
        </p>

        <div className="mt-3 flex-1 overflow-y-auto">
          {mode === "create" && (
            <div className="rounded-card border border-line bg-surface-2 p-3">
              <label className="text-[11px] font-bold text-muted">
                챌린지 이름
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface px-3 text-sm font-bold"
              />
              <div className="mt-2 flex gap-2">
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-muted">
                    시작일
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface px-3 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-muted">
                    종료일
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface px-3 text-sm"
                  />
                </div>
              </div>
              <p className="mt-1.5 text-right text-[11px] text-muted">
                기간 {periodDays}일 ({weeks.toFixed(1)}주)
              </p>
            </div>
          )}

          <div className="mt-3 rounded-card border border-line bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-extrabold">🎯 내 목표 (KPI)</p>
              <div className="flex gap-1.5">
                {prevGoals && prevGoals.length > 0 && (
                  <button
                    onClick={loadPrev}
                    className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-bold"
                  >
                    ↺ 지난 KPI
                  </button>
                )}
                <button
                  onClick={addRow}
                  className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-bold text-accent"
                >
                  + 목표
                </button>
              </div>
            </div>

            <div className="mt-2 flex gap-1 rounded-card-sm border border-line bg-surface p-1">
              {(
                [
                  ["auto", "하루 기준 계산"],
                  ["direct", "총량 직접 입력"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setInputMode(m)}
                  className={`h-8 flex-1 rounded-[8px] text-[11.5px] font-bold ${
                    inputMode === m ? "bg-accent-weak text-accent" : "text-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {rows.map((row, i) => {
              const meta = GOAL_TYPE_META[row.type];
              const total = totalOf(row);
              const metricOptions = CATEGORY_TYPES[row.category].includes(row.type)
                ? CATEGORY_TYPES[row.category]
                : [...CATEGORY_TYPES[row.category], row.type];
              return (
                <div
                  key={i}
                  className="mt-2 rounded-card-sm border border-line bg-surface p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-muted">
                      목표 {i + 1}
                    </label>
                    <button
                      onClick={() => removeRow(i)}
                      disabled={rows.length <= 1}
                      aria-label={`목표 ${i + 1} 삭제`}
                      className="grid h-7 w-7 place-items-center rounded-card-sm border border-line bg-surface text-xs disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </div>

                  {/* 카테고리 3버튼 */}
                  <div className="mt-1 flex gap-1 rounded-card-sm border border-line bg-surface-2 p-1">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => changeCategory(i, c.key)}
                        className={`h-8 flex-1 rounded-[8px] text-[11.5px] font-bold ${
                          row.category === c.key
                            ? "bg-accent-weak text-accent"
                            : "text-muted"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>

                  {/* 지표 select */}
                  <select
                    value={row.type}
                    onChange={(e) => changeMetric(i, e.target.value as GoalType)}
                    className="mt-2 h-11 w-full rounded-card-sm border border-line bg-surface px-2 text-sm font-bold"
                  >
                    {metricOptions.map((t) => (
                      <option key={t} value={t}>
                        {METRIC_LABEL[t]}
                      </option>
                    ))}
                  </select>

                  {inputMode === "auto" ? (
                    <div className="mt-2 flex items-end gap-2">
                      {!isDays(row.type) && (
                        <div className="flex-1">
                          <label className="text-[11px] font-bold text-muted">
                            하루 목표 ({meta.unit})
                          </label>
                          <input
                            inputMode="decimal"
                            key={`pd-${i}-${row.type}`}
                            defaultValue={row.perDay}
                            onChange={(e) =>
                              updateRow(i, {
                                perDay: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface-2 px-3 text-right font-mono text-sm font-bold"
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <label className="text-[11px] font-bold text-muted">
                          주 며칠
                        </label>
                        <div className="mt-1 flex h-11 items-center justify-between rounded-card-sm border border-line bg-surface-2 px-1.5">
                          <button
                            onClick={() =>
                              updateRow(i, {
                                daysPerWeek: Math.max(1, row.daysPerWeek - 1),
                              })
                            }
                            className="h-8 w-8 rounded-full text-base font-bold"
                          >
                            –
                          </button>
                          <span className="font-mono text-sm font-extrabold">
                            {row.daysPerWeek}일
                          </span>
                          <button
                            onClick={() =>
                              updateRow(i, {
                                daysPerWeek: Math.min(7, row.daysPerWeek + 1),
                              })
                            }
                            className="h-8 w-8 rounded-full text-base font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <label className="text-[11px] font-bold text-muted">
                        기간 총 목표 ({meta.unit})
                      </label>
                      <input
                        inputMode="decimal"
                        key={`dt-${i}-${row.type}`}
                        defaultValue={row.directTarget}
                        onChange={(e) =>
                          updateRow(i, {
                            directTarget: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface-2 px-3 text-right font-mono text-sm font-bold"
                      />
                    </div>
                  )}

                  {isDays(row.type) && (
                    <div className="mt-2 rounded-card-sm border border-line bg-surface-2 p-2">
                      <label className="text-[11px] font-bold text-muted">
                        {row.type === "weight_days"
                          ? "하루 최소 부위 수 — 이만큼 웨이트를 완료한 날만 인정"
                          : "하루 최소 종목 수 — 이만큼 맨몸을 완료한 날만 인정"}
                      </label>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[12px] font-bold">
                          {goalLabel(row.type, row.qualifier)}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              updateRow(i, {
                                qualifier: Math.max(1, row.qualifier - 1),
                              })
                            }
                            className="h-8 w-8 rounded-full border border-line bg-surface text-base font-bold"
                          >
                            –
                          </button>
                          <span className="w-14 text-center font-mono text-sm font-extrabold">
                            {row.qualifier}
                            {row.type === "weight_days" ? "부위+" : "종목+"}
                          </span>
                          <button
                            onClick={() =>
                              updateRow(i, {
                                qualifier: Math.min(7, row.qualifier + 1),
                              })
                            }
                            className="h-8 w-8 rounded-full border border-line bg-surface text-base font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="mt-1.5 text-right text-[11.5px] font-bold text-accent">
                    → 기간 목표{" "}
                    <span className="font-mono">
                      {total.toLocaleString()}
                      {meta.unit}
                    </span>
                    {inputMode === "auto" && (
                      <span className="font-normal text-muted">
                        {" "}
                        {isDays(row.type)
                          ? `(주 ${row.daysPerWeek}일 × ${weeks.toFixed(1)}주)`
                          : `(${row.perDay}${meta.unit} × 주 ${row.daysPerWeek}일 × ${weeks.toFixed(1)}주)`}
                      </span>
                    )}
                  </p>
                </div>
              );
            })}

            <label className="mt-3 block text-[11px] font-bold text-muted">
              계획 운동일 (주 N일) — 참여율 기준
            </label>
            <div className="mt-1 flex items-center gap-2">
              <button
                onClick={() => setPlannedDays((d) => Math.max(1, d - 1))}
                className="h-9 w-9 rounded-full border border-line bg-surface text-lg font-bold"
              >
                –
              </button>
              <span className="w-14 text-center font-mono text-sm font-extrabold">
                주 {plannedDays}일
              </span>
              <button
                onClick={() => setPlannedDays((d) => Math.min(7, d + 1))}
                className="h-9 w-9 rounded-full border border-line bg-surface text-lg font-bold"
              >
                +
              </button>
            </div>
          </div>

          {notice && (
            <p className="mt-2 text-center text-xs font-bold text-warn">
              {notice}
            </p>
          )}
        </div>

        <button
          onClick={submit}
          disabled={busy}
          className="mt-3 h-12 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-60"
        >
          {busy
            ? "저장 중…"
            : mode === "create"
              ? "챌린지 만들기 (내 KPI 포함)"
              : "내 KPI 저장"}
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/challenge/setup-sheet.tsx
git commit -m "feat: 챌린지 목표 설정 카테고리 우선 UI"
```

---

### Task 10: 챌린지 page.tsx 배선 + 전체 검증 + DB 적용

**Files:**
- Modify: `src/app/(tabs)/challenge/page.tsx` (EMPTY_STATS 38-45, openSheet 기본 296-302, 라벨 이미 goalLabel 사용 중)

- [ ] **Step 1: EMPTY_STATS 새 형태로** — page.tsx 38-45

```ts
const EMPTY_STATS: PeriodStats = {
  workoutDays: 0,
  weightReps: 0,
  volumeKg: 0,
  cardioDistanceKm: 0,
  cardioTimeMin: 0,
  bodyweightReps: 0,
  bodyweightTimeMin: 0,
  weightPartsByDay: {},
  bodyweightKindsByDay: {},
};
```

- [ ] **Step 2: openSheet 기본 목표를 신규 goal_type로** — page.tsx 296-302의 기본 목표

```ts
        goals:
          mode === "goals" && myGoals.length > 0
            ? myGoals.map((g) => ({
                type: g.goal_type,
                target: Number(g.target_value),
                qualifier: g.qualifier,
              }))
            : [{ type: "weight_days", target: 12, qualifier: 3 }],
```

- [ ] **Step 3: 전체 정적 검증**

Run: `pnpm typecheck`
Expected: 통과 (에러 0). 실패 시 해당 파일의 measure/goal_type 배선 누락을 수정.

Run: `pnpm lint`
Expected: 통과.

Run: `pnpm test`
Expected: 기존 + 신규 challenge 테스트 모두 PASS.

Run: `pnpm build`
Expected: Compiled successfully.

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(tabs)/challenge/page.tsx"
git commit -m "feat: 챌린지 화면 카테고리 목표 배선 + 전체 검증"
```

- [ ] **Step 5: DB 적용 (사용자 수동)** — 사용자에게 안내

`supabase/migrations/0008_category_goals.sql` 파일 열기 → 전체 복사 → Supabase SQL Editor → Run.

- [ ] **Step 6: RLS 회귀 확인**

Run: `node scripts/rls-test.mjs`
Expected: `68 통과 / 0 실패` (컬럼·제약만 추가, 신규 RLS 없음). 픽스처가 구 goal_type을 쓰면 신규 값으로 갱신 후 재실행.

- [ ] **Step 7: 사용자 실기기 확인 (메모리 규칙)**

폰/PC에서:
- 맨몸 시간형 운동(매달리기) 추가 → 세트별 분 입력(1회차 3분·2회차 3분…) 동작.
- 직접 만들기에서 맨몸 선택 시 측정(횟수/시간) 선택 노출.
- 챌린지 목표 설정: 카테고리(웨이트/유산소/맨몸) 전환 → 지표 선택 → 일수형이면 부위/종목 스템퍼.
- 완료 세션이 챌린지 진행률에 카테고리별로 반영.

- [ ] **Step 8: 확인 후 최종 상태** — 실기기 확인 완료 보고 시 PROGRESS.md의 진행 상황을 갱신(별도 커밋). (이전 미커밋 "웨이트 운동일" 변경은 이 개편에 흡수되어 함께 커밋됨.)

---

## Self-Review (작성자 확인 완료)

**스펙 커버리지:**
- 카테고리 우선 목표 모델 → Task 2·3·9. 맨몸 시간형(매달리기) → Task 1·5·6·7. measure 구분(A안) → Task 1·2·5·7. days N 사용자설정 → Task 9(qualifier 스템퍼). goal_type 확장·매핑 → Task 1. 집계 확장 → Task 4. 라벨 → Task 3. 검증·DB·실기기 → Task 10. ✔ 누락 없음.

**플레이스홀더:** 없음(모든 코드 블록 완성).

**타입 일관성:** `measure: "reps" | "time" | null` 전 파일 동일. `GoalCategory`는 challenge.ts에서 export(Task 3) → setup-sheet import(Task 9). `PeriodStats`/`EMPTY_STATS` 필드명 challenge.ts(Task 3·4)와 page.tsx(Task 10) 일치. `foldPeriodStats`/`PeriodSessionRow`는 Task 4에서 정의·export, 테스트·getPeriodStatsByUser에서 사용. ✔
