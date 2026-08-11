# GND Official Program Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `시선이 머무는 어깨` 6주 프로그램을 선택하고 시작 날짜·주 3회 요일·시간을 정하면 충돌 없는 18회 계획이 달력에 원자적으로 등록되고, 놓친 회차의 재배치안을 확인 후 반영할 수 있게 한다.

**Architecture:** 공식 프로그램 본문은 버전이 있는 TypeScript 정적 카탈로그로 관리하고, 사용자 등록 상태만 Supabase에 저장한다. 등록 순간 18회 처방을 기존 `workout_plans.exercises`에 스냅샷으로 넣어 템플릿 수정이 과거 등록에 영향을 주지 않게 한다. 일정 계산은 순수 함수로, 18회 등록과 여러 회차 재배치는 보안 RPC 한 트랜잭션으로 처리한다.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, Supabase/PostgreSQL, Vitest, Testing Library

---

## 실행 전 조건

- 설계 원문: `docs/superpowers/specs/2026-08-12-official-workout-programs-design.md`
- 현재 checkout에 사용자 미추적 파일이 많으므로 실행 시 `using-git-worktrees`로 격리한다.
- DB 변경은 고위험 작업이다. SQL은 작성·정적 검토까지만 하고, 사용자가 Supabase SQL Editor에서 직접 Run하기 전에는 실 DB 검사를 실행하지 않는다.
- 이 계획은 운동 중 무게 보정과 자세 안내를 구현하지 않는다. 처방 스냅샷을 보존하는 타입까지만 넣고, 실제 사용은 후속 계획이 담당한다.

## 파일 구조

**생성**

- `src/lib/domain/official-programs.ts` — 버전 있는 공식 프로그램 카탈로그와 카탈로그 종목명 해석
- `src/lib/domain/official-programs.test.ts` — 18회·세트·반복·휴식·종목명 계약
- `src/lib/domain/program-schedule.ts` — 주 3회 일정 생성, 충돌 대체안, 결석 재배치안
- `src/lib/domain/program-schedule.test.ts` — 날짜 경계·회복 간격·충돌·재배치 테스트
- `src/lib/programs.ts` — enrollment 조회와 등록·재배치 RPC I/O
- `src/components/programs/program-catalog.tsx` — 프로그램 카드와 상세
- `src/components/programs/program-catalog.test.tsx` — 카피·18회·CTA 렌더
- `src/components/programs/program-schedule-setup.tsx` — 시작일·요일·시간 입력과 미리보기
- `src/components/programs/program-schedule-setup.test.tsx` — 연속 요일·충돌·확정 동작
- `src/app/(tabs)/record/programs/page.tsx` — 인증 상태와 프로그램 흐름 연결
- `supabase/migrations/0066_official_program_enrollments.sql` — enrollment·계획 메타데이터·등록/재배치 RPC
- `scripts/program-enrollment-test.mjs` — A/B 계정 RLS·원자성·재배치 실 DB 검사

**수정**

- `src/lib/domain/workout-plan.ts` — 선택적 `prescription` 파싱·직렬화
- `src/lib/domain/workout-plan.test.ts` — 구버전 호환과 처방 검증
- `src/lib/workout-plan.ts` — 프로그램 계획 메타데이터 복원
- `src/components/record/exercise-picker.tsx` — `GND 추천 프로그램` 허브 진입
- `src/components/record/exercise-picker.test.tsx` — 프로그램 진입 카드와 기존 허브 회귀
- `src/app/(tabs)/record/page.tsx` — 프로그램 페이지 이동 콜백
- `src/components/record/calendar-view.tsx` — 프로그램명·주차·회차 표시, 프로그램 계획의 개별 교체 차단
- `src/components/record/calendar-view.test.tsx` — 프로그램 라벨과 재배치 진입
- `scripts/workout-plan-test.mjs` — 0066 컬럼을 포함한 기존 계획 회귀
- `PROGRESS.md` — 실제 검증 수치와 DB/배포 상태

---

### Task 1: 공식 프로그램 카탈로그를 TDD로 고정

**Files:**
- Create: `src/lib/domain/official-programs.test.ts`
- Create: `src/lib/domain/official-programs.ts`
- Modify: `src/lib/domain/workout-plan.ts`

- [ ] **Step 1: 카탈로그 계약 실패 테스트 작성**

다음 핵심 단언을 먼저 작성한다.

```ts
import { describe, expect, it } from "vitest";
import { OFFICIAL_PROGRAMS, resolveProgram } from "./official-programs";

describe("shoulder-frame-6w v1", () => {
  const program = OFFICIAL_PROGRAMS[0];

  it("확정 카피와 6주 18회 구조를 가진다", () => {
    expect(program.key).toBe("shoulder-frame-6w");
    expect(program.version).toBe(1);
    expect(program.eyebrow).toBe("시선이 머무는 어깨");
    expect(program.title).toBe("상체의 틀을 넓히는 6주");
    expect(program.weeks).toBe(6);
    expect(program.sessionsPerWeek).toBe(3);
    expect(program.sessions).toHaveLength(3);
  });

  it("모든 처방은 반복 범위·여유·휴식·증량 단위를 가진다", () => {
    for (const session of program.sessions) {
      for (const exercise of session.exercises) {
        expect(exercise.repsMin).toBeLessThanOrEqual(exercise.repsMax);
        expect([1, 2, 3]).toContain(exercise.targetRir);
        expect(exercise.restSeconds).toBeGreaterThanOrEqual(60);
        expect([1, 2.5, 5]).toContain(exercise.loadStepKg);
      }
    }
  });

  it("DB 카탈로그에 없는 종목이 하나라도 있으면 등록 자료를 만들지 않는다", () => {
    expect(() => resolveProgram(program, [])).toThrow("program_exercise_missing");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```powershell
pnpm test -- src/lib/domain/official-programs.test.ts
```

예상: `./official-programs` 모듈 없음으로 FAIL.

- [ ] **Step 3: 최소 카탈로그 타입과 v1 본문 구현**

먼저 `src/lib/domain/workout-plan.ts`에 프로그램과 계획이 함께 쓸 처방 타입만 추가한다.

```ts
export type ExercisePrescription = {
  repsMin: number;
  repsMax: number;
  targetRir: 1 | 2 | 3;
  restSeconds: number;
  loadStepKg: 1 | 2.5 | 5;
};
```

그 타입을 `official-programs.ts`에서 import하고 프로그램 운동은 다음 타입을 사용한다.

```ts
export type ProgramExerciseTemplate = ExercisePrescription & {
  exerciseName: string;
  beginnerSets: number;
  experiencedSets: number;
};

export type OfficialProgram = {
  key: "shoulder-frame-6w";
  version: 1;
  eyebrow: string;
  title: string;
  description: string;
  weeks: 6;
  sessionsPerWeek: 3;
  sessions: readonly {
    key: "A" | "B" | "C";
    title: string;
    exercises: readonly ProgramExerciseTemplate[];
  }[];
};
```

종목과 수치는 설계 §8의 A/B/C 표를 그대로 입력한다. `resolveProgram()`은 이름으로 `CatalogExercise`를 찾아 body part와 type을 결합하고, 누락 종목명을 포함한 `program_exercise_missing:<name>` 오류를 던진다.

- [ ] **Step 4: 카탈로그 테스트 통과 확인**

```powershell
pnpm test -- src/lib/domain/official-programs.test.ts
```

예상: 3건 이상 PASS.

- [ ] **Step 5: 카탈로그 단위 커밋**

```powershell
git add -- src/lib/domain/official-programs.ts src/lib/domain/official-programs.test.ts src/lib/domain/workout-plan.ts
git commit -m "feat: 첫 GND 공식 6주 프로그램 정의"
```

---

### Task 2: 계획 스냅샷에 처방을 보존

**Files:**
- Modify: `src/lib/domain/workout-plan.ts`
- Modify: `src/lib/domain/workout-plan.test.ts`

- [ ] **Step 1: 처방 호환 실패 테스트 작성**

```ts
it("프로그램 처방을 파싱하고 다시 draft로 보존한다", () => {
  const prescription = {
    repsMin: 8,
    repsMax: 12,
    targetRir: 2 as const,
    restSeconds: 120,
    loadStepKg: 2.5 as const,
  };
  const parsed = parsePlanExercises([{ ...plan[0], prescription }]);
  expect(parsed[0].prescription).toEqual(prescription);
  expect(toDraftExercises(parsed, () => "key")[0].prescription).toEqual(prescription);
});

it("처방이 없는 기존 계획은 그대로 유효하다", () => {
  expect(parsePlanExercises(plan)).toEqual(plan);
});

it("역전 반복 범위와 60초 미만 휴식은 거부한다", () => {
  expect(parsePlanExercises([{ ...plan[0], prescription: {
    repsMin: 12, repsMax: 8, targetRir: 2, restSeconds: 30, loadStepKg: 2.5,
  } }])).toEqual([]);
});
```

- [ ] **Step 2: 신규 테스트 실패 확인**

```powershell
pnpm test -- src/lib/domain/workout-plan.test.ts
```

예상: `prescription`이 파서에서 제거되어 신규 테스트 FAIL.

- [ ] **Step 3: 선택적 처방 타입·검증 구현**

Task 1에서 추가한 `ExercisePrescription`을 다음처럼 `PlanExercise`에 연결한다.

```ts
export type PlanExercise = {
  name: string;
  bodyPart: BodyPart;
  exerciseType: ExerciseType;
  measure: "reps" | "time" | null;
  isCustom: boolean;
  sets: PlanSet[];
  prescription?: ExercisePrescription;
};
```

`parsePlanExercises()`는 처방이 없으면 기존처럼 통과시키고, 있으면 정수 반복 범위 1~100, `repsMin <= repsMax`, RIR 1~3, 휴식 60~300초, 증량 단위 1/2.5/5만 복원한다. `toPlanExercises()`와 `toDraftExercises()`도 값을 보존한다.

- [ ] **Step 4: 관련 테스트 통과**

```powershell
pnpm test -- src/lib/domain/workout-plan.test.ts src/lib/domain/official-programs.test.ts
```

예상: 전체 PASS.

- [ ] **Step 5: 처방 타입 커밋**

```powershell
git add -- src/lib/domain/workout-plan.ts src/lib/domain/workout-plan.test.ts
git commit -m "feat: 운동 계획에 프로그램 처방 보존"
```

---

### Task 3: 18회 일정 계산과 충돌 제안 TDD

**Files:**
- Create: `src/lib/domain/program-schedule.test.ts`
- Create: `src/lib/domain/program-schedule.ts`

- [ ] **Step 1: 일정 불변식 테스트 작성**

```ts
describe("buildProgramSchedule", () => {
  it("시작일 이후 선택 요일 3개에 6주 18회를 순서대로 만든다", () => {
    const out = buildProgramSchedule({
      startDate: "2026-08-17",
      slots: [
        { weekday: 1, time: "19:00" },
        { weekday: 3, time: "19:00" },
        { weekday: 5, time: "18:00" },
      ],
      timeZone: "Asia/Seoul",
      occupiedDates: new Set(),
    });
    expect(out.plans).toHaveLength(18);
    expect(out.plans[0]).toMatchObject({ date: "2026-08-17", week: 1, session: 1 });
    expect(out.conflicts).toEqual([]);
  });

  it("연속 요일은 회복 간격 오류로 거부한다", () => {
    expect(() => buildProgramSchedule({
      startDate: "2026-08-17",
      slots: [
        { weekday: 1, time: "19:00" },
        { weekday: 2, time: "19:00" },
        { weekday: 5, time: "19:00" },
      ],
      timeZone: "Asia/Seoul",
      occupiedDates: new Set(),
    })).toThrow("program_recovery_gap");
  });

  it("기존 계획 날짜는 덮지 않고 대체 날짜를 제안한다", () => {
    const out = buildProgramSchedule({
      startDate: "2026-08-17",
      slots: [
        { weekday: 1, time: "19:00" },
        { weekday: 3, time: "19:00" },
        { weekday: 5, time: "18:00" },
      ],
      timeZone: "Asia/Seoul",
      occupiedDates: new Set(["2026-08-19"]),
    });
    expect(out.conflicts[0].date).toBe("2026-08-19");
    expect(out.conflicts[0].suggestedDate).not.toBe("2026-08-19");
  });
});
```

`buildMissedSessionProposal()`에는 완료된 회차를 움직이지 않음, 남은 순서 유지, 오늘 이전 날짜 금지, 기존 계획 보존을 단언한다.

- [ ] **Step 2: 모듈 없음 실패 확인**

```powershell
pnpm test -- src/lib/domain/program-schedule.test.ts
```

- [ ] **Step 3: UTC 날짜 연산 기반 순수 함수 구현**

렌더 중 현재 시각을 읽지 않는다. `todayKey`와 `occupiedDates`는 호출자가 전달한다.

```ts
export type PreferredSlot = { weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; time: string };
export type ProgramScheduleItem = {
  date: string;
  scheduledAt: string;
  week: number;
  session: 1 | 2 | 3;
  templateKey: "A" | "B" | "C";
};

export function buildProgramSchedule(input: {
  startDate: string;
  slots: readonly PreferredSlot[];
  timeZone: string;
  occupiedDates: ReadonlySet<string>;
}): { plans: ProgramScheduleItem[]; conflicts: ScheduleConflict[] };
```

시간대 변환은 `Intl.DateTimeFormat`을 흉내 내지 말고 프로젝트의 날짜 유틸 패턴을 따라 별도 `localDateTimeToIso()`에서 처리한다. `Asia/Seoul` 고정값을 결과에 박지 않는다.

- [ ] **Step 4: 경계 테스트 통과 확인**

```powershell
pnpm test -- src/lib/domain/program-schedule.test.ts
```

- [ ] **Step 5: 일정 계산 커밋**

```powershell
git add -- src/lib/domain/program-schedule.ts src/lib/domain/program-schedule.test.ts
git commit -m "feat: 6주 프로그램 일정과 재배치안 계산"
```

---

### Task 4: enrollment 스키마와 원자적 RPC 작성

**Files:**
- Create: `supabase/migrations/0066_official_program_enrollments.sql`
- Create: `scripts/program-enrollment-test.mjs`
- Modify: `scripts/workout-plan-test.mjs`

- [ ] **Step 1: 실 DB 검사 스크립트를 먼저 작성**

기존 `_safe-delete.mjs` 보호와 `workout-plan-test.mjs`의 계정 생성·정리 방식을 재사용한다. 최소 단언은 다음과 같다.

```js
check("A는 18회 프로그램을 원자적으로 등록", created.status === 200 && plans.length === 18);
check("B에게 A enrollment가 보이지 않음", bRows.status === 200 && bRows.json.length === 0);
check("기존 계획 충돌이면 enrollment와 계획이 0개 생성", conflict.status >= 400 && afterCount === beforeCount);
check("같은 프로그램 active 중복 등록 거부", duplicate.status >= 400);
check("재배치는 완료 회차를 건드리지 않고 남은 날짜만 변경", movedCompleted === false && movedFuture === true);
```

- [ ] **Step 2: 0066 SQL 작성**

테이블과 컬럼의 핵심 골격은 다음과 같다.

```sql
create table public.program_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  program_key text not null check (char_length(program_key) between 1 and 60),
  program_version int not null check (program_version >= 1),
  title_snapshot text not null check (char_length(title_snapshot) between 1 and 80),
  level_at_start text not null check (level_at_start in ('beginner','experienced')),
  start_date date not null,
  timezone text not null check (char_length(timezone) between 1 and 60),
  preferred_slots jsonb not null check (jsonb_typeof(preferred_slots) = 'array' and jsonb_array_length(preferred_slots) = 3),
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index program_enrollments_one_active_version
  on public.program_enrollments(user_id, program_key, program_version)
  where status = 'active';

alter table public.workout_plans
  add column title text check (title is null or char_length(title) <= 80),
  add column scheduled_at timestamptz,
  add column program_enrollment_id uuid references public.program_enrollments(id) on delete set null,
  add column program_week smallint check (program_week between 1 and 6),
  add column program_session smallint check (program_session between 1 and 3),
  add column program_template_version int check (program_template_version >= 1);

create unique index workout_plans_program_slot
  on public.workout_plans(program_enrollment_id, program_week, program_session)
  where program_enrollment_id is not null;
```

RLS는 본인 전용 4정책으로 만들고,
`create_program_enrollment(p_program_key text, p_program_version int,
p_title_snapshot text, p_level_at_start text, p_start_date date,
p_timezone text, p_preferred_slots jsonb, p_plans jsonb)` RPC는 다음을 모두
검증한 뒤 한 트랜잭션에서 enrollment 1행과 plan 18행을 넣는다.

- 인증 사용자
- 계획 배열 정확히 18개
- 날짜 18개가 서로 다르고 오늘 이후
- week 1~6 × session 1~3 조합이 각각 한 번
- 대상 날짜에 기존 `workout_plans` 없음
- 각 `exercises`가 배열 1~50개, 200KB 이하

충돌 시 `program_plan_date_taken:<date>`를 던져 전체 함수가 롤백되게 한다. `reschedule_program_plans(p_enrollment_id, p_moves jsonb)`도 소유권·오늘 이후·날짜 중복·타 enrollment 충돌을 먼저 검사한 뒤 모든 행을 업데이트한다. 함수 execute 권한은 authenticated에만 준다.

- [ ] **Step 3: SQL 정적 검토**

```powershell
rg -n "program_enrollments|create_program_enrollment|reschedule_program_plans|enable row level security|revoke all" supabase/migrations/0066_official_program_enrollments.sql
git diff --check
```

예상: 테이블, RLS, 두 RPC, 권한 회수가 모두 검색되고 whitespace 오류 0.

- [ ] **Step 4: 사용자 SQL 적용 게이트**

여기서 사용자에게 `0066_official_program_enrollments.sql` 전체를 SQL Editor에서 한 번 Run해 달라고 요청하고 결과를 기다린다. 승인과 적용 확인 전에는 다음 실 DB 명령을 실행하지 않는다.

- [ ] **Step 5: 적용 후 실 DB 검사**

```powershell
node scripts/program-enrollment-test.mjs
node scripts/workout-plan-test.mjs
```

예상: 신규 단언 전부 PASS, 기존 계획 회귀 실패 0. 실제 건수를 기록한다.

- [ ] **Step 6: DB 단위 커밋**

```powershell
git add -- supabase/migrations/0066_official_program_enrollments.sql scripts/program-enrollment-test.mjs scripts/workout-plan-test.mjs
git commit -m "feat: 공식 프로그램 등록과 재배치 스키마"
```

---

### Task 5: 프로그램 I/O와 계획 메타데이터 복원

**Files:**
- Create: `src/lib/programs.ts`
- Modify: `src/lib/workout-plan.ts`

- [ ] **Step 1: 공개 타입과 RPC 래퍼 구현**

```ts
export type ProgramEnrollment = {
  id: string;
  programKey: string;
  programVersion: number;
  title: string;
  levelAtStart: "beginner" | "experienced";
  startDate: string;
  timeZone: string;
  preferredSlots: PreferredSlot[];
  status: "active" | "completed" | "cancelled";
};

export async function createProgramEnrollment(input: CreateProgramEnrollmentInput): Promise<string>;
export async function getActiveProgramEnrollments(userId: string): Promise<ProgramEnrollment[]>;
export async function rescheduleProgramPlans(input: { enrollmentId: string; moves: ProgramPlanMove[] }): Promise<void>;
```

Supabase 오류 객체는 `String(error)`로 뭉개지 말고 기존 `errorText()`가 해석할 수 있게 그대로 던진다.

- [ ] **Step 2: `WorkoutPlan` 메타데이터 추가**

`WorkoutPlanRow`과 `fromRow()`에 `title`, `scheduled_at`, enrollment ID, week, session, template version을 선택적으로 복원한다. 0066 적용 전에도 undefined 필드는 null로 처리해 기존 계획 조회가 깨지지 않게 한다.

- [ ] **Step 3: 타입 검사**

```powershell
pnpm typecheck
```

예상: 오류 0.

- [ ] **Step 4: I/O 커밋**

```powershell
git add -- src/lib/programs.ts src/lib/workout-plan.ts
git commit -m "feat: 공식 프로그램 등록 I/O 연결"
```

---

### Task 6: 프로그램 선택·일정 설정 UI

**Files:**
- Create: `src/components/programs/program-catalog.tsx`
- Create: `src/components/programs/program-catalog.test.tsx`
- Create: `src/components/programs/program-schedule-setup.tsx`
- Create: `src/components/programs/program-schedule-setup.test.tsx`
- Create: `src/app/(tabs)/record/programs/page.tsx`
- Modify: `src/components/record/exercise-picker.tsx`
- Modify: `src/components/record/exercise-picker.test.tsx`
- Modify: `src/app/(tabs)/record/page.tsx`

- [ ] **Step 1: 프로그램 카드 실패 테스트 작성**

```tsx
it("확정 카피와 6주 정보를 보여준다", () => {
  render(<ProgramCatalog onPick={vi.fn()} />);
  expect(screen.getByText("시선이 머무는 어깨")).toBeVisible();
  expect(screen.getByText("상체의 틀을 넓히는 6주")).toBeVisible();
  expect(screen.getByText(/주 3회/)).toBeVisible();
  expect(screen.getByRole("button", { name: "존재감 만들기" })).toBeEnabled();
});
```

일정 테스트에는 시작일 → 요일 3개 → 시간 3개 → 18회 미리보기, 연속 요일 오류, 충돌 날짜의 `기존 계획 유지` 문구, 저장 중 이중 클릭 방지를 넣는다.

- [ ] **Step 2: 실패 확인**

```powershell
pnpm test -- src/components/programs/program-catalog.test.tsx src/components/programs/program-schedule-setup.test.tsx
```

- [ ] **Step 3: 카탈로그와 설정 화면 구현**

페이지 상태는 다음 네 단계만 둔다.

```ts
type ProgramStep = "catalog" | "detail" | "schedule" | "preview";
```

`preview` 단계에서만 `createProgramEnrollment()`를 호출한다. `catalog`와 `detail`은 DB를 쓰지 않는다. 기존 계획은 `getWorkoutPlans(userId)`로 읽어 `occupiedDates`에 넘긴다.

- [ ] **Step 4: 운동 추가 허브에서 프로그램 페이지 연결**

`ExercisePicker`에 `onOpenPrograms?: () => void`를 추가하고 허브의 첫 카드로 다음을 표시한다.

```tsx
<HubCard
  primary
  iconSrc="/ui-icons/hub-situation.webp"
  title="GND 추천 프로그램"
  sub="요일과 시간만 고르면 6주 운동을 달력에 담아요"
  onClick={onOpenPrograms}
/>
```

기존 `상황별 추천`은 두 번째 카드로 남기며 동작을 바꾸지 않는다. `record/page.tsx`는 `useRouter().push("/record/programs")`를 전달한다.

- [ ] **Step 5: UI 테스트 통과**

```powershell
pnpm test -- src/components/programs/program-catalog.test.tsx src/components/programs/program-schedule-setup.test.tsx src/components/record/exercise-picker.test.tsx
```

- [ ] **Step 6: 프로그램 UI 커밋**

```powershell
git add -- src/components/programs src/app/(tabs)/record/programs/page.tsx src/components/record/exercise-picker.tsx src/components/record/exercise-picker.test.tsx src/app/(tabs)/record/page.tsx
git commit -m "feat: 공식 프로그램 선택과 18회 일정 설정"
```

---

### Task 7: 달력 진행 표시와 결석 재배치 진입

**Files:**
- Modify: `src/components/record/calendar-view.tsx`
- Modify: `src/components/record/calendar-view.test.tsx`

- [ ] **Step 1: 프로그램 계획 표시 실패 테스트 작성**

```tsx
it("프로그램 계획에 프로그램명과 2주차 1회차를 표시한다", async () => {
  const plan = {
    id: "22222222-2222-4222-8222-222222222222",
    userId: "user-1",
    planDate: "2026-08-24",
    sourceSessionId: null,
    exercises: [{
      name: "숄더프레스",
      bodyPart: "어깨",
      exerciseType: "weight",
      measure: null,
      isCustom: false,
      sets: [{ weightKg: 0, reps: 8, distanceKm: 0, durationMin: 0 }],
    }],
    tabataMinutes: null,
    scheduledAt: "2026-08-24T10:00:00.000Z",
    title: "상체의 틀을 넓히는 6주",
    programEnrollmentId: "11111111-1111-4111-8111-111111111111",
    programWeek: 2,
    programSession: 1,
    programTemplateVersion: 1,
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
  };
  mocks.getWorkoutPlans.mockResolvedValue([plan]);
  await setup();
  fireEvent.click(screen.getByRole("button", { name: /8월 24일/ }));
  expect(screen.getByText("상체의 틀을 넓히는 6주")).toBeVisible();
  expect(screen.getByText("2주차 · 1회차")).toBeVisible();
});

it("프로그램 계획은 개별 교체 대신 전체 재배치를 연다", () => {
  // 기존 '날짜 이동' 대신 '남은 일정 다시 잡기'를 단언
});
```

- [ ] **Step 2: 실패 확인 후 최소 UI 구현**

일반 계획은 기존 이동·삭제를 유지한다. 프로그램 계획은 `남은 일정 다시 잡기`로 재배치 미리보기를 열고, 사용자 확인 뒤 `rescheduleProgramPlans()`를 한 번 호출한다. 완료된 과거 세션은 moves에 포함하지 않는다.

- [ ] **Step 3: 달력 테스트 통과**

```powershell
pnpm test -- src/components/record/calendar-view.test.tsx
```

- [ ] **Step 4: 달력 커밋**

```powershell
git add -- src/components/record/calendar-view.tsx src/components/record/calendar-view.test.tsx
git commit -m "feat: 프로그램 주차 표시와 남은 일정 재배치"
```

---

### Task 8: 개발 서버 직접 조작·전체 검사·기록

**Files:**
- Modify: `PROGRESS.md`
- Create: `docs/superpowers/HANDOFF-2026-08-12-official-program-scheduling.md`

- [ ] **Step 1: 개발 서버 실행**

```powershell
pnpm dev
```

브라우저 조작 수단이 없으면 여기서 중단하고 아래 표를 사용자에게 전달해 결과를 기다린다.

- [ ] **Step 2: 실제 화면 흐름 확인**

| # | 조작 | 확인할 실물 |
|---|---|---|
| 1 | `/record` → 운동 추가 | `GND 추천 프로그램` 카드가 첫 번째, 기존 카드 모두 남음 |
| 2 | 프로그램 카드 선택 | 확정 카피, 6주·18회, 전신+어깨 설명 |
| 3 | 시작일·월/수/금·시간 입력 | 18회 미리보기, 날짜와 시각 정확 |
| 4 | 기존 계획 날짜를 포함 | 기존 계획 유지 문구와 대체안 표시 |
| 5 | 달력에 담기 | 예정표가 정확히 18개 생성, 중복 0 |
| 6 | 달력 프로그램 날짜 선택 | 프로그램명·주차·회차 표시 |
| 7 | 남은 일정 다시 잡기 | 확인 전 DB 변화 없음, 확인 후 남은 회차만 이동 |
| 8 | 일반 계획 선택 | 기존 이동·삭제·운동 준비하기 정상 |

- [ ] **Step 3: 개발 서버 종료 후 전체 검사 한 번 실행**

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

예상: lint/typecheck 오류 0, Vitest 실패 0, build 성공, diff-check 출력 0줄.

- [ ] **Step 4: PROGRESS와 인수인계서 한 번 갱신**

실제 테스트 건수, 0066 적용 여부, program-enrollment 실 DB 건수, 개발 서버 8개 항목, 운영 배포 안 함, 다음 할 일 `운동 중 자동 세팅 계획 실행`을 기록한다.

- [ ] **Step 5: 지정 파일만 커밋**

```powershell
git add -- PROGRESS.md docs/superpowers/HANDOFF-2026-08-12-official-program-scheduling.md
git commit -m "docs: 공식 프로그램 일정 등록 검증 기록"
```

운영 배포는 사용자 승인 전 실행하지 않는다.

---

## 요구사항 대응표

| 요구사항 | Task |
|---|---|
| GND 공식 프로그램 | 1, 6 |
| 6주·주 3회·18회 | 1, 3 |
| 시작일·요일·시간 | 3, 6 |
| 기존 계획 비파괴 | 3, 4, 6 |
| 원자적 일괄 등록 | 4, 5 |
| 결석 재배치 확인 | 3, 4, 7 |
| 프로그램 스냅샷 | 2, 4 |
| 달력 주차·회차 | 5, 7 |
| 개발 서버 직접 확인 | 8 |
