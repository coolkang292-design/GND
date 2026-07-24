# 내 루틴 · 친구 레벨 보기 · 친구 신청/리스트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **먼저 §0(현재 상태)과 §1(결정 사항)을 읽어라.** 세 기능은 **독립적**이라 Phase 1/2/3을 따로 실행·배포해도 된다. Phase 3은 착수 전 결정 F1을 사용자에게 확인하라.

**Goal:** (1) 운동 추가 시 재사용 가능한 **내 루틴**을 만들어 불러오기, (2) **크루원을 눌러 그 사람의 레벨/단계** 확인, (3) **친구 신청·수락·친구 리스트**로 크루에 사람을 들이는 흐름 추가.

**Architecture:** 세 독립 기능. **Phase 1(루틴)** — 날짜에 묶이지 않은 `workout_routines` 테이블 + 운동 담기 시트에 "내 루틴" 탭. **Phase 2(친구 레벨)** — 본인만 보이는 `user_progress`를 크루원끼리 읽는 정의자 RPC `get_crew_member_progress` + 레벨 상세 시트. **Phase 3(친구 신청/리스트)** — 기존 크루/그룹 모델 위에 **가입 신청·승인** 흐름(`group_join_requests`) + 크루원(친구) 리스트 화면. 마이그레이션은 **0026·0027·0028** 신규 파일로만 추가(0022~0025는 수정 금지).

**Tech Stack:** Next.js 16(App Router)·React 19·TypeScript·Tailwind v4·Supabase(Postgres RPC·RLS)·vitest. DB는 SQL Editor에 **수동 Run**.

---

## 0. 현재 상태 지도 (콜드 에이전트 필독)

프로덕션 **https://gnd-one.vercel.app**. 저장소 `workout-app`, 브랜치 `main`.
**게이트(모든 커밋 전):** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
**마이그레이션:** 신규 번호 파일로만. 0022~0025 **적용됨·수정 금지**. 다음 번호 **0026**. 상단에 "SQL Editor Run" 주석. DDL은 에이전트가 못 돌리니 **사용자에게 Run 요청 후 실 DB 스크립트로 검증**.

**핵심 파일·심볼(실측):**

| 대상 | 위치 | 핵심 |
|---|---|---|
| 운동 draft·직렬화 | `src/lib/workout.ts` | `LocalExercise{key,name,bodyPart,exerciseType,measure,isCustom,sets}`. `toDraftExercises(jsonb, localId)`·`localId()` |
| 운동 담기 시트 | `src/components/record/exercise-picker.tsx` | 탭 `["catalog","past"]`(61·141). props `onPickMany(items)`·`onPickPast(sessionId)`·`pastSessions` |
| 기록 페이지 | `src/app/(tabs)/record/page.tsx` | `addExercises`(246)·`handleLoadPlan`(528, `toDraftExercises`로 draft 주입)·`<ExercisePicker>`(1034) |
| 예정표(날짜 묶임) | `src/lib/workout-plan.ts` + `0015_workout_plans.sql` | `workout_plans(user_id, plan_date, exercises jsonb, ...)`. RLS 본인. 루틴의 참고 모델 |
| 레벨 도메인 | `src/lib/domain/progression.ts` | `getLevelProgress(totalXp)`→`{currentLevel,currentStageIndex,stageName,characterPath,percent,xpToNextLevel,...}` |
| 레벨 조회(본인) | `src/lib/progression.ts` | `getProgressSummary()`(RLS 본인)·`ProgressSummary`. `user_progress`는 `user_progress_own_select`(본인만) |
| 홈 캐릭터 카드 | `src/components/home/character-card.tsx` | `CharacterCard({summary})` — 레벨 표시 UI 재사용 대상 |
| 크루 | `src/lib/crew.ts` + `0001_identity_crew.sql` | `groups(invite_code,owner_id)`·`group_members(group_id,user_id,role)`. `getMyGroups`·`getCrewProfiles(groupId)`·`joinGroupWithCode(code)`(즉시 가입 RPC)·`createGroup` |
| 크루 성과(정의자 패턴) | `src/lib/social.ts:553` | `getCrewPerformance(targetId,groupId)` — `shares_group_with` 검사하는 정의자 RPC 패턴의 예 |
| RLS 헬퍼 | `0011_social.sql` | `shares_group_with(uid)`·`is_group_member(gid,uid)`. `notify(user,actor,type,ref,title,body)`(183). type enum 최신 `0020_badges.sql:49` |
| 실 DB 테스트 | `scripts/xp-test.mjs`·`rls-test.mjs` | anon signup(REST)→RPC. 그룹 생성/가입 RPC 사용 예는 `rls-test.mjs` |

**테스트 관례:** 순수 도메인 `src/lib/domain/*.test.ts`(vitest), 컴포넌트 `renderToStaticMarkup` SSR(`src/components/**/*.test.tsx`).

---

## 1. 결정 사항

**F1 — "친구"의 정체 (Phase 3 착수 전 확인, 권장안 채택).**
- **권장(계획 채택):** **친구 = 크루원(그룹 멤버).** "친구 리스트" = 내 크루 멤버 목록(+레벨). "친구 신청" = **그룹 가입 신청→소유자 승인** 흐름. 기존 소셜 스택(피드·챌린지·열람권이 전부 그룹 기반)을 그대로 재사용 → 리스크 최소.
- 대안(비권장): 그룹과 별개의 **양방향 친구 그래프**(`friendships`) 신설. 피드·챌린지와의 연동을 새로 설계해야 해 범위가 2~3배.

**F2 — 레벨 열람 범위 (Phase 2).** 크루원의 레벨/단계/진행률만 공개(누적 XP 절대값은 표시하되 상세 내역·XP 원장은 비공개). 권장대로 `total_xp, current_level, current_stage`만 반환.

---

## PHASE 1 — 내 운동 루틴

재사용 가능한 운동 묶음(루틴)을 저장하고, 운동 담기 시트의 "내 루틴" 탭에서 불러온다. 저장 포맷은 `workout_plans.exercises`와 **동일한 jsonb(LocalExercise[])** — `toDraftExercises`를 그대로 재사용한다.

### Task 1.1: 마이그레이션 0026 — workout_routines

**Files:** Create `supabase/migrations/0026_workout_routines.sql`

- [ ] **Step 1: 작성**

```sql
-- 0026: 내 운동 루틴 — 날짜에 묶이지 않은 재사용 운동 묶음
-- 적용: SQL Editor에 붙여넣고 Run (1회). 기존 마이그레이션 수정 금지.
create table if not exists public.workout_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  exercises jsonb not null check (
    jsonb_typeof(exercises) = 'array'
    and jsonb_array_length(exercises) between 1 and 50
    and octet_length(exercises::text) <= 200000
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workout_routines_user_idx
  on public.workout_routines (user_id, updated_at desc);

alter table public.workout_routines enable row level security;
revoke all on public.workout_routines from anon;
grant select, insert, update, delete on public.workout_routines to authenticated;

drop policy if exists "routines_own_all" on public.workout_routines;
create policy "routines_own_all" on public.workout_routines
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger workout_routines_updated_at
  before update on public.workout_routines
  for each row execute function public.set_updated_at();
```

- [ ] **Step 2: 사용자에게 0026 Run 요청.**

### Task 1.2: 클라이언트 lib

**Files:** Create `src/lib/routines.ts`

- [ ] **Step 1: 작성** (workout-plan.ts 패턴 미러)

```ts
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toDraftExercises, localId, type LocalExercise } from "@/lib/workout";

export type WorkoutRoutine = {
  id: string;
  name: string;
  exercises: LocalExercise[]; // 저장은 jsonb, 로드시 toDraftExercises로 정규화
  updatedAt: string;
};

export async function getMyRoutines(): Promise<WorkoutRoutine[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_routines")
    .select("id, name, exercises, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    exercises: toDraftExercises(r.exercises, localId),
    updatedAt: r.updated_at,
  }));
}

/** 현재 draft의 운동들을 이름 붙여 루틴으로 저장. exercises는 저장용 jsonb로 변환. */
export async function saveRoutine(input: {
  name: string;
  exercises: LocalExercise[];
}): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  // workout_plans 저장과 동일한 직렬화 규칙을 쓴다. saveWorkoutPlan이 쓰는
  // 변환 함수가 있으면 그것을 재사용하라(예: toPlanExercises). 없으면 아래처럼
  // LocalExercise에서 로컬 전용 필드(key)를 제외해 저장한다.
  const payload = input.exercises.map(({ key: _key, ...rest }) => rest);
  const { error } = await supabase
    .from("workout_routines")
    .insert({ name: input.name.trim(), exercises: payload });
  if (error) throw error;
}

export async function deleteRoutine(id: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("workout_routines").delete().eq("id", id);
  if (error) throw error;
}
```

> **주의:** `saveWorkoutPlan`(workout-plan.ts:52)이 exercises를 jsonb로 넣을 때 쓰는 변환을 그대로 따르라. 위 `payload`는 근사치다 — 실제 저장 필드는 `saveWorkoutPlan` 구현을 열어 **정확히 동일하게** 맞춰라(안 맞으면 `toDraftExercises`가 로드 시 깨진다).

- [ ] **Step 2:** `pnpm typecheck` → PASS. 커밋 `feat: 루틴 클라 lib`.

### Task 1.3: 운동 담기 시트에 "내 루틴" 탭 + 저장 버튼

**Files:** Modify `src/components/record/exercise-picker.tsx` · `src/app/(tabs)/record/page.tsx`

- [ ] **Step 1: picker에 탭·콜백 추가** — 탭 배열을 `["catalog","past","routine"]`로, props에 `routines: WorkoutRoutine[]`·`onPickRoutine(routineId): void` 추가. routine 탭에서 루틴 목록(이름·운동 수)을 버튼으로 나열, 클릭 시 `onPickRoutine(id)`.

```tsx
// 탭 정의(141행 근처)
["catalog","기본"],["past","지난 기록"],["routine","내 루틴"],

// routine 탭 본문
{tab === "routine" && (
  <ul className="flex flex-col gap-1.5">
    {routines.length === 0 && (
      <li className="text-xs text-muted">저장한 루틴이 없어요. 운동을 담고 &lsquo;루틴으로 저장&rsquo;을 눌러 보세요.</li>
    )}
    {routines.map((r) => (
      <li key={r.id}>
        <button onClick={() => onPickRoutine(r.id)} className="flex w-full items-center justify-between rounded-card-sm border border-line bg-surface-2 px-3 py-2.5 text-left">
          <span className="text-sm font-bold">{r.name}</span>
          <span className="text-xs text-muted">{r.exercises.length}개 ›</span>
        </button>
      </li>
    ))}
  </ul>
)}
```

- [ ] **Step 2: record 페이지 배선** — `getMyRoutines()`로 `routines` 상태 로드. `onPickRoutine(id)` = 해당 루틴의 `exercises`를 `handleLoadPlan`과 같은 방식으로 draft에 주입(단 `scheduledPlanId`는 설정하지 않음 — 루틴은 예정표가 아니다). `<ExercisePicker>`에 `routines`·`onPickRoutine` 전달.

```ts
const [routines, setRoutines] = useState<WorkoutRoutine[]>([]);
// 로드 effect에 추가: setRoutines(await getMyRoutines())
function loadRoutine(id: string) {
  const r = routines.find((x) => x.id === id);
  if (!r) return;
  if (active) { showToast("운동 중에는 불러올 수 없어요"); return; }
  if (draft.exercises.length > 0 && !window.confirm("현재 목록을 지우고 루틴으로 바꿀까요?")) return;
  setDraft((cur) => ({ ...cur, exercises: r.exercises.map((e) => ({ ...e, key: localId() })) }));
  setPickerOpen(false);
  showToast(`루틴 '${r.name}'을 불러왔어요`);
}
```

- [ ] **Step 3: "루틴으로 저장"** — 운동 준비 화면(draft.exercises.length>0, 시작 전)에 버튼 추가 → 이름 prompt → `saveRoutine({name, exercises: draft.exercises})` → `setRoutines(await getMyRoutines())`.

```tsx
{!active && draft.exercises.length > 0 && (
  <button onClick={async () => {
    const name = window.prompt("루틴 이름을 지어주세요 (예: 등·이두의 날)");
    if (!name?.trim()) return;
    try { await saveRoutine({ name, exercises: draft.exercises }); setRoutines(await getMyRoutines()); showToast("루틴으로 저장했어요 ✓"); }
    catch (e) { showToast(errorMessage(e)); }
  }} className="h-11 rounded-card border border-line bg-surface text-[13px] font-bold text-accent">
    ⭐ 이 구성을 루틴으로 저장
  </button>
)}
```

- [ ] **Step 4: 게이트 + 커밋** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → 커밋 `feat: 운동 담기에 내 루틴 탭·루틴 저장`.

### Task 1.4: 실 DB 검증

**Files:** Create `scripts/routine-check.mjs`

- [ ] 루틴 insert→select→로드 왕복, RLS(타 유저 루틴 조회 0건), 삭제. 실행 후 픽스처 정리. 커밋.

---

## PHASE 2 — 크루원(친구) 레벨 보기

`user_progress`는 본인만 조회 가능하므로, 크루원끼리 서로의 레벨을 보려면 정의자 RPC가 필요하다(`getCrewPerformance`와 같은 패턴).

### Task 2.1: 마이그레이션 0027 — get_crew_member_progress RPC

**Files:** Create `supabase/migrations/0027_crew_member_progress.sql`

- [ ] **Step 1: 작성**

```sql
-- 0027: 크루원 레벨 열람 — 같은 그룹이면 서로의 진행 요약을 읽는다
-- 적용: SQL Editor에 붙여넣고 Run (1회).
create or replace function public.get_crew_member_progress(p_target_id uuid)
returns table (total_xp int, current_level smallint, current_stage smallint)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_target_id <> auth.uid() and not shares_group_with(p_target_id) then
    raise exception 'not_crew';
  end if;
  return query
    select up.total_xp, up.current_level, up.current_stage
    from user_progress up where up.user_id = p_target_id;
end $$;
revoke all on function public.get_crew_member_progress(uuid) from anon, public;
grant execute on function public.get_crew_member_progress(uuid) to authenticated;
```

- [ ] **Step 2: 사용자에게 0027 Run 요청.**

### Task 2.2: 클라이언트 조회 — 크루원 진행 요약

**Files:** Modify `src/lib/progression.ts`

- [ ] **Step 1: 함수 추가** — `getProgressSummary`가 쓰는 `getLevelProgress`를 재사용해 크루원 요약을 만든다.

```ts
/** 크루원 한 명의 레벨 요약. RLS 우회 정의자 RPC 사용. 행 없으면 0 XP(Lv.1). */
export async function getCrewMemberProgress(
  targetId: string,
): Promise<ProgressSummary> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_crew_member_progress", {
    p_target_id: targetId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const totalXp = row?.total_xp ?? 0;
  const p = getLevelProgress(totalXp);
  return {
    totalXp,
    currentLevel: p.currentLevel,
    currentStage: p.currentStageIndex,
    stageName: p.stageName,
    characterPath: p.characterPath,
    nextLevelRequiredXp: p.nextLevelRequiredXp,
    xpToNextLevel: p.xpToNextLevel,
    levelProgressPercent: p.percent,
    streakShieldCount: 0, // 타인 것은 노출 안 함
    hasReceivedTodayWorkoutXp: false,
  };
}
```

- [ ] **Step 2:** `pnpm typecheck` → PASS. 커밋.

### Task 2.3: 크루원 레벨 상세 시트

**Files:** Create `src/components/crew/member-level-sheet.tsx` · Modify 크루원을 클릭하는 화면

- [ ] **Step 1: 시트 컴포넌트** — 대상 프로필(닉네임·아바타) + 레벨 카드(캐릭터·`{stageName} Lv.N`·구간 진행바·다음 레벨까지 XP). `CharacterCard`의 표시 로직을 참고하되 클릭 이동 없이 시트로. 데이터: `getCrewMemberProgress(targetId)`.

```tsx
"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { getCrewMemberProgress, type ProgressSummary } from "@/lib/progression";
import type { Profile } from "@/lib/types";

export function MemberLevelSheet({ member, onClose }: { member: Profile; onClose: () => void }) {
  const [s, setS] = useState<ProgressSummary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let c = false;
    getCrewMemberProgress(member.id).then((r) => !c && setS(r)).catch(() => !c && setFailed(true));
    return () => { c = true; };
  }, [member.id]);
  const pct = s ? Math.min(100, Math.round(s.levelProgressPercent)) : 0;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" className="fixed inset-x-0 bottom-0 z-50 rounded-t-[22px] border-t border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <div className="flex items-center gap-3">
          <span className="text-3xl">{member.avatar_url ?? "👤"}</span>
          <p className="text-lg font-extrabold">{member.nickname}님</p>
        </div>
        {failed && <p className="mt-4 text-sm text-muted">레벨 정보를 불러오지 못했어요.</p>}
        {s && (
          <div className="mt-4 flex items-center gap-3.5">
            <Image src={s.characterPath} alt="" width={88} height={117} sizes="88px" className="rounded-card-sm object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-xl font-extrabold text-accent">{s.stageName} Lv.{s.currentLevel}</p>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-[11.5px] text-muted">
                {s.nextLevelRequiredXp === null ? "최고 레벨" : `다음 레벨까지 ${s.xpToNextLevel.toLocaleString()} XP`}
              </p>
            </div>
          </div>
        )}
        <button onClick={onClose} className="mt-5 h-12 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink">닫기</button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: 클릭 진입점 배선** — 크루원이 나열되는 곳(권장: Phase 3의 친구 리스트 화면. 없으면 `crew-card.tsx` 또는 `king-card.tsx`의 멤버 목록)에서 멤버 클릭 시 `setSelected(member)` → `<MemberLevelSheet member={selected} onClose={...} />`.

- [ ] **Step 3: SSR 테스트** — `member-level-sheet.test.tsx`: 표시 로직은 `getLevelProgress`(도메인, 이미 테스트됨)에 의존하므로, 여기선 시트가 닉네임·`role=dialog`·닫기 버튼을 렌더하는지 정도만 검증(데이터는 effect라 로딩 상태만 SSR에 나타남).

- [ ] **Step 4: 게이트 + 커밋.**

### Task 2.4: 실 DB 검증

**Files:** Create `scripts/crew-progress-check.mjs`

- [ ] 같은 그룹 2인 → A가 B의 `get_crew_member_progress` 성공. 다른 그룹 유저 → `not_crew` 실패. 픽스처 정리. 커밋.

---

## PHASE 3 — 친구 신청 + 친구 리스트

**결정 F1 확정 필요.** 아래는 **권장안: 친구=크루원, 친구 신청=그룹 가입 신청→소유자 승인.** 기존 즉시-가입(`joinGroupWithCode`)은 유지하되, 신청 기반 흐름을 추가한다.

### Task 3.1: 마이그레이션 0028 — group_join_requests + RPC

**Files:** Create `supabase/migrations/0028_group_join_requests.sql`

- [ ] **Step 1: 작성**

```sql
-- 0028: 친구 신청 — 그룹 가입 신청·승인 (친구=크루원 모델)
-- 적용: SQL Editor에 붙여넣고 Run (1회).
create table if not exists public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  requester_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index if not exists join_req_pending_unique
  on public.group_join_requests (group_id, requester_id) where status = 'pending';

alter table public.group_join_requests enable row level security;
revoke all on public.group_join_requests from anon, authenticated;
grant select on public.group_join_requests to authenticated;
-- 신청자 본인 또는 그룹 멤버(=승인권자 포함)가 조회
drop policy if exists "join_req_select" on public.group_join_requests;
create policy "join_req_select" on public.group_join_requests
  for select using (
    requester_id = auth.uid()
    or is_group_member(group_id, auth.uid())
  );
-- 쓰기는 아래 정의자 RPC만

-- 신청: 코드로 그룹을 찾아 pending 생성 (이미 멤버면 거절)
create or replace function public.request_join_group(p_code text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare g groups; v_req_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into g from groups where invite_code = p_code;
  if not found then raise exception 'invalid_invite_code'; end if;
  if is_group_member(g.id, auth.uid()) then raise exception 'already_member'; end if;
  insert into group_join_requests (group_id, requester_id)
  values (g.id, auth.uid())
  on conflict (group_id, requester_id) where status = 'pending' do nothing
  returning id into v_req_id;
  -- 소유자에게 알림
  perform notify(g.owner_id, auth.uid(), 'join_requested', g.id,
    (select coalesce(nickname,'누군가') from profiles where id = auth.uid()) || '님이 친구 신청했어요 🤝', null);
  return v_req_id;
end $$;
revoke all on function public.request_join_group(text) from anon, public;
grant execute on function public.request_join_group(text) to authenticated;

-- 승인/거절: 소유자만. 승인 시 group_members에 추가.
create or replace function public.respond_join_request(p_request_id uuid, p_accept boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
declare r group_join_requests; g groups;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into r from group_join_requests where id = p_request_id for update;
  if not found or r.status <> 'pending' then raise exception 'request_not_found'; end if;
  select * into g from groups where id = r.group_id;
  if g.owner_id <> auth.uid() then raise exception 'not_owner'; end if;

  if p_accept then
    insert into group_members (group_id, user_id) values (r.group_id, r.requester_id)
      on conflict (group_id, user_id) do nothing;
    update group_join_requests set status='accepted', responded_at=now() where id = p_request_id;
    perform notify(r.requester_id, auth.uid(), 'join_accepted', r.group_id,
      '친구 신청이 수락됐어요! 🎉', null);
  else
    update group_join_requests set status='rejected', responded_at=now() where id = p_request_id;
  end if;
end $$;
revoke all on function public.respond_join_request(uuid, boolean) from anon, public;
grant execute on function public.respond_join_request(uuid, boolean) to authenticated;

-- 알림 타입 확장 (0020 제약을 다시 정의)
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'workout_started','cheer_received','poke','reaction_received','rank_change',
  'record_viewed','morning_briefing','challenge_started','challenge_ended',
  'record_beaten','badge_earned','join_requested','join_accepted'
));
```

- [ ] **Step 2: 사용자에게 0028 Run 요청.**

### Task 3.2: 클라이언트 lib

**Files:** Modify `src/lib/crew.ts`

- [ ] **Step 1: 함수 추가**

```ts
export async function requestJoinGroup(code: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("request_join_group", { p_code: code.trim() });
  if (error) throw error;
}

export type JoinRequest = { id: string; requesterId: string; createdAt: string };

/** 내 그룹으로 들어온 pending 신청 (소유자 화면용). requester 프로필은 별도 조회. */
export async function getPendingJoinRequests(groupId: string): Promise<JoinRequest[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("group_join_requests")
    .select("id, requester_id, created_at")
    .eq("group_id", groupId).eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, requesterId: r.requester_id, createdAt: r.created_at }));
}

export async function respondJoinRequest(requestId: string, accept: boolean): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("respond_join_request", { p_request_id: requestId, p_accept: accept });
  if (error) throw error;
}
```

- [ ] **Step 2:** typecheck → 커밋.

### Task 3.3: 친구 리스트 + 신청 화면

**Files:** Create `src/app/(tabs)/friends/page.tsx` **또는** 내 정보(profile) 하위 섹션 — 사용자와 위치 확정. 아래는 독립 화면 기준.

> **탭 추가 여부는 확인 필요.** 하단 탭에 "친구"를 넣을지, 내 정보(profile) 안 섹션으로 둘지 결정하라(권장: 내 정보 하위 — 탭 5개 유지). `src/components/tab-bar.tsx` 확인.

- [ ] **Step 1: 친구 리스트** — `getCrewProfiles(groupId)`로 크루원 목록, 각 항목 클릭 시 **Phase 2의 `MemberLevelSheet`** 오픈. 각 항목에 레벨 배지를 미리 보이려면 `getCrewMemberProgress`를 멤버별로 호출(수 명 규모라 부담 없음) 또는 클릭 시 로드.

```tsx
{members.map((m) => (
  <button key={m.id} onClick={() => setSelected(m)} className="flex w-full items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-card">
    <span className="text-2xl">{m.avatar_url ?? "👤"}</span>
    <span className="flex-1 text-left text-sm font-bold">{m.nickname}</span>
    <span className="text-xs font-bold text-accent">레벨 보기 ›</span>
  </button>
))}
{selected && <MemberLevelSheet member={selected} onClose={() => setSelected(null)} />}
```

- [ ] **Step 2: 친구 신청(코드 입력)** — 입력창 + "신청" 버튼 → `requestJoinGroup(code)` → 토스트("신청을 보냈어요"). `already_member`·`invalid_invite_code` 에러 문구 처리.

- [ ] **Step 3: 받은 신청(소유자)** — 내가 소유자인 그룹이면 `getPendingJoinRequests(groupId)` 목록 + 각 신청에 수락/거절 버튼(`respondJoinRequest(id, true/false)`) → 갱신. requester 닉네임은 `getCrewProfiles`엔 없을 수 있으니 `profiles`를 id로 조회하거나 별도 helper 추가.

- [ ] **Step 4: 게이트 + 커밋** `feat: 친구 리스트·신청·승인 화면`.

### Task 3.4: 실 DB 검증

**Files:** Create `scripts/friend-request-check.mjs`

- [ ] 시나리오: A가 B그룹 코드로 `request_join_group` → pending 1건, B(소유자)에 `join_requested` 알림. B가 `respond_join_request(id,true)` → A가 group_members에 추가·`join_accepted` 알림. 이미 멤버가 신청 → `already_member`. 소유자 아닌 사람이 승인 → `not_owner`. 픽스처 정리. 커밋.

---

## 2. 최종 게이트 + 배포 (각 Phase 독립)

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 통과.
- [ ] 해당 Phase의 마이그레이션(0026/0027/0028) 운영 적용 확인 + 실 DB 스크립트 통과.
- [ ] **사용자 실기기 검수 후** main → `pnpm dlx vercel deploy --prod --yes` → `/record`·`/home`·(친구 화면) 200 + 번들 실검증(교훈 9).
- [ ] `PROGRESS.md` 갱신.

## 3. Self-Review 체크리스트

- [ ] P1: 루틴 저장 jsonb 포맷이 `saveWorkoutPlan`과 동일 → `toDraftExercises` 로드 무손실(직접 왕복 테스트로 확인)
- [ ] P1: 루틴 불러오기는 `scheduledPlanId`를 세팅하지 않는다(예정표 아님, 완료 시 삭제 로직에 안 걸림)
- [ ] P2: 크루 아닌 사람은 `get_crew_member_progress` 거부(`not_crew`) — 실 DB로 검증
- [ ] P2: 타인의 streak_shield·XP 원장은 노출 안 함(레벨/단계/누적XP만)
- [ ] P3(F1): 친구=크루원 확정대로. 별도 친구 그래프 만들지 않음
- [ ] P3: `request_join_group` 멱등(중복 pending 없음), 승인은 소유자만, 승인 시 group_members 추가
- [ ] P3: 알림 타입 `join_requested`·`join_accepted` 제약에 추가됨
- [ ] 마이그레이션 0026~ 신규, 0022~0025 미수정
- [ ] 테스트 계정 정리(교훈 13), 실계정 4개 미접촉

## 4. 인수인계 메모

- **마이그레이션은 사용자가 SQL Editor에 수동 Run** 후 실 DB 스크립트로 검증. 순서: 만들기 → Run 요청 → 검증 → UI.
- **세 Phase는 독립.** 우선순위 정해 하나씩 배포 가능. 의존성: Phase 3의 친구 리스트에서 Phase 2의 `MemberLevelSheet`를 재사용하면 좋다(둘을 함께 하면 시너지).
- **커밋/배포 규칙:** 자동 검증 → 사용자 실기기 확인 → main 배포 → 번들 grep 실검증.
- **F1(친구 모델) 미확정이면 Phase 3 착수 금지.** 권장안(크루 기반)이 아니면 스키마·RPC가 전면 달라진다.
- **직전 작업 맥락:** XP·레벨·유산소·챌린지 점수/관리·챌린지 동의(0025)까지 배포/진행됨. `PROGRESS.md` 상단(2026-07-24) 참고. 이 계획은 그 위에 쌓는다.
