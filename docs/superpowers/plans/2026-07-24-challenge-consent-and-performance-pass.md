# 챌린지 목표 상호 동의 + 성과 열람권 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **먼저 §0(현재 상태)와 §1(결정 사항)을 읽고, §1의 결정 3건을 사용자에게 확인한 뒤 착수하라.** 결정에 따라 Phase B의 일부 코드가 달라진다.

**Goal:** 크루 전원이 서로의 목표에 동의해야 챌린지가 시작되게 하고, 챌린지 시작 후 홈에 "챌린지 크루 성과"를 5일 연속 운동으로만 열리는 2시간짜리 잠금 카드(블러+자물쇠)로 노출하되 남은 기간을 함께 보여준다.

**Architecture:** 두 서브시스템. **Phase A(동의 게이트)** — 새 `challenge_goal_approvals` 테이블 + `approve_challenge_goals` RPC + `start_challenge`에 "전원 동의" 게이트 추가 + setup UI에 동의 버튼/현황. **Phase B(성과 열람권)** — 열람 자격을 "5일 연속"으로, 열람 창을 2시간으로 바꾸고, 홈에 챌린지 순위를 블러/자물쇠로 감춘 뒤 자격 획득 시 2시간 공개하는 카드. 마이그레이션은 **0025(동의)·0026(열람권)** 신규 파일로만 추가하고 기존(0022~0024)은 수정하지 않는다.

**Tech Stack:** Next.js 16(App Router)·React 19·TypeScript·Tailwind v4·Supabase(Postgres RPC·RLS)·vitest. DB는 Supabase SQL Editor에 마이그레이션을 **수동 Run**한다(로컬 CLI 아님).

---

## 0. 현재 상태 지도 (콜드 에이전트 필독)

프로덕션: **https://gnd-one.vercel.app** (Vercel, `pnpm dlx vercel deploy --prod --yes`). 저장소 `workout-app`, 기본 브랜치 `main`.

**게이트(모든 커밋 전):** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. 현재 baseline **412 테스트 통과**.

**마이그레이션 정책(중요):** `supabase/migrations/000N_*.sql`는 **번호순 신규 파일로만** 추가한다. 0022~0024는 **이미 운영 DB에 적용됨 → 수정 금지**. 다음 번호는 **0025**. 각 파일 상단에 "SQL Editor에 붙여넣고 Run" 주석을 단다. 함수는 `create or replace`로 교체(이력 왜곡 아님).

**관련 파일·심볼(실측 확인함):**

| 대상 | 위치 | 핵심 |
|---|---|---|
| 챌린지 페이지 | `src/app/(tabs)/challenge/page.tsx` | 상태분기 setup(415~)·active(520~)·ended(683~). `handleStart`(258)·`handleCancel`(262)·`goalsByUser`(map)·`members`·`goalCountByUser` |
| 챌린지 조회/액션 | `src/lib/challenge.ts` | `getCurrentChallenge`(48)·`getChallengeGoals`(87)·`startChallenge`(162)·`cancelChallenge`·`getActiveChallengeRanking`(450)→`{name, list: RankedParticipant[]}` |
| 시작 RPC | `supabase/migrations/0006_challenges.sql:110` | `start_challenge` — setup에서 전원 목표≥1 게이트, 그 후 아무 크루원이나 시작 |
| user_goals | `0006_challenges.sql:28` | `(user_id, challenge_id, group_id, goal_type, target_value, unit, planned_days)`, `unique(user_id, challenge_id, goal_type)` |
| 열람권 도메인 | `src/lib/domain/viewing-pass.ts` | `KING_DAYS=5`·`PASS_HOURS=24`·`viewingPassStatus()`·`weekWorkoutDays()`. **주(월요일) 5일** 기준(연속 아님) |
| 열람 RPC | `supabase/migrations/0012_record_view_rpc.sql` | `view_record(target)` — 주 5일째 완료시각+**24h** 유효·1회. `record_views(viewer_id,target_id,challenge_id,viewed_at)` |
| 성과 계산 | `src/lib/social.ts:553` | `getCrewPerformance(targetId, groupId)`→`{weekDays, streak, challenge}`. `getMyRecordViewAts` |
| 열람권 카드 | `src/components/home/king-card.tsx` | 홈 카드. **이미 "진행 중 챌린지 있을 때만 노출"로 게이팅됨**(`getCurrentChallenge().status==='active'`) |
| 홈 | `src/components/home/home-client.tsx` | `KingCard`는 `completedAts` 있을 때 렌더. 최근 친구 활동은 제거됨 |
| 스트릭(연속) | `src/lib/domain/streak.ts` | `currentStreak(dayKeys, todayKey)` — **간격<5일이면 이어짐**(엄밀 연속 아님). `workoutDayKeys()` |
| 시간 유틸 | `src/lib/domain/time.ts` | `dayKey(date, tz)`·`weekRange(now, tz)`·`DEFAULT_TIMEZONE='Asia/Seoul'` |
| notify | `0011_social.sql:183` | `notify(user, actor, type, ref, title, body)` (definer). type enum 최신은 `0020_badges.sql:49` |
| 실 DB 테스트 패턴 | `scripts/xp-test.mjs`·`finish-repro.mjs` | anon signup(REST) → RPC 호출. `.env.local`에서 URL/anon/service 로드 |

**컴포넌트 테스트 관례:** `renderToStaticMarkup`로 SSR 문자열 검증(`src/components/**/*.test.tsx`). 순수 도메인 함수는 `src/lib/domain/*.test.ts`.

---

## 1. 결정 사항 — ✅ 확정됨 (2026-07-24, 사용자)

**세 결정 모두 권장안으로 확정. 대안은 폐기. 아래대로만 구현한다.**

**D1 — "5일 연속"의 정의 → ✅ 엄밀 연속 5일.** 오늘 포함 최근 5개 캘린더 날짜를 모두 운동해야 자격. 새 도메인 `hasConsecutiveWorkoutDays(dayKeys, todayKey, 5)`로 판정. (주-5일 대안 폐기.)

**D2 — 열람 대상 → ✅ 크루 전체 순위판.** `getActiveChallengeRanking(groupId)`의 `list` 전체를 공개. 개인 1명 선택 열람 아님. → **Task B2(view_record 2h RPC)는 건너뛴다.** KingCard는 홈에서 렌더만 제거하고 파일은 남긴다.

**D3 — 2시간 창 → ✅ 달성 시각부터 2시간.** 5일 연속을 만든 시각(오늘 5일째 첫 완료 시각)부터 2h 동안 순위판이 열리고, 지나면 다시 잠긴다. 소비 기록 없이 시간창만. `record_views` 1회 소비는 이 카드에서 쓰지 않는다.

> 확정 동작: **5일 연속 → 그 시각부터 2h 동안 크루 순위판 공개, 그 외엔 블러+자물쇠, 남은 기간(D-day)은 항상 표시.**

---

## 2. File Structure

**Phase A (동의 게이트)**
- Create: `supabase/migrations/0025_challenge_goal_approvals.sql` — 테이블·RLS·`approve_challenge_goals`·`unapprove_challenge_goals`·`start_challenge` 재정의(전원 동의 게이트)
- Modify: `src/lib/challenge.ts` — `approveChallengeGoals`·`unapproveChallengeGoals`·`getChallengeApprovals` 추가
- Modify: `src/app/(tabs)/challenge/page.tsx` — setup에 동의 버튼/현황, 시작 게이트
- Create: `scripts/challenge-consent-test.mjs` — 실 DB 검증

**Phase B (성과 열람권)**
- Modify: `src/lib/domain/viewing-pass.ts` — `PASS_HOURS` 2, 연속 판정 `hasConsecutiveWorkoutDays` + `challengePassStatus`
- Create: `src/lib/domain/viewing-pass.test.ts`에 연속·2h 테스트 추가(파일 있으면 추가, 없으면 생성)
- Create: `supabase/migrations/0026_challenge_view_pass_2h.sql` — `view_record` 2h(사용자가 D2/D3에서 순위판-리빌만 쓰면 이 RPC 변경은 선택)
- Create: `src/components/home/challenge-performance-card.tsx` — 블러/자물쇠 순위판 + D-day
- Modify: `src/components/home/home-client.tsx` — KingCard 자리에 새 카드 노출(챌린지 active일 때)
- Create: `src/components/home/challenge-performance-card.test.tsx`

---

## PHASE A — 목표 상호 동의 게이트

### Task A1: 마이그레이션 0025 — 동의 테이블 + RLS

**Files:** Create `supabase/migrations/0025_challenge_goal_approvals.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 0025: 챌린지 목표 상호 동의 — 전원이 서로의 목표에 동의해야 시작
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회). 0022~0024는 수정하지 않는다.
--
-- 흐름: setup에서 전원이 목표를 세팅한 뒤, 각 크루원이 "전원의 목표에 동의"를
-- 1회 기록한다. 전원 동의가 모이면 start_challenge가 통과된다.

create table if not exists public.challenge_goal_approvals (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  approver_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  approved_at timestamptz not null default now(),
  primary key (challenge_id, approver_id)
);

alter table public.challenge_goal_approvals enable row level security;
revoke all on public.challenge_goal_approvals from anon, authenticated;
grant select on public.challenge_goal_approvals to authenticated;

-- 같은 크루의 동의만 조회 (setup 현황 표시용)
drop policy if exists "approvals_select_crew" on public.challenge_goal_approvals;
create policy "approvals_select_crew" on public.challenge_goal_approvals
  for select using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and public.is_group_member(c.group_id, auth.uid())
    )
  );
-- insert/delete는 아래 정의자 RPC만 (직접 쓰기 금지 — 위조 방지)
```

- [ ] **Step 2: 사용자에게 "0025를 SQL Editor에 Run" 요청 후, 다음 Task의 RPC(A2)를 같은 파일에 이어 붙일 것.** (A1·A2를 한 파일로 작성해 한 번에 Run하는 것이 낫다 — 아래 A2 Step 1이 같은 파일에 append)

---

### Task A2: 동의 RPC + start_challenge 게이트 (같은 0025 파일에 append)

**Files:** Modify `supabase/migrations/0025_challenge_goal_approvals.sql`

- [ ] **Step 1: RPC 3종을 0025 파일 끝에 추가**

```sql
-- ── 동의 기록 (setup·전원 목표 세팅 완료 상태에서만) ──────────
create or replace function public.approve_challenge_goals(p_challenge_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare c challenges; v_missing int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from challenges where id = p_challenge_id;
  if not found or not is_group_member(c.group_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;
  -- 전원 목표 세팅 전에는 동의 불가 (목표가 확정돼야 동의가 의미 있음)
  select count(*) into v_missing from group_members gm
  where gm.group_id = c.group_id
    and not exists (select 1 from user_goals ug
                    where ug.challenge_id = p_challenge_id and ug.user_id = gm.user_id);
  if v_missing > 0 then raise exception 'kpi_incomplete'; end if;

  insert into challenge_goal_approvals (challenge_id, approver_id)
  values (p_challenge_id, auth.uid())
  on conflict (challenge_id, approver_id) do nothing;
end $$;
revoke all on function public.approve_challenge_goals(uuid) from anon, public;
grant execute on function public.approve_challenge_goals(uuid) to authenticated;

-- ── 동의 철회 (누군가 목표를 수정하면 동의도 리셋되게 하는 용도) ──
create or replace function public.unapprove_challenge_goals(p_challenge_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare c challenges;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from challenges where id = p_challenge_id;
  if not found or not is_group_member(c.group_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  delete from challenge_goal_approvals
  where challenge_id = p_challenge_id and approver_id = auth.uid();
end $$;
revoke all on function public.unapprove_challenge_goals(uuid) from anon, public;
grant execute on function public.unapprove_challenge_goals(uuid) to authenticated;

-- ── start_challenge 재정의: 전원 목표 + 전원 동의 게이트 추가 ──
create or replace function public.start_challenge(p_challenge_id uuid)
returns public.challenges
language plpgsql volatile security definer set search_path = public as $$
declare c challenges; total int; missing int; approvals int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from challenges where id = p_challenge_id for update;
  if not found or not is_group_member(c.group_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  select count(*) into total from group_members gm where gm.group_id = c.group_id;
  select count(*) into missing from group_members gm
  where gm.group_id = c.group_id
    and not exists (select 1 from user_goals ug
                    where ug.challenge_id = p_challenge_id and ug.user_id = gm.user_id);
  if missing > 0 then raise exception 'kpi_incomplete:%/%', total - missing, total; end if;

  -- 신규: 전원 동의 게이트
  select count(*) into approvals from challenge_goal_approvals a
  where a.challenge_id = p_challenge_id
    and exists (select 1 from group_members gm
                where gm.group_id = c.group_id and gm.user_id = a.approver_id);
  if approvals < total then raise exception 'consent_incomplete:%/%', approvals, total; end if;

  update challenges set status = 'active' where id = p_challenge_id returning * into c;
  return c;
end $$;
revoke execute on function public.start_challenge(uuid) from anon, public;
grant execute on function public.start_challenge(uuid) to authenticated;
```

- [ ] **Step 2: 사용자에게 0025 전체를 SQL Editor에 Run 요청.** 이후 A5 스크립트로 검증한다(코드 UI보다 먼저 RPC를 검증하면 안전).

---

### Task A3: 클라이언트 조회/액션 함수

**Files:** Modify `src/lib/challenge.ts` (기존 `cancelChallenge` 근처에 추가)

- [ ] **Step 1: 세 함수 추가**

```ts
/** 챌린지 목표에 동의(1회 기록). setup·전원 목표 세팅 완료 상태에서만. */
export async function approveChallengeGoals(challengeId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("approve_challenge_goals", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
}

/** 내 동의 철회 */
export async function unapproveChallengeGoals(challengeId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("unapprove_challenge_goals", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
}

/** 이 챌린지에 동의한 크루원 id 집합 (setup 현황·시작 게이트용) */
export async function getChallengeApprovals(
  challengeId: string,
): Promise<Set<string>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("challenge_goal_approvals")
    .select("approver_id")
    .eq("challenge_id", challengeId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.approver_id as string));
}
```

- [ ] **Step 2: 게이트 실행** `pnpm typecheck` → PASS(사용처는 A4에서). 커밋:

```bash
git add src/lib/challenge.ts
git commit -m "feat: 챌린지 목표 동의 클라 함수 (approve/unapprove/getApprovals)"
```

---

### Task A4: setup UI — 동의 버튼·현황·시작 게이트

**Files:** Modify `src/app/(tabs)/challenge/page.tsx`

배경: setup 분기(현재 라인 ~415). 이미 참여자별 목표를 보여준다(`goalsByUser`). 여기에 (1) 동의 현황 배지, (2) 내 동의/철회 버튼, (3) "챌린지 시작" 버튼을 **전원 동의 시에만** 활성화한다.

- [ ] **Step 1: 데이터 로드에 approvals 추가** — 챌린지 로드 effect(현재 `getChallengeGoals(ch.id)` 호출부, ~143)에 `getChallengeApprovals(ch.id)`를 `Promise.all`로 추가하고 `const [approvals, setApprovals] = useState<Set<string>>(new Set())`에 저장. import에 `approveChallengeGoals, unapproveChallengeGoals, getChallengeApprovals` 추가.

```ts
// import 블록(@/lib/challenge)에 추가
approveChallengeGoals,
unapproveChallengeGoals,
getChallengeApprovals,

// 상태
const [approvals, setApprovals] = useState<Set<string>>(new Set());

// 로드 effect의 Promise.all에 추가하고
const [chGoals, appr] = await Promise.all([
  getChallengeGoals(ch.id),
  getChallengeApprovals(ch.id),
]);
setGoals(chGoals);
setApprovals(appr);
```

- [ ] **Step 2: 핸들러 2개 추가** (handleStart 근처)

```ts
const allSet =
  members.length > 0 &&
  members.every((m) => (goalCountByUser.get(m.id) ?? 0) > 0);
const allApproved =
  members.length > 0 && members.every((m) => approvals.has(m.id));
const iApproved = userId ? approvals.has(userId) : false;

async function handleApprove() {
  if (!challenge) return;
  setBusy(true);
  try {
    if (iApproved) await unapproveChallengeGoals(challenge.id);
    else await approveChallengeGoals(challenge.id);
    reload();
  } catch (e) {
    showToast(errorMessage(e));
  } finally {
    setBusy(false);
  }
}
```

- [ ] **Step 3: 참여자 현황 행에 동의 배지 추가** — 각 멤버 행(현재 "목표 N개 ✓" 배지 옆)에 동의 여부 표시:

```tsx
{approvals.has(m.id) ? (
  <span className="rounded-full bg-good-weak px-2 py-1 text-[11px] font-bold text-good">동의함 👍</span>
) : (goalCountByUser.get(m.id) ?? 0) > 0 ? (
  <span className="rounded-full bg-surface-2 px-2 py-1 text-[11px] font-bold text-muted">동의 대기</span>
) : null}
```

- [ ] **Step 4: 내 동의 버튼 + 시작 버튼 게이트** — 참여자 현황 섹션 아래, 기존 "챌린지 시작 🏁" 버튼 앞에 삽입하고 시작 버튼 disabled 조건을 교체:

```tsx
{/* 내 동의 버튼 — 전원 목표 세팅 후에만 의미 */}
{allSet && (
  <button
    onClick={handleApprove}
    disabled={busy}
    className={`h-11 rounded-card border text-[13px] font-extrabold disabled:opacity-50 ${
      iApproved
        ? "border-line bg-surface text-muted"
        : "border-accent bg-accent-weak text-accent"
    }`}
  >
    {iApproved ? "✓ 동의함 (누르면 철회)" : "크루 목표에 동의하기 👍"}
  </button>
)}

<button
  onClick={handleStart}
  disabled={busy || !allSet || !allApproved}
  className="h-12 rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-50"
>
  {!allSet
    ? "전원 목표 세팅 대기 중…"
    : !allApproved
      ? `전원 동의 대기 중… (${members.filter((m) => approvals.has(m.id)).length}/${members.length})`
      : "챌린지 시작 🏁"}
</button>
```

- [ ] **Step 5: 게이트 + 커밋**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
git add "src/app/(tabs)/challenge/page.tsx"
git commit -m "feat: 챌린지 setup 목표 상호 동의 게이트 UI"
```

---

### Task A5: 실 DB 검증 스크립트

**Files:** Create `scripts/challenge-consent-test.mjs`

- [ ] **Step 1: 스크립트 작성** (패턴은 `scripts/finish-repro.mjs` 참고 — anon signup·REST·service_role 정리)

핵심 시나리오(각각 `check()`로 검증):
1. 2인 크루 + 챌린지(setup) 생성, 둘 다 목표 세팅.
2. 전원 목표 있으나 **동의 0 → `start_challenge` 실패**(`consent_incomplete`).
3. 한 명만 동의 → 여전히 실패.
4. 둘 다 `approve_challenge_goals` → `start_challenge` 성공(status='active').
5. `approve_challenge_goals` 재호출 → 멱등(에러 없음, 중복 행 없음: `challenge_goal_approvals` 1행).
6. `unapprove_challenge_goals` 후 start → 다시 실패.
7. 목표 미세팅 상태에서 `approve` → `kpi_incomplete` 실패.

```js
// 필수 골격 (finish-repro.mjs의 api/anonUser 재사용)
// - crew group 생성/가입 방법은 scripts/rls-test.mjs의 그룹 생성 패턴을 따를 것.
// - 검증 후 service_role로 유저 삭제(픽스처 정리).
```

- [ ] **Step 2: 실행** `node scripts/challenge-consent-test.mjs` → 모든 시나리오 통과. 커밋:

```bash
git add scripts/challenge-consent-test.mjs
git commit -m "test: 챌린지 동의 게이트 실 DB 검증"
```

> **주의:** 그룹/크루 생성 RPC 이름은 `src/lib/crew.ts`와 `scripts/rls-test.mjs`에서 확인해 정확히 쓸 것(이 계획은 그 세부를 강제하지 않는다).

---

## PHASE B — 챌린지 성과 열람권 개편

> Phase A 완료(챌린지가 active로 전환 가능) 후 진행. §1 결정 D1~D3 확정 후 착수.

### Task B1: viewing-pass 도메인 — 연속 5일 + 2시간 (TDD)

**Files:** Modify `src/lib/domain/viewing-pass.ts` · Test `src/lib/domain/viewing-pass.test.ts`

- [ ] **Step 1: 실패 테스트 작성** (`viewing-pass.test.ts`에 추가; 파일 없으면 생성)

```ts
import { describe, expect, it } from "vitest";
import {
  hasConsecutiveWorkoutDays,
  challengePassStatus,
  CHALLENGE_PASS_HOURS,
} from "./viewing-pass";

const at = (day: string) => new Date(`${day}T03:00:00Z`); // KST 정오

describe("hasConsecutiveWorkoutDays — 오늘 포함 최근 N일 모두 운동", () => {
  it("5일 연속이면 true, 하루라도 빠지면 false", () => {
    const keys = ["2026-07-20","2026-07-21","2026-07-22","2026-07-23","2026-07-24"];
    expect(hasConsecutiveWorkoutDays(keys, "2026-07-24", 5)).toBe(true);
    const gap = ["2026-07-20","2026-07-22","2026-07-23","2026-07-24"]; // 21 빠짐
    expect(hasConsecutiveWorkoutDays(gap, "2026-07-24", 5)).toBe(false);
  });
  it("오늘 미운동이면 false (연속의 끝은 오늘이어야)", () => {
    const keys = ["2026-07-19","2026-07-20","2026-07-21","2026-07-22","2026-07-23"];
    expect(hasConsecutiveWorkoutDays(keys, "2026-07-24", 5)).toBe(false);
  });
});

describe("challengePassStatus — 연속 5일 만든 시각부터 2시간 공개", () => {
  it("CHALLENGE_PASS_HOURS는 2", () => {
    expect(CHALLENGE_PASS_HOURS).toBe(2);
  });
  it("5일 연속 직후는 unlocked, 2시간 지나면 locked", () => {
    const days = [at("2026-07-20"),at("2026-07-21"),at("2026-07-22"),at("2026-07-23"),at("2026-07-24")];
    const justNow = new Date(at("2026-07-24").getTime() + 30*60_000);   // 30분 후
    const later   = new Date(at("2026-07-24").getTime() + 3*3600_000);  // 3시간 후
    expect(challengePassStatus(days, justNow, "Asia/Seoul").state).toBe("unlocked");
    expect(challengePassStatus(days, later, "Asia/Seoul").state).toBe("locked_expired");
  });
  it("연속 5일 미달이면 locked_progress + daysDone", () => {
    const days = [at("2026-07-22"),at("2026-07-23"),at("2026-07-24")];
    const s = challengePassStatus(days, at("2026-07-24"), "Asia/Seoul");
    expect(s.state).toBe("locked_progress");
    expect(s.consecutiveDays).toBe(3);
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인** `pnpm vitest run src/lib/domain/viewing-pass.test.ts` → FAIL(함수 없음).

- [ ] **Step 3: 구현 추가** (`viewing-pass.ts` 하단)

```ts
export const CHALLENGE_PASS_HOURS = 2;

/** 오늘(todayKey) 포함 최근 n일 캘린더 날짜가 모두 운동일이면 true */
export function hasConsecutiveWorkoutDays(
  dayKeys: string[],
  todayKey: string,
  n: number,
): boolean {
  const set = new Set(dayKeys);
  const [y, m, d] = todayKey.split("-").map(Number);
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    if (!set.has(key)) return false;
  }
  return true;
}

export type ChallengePassState = "locked_progress" | "unlocked" | "locked_expired";
export type ChallengePassStatus = {
  state: ChallengePassState;
  consecutiveDays: number; // 오늘부터 뒤로 이어진 연속 운동일 수
  fifthAt: Date | null;    // 5일 연속을 만든 (5일째=오늘) 첫 완료 시각
  expiresAt: Date | null;  // fifthAt + 2h
};

/** 연속 5일 달성 시각부터 2시간 공개. completedAts=내 완료 시각 목록 */
export function challengePassStatus(
  completedAts: Date[],
  now: Date,
  timeZone: string,
  requiredDays = KING_DAYS, // 5
): ChallengePassStatus {
  const keys = [...new Set(completedAts.map((d) => dayKey(d, timeZone)))];
  const todayKey = dayKey(now, timeZone);
  // 오늘부터 뒤로 연속 일수
  let consecutive = 0;
  const set = new Set(keys);
  const [y, m, d] = todayKey.split("-").map(Number);
  for (let i = 0; ; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    const k = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    if (set.has(k)) consecutive++;
    else break;
  }
  if (consecutive < requiredDays) {
    return { state: "locked_progress", consecutiveDays: consecutive, fifthAt: null, expiresAt: null };
  }
  // 오늘 완료들 중 첫 시각 = 5일째를 만든 시각
  const todays = completedAts
    .filter((dt) => dayKey(dt, timeZone) === todayKey)
    .sort((a, b) => a.getTime() - b.getTime());
  const fifthAt = todays[0] ?? now;
  const expiresAt = new Date(fifthAt.getTime() + CHALLENGE_PASS_HOURS * 3_600_000);
  return {
    state: now >= expiresAt ? "locked_expired" : "unlocked",
    consecutiveDays: consecutive,
    fifthAt,
    expiresAt,
  };
}
```

- [ ] **Step 4: 실행 → 통과** `pnpm vitest run src/lib/domain/viewing-pass.test.ts` → PASS. 커밋:

```bash
git add src/lib/domain/viewing-pass.ts src/lib/domain/viewing-pass.test.ts
git commit -m "feat: 챌린지 열람권 도메인 — 연속 5일·2시간 (TDD)"
```

> **D3 대안 채택 시:** "처음 연 순간부터 2h"라면 열람 시작 시각을 서버/로컬에 저장해야 한다(예: `record_views` 재사용 또는 localStorage). 위 구현은 "달성 시각부터 2h"(권장) 기준이다.

---

### Task B2: (선택) view_record RPC 2시간 — D2에서 "1명 선택 열람"을 유지할 때만

**Files:** Create `supabase/migrations/0026_challenge_view_pass_2h.sql`

> **권장안(D2=순위판 리빌, D3=시간창)에서는 서버 `view_record`를 쓰지 않으므로 이 Task는 건너뛴다.** 순위판은 `getActiveChallengeRanking`(크루원 select 허용)로 이미 조회 가능하고, 공개 여부는 클라의 `challengePassStatus`로만 판정한다. 아래는 D2="1명 선택 열람 유지"를 고른 경우의 서버 변경.

- [ ] **Step 1: (조건부) 마이그레이션 작성** — `0012`의 `view_record`를 `create or replace`로 복제하되 `interval '24 hours'` → `interval '2 hours'`, 그리고 자격 판정을 연속 5일로 교체. (0012 전문을 베이스로, 35~48행의 주-5일 서브쿼리를 "오늘 포함 최근 5일 연속" 판정으로 바꾼다.) 사용자에게 SQL Run 요청.

---

### Task B3: 남은 기간 헬퍼 + 크루 순위판 조회 재사용

**Files:** Modify `src/lib/domain/time.ts`(또는 challenge 도메인) — 이미 있으면 재사용

- [ ] **Step 1: D-day 계산 확인** — `src/app/(tabs)/challenge/page.tsx`에 이미 `dday = periodDays(todayKey, challenge.end_date) - 1` 패턴이 있다. 동일 로직으로 홈 카드에서 남은 일수를 계산한다. 순수 함수가 없으면 `src/lib/domain/challenge-time.ts`에 추가:

```ts
/** 오늘~종료일 남은 일수(오늘 포함). 종료일 지났으면 0 */
export function challengeDaysLeft(todayKey: string, endDateKey: string): number {
  const toUtc = (k: string) => { const [y,m,d]=k.split("-").map(Number); return Date.UTC(y,m-1,d); };
  const diff = Math.round((toUtc(endDateKey) - toUtc(todayKey)) / 86_400_000) + 1;
  return Math.max(0, diff);
}
```

- [ ] **Step 2: 테스트 + 커밋** (간단 TDD: 종료 당일=1, 하루 전=2, 지난 후=0)

---

### Task B4: 홈 — 블러/자물쇠 챌린지 성과 카드

**Files:** Create `src/components/home/challenge-performance-card.tsx` · Modify `src/components/home/home-client.tsx`

동작: 챌린지 active일 때 홈에 카드 1개. 항상 **"챌린지 D-N"**과 크루 순위판을 렌더하되, `challengePassStatus`가 `unlocked`가 아니면 순위판 위에 **블러(`blur-sm`) + 자물쇠 오버레이 + 진행문구("5일 연속 중 N/5")**를 덮는다. `unlocked`면 실제 순위와 "🎟️ N분 남음"을 보여준다.

- [ ] **Step 1: 컴포넌트 작성**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";
import { challengePassStatus } from "@/lib/domain/viewing-pass";
import { challengeDaysLeft } from "@/lib/domain/challenge-time";
import { getMyGroups } from "@/lib/crew";
import { getCurrentChallenge, getActiveChallengeRanking, type ChallengeRanking } from "@/lib/challenge";

export function ChallengePerformanceCard({ completedAts }: { completedAts: Date[] }) {
  const { userId } = useAuth();
  const [ranking, setRanking] = useState<ChallengeRanking | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const g = (await getMyGroups())[0];
        if (!g) { if (!cancelled) setReady(true); return; }
        const ch = await getCurrentChallenge(g.id);
        if (!ch || ch.status !== "active") { if (!cancelled) setReady(true); return; }
        const rank = await getActiveChallengeRanking(g.id);
        if (!cancelled) { setEndDate(ch.end_date); setRanking(rank); setReady(true); }
      } catch { if (!cancelled) setReady(true); }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (!ready || !ranking || !endDate) return null; // 챌린지 없으면 숨김

  const now = new Date();
  const pass = challengePassStatus(completedAts, now, DEFAULT_TIMEZONE);
  const dLeft = challengeDaysLeft(dayKey(now, DEFAULT_TIMEZONE), endDate);
  const minsLeft = pass.expiresAt ? Math.max(0, Math.ceil((pass.expiresAt.getTime() - now.getTime()) / 60_000)) : 0;
  const unlocked = pass.state === "unlocked";

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold">🏆 챌린지 크루 성과</h3>
        <span className="text-xs font-bold text-accent">D-{Math.max(0, dLeft - 1)}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted">
        {unlocked
          ? `🎟️ 열람 중 · ${minsLeft}분 남음`
          : pass.state === "locked_expired"
            ? "오늘 열람 시간이 끝났어요 (다시 5일 연속 달성 시 열려요)"
            : `5일 연속 운동하면 열려요 · 현재 ${pass.consecutiveDays}/5일`}
      </p>

      <div className="relative mt-3">
        <ul className={`flex flex-col gap-1.5 ${unlocked ? "" : "pointer-events-none select-none blur-sm"}`}>
          {ranking.list.map((r, i) => (
            <li key={r.userId} className="flex items-center justify-between rounded-card-sm bg-surface-2 px-3 py-2 text-[12.5px]">
              <span className="font-bold">{i + 1}위 · {r.userId.slice(0, 6)}</span>
              <span className="font-mono font-bold text-accent">{Math.round(r.overall)}점</span>
            </li>
          ))}
        </ul>
        {!unlocked && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="rounded-full bg-black/50 px-3 py-1.5 text-lg">🔒</span>
          </div>
        )}
      </div>
    </section>
  );
}
```

> **참고:** `r.userId.slice(0,6)` 자리에는 실제 닉네임을 쓰라 — `getCrewProfiles(groupId)`로 프로필을 받아 id→nickname 매핑(king-card.tsx의 `members` 패턴 참고). 블러 상태에서는 닉네임도 가려지므로 unlocked에서만 정확히 보이면 된다.

- [ ] **Step 2: 홈에 배치** — `home-client.tsx`에서 KingCard 자리(또는 그 위)에 `<ChallengePerformanceCard completedAts={completedAts} />`를 렌더. 챌린지 없으면 컴포넌트가 스스로 null을 반환하므로 조건 없이 둬도 된다(단 `completedAts` 존재 시).

```tsx
{completedAts && <ChallengePerformanceCard completedAts={completedAts} />}
```

기존 `KingCard`는 **D2에서 "1명 선택 열람"을 유지할 때만** 남긴다. 권장안(순위판 리빌)에서는 KingCard를 이 카드로 대체하고 홈에서 제거한다. (KingCard 파일은 삭제하지 말고 렌더만 빼서 롤백 여지를 남겨라.)

- [ ] **Step 3: SSR 테스트** `challenge-performance-card.test.tsx` — 잠금 상태에서 `blur-sm`·🔒 포함, 언락 상태에서 순위/분 표시. (KingCard 테스트 패턴은 없으니 `growth-hub.test.tsx`의 `renderToStaticMarkup` 방식 참고. 단 이 컴포넌트는 useEffect로 데이터를 받으므로, 순수 표시 로직을 분리해 테스트하거나 `challengePassStatus` 도메인 테스트로 갈음할 수 있다 — 도메인 테스트(B1)로 핵심은 이미 커버됨.)

- [ ] **Step 4: 게이트 + 커밋**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
git add src/components/home/challenge-performance-card.tsx src/components/home/home-client.tsx src/lib/domain/challenge-time.ts src/lib/domain/challenge-time.test.ts
git commit -m "feat: 홈 챌린지 크루 성과 카드 — 5일 연속 잠금·2시간 공개·D-day"
```

---

### Task B5: 실 DB·실기기 검증

- [ ] **Step 1: 실 DB** — 테스트 계정으로 5일 연속 완료 세션을 만들고(과거 날짜는 service_role로 `completed_at` 조정) `getActiveChallengeRanking`이 순위를 주는지, `challengePassStatus`가 unlocked를 주는지 스크립트로 확인. **테스트 계정은 반드시 정리**(service_role 삭제).
- [ ] **Step 2: 실기기** — 챌린지 active 상태에서 홈 카드가 (a) 미달성 시 블러+🔒+"N/5일", (b) 5일 연속 후 순위 공개+"분 남음", (c) 2시간 후 재잠금, (d) D-day 표시.

---

## 3. 최종 게이트 + 배포

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 전부 통과.
- [ ] 마이그레이션 **0025(필수)**, 0026(D2 대안 선택 시) 운영 적용 확인.
- [ ] **사용자 실기기 검수 후** main 반영 → `pnpm dlx vercel deploy --prod --yes` → `/challenge`·`/home` 200 + 번들 실검증(교훈 9: 배포 청크에서 새 문구 grep).
- [ ] `PROGRESS.md`에 완료 항목·실측치 기록.

---

## 4. Self-Review 체크리스트

- [ ] A: 전원 목표 세팅 → 전원 동의 → 시작 (게이트 3단) — `start_challenge`가 `consent_incomplete` 던지는지 A5로 검증
- [ ] A: 동의 멱등(중복 행 없음)·철회 동작
- [ ] A: 직접 `challenge_goal_approvals` insert 차단(정의자 RPC만) — RLS로 검증
- [ ] B: "5일 연속" 정의 D1 확정대로 구현(연속 vs 주-5일)
- [ ] B: 2시간 창 D3 확정대로(달성시각부터 vs 처음 연 순간부터)
- [ ] B: 미달성 시 순위 **블러+자물쇠**로 실제 값이 DOM/네트워크에 노출되지 않도록 — 블러는 시각 처리일 뿐이므로, **민감하면 unlocked일 때만 `getActiveChallengeRanking`을 호출**하도록 바꿔라(블러 상태에선 순위 데이터를 아예 받지 않기). 이 편이 안전하다.
- [ ] B: 남은 기간(D-day) 항상 표시
- [ ] 마이그레이션 번호 0025~ 신규 파일, 0022~0024 미수정
- [ ] 테스트 계정 정리(교훈 13), 실계정 4개(오뎅끼데스까·스칼레또·ㄹ홀·낭만송곳니) 미접촉

> **보안 노트(중요):** 블러는 CSS일 뿐 데이터는 클라에 있다. 미달성 사용자가 순위를 못 보게 하려면 **잠금 상태에서 순위 데이터를 아예 조회하지 않는 것**이 원칙이다. Task B4 컴포넌트를 "unlocked일 때만 `getActiveChallengeRanking` 호출"로 수정하고, 잠금 상태에서는 순위 없이 자물쇠·진행문구·D-day만 렌더하라. (계획의 예시 코드는 단순화를 위해 미리 받아 블러 처리했지만, 실제로는 조회를 미루는 편을 권장.)

---

## 5. 인수인계 메모

- **마이그레이션은 사용자가 SQL Editor에 수동 Run.** DDL은 에이전트가 못 돌린다. 각 마이그레이션을 만들면 "이 파일을 SQL Editor에 붙여넣고 Run"을 사용자에게 요청하고, 이후 실 DB 스크립트로 검증하라.
- **커밋/배포 규칙:** 기능 완성 → 자동 검증 → **사용자 실기기 확인** → 그다음 main 배포. 배포 후 번들 grep로 실반영 확인(교훈 9).
- **직전 세션이 만든 것:** 유산소 XP(0024)·완료이벤트/0XP replay(0023)·목표 개수 보너스·홈 정리·열람권 챌린지 게이팅은 이미 배포됨. 이 계획은 그 위에 쌓는다. `PROGRESS.md` 상단 두 항목(2026-07-24) 참고.
- **결정 3건(§1) 미확정이면 착수 금지** — 특히 D1(연속 vs 주-5일)이 도메인·RPC 코드를 가른다.
- **KingCard 처리:** 권장안(순위판 리빌)에서는 홈에서 KingCard 렌더만 제거하고 파일은 남긴다. 1명-선택-열람을 유지하려면 KingCard를 살리고 B4 카드와 공존 방식을 사용자와 정하라.
