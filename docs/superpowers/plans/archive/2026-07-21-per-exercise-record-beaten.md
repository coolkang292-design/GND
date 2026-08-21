# 종목별 기록 갱신 판정 Implementation Plan

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** 기록 갱신 판정을 세션 총합 비교에서 종목별 비교로 바꿔, 구성이 달라도 판정되고 알림이 "벤치프레스를 2회 더 하셨어요"처럼 사람 말이 되게 한다.

**Architecture:** 판정은 전부 `lib/domain/record-beaten.ts`의 순수함수가 맡는다(종목 지표 환산 → 종목별 문구 → 대표 문구 요약). I/O는 종목 이름 배열을 받아 쿼리 2회로 직전 기록을 한꺼번에 가져오는 배치 함수 하나로 끝낸다. SQL은 알림 문장 조립과 길이 제한만 바꾸고 배지 로직은 건드리지 않는다.

**Tech Stack:** Next.js 15 App Router · TypeScript · Supabase(Postgres/RLS/definer RPC) · vitest

**설계 문서:** `docs/superpowers/specs/2026-07-21-per-exercise-record-beaten-design.md`

**중요 전제:**
- 저장소 `C:\Users\SAMSUNG\workout-app`. `.claude/`는 untracked로 두고 절대 커밋하지 않는다.
- **DB 0001~0020은 적용 완료 — 재실행 금지.** 이번 신규는 `0021`뿐이고 Task 4 이후 사용자가 SQL Editor에 1회 적용한다.
- 파일 하나만 테스트할 땐 `pnpm exec vitest run <경로>`를 쓴다. `pnpm test -- <경로>`는 이 저장소에서 스코프가 먹지 않는다.
- 커밋 메시지 끝에는 항상 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 트레일러를 붙인다.

---

### Task 1: 종목별 판정 도메인 전면 교체 (TDD)

**Files:**
- Rewrite: `src/lib/domain/record-beaten.ts`
- Rewrite: `src/lib/domain/record-beaten.test.ts`

기존 `effortTotals`·`recordBeatenNote`·`findComparableSession`과 타입 `EffortTotals`·`ComparableCandidate`는 **전부 삭제**한다. `record/page.tsx` 외에 사용처가 없음을 확인했다(Task 3에서 그 호출부도 교체한다). 기존 테스트도 전부 새 테스트로 대체한다.

- [ ] **Step 1: 새 테스트 파일 작성 (기존 내용 전부 대체)**

`src/lib/domain/record-beaten.test.ts` 전체를 아래로 바꾼다.

```ts
import { describe, expect, it } from "vitest";

import {
  exerciseImprovementNote,
  exerciseMetric,
  recordBeatenSummary,
} from "./record-beaten";

function weightEx(
  sets: Array<[weightKg: number, reps: number, done?: boolean]>,
) {
  return {
    name: "벤치프레스",
    exerciseType: "weight" as const,
    measure: null,
    sets: sets.map(([weightKg, reps, done = true]) => ({
      weightKg,
      reps,
      distanceKm: 0,
      durationMin: 0,
      isCompleted: done,
    })),
  };
}

function bodyweightEx(
  name: string,
  measure: "reps" | "time",
  sets: Array<[reps: number, durationMin: number]>,
) {
  return {
    name,
    exerciseType: "bodyweight" as const,
    measure,
    sets: sets.map(([reps, durationMin]) => ({
      weightKg: 0,
      reps,
      distanceKm: 0,
      durationMin,
      isCompleted: true,
    })),
  };
}

function cardioEx(
  name: string,
  sets: Array<[distanceKm: number, durationMin: number]>,
) {
  return {
    name,
    exerciseType: "cardio" as const,
    measure: null,
    sets: sets.map(([distanceKm, durationMin]) => ({
      weightKg: 0,
      reps: 0,
      distanceKm,
      durationMin,
      isCompleted: true,
    })),
  };
}

describe("exerciseMetric", () => {
  it("웨이트는 볼륨(무게×횟수) 합계", () => {
    expect(exerciseMetric(weightEx([[30, 10], [30, 10]]))).toBe(600);
  });

  it("미완료 세트는 세지 않는다", () => {
    expect(exerciseMetric(weightEx([[30, 10], [30, 10, false]]))).toBe(300);
  });

  it("맨몸 횟수형은 총 횟수", () => {
    expect(exerciseMetric(bodyweightEx("푸시업", "reps", [[20, 0], [15, 0]]))).toBe(35);
  });

  it("맨몸 시간형은 총 시간(분)", () => {
    expect(exerciseMetric(bodyweightEx("플랭크", "time", [[0, 2], [0, 1]]))).toBe(3);
  });

  it("유산소는 거리 km", () => {
    expect(exerciseMetric(cardioEx("러닝", [[3, 20]]))).toBe(3);
  });

  it("유산소 거리가 0이면 시간(분)을 쓴다", () => {
    expect(exerciseMetric(cardioEx("러닝", [[0, 25]]))).toBe(25);
  });
});

describe("exerciseImprovementNote", () => {
  it("세트가 늘면 세트 문구", () => {
    expect(
      exerciseImprovementNote(
        weightEx([[30, 10], [30, 10], [30, 10], [30, 10]]),
        weightEx([[30, 10], [30, 10], [30, 10], [30, 10], [30, 10]]),
      ),
    ).toBe("벤치프레스를 1세트 더 하셨어요");
  });

  it("세트가 같고 무게가 오르면 무게 문구", () => {
    expect(
      exerciseImprovementNote(weightEx([[60, 5]]), weightEx([[65, 5]])),
    ).toBe("벤치프레스를 5kg 더 무겁게 드셨어요");
  });

  it("세트·무게가 같고 횟수가 늘면 횟수 문구", () => {
    expect(
      exerciseImprovementNote(weightEx([[30, 8]]), weightEx([[30, 10]])),
    ).toBe("벤치프레스를 2회 더 하셨어요");
  });

  it("맨몸 횟수형", () => {
    expect(
      exerciseImprovementNote(
        bodyweightEx("푸시업", "reps", [[20, 0]]),
        bodyweightEx("푸시업", "reps", [[25, 0]]),
      ),
    ).toBe("푸시업을 5회 더 하셨어요");
  });

  it("맨몸 시간형", () => {
    expect(
      exerciseImprovementNote(
        bodyweightEx("플랭크", "time", [[0, 1]]),
        bodyweightEx("플랭크", "time", [[0, 3]]),
      ),
    ).toBe("플랭크를 2분 더 버텼어요");
  });

  it("유산소 거리", () => {
    expect(
      exerciseImprovementNote(cardioEx("러닝", [[3, 20]]), cardioEx("러닝", [[3.5, 20]])),
    ).toBe("러닝을 0.5km 더 뛰었어요");
  });

  it("유산소 시간 (거리 없음)", () => {
    expect(
      exerciseImprovementNote(cardioEx("러닝", [[0, 20]]), cardioEx("러닝", [[0, 25]])),
    ).toBe("러닝을 5분 더 뛰었어요");
  });

  it("동률이면 null", () => {
    expect(
      exerciseImprovementNote(weightEx([[30, 10]]), weightEx([[30, 10]])),
    ).toBeNull();
  });

  it("줄었으면 null", () => {
    expect(
      exerciseImprovementNote(weightEx([[30, 10]]), weightEx([[30, 8]])),
    ).toBeNull();
  });

  it("직전 실적이 0이면 null", () => {
    expect(
      exerciseImprovementNote(weightEx([[0, 0]]), weightEx([[30, 10]])),
    ).toBeNull();
  });

  it("받침 있는 이름엔 '을'을 쓴다", () => {
    expect(
      exerciseImprovementNote(
        bodyweightEx("랫풀다운", "reps", [[10, 0]]),
        bodyweightEx("랫풀다운", "reps", [[12, 0]]),
      ),
    ).toBe("랫풀다운을 2회 더 하셨어요");
  });

  it("한글이 아닌 이름엔 '를'을 쓴다", () => {
    expect(
      exerciseImprovementNote(
        bodyweightEx("Burpee", "reps", [[10, 0]]),
        bodyweightEx("Burpee", "reps", [[12, 0]]),
      ),
    ).toBe("Burpee를 2회 더 하셨어요");
  });

  it("소수는 2자리까지만 남긴다", () => {
    expect(
      exerciseImprovementNote(cardioEx("러닝", [[3, 20]]), cardioEx("러닝", [[3.333, 20]])),
    ).toBe("러닝을 0.33km 더 뛰었어요");
  });
});

describe("recordBeatenSummary", () => {
  const bench = { note: "벤치프레스를 2회 더 하셨어요", ratio: 0.2 };
  const squat = { note: "스쿼트를 1세트 더 하셨어요", ratio: 0.5 };
  const run = { note: "러닝을 5분 더 뛰었어요", ratio: 0.1 };

  it("개선이 없으면 null", () => {
    expect(recordBeatenSummary([])).toBeNull();
  });

  it("1종목이면 그 문구 그대로", () => {
    expect(recordBeatenSummary([bench])).toBe("벤치프레스를 2회 더 하셨어요");
  });

  it("여러 종목이면 개선율이 가장 큰 종목 + 외 N종목", () => {
    expect(recordBeatenSummary([bench, squat, run])).toBe(
      "스쿼트를 1세트 더 하셨어요 외 2종목 갱신",
    );
  });

  it("개선율이 같으면 먼저 온 종목을 대표로 쓴다", () => {
    expect(
      recordBeatenSummary([
        { note: "먼저를 1회 더 하셨어요", ratio: 0.3 },
        { note: "나중을 1회 더 하셨어요", ratio: 0.3 },
      ]),
    ).toBe("먼저를 1회 더 하셨어요 외 1종목 갱신");
  });

  it("문구는 80자를 넘지 않는다", () => {
    const long = {
      note: "아주아주긴이름의커스텀운동종목이름입니다를 1000회 더 하셨어요",
      ratio: 1,
    };
    const summary = recordBeatenSummary([long, bench, squat]);
    expect(summary).not.toBeNull();
    expect(summary!.length).toBeLessThanOrEqual(80);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run src/lib/domain/record-beaten.test.ts`
Expected: FAIL — 아직 구현이 없으므로 import 해석에 실패한다(`exerciseMetric is not a function` 또는 export 없음 오류).

- [ ] **Step 3: 구현 (파일 전체 교체)**

`src/lib/domain/record-beaten.ts` 전체를 아래로 바꾼다.

```ts
import type { ExerciseType } from "@/lib/types";

/** 판정 입력 — 종목 하나의 완료 실적 (설계 2026-07-21) */
export type ComparableExercise = {
  name: string;
  exerciseType: ExerciseType;
  measure: "reps" | "time" | null;
  sets: Array<{
    weightKg: number;
    reps: number;
    distanceKm: number;
    durationMin: number;
    isCompleted: boolean;
  }>;
};

function completedSets(exercise: ComparableExercise) {
  return exercise.sets.filter((set) => set.isCompleted);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function trimNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** 한글 마지막 글자에 받침이 있으면 "을", 아니면 "를". 비한글은 "를". */
function objectParticle(name: string): string {
  const last = name.trim().at(-1);
  if (!last) return "를";
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "를";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

/**
 * 종목 하나를 유형에 맞는 지표 하나로 환산한다. 완료 세트만 센다.
 * 유산소는 거리를 쓰되, 거리 기록이 없으면 시간을 쓴다.
 */
export function exerciseMetric(exercise: ComparableExercise): number {
  const sets = completedSets(exercise);
  if (exercise.exerciseType === "weight") {
    return sum(sets.map((set) => set.weightKg * set.reps));
  }
  if (exercise.exerciseType === "bodyweight") {
    return exercise.measure === "time"
      ? sum(sets.map((set) => set.durationMin))
      : sum(sets.map((set) => set.reps));
  }
  const distance = sum(sets.map((set) => set.distanceKm));
  return distance > 0 ? distance : sum(sets.map((set) => set.durationMin));
}

/**
 * 종목 하나가 직전보다 나아졌으면 사람 말 문구, 아니면 null.
 * 판정은 지표로 하고, 문구는 실제로 변한 항목으로 쓴다.
 */
export function exerciseImprovementNote(
  previous: ComparableExercise,
  current: ComparableExercise,
): string | null {
  const before = exerciseMetric(previous);
  const after = exerciseMetric(current);
  if (before <= 0 || after <= before) return null;

  const name = current.name;
  const particle = objectParticle(name);

  if (current.exerciseType === "weight") {
    const prevSets = completedSets(previous);
    const currSets = completedSets(current);

    const setDelta = currSets.length - prevSets.length;
    if (setDelta > 0) return `${name}${particle} ${setDelta}세트 더 하셨어요`;

    const prevTopWeight = Math.max(...prevSets.map((set) => set.weightKg), 0);
    const currTopWeight = Math.max(...currSets.map((set) => set.weightKg), 0);
    const weightDelta = currTopWeight - prevTopWeight;
    if (weightDelta > 0) {
      return `${name}${particle} ${trimNumber(weightDelta)}kg 더 무겁게 드셨어요`;
    }

    const repsDelta =
      sum(currSets.map((set) => set.reps)) - sum(prevSets.map((set) => set.reps));
    if (repsDelta > 0) return `${name}${particle} ${repsDelta}회 더 하셨어요`;

    return `${name} 볼륨이 ${trimNumber(after - before)}kg 늘었어요`;
  }

  if (current.exerciseType === "bodyweight") {
    return current.measure === "time"
      ? `${name}${particle} ${trimNumber(after - before)}분 더 버텼어요`
      : `${name}${particle} ${trimNumber(after - before)}회 더 하셨어요`;
  }

  const usesDistance = sum(completedSets(current).map((set) => set.distanceKm)) > 0;
  return usesDistance
    ? `${name}${particle} ${trimNumber(after - before)}km 더 뛰었어요`
    : `${name}${particle} ${trimNumber(after - before)}분 더 뛰었어요`;
}

/** 개선된 종목 하나 — 문구와 개선율(비율) */
export type ExerciseImprovement = {
  note: string;
  ratio: number;
};

/** record_note 컬럼과 RPC가 허용하는 최대 길이 (0021) */
const NOTE_MAX_LENGTH = 80;

/**
 * 개선된 종목들을 알림 1건짜리 문구로 묶는다. 대표는 개선율이 가장 큰
 * 종목이고, 동률이면 먼저 온 종목을 쓴다. 나머지는 "외 N종목 갱신".
 */
export function recordBeatenSummary(
  improvements: ExerciseImprovement[],
): string | null {
  if (improvements.length === 0) return null;

  let top = improvements[0];
  for (const improvement of improvements) {
    if (improvement.ratio > top.ratio) top = improvement;
  }

  const others = improvements.length - 1;
  const summary =
    others > 0 ? `${top.note} 외 ${others}종목 갱신` : top.note;

  return summary.length > NOTE_MAX_LENGTH
    ? summary.slice(0, NOTE_MAX_LENGTH)
    : summary;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run src/lib/domain/record-beaten.test.ts`
Expected: PASS (6 + 13 + 5 = 24 tests)

이 시점에 `pnpm typecheck`는 **실패한다** — `record/page.tsx`가 아직 삭제된 함수를 import하고 있기 때문이다. Task 3에서 고친다. 여기서는 진행해도 된다.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/record-beaten.ts src/lib/domain/record-beaten.test.ts
git commit -m "feat: per-exercise record beaten judgement"
```

---

### Task 2: 직전 종목 기록 배치 조회

**Files:**
- Modify: `src/lib/workout.ts` (파일 끝의 기록 갱신 관련 영역에 추가)

- [ ] **Step 1: 배치 조회 함수 추가**

`src/lib/workout.ts`의 `markRecordBeaten` 함수 바로 위에 아래를 그대로 추가한다.

```ts
/** 직전 기록 조회 범위 — 이보다 오래된 기록과는 비교하지 않는다 */
const PREVIOUS_RECORD_SESSION_LIMIT = 20;

/** 조회 결과 — 판정 입력에 어느 세션에서 왔는지를 더한 것 */
export type PreviousExerciseRecord = ComparableExercise & {
  sessionId: string;
};

/**
 * 오늘 한 종목들의 **직전 기록**을 한 번에 가져온다 (설계 2026-07-21).
 * 쿼리 2회로 끝낸다. 방금 완료한 세션과 타바타 세션은 후보에서 뺀다 —
 * 타바타는 세트 실적이 0이라 정상 기록을 가린다.
 */
export async function getPreviousExerciseRecords(
  userId: string,
  exerciseNames: string[],
  excludeSessionId: string,
): Promise<Map<string, PreviousExerciseRecord>> {
  const result = new Map<string, PreviousExerciseRecord>();
  if (exerciseNames.length === 0) return result;

  const supabase = getSupabaseBrowserClient();

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

  // sessionIds는 최신순이므로 인덱스가 작을수록 최근이다.
  const recencyOf = new Map(sessionIds.map((id, index) => [id, index]));

  for (const row of (exercises ?? []) as Row[]) {
    const rank = recencyOf.get(row.session_id);
    if (rank === undefined) continue;

    const existing = result.get(row.exercise_name);
    if (existing) {
      const existingRank = recencyOf.get(existing.sessionId);
      if (existingRank !== undefined && existingRank <= rank) continue;
    }

    result.set(row.exercise_name, {
      sessionId: row.session_id,
      name: row.exercise_name,
      exerciseType: row.exercise_type,
      measure: row.measure,
      sets: (row.workout_sets ?? []).map((s) => ({
        weightKg: Number(s.weight_kg ?? 0),
        reps: s.reps ?? 0,
        distanceKm: Number(s.distance_meters ?? 0) / 1000,
        durationMin: Math.round((s.duration_seconds ?? 0) / 60),
        isCompleted: s.is_completed,
      })),
    });
  }

  return result;
}
```

- [ ] **Step 2: import 추가**

`src/lib/workout.ts` 상단의 `import type { LogExercise } from "@/lib/domain/workout-log";` 바로 아래에 한 줄을 넣는다.

```ts
import type { ComparableExercise } from "@/lib/domain/record-beaten";
```

`ExerciseType`과 `WorkoutSet`은 이 파일이 이미 `@/lib/types`에서 가져오고 있으므로 **추가 import가 필요 없다**(확인 완료).

- [ ] **Step 3: 타입 확인**

Run: `pnpm typecheck`
Expected: `src/app/(tabs)/record/page.tsx`에서 삭제된 함수(`effortTotals`·`recordBeatenNote`·`findComparableSession`)를 import한다는 오류만 남는다. Task 3에서 고친다. `workout.ts` 관련 오류가 나오면 그건 여기서 고쳐야 한다.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/workout.ts
git commit -m "feat: batch lookup of previous per-exercise records"
```

---

### Task 3: 완료 흐름 교체

**Files:**
- Modify: `src/app/(tabs)/record/page.tsx` — `@/lib/domain/record-beaten` import, `@/lib/workout` import, `handleFinish`의 판정 블록

- [ ] **Step 1: import 교체**

`@/lib/domain/record-beaten`에서 가져오는 줄을 아래로 바꾼다.

```ts
import {
  exerciseImprovementNote,
  exerciseMetric,
  recordBeatenSummary,
  type ExerciseImprovement,
} from "@/lib/domain/record-beaten";
```

`@/lib/workout`의 import 목록에 `getPreviousExerciseRecords`를 알파벳 순서에 맞게 추가한다.

같은 목록에서 `getSessionLogExercises`는 이 교체 후 `record/page.tsx`에서 쓰이지 않게 되므로 **import 목록에서만 제거**한다. **`workout.ts`의 함수 자체는 절대 지우지 마라** — `src/components/record/calendar-view.tsx:202`(달력 상세 시트의 일지 공유)가 계속 쓴다(확인 완료).

- [ ] **Step 2: 판정 블록 교체**

`handleFinish` 안의 `// 기록 갱신 판정 — 복사 원본이 있으면 …` 주석부터 그 `try/catch` 끝까지를 아래로 통째로 바꾼다.

```tsx
      // 기록 갱신 판정 — 종목마다 그 종목의 직전 기록과 비교한다. 구성이
      // 달라도 성립한다. 판정·RPC 실패는 완료 흐름을 막지 않는다.
      let recordNote: string | null = null;
      try {
        const names = draft.exercises.map((ex) => ex.name);
        const previousByName = await getPreviousExerciseRecords(
          userId,
          names,
          s.id,
        );

        const improvements: ExerciseImprovement[] = [];
        for (const ex of draft.exercises) {
          const previous = previousByName.get(ex.name);
          if (!previous) continue;

          const current = {
            name: ex.name,
            exerciseType: ex.exerciseType,
            measure: ex.measure,
            sets: ex.sets.map((set) => ({
              weightKg: set.weightKg,
              reps: set.reps,
              distanceKm: set.distanceKm,
              durationMin: set.durationMin,
              isCompleted: set.done,
            })),
          };

          const note = exerciseImprovementNote(previous, current);
          if (!note) continue;

          const before = exerciseMetric(previous);
          improvements.push({
            note,
            ratio: before > 0 ? (exerciseMetric(current) - before) / before : 0,
          });
        }

        recordNote = recordBeatenSummary(improvements);
        if (recordNote) await markRecordBeaten(s.id, recordNote);
      } catch {
        recordNote = null;
      }
```

- [ ] **Step 3: 검증**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 타입 오류 0 · 린트 오류 0 · 전체 테스트 통과

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(tabs)/record/page.tsx"
git commit -m "feat: judge record beaten per exercise on finish"
```

---

### Task 4: 0021 마이그레이션 (사용자 적용 게이트)

**Files:**
- Create: `supabase/migrations/0021_record_note_wording.sql`

**이 태스크는 SQL 파일을 쓰기만 한다. 실행하지 않는다.**

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/0021_record_note_wording.sql`을 만든다. 0020의 `mark_record_beaten`을 그대로 가져오되 **두 곳만** 바꾼다 — 문구 길이 제한 40 → 80, 알림 body 조립 방식.

```sql
-- 0021: 기록 갱신 문구를 종목별 서술로 바꾸면서 알림 문장·길이 제한 조정
-- 설계: docs/superpowers/specs/2026-07-21-per-exercise-record-beaten-design.md
-- 0020 대비 바뀐 것 ①문구 길이 40 → 80 ②알림 body가 "{닉네임}님이 {문구}." 형태
-- 배지 지급 로직은 0020과 동일하다.
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만)

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
     or length(p_note) > 80 then
    raise exception 'invalid_note';
  end if;

  update workout_sessions
  set record_note = p_note
  where id = p_session_id;

  select nickname into v_nickname
  from profiles
  where id = v_session.user_id;

  -- 크루에게 칭찬 요청 알림 (→ 0016 트리거가 푸시 발송)
  -- 문구가 "벤치프레스를 2회 더 하셨어요" 형태라 닉네임만 앞에 붙이면 문장이 된다.
  insert into notifications (user_id, actor_id, type, reference_id, title, body)
  select distinct
    gm.user_id,
    v_session.user_id,
    'record_beaten',
    p_session_id,
    '🏅 기록 갱신! 칭찬해주세요',
    coalesce(v_nickname, '크루원') || '님이 ' || p_note
      || '. 칭찬 한마디 남겨주세요! 👏'
  from group_members gm
  where gm.user_id <> v_session.user_id
    and gm.group_id in (
      select group_id
      from group_members
      where user_id = v_session.user_id
    );

  -- 배지 지급 — 임계값은 여기가 단일 원천이다 (0020과 동일).
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

- [ ] **Step 2: 배지 키 드리프트 테스트가 여전히 통과하는지 확인**

`src/lib/badge-keys.test.ts`는 `0020_badges.sql`을 읽는다. 0021에도 같은 키가 들어갔으므로 테스트는 그대로 통과해야 한다.

Run: `pnpm exec vitest run src/lib/badge-keys.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0021_record_note_wording.sql
git commit -m "feat: 0021 per-exercise wording in record beaten notification"
```

- [ ] **Step 4: 사용자에게 적용 요청 (게이트)**

사용자에게 아래를 요청하고, 적용 완료 응답 전에는 Task 5를 실행하지 않는다.

> `supabase/migrations/0021_record_note_wording.sql` 전체를 Supabase SQL Editor에 붙여넣고 Run 해주세요 (1회만). 0001~0020은 이미 적용돼 있으니 다시 실행하지 마세요.

---

### Task 5: 실 DB 검증 갱신 (0021 적용 후)

**Files:**
- Modify: `scripts/record-beaten-test.mjs`
- Modify: `scripts/badge-test.mjs`

- [ ] **Step 1: record-beaten-test 문구 단언 갱신**

`scripts/record-beaten-test.mjs`에서 마킹에 쓰는 문구를 새 형식으로 바꾸고(3곳: 초기 거절 테스트, 성공 마킹, 재마킹 시도), 크루 알림 단언을 새 문장에 맞춘다.

`p_note: "볼륨 +12.5kg"` → `p_note: "벤치프레스를 2회 더 하셨어요"`
`row.json?.[0]?.record_note === "볼륨 +12.5kg"` → `=== "벤치프레스를 2회 더 하셨어요"`

크루 알림 단언을 아래로 바꾼다.

```js
  check(
    "크루원(B)에게 칭찬 요청 알림 생성",
    notifs.status === 200 &&
      notifs.json?.length === 1 &&
      notifs.json[0].body.includes("님이 벤치프레스를 2회 더 하셨어요") &&
      notifs.json[0].body.includes("칭찬 한마디") &&
      notifs.json[0].title.includes("칭찬해주세요"),
    JSON.stringify(notifs.json),
  );
```

빈 문구 거절 테스트는 그대로 두고, **80자 초과 거절**을 확인하는 케이스를 하나 더 넣는다(`"가".repeat(81)`).

- [ ] **Step 2: badge-test 문구 갱신**

`scripts/badge-test.mjs`의 `p_note` 값들을 새 형식으로 바꾼다. 배지 로직은 그대로이므로 문구만 맞추면 된다.

`"볼륨 +10kg"` → `"벤치프레스를 1회 더 하셨어요"`
`` `볼륨 +${i}kg` `` → `` `스쿼트를 ${i}회 더 하셨어요` ``
`"볼륨 +50kg"` → `"러닝을 5분 더 뛰었어요"`

크루 알림 단언도 새 문장에 맞춘다.

```js
  check(
    "크루원에게 칭찬 요청 알림",
    praise.status === 200 &&
      praise.json?.length === 1 &&
      praise.json[0].title.includes("칭찬해주세요") &&
      praise.json[0].body.includes("님이 벤치프레스를 1회 더 하셨어요"),
    JSON.stringify(praise.json),
  );
```

- [ ] **Step 3: 실행**

Run:
```bash
node scripts/record-beaten-test.mjs
node scripts/badge-test.mjs
```
Expected: 9/9 (80자 케이스 추가로 8 → 9) · 9/9

- [ ] **Step 4: 커밋**

```bash
git add scripts/record-beaten-test.mjs scripts/badge-test.mjs
git commit -m "test: per-exercise wording in real db verification"
```

---

### Task 6: 전체 게이트 + 기록 + 배포

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 정적 게이트**

dev 서버가 떠 있으면 먼저 끈다.

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: 전체 통과 · 린트 오류 0 · 빌드 성공

- [ ] **Step 2: 실 DB 게이트 전수**

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
Expected: 107 · 15/15 · 8/8 · 8/8 · 8/8 · 9/9 · 9/9

- [ ] **Step 3: PROGRESS.md 갱신**

최상단에 새 섹션을 추가한다. 실측값은 실행 결과로 채운다.

```markdown
## ✅ 2026-07-21 — 기록 갱신을 종목별 판정으로 교체

- **문서**: 설계 `docs/superpowers/specs/2026-07-21-per-exercise-record-beaten-design.md` · 계획 `docs/superpowers/plans/archive/2026-07-21-per-exercise-record-beaten.md`.
- **왜 바꿨나**: 세션 총합 비교는 ①종목 구성이 하나만 달라도 판정 자체를 안 하고 ②종목을 빼면 유리해지는 악용 경로가 있었으며 ③"볼륨 +300kg"이 어느 종목인지 알 수 없었다.
- **새 규칙**: 종목마다 **그 종목의 직전 기록**(최근 20세션, 타바타·당일 세션 제외)과 비교. 문구는 실제로 변한 항목으로 쓴다 — 세트↑ → "N세트 더", 무게↑ → "Nkg 더 무겁게", 횟수↑ → "N회 더". 조사(을/를)는 받침으로 고른다.
- **알림**: 세션당 **1건**으로 묶는다. 대표는 개선율 최대 종목, 나머지는 "외 N종목 갱신". **개선폭 문턱 없음**(사용자 확정 — 1회만 더 해도 발송).
- **0021 적용 ✅**: `mark_record_beaten`의 문구 길이 40 → 80, 알림 body가 `{닉네임}님이 {문구}. 칭찬 한마디 남겨주세요! 👏`. 배지 로직은 0020과 동일.
- **쿼리 개선**: 완료 시 이력 전체를 긁던 것을 종목 이름으로 묶어 **쿼리 2회**로 줄였다 — 이전 백로그 항목 해소.
- **알려진 한계**: 시간은 분 단위 정수 입력이라 플랭크 60초→90초 같은 개선은 잡히지 않는다(1분→2분이어야 함).
- **검증 실측**: unit __/__ · typecheck · lint 0 · build · RLS 107 · 예정표 15 · 사진 8 · 브리핑 8 · 푸시 8 · 기록갱신 9/9 · 배지 9/9.
```

`다음 세션 시작 체크리스트`의 DB 줄을 `0001~0021 전부 적용 완료`로 고친다.

- [ ] **Step 4: 커밋**

```bash
git add PROGRESS.md
git commit -m "docs: record per-exercise record beaten judgement"
```

- [ ] **Step 5: 배포 (사용자 승인 후)**

Run: `pnpm dlx vercel deploy --prod --yes`
Expected: `● Ready` (target production)

확인: `https://gnd-one.vercel.app/record` HTTP 200

---

## 참고 — 이 계획이 손대지 않는 것

- 배지 시스템(0020)의 지급 규칙·테이블·진열대 UI
- 웹 푸시 배관(0016)
- 시간 입력 단위(분 → 초)
- 개선폭 문턱, 종목별 개인 최고기록(PR) 추적
- `0001`~`0020` 마이그레이션 (적용 완료 — 재실행 금지)
