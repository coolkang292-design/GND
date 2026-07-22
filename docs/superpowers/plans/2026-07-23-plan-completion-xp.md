# 계획 완료 보너스(+20 XP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 예정표(계획)로 시작한 운동을 계획대로 완료하면 운동 XP에 **계획 완료 +20**을 실제로 지급한다.

**Architecture:** ①`workout_sessions`에 `scheduled_plan_id`를 저장해 "이 세션이 어느 예정표를 수행했는가"를 DB가 알게 한다 ②SQL 판정 함수 `is_plan_completed`가 완료 세션의 운동·완료 세트를 예정표 `exercises`와 비교 ③`complete_workout_v2`가 그 결과로 `v_plan`을 0 또는 20으로 계산. 판정·지급은 기존 완료 트랜잭션 안에서 원자적으로 일어난다.

**Tech Stack:** Next.js 16, React 19, Supabase(Postgres RLS + plpgsql), TypeScript, vitest, pnpm.

**선행 의존성:** `docs/superpowers/plans/2026-07-23-xp-level-character-system.md`(0022 XP 시스템)가 **먼저 구현·배포돼 있어야 한다.** 이 계획은 그 위에 얹는 후속이다. 이 계획의 마이그레이션은 **0023**(0022가 이미 적용된 전제 — 0022 파일은 수정하지 않고 새 마이그레이션으로 분리).

**배경(왜 별도인가):** 현재 예정표([workout_plans](../../../supabase/migrations/0015_workout_plans.sql))는 있으나 `workout_sessions`에 "어느 예정표를 수행했는지" 가리키는 컬럼이 없다. 예정표 시작 연결(`draft.scheduledPlanId`)은 클라 화면에만 있고 DB에 안 남으므로, 서버 완료 시점에 계획 여부를 알 수 없어 0022는 `v_plan := 0`으로 둔다. 이 계획이 그 연결과 판정을 추가한다.

---

## 판정 규칙 (확정)

예정표의 **모든 운동**에 대해, 완료 세션에 **같은 이름의 운동**이 있고 그 운동의 **완료 세트 수 ≥ 예정표에 계획된 세트 수**이면 "계획 완료"다. 하나라도 미달이면 0. (설계 §5의 "계획 필수 운동·세트 모두 수행"을 세트 수 기준으로 단순화한 MVP. 유산소 최소 시간 판정은 후속 개선으로 남긴다.)

- 예정표에서 시작하지 않은 즉흥 운동(`scheduled_plan_id`가 null) → 계획 보너스 0.
- 타바타 → 계획 보너스 대상 아님(0022 규칙 유지).
- 스푸핑 방지: 판정 시 `workout_plans`를 `user_id = 세션 소유자`로 함께 필터 → 타인 예정표 id를 넣어도 매칭되지 않는다.

`PlanExercise` 구조(참조): `{ name, bodyPart, exerciseType, measure, sets[] }` — 판정에 쓰는 값은 `name`과 `sets` 길이(계획 세트 수).

---

## 파일 구조

- Create `supabase/migrations/0023_plan_completion_xp.sql` — `scheduled_plan_id` 컬럼 + `is_plan_completed` + `complete_workout_v2` 재정의
- Create `src/lib/domain/plan-completion.ts` — 순수 판정 함수(미러) + 테스트
- Create `src/lib/domain/plan-completion.test.ts`
- Modify `src/lib/workout.ts` — `createDraftSession`에 `scheduledPlanId` 저장
- Modify `src/app/(tabs)/record/page.tsx` — 세션 생성 시 `scheduledPlanId` 전달
- Modify `scripts/xp-test.mjs` — 계획 완료 시나리오 추가
- Modify `src/components/profile/xp-guide-sheet.tsx` — "계획 완료"를 "준비 중" → "획득 가능"으로 이동

---

### Task 1: 0023 마이그레이션 — 컬럼 + 판정 함수 + RPC 재정의

**Files:**
- Create: `supabase/migrations/0023_plan_completion_xp.sql`

- [ ] **Step 1: 컬럼 + 판정 함수 작성**

```sql
-- 0023: 계획 완료 보너스(+20 XP)
-- 설계: docs/superpowers/plans/2026-07-23-plan-completion-xp.md
-- 선행: 0022 적용됨. 적용: SQL Editor에 전체 붙여넣기 → Run (1회만)

-- ── 세션 → 예정표 연결 컬럼 ──────────────────────────────────
alter table public.workout_sessions
  add column if not exists scheduled_plan_id uuid
  references public.workout_plans (id) on delete set null;

-- 클라(createDraftSession)가 draft insert 시 자신의 예정표 id를 넣는다.
-- 소유권은 판정 함수에서 user_id 필터로 재검증한다(스푸핑 무력화).

-- ── 계획 완료 판정 (내부 전용) ───────────────────────────────
create or replace function public.is_plan_completed(p_session_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_plan_id uuid; v_user uuid; v_exercises jsonb; v_unmet int;
begin
  select scheduled_plan_id, user_id into v_plan_id, v_user
  from workout_sessions where id = p_session_id;
  if v_plan_id is null then return false; end if;

  -- 소유자 필터 겸 예정표 조회(타인 예정표 스푸핑 차단)
  select exercises into v_exercises from workout_plans
  where id = v_plan_id and user_id = v_user;
  if v_exercises is null or jsonb_array_length(v_exercises) = 0 then
    return false;
  end if;

  -- 계획 운동 중 "완료 세트 수 < 계획 세트 수"인 게 하나라도 있으면 미달
  select count(*) into v_unmet
  from jsonb_array_elements(v_exercises) pe
  where coalesce((
    select count(*) from workout_sets ws
    join workout_exercises we on we.id = ws.workout_exercise_id
    where we.session_id = p_session_id
      and we.exercise_name = pe->>'name'
      and ws.is_completed
  ), 0) < coalesce(jsonb_array_length(pe->'sets'), 0);

  return v_unmet = 0;
end $$;

revoke all on function public.is_plan_completed(uuid) from public, anon, authenticated;
```

- [ ] **Step 2: complete_workout_v2 재정의 (계획 보너스 반영)**

0022 Task 5 Step 3의 `complete_workout_v2` **본문을 그대로** 다시 `create or replace`로 붙이되, 계획 보너스 한 줄만 교체한다. 나머지 라인은 0022와 완전히 동일해야 한다.

기존(0022):
```sql
    if not v_tabata then
      v_plan := 0; -- 계획-실행 필수판정 스키마 없음 → 0 (설계 §5)
      v_rec := case when exists (
```

변경(0023):
```sql
    if not v_tabata then
      v_plan := case when public.is_plan_completed(p_session_id) then 20 else 0 end;
      v_rec := case when exists (
```

> ⚠️ `complete_workout_v2`는 함수 전체를 `create or replace`로 재정의해야 한다(부분 패치 불가). 0022의 Step 3 SQL 전문을 복사해 위 한 줄만 바꾼 뒤 이 마이그레이션에 포함한다. `apply_xp_and_progress`·`is_valid_workout`·권한 부여 라인은 0022 것을 그대로 재사용(재정의 불필요).

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0023_plan_completion_xp.sql
git commit -m "feat: 0023 계획 완료 보너스 — scheduled_plan_id + is_plan_completed + v2 재정의"
```

---

### Task 2: 순수 판정 함수(미러) + 테스트

DB `is_plan_completed`와 동일 규칙의 TS 순수 함수. 클라에서 "이번 운동이 계획 완료로 인정될지" 미리 표시하거나 테스트로 규칙을 고정하는 데 쓴다(0022의 DB↔TS 미러 원칙과 동일).

**Files:**
- Create: `src/lib/domain/plan-completion.ts`
- Test: `src/lib/domain/plan-completion.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, expect, it } from "vitest";
import { isPlanFulfilled, type PlanReq, type SessionDone } from "./plan-completion";

const plan: PlanReq[] = [
  { name: "벤치프레스", plannedSets: 3 },
  { name: "스쿼트", plannedSets: 2 },
];

describe("isPlanFulfilled", () => {
  it("모든 계획 운동의 완료 세트 수가 충족 → true", () => {
    const done: SessionDone[] = [
      { name: "벤치프레스", completedSets: 3 },
      { name: "스쿼트", completedSets: 2 },
    ];
    expect(isPlanFulfilled(plan, done)).toBe(true);
  });
  it("한 운동의 완료 세트가 모자라면 → false", () => {
    const done: SessionDone[] = [
      { name: "벤치프레스", completedSets: 3 },
      { name: "스쿼트", completedSets: 1 },
    ];
    expect(isPlanFulfilled(plan, done)).toBe(false);
  });
  it("계획 운동이 아예 빠지면 → false", () => {
    expect(isPlanFulfilled(plan, [{ name: "벤치프레스", completedSets: 3 }])).toBe(false);
  });
  it("계획보다 더 했으면(초과) → true", () => {
    const done: SessionDone[] = [
      { name: "벤치프레스", completedSets: 5 },
      { name: "스쿼트", completedSets: 2 },
    ];
    expect(isPlanFulfilled(plan, done)).toBe(true);
  });
  it("빈 계획 → false(계획 없음은 보너스 대상 아님)", () => {
    expect(isPlanFulfilled([], [{ name: "벤치프레스", completedSets: 3 }])).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm test src/lib/domain/plan-completion.test.ts` → FAIL

- [ ] **Step 3: 구현**

```ts
/** DB is_plan_completed와 동일 규칙의 미러. 계획 운동별 완료 세트 수로 판정. */
export interface PlanReq { name: string; plannedSets: number }
export interface SessionDone { name: string; completedSets: number }

export function isPlanFulfilled(plan: PlanReq[], done: SessionDone[]): boolean {
  if (plan.length === 0) return false; // 계획 없음은 보너스 대상 아님
  const doneByName = new Map<string, number>();
  for (const d of done) {
    doneByName.set(d.name, (doneByName.get(d.name) ?? 0) + d.completedSets);
  }
  return plan.every((p) => (doneByName.get(p.name) ?? 0) >= p.plannedSets);
}
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm test src/lib/domain/plan-completion.test.ts` → PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/plan-completion.ts src/lib/domain/plan-completion.test.ts
git commit -m "feat: 계획 완료 판정 순수 함수(미러) + 테스트"
```

---

### Task 3: 예정표 연결을 세션에 저장

**Files:**
- Modify: `src/lib/workout.ts` (`createDraftSession`)
- Modify: `src/app/(tabs)/record/page.tsx` (호출부)

- [ ] **Step 1: createDraftSession에 scheduledPlanId 추가**

```ts
export async function createDraftSession(input: {
  groupId: string | null;
  timezone: string;
  tabataMinutes?: number;
  scheduledPlanId?: string | null; // 예정표로 시작한 경우 연결 저장
}): Promise<WorkoutSession> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({
      group_id: input.groupId,
      timezone: input.timezone,
      ...(input.tabataMinutes ? { tabata_minutes: input.tabataMinutes } : {}),
      ...(input.scheduledPlanId ? { scheduled_plan_id: input.scheduledPlanId } : {}),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: 호출부에서 draft.scheduledPlanId 전달** — `record/page.tsx`에서 일반 운동 시작 시 `createDraftSession(...)`을 호출하는 지점을 찾아 `scheduledPlanId: draft.scheduledPlanId`를 넘긴다(타바타 경로는 전달하지 않음 — 계획 대상 아님).

```ts
// 예: 운동 시작 흐름에서
const session = await createDraftSession({
  groupId,
  timezone,
  scheduledPlanId: draft.scheduledPlanId, // ← 추가
});
```

- [ ] **Step 3: 타입체크·커밋**

Run: `pnpm typecheck` → PASS

```bash
git add src/lib/workout.ts src/app/\(tabs\)/record/page.tsx
git commit -m "feat: 예정표로 시작한 운동에 scheduled_plan_id 저장"
```

---

### Task 4: 실 DB 테스트 — 계획 완료 시나리오

**Files:**
- Modify: `scripts/xp-test.mjs`

- [ ] **Step 1: 시나리오 추가** — 0022 xp-test 헬퍼를 재사용해 아래를 검증:

1. 유저가 예정표 생성(벤치 3세트·스쿼트 2세트) → 그 예정표로 세션 생성(`scheduled_plan_id` 세팅) → 운동/세트를 **계획대로** 완료 → `complete_workout_v2` → `breakdown.planXp = 20`.
2. 같은 구성인데 스쿼트를 **1세트만** 완료 → `planXp = 0`.
3. `scheduled_plan_id` 없이(즉흥) 완료 → `planXp = 0`.
4. **스푸핑**: 타 유저의 예정표 id를 `scheduled_plan_id`에 넣고 완료 → `planXp = 0`(소유자 필터).
5. 인증 유저가 `is_plan_completed`를 직접 RPC 호출 → 권한 실패.
6. 종료 시 픽스처(계정·예정표·세션) 전량 정리(잔여물 0).

- [ ] **Step 2: 실행** (0023 적용 후)

Run: `node scripts/xp-test.mjs`
Expected: 계획 시나리오 포함 전부 ✅

- [ ] **Step 3: 커밋**

```bash
git add scripts/xp-test.mjs
git commit -m "test: 계획 완료 보너스 실 DB 검증(계획대로/미달/즉흥/스푸핑)"
```

---

### Task 5: XP 안내 시트 갱신 — 계획 완료를 "획득 가능"으로

**Files:**
- Modify: `src/components/profile/xp-guide-sheet.tsx`

- [ ] **Step 1: 이동** — 0022에서 "준비 중"에 있던 **계획 완료 +20**을 **"지금 획득 가능"** 섹션으로 옮기고 설명을 붙인다: "예정표로 시작해 계획한 운동·세트를 모두 마치면 +20". (주간 목표 +100은 계속 "준비 중" 유지.)

- [ ] **Step 2: 실기기 확인** — 내 정보 → "XP 획득 방법 보기"에서 계획 완료가 획득 가능으로 표시되는지.

- [ ] **Step 3: 커밋**

```bash
git add src/components/profile/xp-guide-sheet.tsx
git commit -m "feat: XP 안내 시트에서 계획 완료를 획득 가능으로 이동"
```

---

### Task 6: 게이트 + 배포

- [ ] **Step 1: 전체 게이트**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: 전부 통과. 0022 기존 테스트가 깨지지 않아야 한다.

- [ ] **Step 2: 0023 마이그레이션 적용** — Supabase SQL Editor에 `0023_plan_completion_xp.sql` 전체 붙여넣기 → Run(1회). `scripts/xp-test.mjs` 재확인.

- [ ] **Step 3: 실기기 검수** — 예정표 만들기 → 그 예정표로 운동 → 계획대로 완료 → 완료 모달/내역에 계획 완료 +20이 포함되는지. **사용자 실기기 확인 후** 배포.

- [ ] **Step 4: 배포** — main 반영 → Vercel 배포 → 200 확인.

- [ ] **Step 5: PROGRESS.md 갱신**

---

## Self-Review 체크리스트

- [ ] 판정 규칙(계획 운동별 완료 세트 ≥ 계획 세트) → Task 1 SQL / Task 2 미러 일치
- [ ] 세션→예정표 연결 저장 → Task 3(createDraftSession + 호출부)
- [ ] 스푸핑 방지(소유자 필터) → Task 1 `is_plan_completed` + Task 4 시나리오4
- [ ] 내부 함수 보호 → Task 1 revoke + Task 4 시나리오5
- [ ] 계획 보너스는 워크아웃 XP 안(원자 트랜잭션)에서 지급 → Task 1 Step 2(v2 재정의)
- [ ] 타바타는 계획 대상 아님 → 0022의 `if not v_tabata` 블록 안에서만 계산(유지)
- [ ] 마이그레이션 정책 → 0022 미수정, 0023 신규(0022 적용 전제)
- [ ] 안내 시트 정합 → Task 5(계획 완료를 획득 가능으로)

> 유산소 "계획된 최소 시간 충족" 판정은 이번 MVP에서 세트 수 기준으로 단순화했다. 시간 기반 정밀 판정이 필요하면 `is_plan_completed`에 유산소 분기(`duration_seconds` 합계 비교)를 더하는 후속 개선으로 분리한다.
