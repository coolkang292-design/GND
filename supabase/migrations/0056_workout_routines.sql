-- 0056: 나만의 운동 루틴 — 날짜에 묶이지 않은 재사용 운동 묶음
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0055는 수정 금지.
-- 설계: docs/superpowers/specs/2026-08-02-routines-frequent-exercises-calendar-planning-design.md
--
-- 왜 필요한가. 사용자가 자주 하는 운동 묶음을 매번 처음부터 담고 있었다.
-- '지난 기록' 탭이 있지만 그건 특정 날짜의 세션을 복사하는 것이라, "가슴날"
-- 같은 고정 루틴을 부르려면 그 루틴을 했던 날을 사람이 기억해서 찾아야 했다.
--
-- exercises jsonb는 workout_plans(0015)와 **똑같은 포맷**이다. src/lib/workout.ts의
-- LocalSet이 {key, weightKg, reps, distanceKm, durationMin, done}이고
-- domain/workout-plan.ts의 DraftPlanSet이 PlanSet & {key, done}이라 같은 모양이라서,
-- parsePlanExercises·toPlanExercises·toDraftExercises를 그대로 재사용한다.
--
-- ⚠️ 슬롯 한도는 0022가 이미 레벨 보상으로 예약해 뒀다:
--   (12, 'routine_slot_1', '운동 루틴 저장 슬롯 1개 추가', 'coming_soon')
--   (27, 'routine_slot_2', '운동 루틴 저장 슬롯 추가',   'coming_soon')
-- 무제한으로 열면 이 두 줄이 거짓말이 된다. 기본 3개 + 보상으로 각 +1로 간다.

-- ── 테이블 ───────────────────────────────────────────────────

create table if not exists public.workout_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  exercises jsonb not null
    check (
      jsonb_typeof(exercises) = 'array'
      and jsonb_array_length(exercises) between 1 and 50
      and octet_length(exercises::text) <= 200000
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 이름은 사용자별 유니크. 같은 이름 두 개면 목록에서 고를 수가 없다.
create unique index if not exists workout_routines_user_name
  on public.workout_routines (user_id, name);

create index if not exists workout_routines_user_updated
  on public.workout_routines (user_id, updated_at desc);

drop trigger if exists workout_routines_updated_at on public.workout_routines;
create trigger workout_routines_updated_at
  before update on public.workout_routines
  for each row execute function public.set_updated_at();

-- ── RLS: 본인 전용 ───────────────────────────────────────────

alter table public.workout_routines enable row level security;
revoke all on public.workout_routines from anon, authenticated;
grant select, insert, update, delete on public.workout_routines to authenticated;

drop policy if exists "workout_routines_select_own" on public.workout_routines;
create policy "workout_routines_select_own" on public.workout_routines
  for select using (user_id = auth.uid());

drop policy if exists "workout_routines_insert_own" on public.workout_routines;
create policy "workout_routines_insert_own" on public.workout_routines
  for insert with check (user_id = auth.uid());

drop policy if exists "workout_routines_update_own" on public.workout_routines;
create policy "workout_routines_update_own" on public.workout_routines
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "workout_routines_delete_own" on public.workout_routines;
create policy "workout_routines_delete_own" on public.workout_routines
  for delete using (user_id = auth.uid());

-- ── 슬롯 한도는 서버가 강제한다 ──────────────────────────────
--
-- 클라이언트만 막으면 우회되고, 무엇보다 조용히 깨졌을 때 아무도 모른다.
-- 한도 = 3 + (달성한 routine_slot_* 보상 수). 레벨 숫자(12·27)를 여기에
-- 박지 않는다 — level_definitions가 단일 진실이고, 클라이언트의
-- routineSlotLimit()도 같은 표를 읽는다.

create or replace function public.enforce_routine_slot_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level int;
  v_limit int;
  v_count int;
begin
  -- ⚠️ coalesce가 두 겹인 이유: 컬럼 NULL과 '행 자체가 없음'은 다른 경우다.
  -- user_progress 행이 없는 신규 사용자는 select ... into가 v_level을 NULL로
  -- 남기는데, 그러면 level <= v_level이 항상 false라 한도가 조용히 3으로
  -- 굳어 레벨을 올려도 슬롯이 안 늘어난다.
  select coalesce(current_level, 1) into v_level
    from user_progress where user_id = new.user_id;
  v_level := coalesce(v_level, 1);

  select 3 + count(*) into v_limit
    from level_definitions
    where reward_key in ('routine_slot_1', 'routine_slot_2')
      and level <= v_level;

  select count(*) into v_count
    from workout_routines where user_id = new.user_id;

  if v_count >= v_limit then
    raise exception 'routine_slot_limit:%', v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_routine_slot_limit() from public, anon;

drop trigger if exists workout_routines_slot_limit on public.workout_routines;
create trigger workout_routines_slot_limit
  before insert on public.workout_routines
  for each row execute function public.enforce_routine_slot_limit();

-- ── 레벨 보상 전환은 여기 없다 → 0057 ────────────────────────
--
-- routine_slot_1/2를 'coming_soon' → 'active'로 바꾸는 일은 **앱을 배포하는
-- 시점**에 해야 한다. 이 파일에 같이 넣었다가 개발 확인용으로 먼저 Run하면,
-- 아직 루틴 기능이 없는 **운영 앱에 즉시 "해금됨"이 뜬다.** 0022가
-- 'coming_soon'을 만든 이유가 정확히 그것(미구현 보상을 실사용 기능처럼
-- 노출하지 않는다)이므로 파일을 나눴다.
--
-- 이 파일(0056)은 언제 Run해도 안전하다. 새 테이블이라 운영에 떠 있는
-- 앱은 참조하지 않는다.

-- ── 적용 확인 (Run 후 결과를 눈으로 볼 것) ───────────────────
-- 기대: 1행, workout_routines / rls_enabled=true / 트리거 2개
select
  c.relname                                            as table_name,
  c.relrowsecurity                                     as rls_enabled,
  (select count(*) from pg_trigger t
    where t.tgrelid = c.oid and not t.tgisinternal)     as trigger_count,
  (select count(*) from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'workout_routines')             as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'workout_routines';
