-- ============================================================
-- 0015: 날짜별 운동 예정표 - 계정 동기화 + 본인 전용 RLS
-- 설계: docs/superpowers/specs/2026-07-18-calendar-workout-plans-design.md
-- 실행: Supabase Dashboard -> SQL Editor에 전체 붙여넣기 -> Run (1회)
-- ============================================================

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  plan_date date not null,
  source_session_id uuid
    references public.workout_sessions (id) on delete set null,
  exercises jsonb not null
    check (
      jsonb_typeof(exercises) = 'array'
      and jsonb_array_length(exercises) between 1 and 50
      and octet_length(exercises::text) <= 200000
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create index workout_plans_user_date
  on public.workout_plans (user_id, plan_date);

create trigger workout_plans_updated_at
  before update on public.workout_plans
  for each row execute function public.set_updated_at();

alter table public.workout_plans enable row level security;

revoke all on public.workout_plans from anon, authenticated;
grant select, insert, update, delete on public.workout_plans to authenticated;

create policy "workout_plans_select_own" on public.workout_plans
  for select using (user_id = auth.uid());

create policy "workout_plans_insert_own" on public.workout_plans
  for insert with check (
    user_id = auth.uid()
    and (
      source_session_id is null
      or public.owns_workout_session(source_session_id)
    )
    and plan_date >= (
      now() at time zone coalesce(
        (select timezone from public.profiles where id = auth.uid()),
        'Asia/Seoul'
      )
    )::date
  );

create policy "workout_plans_update_own" on public.workout_plans
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      source_session_id is null
      or public.owns_workout_session(source_session_id)
    )
    and plan_date >= (
      now() at time zone coalesce(
        (select timezone from public.profiles where id = auth.uid()),
        'Asia/Seoul'
      )
    )::date
  );

create policy "workout_plans_delete_own" on public.workout_plans
  for delete using (user_id = auth.uid());

-- 날짜 이동과 기존 예정표 교체를 한 트랜잭션에서 처리한다.
create or replace function public.move_workout_plan(
  p_plan_id uuid,
  p_target_date date,
  p_replace boolean default false
)
returns public.workout_plans
language plpgsql volatile security definer set search_path = public as $$
declare
  v_plan public.workout_plans%rowtype;
  v_existing_id uuid;
  v_today date;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select (now() at time zone coalesce(p.timezone, 'Asia/Seoul'))::date
    into v_today
  from public.profiles p
  where p.id = auth.uid();
  v_today := coalesce(v_today, (now() at time zone 'Asia/Seoul')::date);

  if p_target_date < v_today then
    raise exception 'past_plan_date';
  end if;

  select * into v_plan
  from public.workout_plans
  where id = p_plan_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'plan_not_found';
  end if;

  select id into v_existing_id
  from public.workout_plans
  where user_id = auth.uid()
    and plan_date = p_target_date
    and id <> p_plan_id
  for update;

  if v_existing_id is not null and not coalesce(p_replace, false) then
    raise exception 'plan_date_taken';
  end if;

  if v_existing_id is not null then
    delete from public.workout_plans where id = v_existing_id;
  end if;

  update public.workout_plans
  set plan_date = p_target_date
  where id = p_plan_id
  returning * into v_plan;

  return v_plan;
end $$;

revoke all on function public.move_workout_plan(uuid, date, boolean) from public;
grant execute on function public.move_workout_plan(uuid, date, boolean)
  to authenticated;
