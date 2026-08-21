# GND Program Guided Workout Implementation Plan

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** 프로그램 예정표를 열면 최근 성공 기록을 바탕으로 무게가 자동 입력되고, 종목별 반복 범위·휴식시간·첫/마지막 세트 피드백으로 오늘과 다음 회차의 권장 무게가 보정되게 한다.

**Architecture:** 계획의 처방은 `PlanExercise.prescription`에서 읽고 실제 무게 추천은 시작 직전 최신 완료 기록으로 계산한다. 프로그램 메타데이터는 완료 세션에 복사해 예정표 삭제 뒤에도 18회 진행률을 보존한다. 노력 피드백은 첫·마지막 세트에만 받고 `workout_sets.effort_feedback`에 저장한다.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Supabase/PostgreSQL, Vitest, Testing Library

---

## 실행 전 조건

- 선행 계획 `2026-08-12-official-program-scheduling.md`가 완료되고 0066이 적용돼 있어야 한다.
- 설계 원문: `docs/superpowers/specs/2026-08-12-official-workout-programs-design.md`
- DB 변경은 사용자 SQL Editor 적용 전까지 정적 검토만 한다.

## 파일 구조

**생성**

- `src/lib/domain/program-load.ts` — 최근 기록→시작 무게, 첫/마지막 피드백→다음 제안
- `src/lib/domain/program-load.test.ts` — 범위 상·하한, 무기록, 자세 붕괴, 증량 단위
- `src/components/record/effort-feedback-sheet.tsx` — 세 버튼과 통증 분기
- `src/components/record/effort-feedback-sheet.test.tsx` — 첫·마지막 세트만 표시
- `supabase/migrations/0067_program_workout_feedback.sql` — 세션 메타데이터와 세트 피드백

**수정**

- `src/lib/workout.ts` — draft v6, 프로그램 메타, 피드백 저장, 최근 종목 기록 조회
- `src/lib/workout-draft.test.ts` — v5→v6 승격과 필드 보존
- `src/app/(tabs)/record/page.tsx` — 프로그램 계획 비동기 준비, 피드백, 종목별 휴식
- `src/components/record/exercise-card.tsx` — 반복 범위·권장 무게 안내
- `src/components/record/exercise-card.test.tsx` — 처방 안내와 수정 가능 입력
- `src/components/record/active-session-overlay.tsx` — 목표 범위와 오늘 무게 표시
- `src/components/record/active-session-overlay.test.tsx` — 휴식·범위 회귀
- `scripts/workout-plan-test.mjs` — 프로그램 세션 메타데이터 연결 검사
- `PROGRESS.md` — 실측 결과

---

### Task 1: 무게 추천 규칙 TDD

**Files:**
- Create: `src/lib/domain/program-load.test.ts`
- Create: `src/lib/domain/program-load.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, expect, it } from "vitest";
import { initialProgramLoad, nextProgramLoad } from "./program-load";

const rx = { repsMin: 8, repsMax: 10, targetRir: 2, restSeconds: 120, loadStepKg: 2.5 } as const;

it("최근 완료 세트 중 반복 범위에 맞는 마지막 성공 무게를 쓴다", () => {
  expect(initialProgramLoad(rx, [
    { weightKg: 40, reps: 10, isCompleted: true },
    { weightKg: 45, reps: 6, isCompleted: true },
  ])).toEqual({ weightKg: 40, source: "history" });
});

it("기록이 없으면 무게를 추측하지 않고 반복 가이드를 준다", () => {
  expect(initialProgramLoad(rx, [])).toMatchObject({ weightKg: null, source: "first_set" });
});

it("모든 세트 상한 달성 + 적당함이면 최소 단위 증량", () => {
  expect(nextProgramLoad(rx, 40, [10, 10, 10], "on_target")).toBe(42.5);
});

it("하한 미달이나 너무 무거움이면 증량하지 않는다", () => {
  expect(nextProgramLoad(rx, 40, [8, 7, 6], "too_heavy")).toBeLessThanOrEqual(40);
});
```

- [ ] **Step 2: 모듈 없음 실패 확인**

```powershell
pnpm test -- src/lib/domain/program-load.test.ts
```

- [ ] **Step 3: 순수 함수 구현**

```ts
export type EffortFeedback = "too_light" | "on_target" | "too_heavy";

export type PreviousCompletedSet = {
  weightKg: number;
  reps: number;
  isCompleted: boolean;
};

export function initialProgramLoad(
  prescription: ExercisePrescription,
  previous: readonly PreviousCompletedSet[],
): { weightKg: number | null; source: "history" | "first_set"; guide: string };

export function nextProgramLoad(
  prescription: ExercisePrescription,
  currentWeightKg: number,
  completedReps: readonly number[],
  finalFeedback: EffortFeedback,
): number;
```

증량은 `loadStepKg` 한 단위만 적용한다. `too_heavy`는 0kg 아래로 내리지 않는다. 자동 결과는 제안값이며 사용자가 수정한 값이 항상 우선한다.

- [ ] **Step 4: 테스트 통과와 커밋**

```powershell
pnpm test -- src/lib/domain/program-load.test.ts
git add -- src/lib/domain/program-load.ts src/lib/domain/program-load.test.ts
git commit -m "feat: 프로그램 무게 추천 규칙"
```

---

### Task 2: 완료 세션 프로그램 연결과 피드백 컬럼

**Files:**
- Create: `supabase/migrations/0067_program_workout_feedback.sql`
- Modify: `scripts/workout-plan-test.mjs`

- [ ] **Step 1: 실 DB 단언 추가**

프로그램 계획으로 만든 세션의 enrollment/week/session/version이 보존되는지, 다른 사용자가 값을 쓰거나 읽을 수 없는지, `effort_feedback`이 허용된 세 값 외에는 거부되는지 먼저 작성한다.

- [ ] **Step 2: 0067 SQL 작성**

```sql
alter table public.workout_sessions
  add column program_enrollment_id uuid references public.program_enrollments(id) on delete set null,
  add column program_week smallint check (program_week between 1 and 6),
  add column program_session smallint check (program_session between 1 and 3),
  add column program_template_version int check (program_template_version >= 1);

alter table public.workout_sets
  add column effort_feedback text
    check (effort_feedback is null or effort_feedback in ('too_light','on_target','too_heavy'));
```

`workout_sessions` insert 정책은 enrollment가 null이거나 본인 enrollment일 때만 허용하도록 교체한다. 클라이언트가 상태·시각 컬럼을 직접 쓰지 못하는 기존 column grant를 유지하면서 네 프로그램 메타 컬럼만 insert 가능하게 추가한다.

- [ ] **Step 3: 정적 검토 후 사용자 SQL 게이트**

```powershell
rg -n "program_enrollment_id|effort_feedback|grant insert|program_enrollments" supabase/migrations/0067_program_workout_feedback.sql
git diff --check
```

사용자에게 0067 전체 Run을 요청하고 기다린다.

- [ ] **Step 4: 적용 후 실 DB 검사와 커밋**

```powershell
node scripts/workout-plan-test.mjs
git add -- supabase/migrations/0067_program_workout_feedback.sql scripts/workout-plan-test.mjs
git commit -m "feat: 프로그램 세션과 노력 피드백 저장"
```

---

### Task 3: draft v6과 프로그램 계획 준비

**Files:**
- Modify: `src/lib/workout.ts`
- Modify: `src/lib/workout-draft.test.ts`
- Modify: `src/app/(tabs)/record/page.tsx`

- [ ] **Step 1: draft 승격 실패 테스트 작성**

`version: 5` draft를 읽으면 `program: null`과 세트별 `effortFeedback: null`이 생기고, v6를 저장·복원하면 프로그램 메타데이터와 처방이 유지되는지 단언한다.

- [ ] **Step 2: 타입 확장**

```ts
export type LocalSet = {
  key: string;
  weightKg: number;
  reps: number;
  distanceKm: number;
  durationMin: number;
  done: boolean;
  effortFeedback: EffortFeedback | null;
};

export type LocalExercise = {
  key: string;
  name: string;
  bodyPart: BodyPart;
  exerciseType: ExerciseType;
  measure: "reps" | "time" | null;
  isCustom: boolean;
  sets: LocalSet[];
  prescription?: ExercisePrescription;
};

export type ProgramDraftMeta = {
  enrollmentId: string;
  week: number;
  session: number;
  templateVersion: number;
};

export type WorkoutDraft = {
  version: 6;
  sessionId: string | null;
  startedAtMs: number | null;
  scheduledPlanId: string | null;
  sourceSessionId: string | null;
  effortMessage: string | null;
  restSeconds: number;
  exercises: LocalExercise[];
  pausedSeconds: number;
  pausedAtMs: number | null;
  lastActivityMs: number | null;
  tabataMinutes: number | null;
  program: ProgramDraftMeta | null;
};
```

`newSet()`은 피드백 null, `emptyDraft()`는 program null이다. v1~v5 승격 경로를 모두 v6으로 끝낸다.

- [ ] **Step 3: 프로그램 계획을 비동기로 준비**

프로그램 plan이면 운동별 `getLastRecordedSets(userId, name)`를 병렬 조회하고 `initialProgramLoad()`로 각 세트의 무게를 채운다. 기록이 없는 종목은 0kg을 자동 확정하지 않고 `first_set` 안내 상태를 둔다. 일반 계획과 타바타는 기존 경로를 유지한다.

`createDraftSession()` 입력에 프로그램 메타를 추가해 `workout_sessions`에 저장한다.

- [ ] **Step 4: 관련 테스트·타입 검사와 커밋**

```powershell
pnpm test -- src/lib/workout-draft.test.ts src/lib/domain/program-load.test.ts
pnpm typecheck
git add -- src/lib/workout.ts src/lib/workout-draft.test.ts src/app/(tabs)/record/page.tsx
git commit -m "feat: 프로그램 계획을 최신 무게로 준비"
```

---

### Task 4: 반복 범위 안내와 종목별 휴식

**Files:**
- Modify: `src/components/record/exercise-card.tsx`
- Modify: `src/components/record/exercise-card.test.tsx`
- Modify: `src/components/record/active-session-overlay.tsx`
- Modify: `src/components/record/active-session-overlay.test.tsx`
- Modify: `src/app/(tabs)/record/page.tsx`

- [ ] **Step 1: UI 실패 테스트 작성**

```tsx
it("프로그램 운동에 반복 범위와 2회 여유 안내를 보여준다", () => {
  const html = renderCard({
    item: {
      ...exercise,
      prescription: {
        repsMin: 8,
        repsMax: 10,
        targetRir: 2,
        restSeconds: 120,
        loadStepKg: 2.5,
      },
    },
  });
  expect(html).toContain("8~10회");
  expect(html).toContain("2회 정도 더 할 수 있는 무게");
  expect(html).toContain("휴식 2:00");
});
```

기존 `renderCard()` 테스트 헬퍼에 `item?: LocalExercise`를 추가하고
`exercise={item ?? exercise}`로 넘긴다. Testing Library 방식으로 파일 전체를 바꾸지
않는다.

처방 없는 일반 운동에는 이 영역이 없고 기존 전역 휴식 설정이 그대로 적용되는지도 단언한다.

- [ ] **Step 2: 카드와 오버레이 최소 구현**

안내 문구는 다음 함수 한 곳에서 만든다.

```ts
export function programWeightGuide(rx: ExercisePrescription): string {
  return `${rx.repsMin}~${rx.repsMax}회를 안정된 자세로 수행하세요. ` +
    `${rx.repsMax}회 뒤 ${rx.targetRir}회 정도 더 할 수 있는 무게가 적당합니다.`;
}
```

세트 완료 시 휴식 시작은 다음처럼 프로그램 처방을 우선한다.

```ts
const restSeconds = ex.prescription?.restSeconds ?? draft.restSeconds;
startRest(sourceKey, restSeconds);
```

- [ ] **Step 3: 테스트 통과와 커밋**

```powershell
pnpm test -- src/components/record/exercise-card.test.tsx src/components/record/active-session-overlay.test.tsx
git add -- src/components/record/exercise-card.tsx src/components/record/exercise-card.test.tsx src/components/record/active-session-overlay.tsx src/components/record/active-session-overlay.test.tsx src/app/(tabs)/record/page.tsx
git commit -m "feat: 프로그램 반복 범위와 종목별 휴식 안내"
```

---

### Task 5: 첫·마지막 세트 노력 피드백

**Files:**
- Create: `src/components/record/effort-feedback-sheet.tsx`
- Create: `src/components/record/effort-feedback-sheet.test.tsx`
- Modify: `src/app/(tabs)/record/page.tsx`
- Modify: `src/lib/workout.ts`

- [ ] **Step 1: 표시 조건 실패 테스트 작성**

첫 세트 완료 후와 마지막 세트 완료 후에만 시트가 열리고, 중간 세트·일반 운동·이미 응답한 세트에는 열리지 않는지 단언한다. 버튼은 정확히 다음 세 개다.

```text
너무 가벼움
적당함 · 1~2회 여유
너무 무거움 · 자세 무너짐
```

별도 `통증이 있어요` 버튼은 운동 중단 안내를 열고 `too_heavy`로 저장하지 않는다.

- [ ] **Step 2: 시트와 상태 연결**

첫 세트 응답은 오늘의 남은 미완료 세트 무게를 `loadStepKg`만큼 제안한다. 마지막 세트 응답은 DB에 저장되고 다음 회차 `initialProgramLoad()`가 읽을 추천 근거가 된다. 사용자가 시트를 닫으면 무게를 바꾸지 않고 피드백 null을 유지한다.

- [ ] **Step 3: `saveSessionExercises()` 확장**

세트 insert row에 다음만 추가한다.

```ts
effort_feedback: s.effortFeedback,
```

- [ ] **Step 4: 관련 테스트 통과와 커밋**

```powershell
pnpm test -- src/components/record/effort-feedback-sheet.test.tsx src/lib/domain/program-load.test.ts src/lib/workout-draft.test.ts
git add -- src/components/record/effort-feedback-sheet.tsx src/components/record/effort-feedback-sheet.test.tsx src/app/(tabs)/record/page.tsx src/lib/workout.ts
git commit -m "feat: 프로그램 첫 마지막 세트 피드백"
```

---

### Task 6: 개발 서버 흐름·전체 검사·기록

**Files:**
- Modify: `PROGRESS.md`
- Create: `docs/superpowers/HANDOFF-2026-08-12-program-guided-workout.md`

- [ ] **Step 1: 개발 서버에서 실제 조작**

```powershell
pnpm dev
```

| # | 조작 | 확인할 실물 |
|---|---|---|
| 1 | 과거 기록 있는 프로그램 계획 열기 | 최근 성공 무게 자동 입력, 수정 가능 |
| 2 | 기록 없는 종목 열기 | 8~10회·2회 여유 안내, 무게 임의 추측 없음 |
| 3 | 첫 세트 완료 | 피드백 3버튼 정확히 한 번 표시 |
| 4 | `너무 가벼움` | 다음 세트 최소 단위 증량 제안 |
| 5 | 중간 세트 완료 | 피드백 시트 안 뜸 |
| 6 | 마지막 세트 완료 | 피드백 시트 표시, 다음 회차 추천 근거 저장 |
| 7 | 휴식 타이머 | 복합 120/150초, 고립 75초로 종목마다 변경 |
| 8 | 일반 운동 | 기존 전역 휴식과 기록 흐름 정상 |

브라우저를 조작할 수 없으면 배포하지 않고 사용자 확인을 기다린다.

- [ ] **Step 2: 개발 서버 종료 후 전체 검사**

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

- [ ] **Step 3: 기록과 지정 커밋**

PROGRESS와 인수인계서에 실제 건수, 0067 적용 여부, 화면 8개 항목, 운영 미배포, 다음 할 일 `운동 지침 계획 실행`을 기록한다.

```powershell
git add -- PROGRESS.md docs/superpowers/HANDOFF-2026-08-12-program-guided-workout.md
git commit -m "docs: 프로그램 자동 세팅 검증 기록"
```

운영 배포는 별도 사용자 승인을 받는다.
