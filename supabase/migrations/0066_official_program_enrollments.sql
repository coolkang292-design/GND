-- 0066: 공식 6주 프로그램 등록과 남은 일정 원자 재배치
-- 적용: 사용자 승인 뒤 SQL Editor에 전체 붙여넣기 -> Run (1회).
-- 주의: 이 파일은 운영 Supabase에 적용되기 전까지 실 DB 검사 스크립트를 실행하지 않는다.

begin;

-- ── 등록 스냅샷 ──────────────────────────────────────────────

create table public.program_enrollments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  program_key text not null
    check (char_length(btrim(program_key)) between 1 and 60),
  program_version int not null check (program_version between 1 and 10000),
  title_snapshot text not null
    check (char_length(btrim(title_snapshot)) between 1 and 80),
  level_at_start text not null
    check (level_at_start in ('beginner', 'experienced')),
  start_date date not null,
  timezone text not null check (char_length(btrim(timezone)) between 1 and 60),
  preferred_slots jsonb not null
    check (
      jsonb_typeof(preferred_slots) = 'array'
      and jsonb_array_length(preferred_slots) = 3
      and octet_length(preferred_slots::text) <= 2000
    ),
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'active' and completed_at is null and cancelled_at is null)
    or (status = 'completed' and completed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and completed_at is null and cancelled_at is not null)
  )
);

create unique index program_enrollments_one_active_version
  on public.program_enrollments (user_id, program_key, program_version)
  where status = 'active';

create index program_enrollments_user_recent
  on public.program_enrollments (user_id, created_at desc);

create trigger program_enrollments_updated_at
  before update on public.program_enrollments
  for each row execute function public.set_updated_at();

alter table public.program_enrollments enable row level security;

-- 등록/상태 변경은 검증 RPC만 통과시킨다. RLS 정책 네 개를 모두 두되,
-- authenticated에는 SELECT만 부여해 REST 직접 쓰기로 RPC 검증을 우회할 수 없다.
-- 네 정책은 본인 전용 의도를 문서화하지만, 실제 쓰기 차단의 핵심은 아래 테이블
-- privilege 회수다. 미래 마이그레이션에서 INSERT/UPDATE/DELETE를 다시 grant하면
-- RPC 검증 우회가 열리므로 적용 확인 쿼리도 세 privilege가 false인지 검사한다.
revoke all on public.program_enrollments from public, anon, authenticated;
grant select on public.program_enrollments to authenticated;

create policy "program_enrollments_select_own" on public.program_enrollments
  for select using (user_id = auth.uid());

create policy "program_enrollments_insert_own" on public.program_enrollments
  for insert with check (user_id = auth.uid());

create policy "program_enrollments_update_own" on public.program_enrollments
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "program_enrollments_delete_own" on public.program_enrollments
  for delete using (user_id = auth.uid());

-- ── 날짜별 계획에 프로그램 메타데이터 추가 ──────────────────

alter table public.workout_plans
  add column title text
    check (title is null or char_length(btrim(title)) between 1 and 80),
  add column scheduled_at timestamptz,
  add column program_enrollment_id uuid
    references public.program_enrollments (id) on delete set null,
  add column program_week smallint check (program_week between 1 and 6),
  add column program_session smallint check (program_session between 1 and 3),
  add column program_template_version int
    check (program_template_version between 1 and 10000);

-- FK가 ON DELETE SET NULL이므로 enrollment 삭제 뒤 스냅샷 메타는 남을 수 있다.
-- 연결된 행에 대해서만 필수 메타의 완전성을 강제하고, authenticated 직접 쓰기는
-- 아래 RLS가 별도로 모두 null만 허용한다.
alter table public.workout_plans
  add constraint workout_plans_program_meta_complete check (
    program_enrollment_id is null
    or (
      program_week is not null
      and program_session is not null
      and program_template_version is not null
      and title is not null
      and scheduled_at is not null
    )
  );

create unique index workout_plans_program_slot
  on public.workout_plans (program_enrollment_id, program_week, program_session)
  where program_enrollment_id is not null;

-- 일반 예정표의 기존 CRUD는 유지한다. 다만 프로그램 연결·주차·회차·버전은
-- security definer RPC만 쓸 수 있고, 연결된 계획의 날짜 PATCH도 막는다.
drop policy "workout_plans_insert_own" on public.workout_plans;
create policy "workout_plans_insert_own" on public.workout_plans
  for insert with check (
    user_id = auth.uid()
    and program_enrollment_id is null
    and program_week is null
    and program_session is null
    and program_template_version is null
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

drop policy "workout_plans_update_own" on public.workout_plans;
create policy "workout_plans_update_own" on public.workout_plans
  for update using (
    user_id = auth.uid()
    and program_enrollment_id is null
  )
  with check (
    user_id = auth.uid()
    and program_enrollment_id is null
    and program_week is null
    and program_session is null
    and program_template_version is null
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

-- ── 원자 등록 RPC ─────────────────────────────────────────────

create or replace function public.create_program_enrollment(
  p_program_key text,
  p_program_version int,
  p_title_snapshot text,
  p_level_at_start text,
  p_start_date date,
  p_timezone text,
  p_preferred_slots jsonb,
  p_plans jsonb
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_enrollment_id uuid := pg_catalog.gen_random_uuid();
  v_today date;
  v_plan jsonb;
  v_plan_index bigint;
  v_plan_date date;
  v_scheduled_at timestamptz;
  v_previous_date date := null;
  v_dates date[] := array[]::date[];
  v_conflict_date date;
  v_week int;
  v_session int;
  v_exercise jsonb;
  v_set jsonb;
  v_prescription jsonb;
  v_bad_count int;
  v_local_time text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  -- 같은 사용자의 RPC끼리는 충돌 검증과 삽입을 한 줄로 세운다.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  if p_program_key is null
    or p_program_key <> btrim(p_program_key)
    or p_program_key !~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$'
    or char_length(p_program_key) > 60 then
    raise exception 'program_invalid_key';
  end if;
  if p_program_version is null or p_program_version not between 1 and 10000 then
    raise exception 'program_invalid_version';
  end if;
  if p_title_snapshot is null
    or char_length(btrim(p_title_snapshot)) not between 1 and 80 then
    raise exception 'program_invalid_title';
  end if;
  if p_level_at_start is null
    or p_level_at_start not in ('beginner', 'experienced') then
    raise exception 'program_invalid_level';
  end if;
  if p_timezone is null
    or char_length(btrim(p_timezone)) not between 1 and 60
    or not exists (
      select 1 from pg_catalog.pg_timezone_names tz where tz.name = p_timezone
    ) then
    raise exception 'program_invalid_timezone';
  end if;

  v_today := (now() at time zone p_timezone)::date;
  if p_start_date is null
    or p_start_date < v_today
    or p_start_date > v_today + 365 then
    raise exception 'program_invalid_start_date';
  end if;

  if p_preferred_slots is null
    or jsonb_typeof(p_preferred_slots) <> 'array'
    or jsonb_array_length(p_preferred_slots) <> 3
    or octet_length(p_preferred_slots::text) > 2000 then
    raise exception 'program_slots_count';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_preferred_slots) slot
    where jsonb_typeof(slot) is distinct from 'object'
      or not (slot ?& array['weekday', 'time'])
      or jsonb_typeof(slot->'weekday') is distinct from 'number'
      or (slot->>'weekday') !~ '^[0-6]$'
      or jsonb_typeof(slot->'time') is distinct from 'string'
      or (slot->>'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ) then
    raise exception 'program_invalid_slot';
  end if;
  select count(distinct (slot->>'weekday')::int)
    into v_bad_count
  from jsonb_array_elements(p_preferred_slots) slot;
  if v_bad_count <> 3 then
    raise exception 'program_slot_weekday_duplicate';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_preferred_slots) a
    cross join jsonb_array_elements(p_preferred_slots) b
    where (a->>'weekday')::int < (b->>'weekday')::int
      and least(
        abs((a->>'weekday')::int - (b->>'weekday')::int),
        7 - abs((a->>'weekday')::int - (b->>'weekday')::int)
      ) < 2
  ) then
    raise exception 'program_recovery_gap';
  end if;

  if p_plans is null
    or jsonb_typeof(p_plans) <> 'array'
    or jsonb_array_length(p_plans) <> 18
    or octet_length(p_plans::text) > 512000 then
    raise exception 'program_plans_count';
  end if;

  for v_plan, v_plan_index in
    select value, ordinality
    from jsonb_array_elements(p_plans) with ordinality
  loop
    if jsonb_typeof(v_plan) is distinct from 'object'
      or not (v_plan ?& array[
        'plan_date', 'scheduled_at', 'week', 'session', 'template_key',
        'title', 'exercises'
      ])
      or jsonb_typeof(v_plan->'week') is distinct from 'number'
      or (v_plan->>'week') !~ '^[1-6]$'
      or jsonb_typeof(v_plan->'session') is distinct from 'number'
      or (v_plan->>'session') !~ '^[1-3]$' then
      raise exception 'program_invalid_slot_meta';
    end if;
    v_week := (v_plan->>'week')::int;
    v_session := (v_plan->>'session')::int;
    if v_week <> ((v_plan_index - 1) / 3)::int + 1
      or v_session <> ((v_plan_index - 1) % 3)::int + 1
      or jsonb_typeof(v_plan->'template_key') is distinct from 'string'
      or v_plan->>'template_key' <> (array['A', 'B', 'C'])[v_session] then
      raise exception 'program_invalid_slot_order';
    end if;
    if jsonb_typeof(v_plan->'plan_date') is distinct from 'string'
      or (v_plan->>'plan_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'program_invalid_plan_date';
    end if;
    begin
      v_plan_date := (v_plan->>'plan_date')::date;
    exception when others then
      raise exception 'program_invalid_plan_date';
    end;
    if v_plan_date::text <> v_plan->>'plan_date'
      or v_plan_date < v_today
      or v_plan_date < p_start_date
      or v_plan_date > p_start_date + 180 then
      raise exception 'program_invalid_plan_date';
    end if;
    if v_plan_date = any(v_dates) then
      raise exception 'program_plan_date_duplicate:%', v_plan_date;
    end if;
    if v_previous_date is not null and v_plan_date - v_previous_date < 2 then
      raise exception 'program_recovery_gap';
    end if;
    v_dates := array_append(v_dates, v_plan_date);
    v_previous_date := v_plan_date;

    if jsonb_typeof(v_plan->'scheduled_at') is distinct from 'string' then
      raise exception 'program_invalid_scheduled_at';
    end if;
    begin
      v_scheduled_at := (v_plan->>'scheduled_at')::timestamptz;
    exception when others then
      raise exception 'program_invalid_scheduled_at';
    end;
    if (v_scheduled_at at time zone p_timezone)::date <> v_plan_date then
      raise exception 'program_scheduled_date_mismatch';
    end if;
    v_local_time := to_char(v_scheduled_at at time zone p_timezone, 'HH24:MI');
    if not exists (
      select 1 from jsonb_array_elements(p_preferred_slots) slot
      where slot->>'time' = v_local_time
    ) then
      raise exception 'program_scheduled_time_mismatch';
    end if;

    if jsonb_typeof(v_plan->'title') is distinct from 'string'
      or char_length(btrim(v_plan->>'title')) not between 1 and 80 then
      raise exception 'program_invalid_plan_title';
    end if;
    if jsonb_typeof(v_plan->'exercises') is distinct from 'array'
      or jsonb_array_length(v_plan->'exercises') not between 5 and 6
      or octet_length((v_plan->'exercises')::text) > 200000 then
      raise exception 'program_invalid_exercises';
    end if;

    for v_exercise in select value from jsonb_array_elements(v_plan->'exercises')
    loop
      if jsonb_typeof(v_exercise) is distinct from 'object'
        or not (v_exercise ?& array[
          'name', 'bodyPart', 'exerciseType', 'measure', 'isCustom', 'sets',
          'prescription'
        ])
        or jsonb_typeof(v_exercise->'name') is distinct from 'string'
        or char_length(btrim(v_exercise->>'name')) not between 1 and 40
        or jsonb_typeof(v_exercise->'bodyPart') is distinct from 'string'
        or v_exercise->>'bodyPart' not in ('가슴','등','하체','어깨','팔','코어','유산소')
        or jsonb_typeof(v_exercise->'exerciseType') is distinct from 'string'
        or v_exercise->>'exerciseType' not in ('weight','bodyweight','cardio')
        or not (v_exercise ? 'measure')
        or not (
          v_exercise->'measure' = 'null'::jsonb
          or v_exercise->>'measure' in ('reps','time')
        )
        or jsonb_typeof(v_exercise->'isCustom') is distinct from 'boolean'
        or (v_exercise->>'isCustom')::boolean
        or jsonb_typeof(v_exercise->'sets') is distinct from 'array'
        or jsonb_array_length(v_exercise->'sets') not between 1 and 4
        or jsonb_typeof(v_exercise->'prescription') is distinct from 'object' then
        raise exception 'program_invalid_exercise_shape';
      end if;

      for v_set in select value from jsonb_array_elements(v_exercise->'sets')
      loop
        if jsonb_typeof(v_set) is distinct from 'object'
          or not (v_set ?& array[
            'weightKg', 'reps', 'distanceKm', 'durationMin'
          ])
          or jsonb_typeof(v_set->'weightKg') is distinct from 'number'
          or (v_set->>'weightKg')::numeric < 0
          or jsonb_typeof(v_set->'reps') is distinct from 'number'
          or (v_set->>'reps')::numeric < 0
          or jsonb_typeof(v_set->'distanceKm') is distinct from 'number'
          or (v_set->>'distanceKm')::numeric < 0
          or jsonb_typeof(v_set->'durationMin') is distinct from 'number'
          or (v_set->>'durationMin')::numeric < 0 then
          raise exception 'program_invalid_set_shape';
        end if;
      end loop;

      v_prescription := v_exercise->'prescription';
      if not (v_prescription ?& array[
          'repsMin', 'repsMax', 'targetRir', 'restSeconds', 'loadStepKg'
        ])
        or jsonb_typeof(v_prescription->'repsMin') is distinct from 'number'
        or (v_prescription->>'repsMin') !~ '^[0-9]+$'
        or (v_prescription->>'repsMin')::int not between 1 and 100
        or jsonb_typeof(v_prescription->'repsMax') is distinct from 'number'
        or (v_prescription->>'repsMax') !~ '^[0-9]+$'
        or (v_prescription->>'repsMax')::int not between 1 and 100
        or (v_prescription->>'repsMin')::int > (v_prescription->>'repsMax')::int
        or jsonb_typeof(v_prescription->'targetRir') is distinct from 'number'
        or (v_prescription->>'targetRir') not in ('1','2','3')
        or jsonb_typeof(v_prescription->'restSeconds') is distinct from 'number'
        or (v_prescription->>'restSeconds') !~ '^[0-9]+$'
        or (v_prescription->>'restSeconds')::int not between 60 and 300
        or jsonb_typeof(v_prescription->'loadStepKg') is distinct from 'number'
        or (v_prescription->>'loadStepKg') not in ('1','2.5','5') then
        raise exception 'program_invalid_prescription';
      end if;
    end loop;
  end loop;

  if exists (
    select 1 from public.program_enrollments
    where user_id = v_user_id
      and program_key = p_program_key
      and program_version = p_program_version
      and status = 'active'
  ) then
    raise exception 'program_already_active';
  end if;

  select min(plan_date) into v_conflict_date
  from public.workout_plans
  where user_id = v_user_id and plan_date = any(v_dates);
  if v_conflict_date is not null then
    raise exception 'program_plan_date_taken:%', v_conflict_date;
  end if;

  begin
    insert into public.program_enrollments (
      id, user_id, program_key, program_version, title_snapshot,
      level_at_start, start_date, timezone, preferred_slots
    ) values (
      v_enrollment_id, v_user_id, p_program_key, p_program_version,
      btrim(p_title_snapshot), p_level_at_start, p_start_date, p_timezone,
      p_preferred_slots
    );
  exception when unique_violation then
    raise exception 'program_already_active';
  end;

  for v_plan in select value from jsonb_array_elements(p_plans)
  loop
    begin
      insert into public.workout_plans (
        user_id, plan_date, source_session_id, exercises, title, scheduled_at,
        program_enrollment_id, program_week, program_session,
        program_template_version
      ) values (
        v_user_id,
        (v_plan->>'plan_date')::date,
        null,
        v_plan->'exercises',
        btrim(v_plan->>'title'),
        (v_plan->>'scheduled_at')::timestamptz,
        v_enrollment_id,
        (v_plan->>'week')::smallint,
        (v_plan->>'session')::smallint,
        p_program_version
      );
    exception when unique_violation then
      raise exception 'program_plan_date_taken:%', v_plan->>'plan_date';
    end;
  end loop;

  return v_enrollment_id;
end;
$$;

revoke all on function public.create_program_enrollment(
  text, int, text, text, date, text, jsonb, jsonb
) from public, anon;
grant execute on function public.create_program_enrollment(
  text, int, text, text, date, text, jsonb, jsonb
) to authenticated;

-- ── 남은 일정 재배치 RPC ─────────────────────────────────────
-- 현재 앱은 예정표를 완료하면 해당 workout_plans 행을 삭제한다. 따라서 완료
-- 회차는 이 RPC의 대상 행으로 존재하지 않아 plan_not_found로 보호된다. 별도
-- 완료 FK가 생기기 전까지 DB가 "삭제된 완료"와 "직접 삭제"를 구분할 수는 없다.

create or replace function public.reschedule_program_plans(
  p_enrollment_id uuid,
  p_moves jsonb
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_enrollment public.program_enrollments%rowtype;
  v_today date;
  v_move jsonb;
  v_move_index bigint;
  v_plan_id uuid;
  v_plan_ids uuid[] := array[]::uuid[];
  v_target_date date;
  v_target_dates date[] := array[]::date[];
  v_scheduled_at timestamptz;
  v_conflict_date date;
  v_bad_count int;
  v_temp_date date;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_enrollment_id is null then
    raise exception 'program_enrollment_not_found';
  end if;
  if p_moves is null
    or jsonb_typeof(p_moves) <> 'array'
    or jsonb_array_length(p_moves) not between 1 and 18
    or octet_length(p_moves::text) > 100000 then
    raise exception 'program_invalid_moves';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select * into v_enrollment
  from public.program_enrollments
  where id = p_enrollment_id
    and user_id = v_user_id
    and status = 'active'
  for update;
  if not found then
    raise exception 'program_enrollment_not_found';
  end if;
  v_today := (now() at time zone v_enrollment.timezone)::date;

  for v_move, v_move_index in
    select value, ordinality
    from jsonb_array_elements(p_moves) with ordinality
  loop
    if jsonb_typeof(v_move) is distinct from 'object'
      or not (v_move ?& array['plan_id', 'plan_date', 'scheduled_at'])
      or jsonb_typeof(v_move->'plan_id') is distinct from 'string'
      or (v_move->>'plan_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'program_invalid_plan_id';
    end if;
    v_plan_id := (v_move->>'plan_id')::uuid;
    if v_plan_id = any(v_plan_ids) then
      raise exception 'program_move_plan_duplicate';
    end if;
    if not exists (
      select 1 from public.workout_plans
      where id = v_plan_id
        and user_id = v_user_id
        and program_enrollment_id = p_enrollment_id
    ) then
      raise exception 'program_plan_not_found';
    end if;
    v_plan_ids := array_append(v_plan_ids, v_plan_id);

    if jsonb_typeof(v_move->'plan_date') is distinct from 'string'
      or (v_move->>'plan_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'program_invalid_plan_date';
    end if;
    begin
      v_target_date := (v_move->>'plan_date')::date;
    exception when others then
      raise exception 'program_invalid_plan_date';
    end;
    if v_target_date::text <> v_move->>'plan_date'
      or v_target_date < v_today
      or v_target_date > v_today + 730 then
      raise exception 'program_invalid_plan_date';
    end if;
    if v_target_date = any(v_target_dates) then
      raise exception 'program_plan_date_duplicate:%', v_target_date;
    end if;
    v_target_dates := array_append(v_target_dates, v_target_date);

    if jsonb_typeof(v_move->'scheduled_at') is distinct from 'string' then
      raise exception 'program_invalid_scheduled_at';
    end if;
    begin
      v_scheduled_at := (v_move->>'scheduled_at')::timestamptz;
    exception when others then
      raise exception 'program_invalid_scheduled_at';
    end;
    if (v_scheduled_at at time zone v_enrollment.timezone)::date <> v_target_date then
      raise exception 'program_scheduled_date_mismatch';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(v_enrollment.preferred_slots) slot
      where slot->>'time' = to_char(
        v_scheduled_at at time zone v_enrollment.timezone,
        'HH24:MI'
      )
    ) then
      raise exception 'program_scheduled_time_mismatch';
    end if;
  end loop;

  -- 옮기는 행 자신의 기존 날짜는 충돌에서 제외한다. 옮기지 않는 같은 프로그램
  -- 회차와 다른 모든 계획은 그대로 충돌 대상이다.
  select min(plan_date) into v_conflict_date
  from public.workout_plans
  where user_id = v_user_id
    and plan_date = any(v_target_dates)
    and not (id = any(v_plan_ids));
  if v_conflict_date is not null then
    raise exception 'program_plan_date_taken:%', v_conflict_date;
  end if;

  -- 실제 UPDATE 전에 최종 주차·회차 순서와 최소 48시간(날짜 차이 2일)을 검증한다.
  select count(*) into v_bad_count
  from (
    select final_date,
      lag(final_date) over (order by program_week, program_session) as previous_date
    from (
      select wp.program_week, wp.program_session,
        coalesce(
          (
            select (move->>'plan_date')::date
            from jsonb_array_elements(p_moves) move
            where (move->>'plan_id')::uuid = wp.id
          ),
          wp.plan_date
        ) as final_date
      from public.workout_plans wp
      where wp.user_id = v_user_id
        and wp.program_enrollment_id = p_enrollment_id
    ) final_rows
  ) ordered_rows
  where previous_date is not null
    and final_date - previous_date < 2;
  if v_bad_count > 0 then
    raise exception 'program_recovery_gap';
  end if;

  -- 기존 enrollment 안에서 날짜를 서로 넘겨받는 연쇄 이동도 허용하려고 잠시
  -- 사용자에게 허용하지 않는 9999년 임시 날짜로 옮긴 뒤 최종 날짜를 쓴다.
  if exists (
    select 1 from public.workout_plans
    where user_id = v_user_id
      and plan_date between date '9999-01-01' and date '9999-01-18'
      and not (id = any(v_plan_ids))
  ) then
    raise exception 'program_temp_date_taken';
  end if;

  for v_move, v_move_index in
    select value, ordinality
    from jsonb_array_elements(p_moves) with ordinality
  loop
    v_temp_date := date '9999-01-01' + (v_move_index::int - 1);
    update public.workout_plans
    set plan_date = v_temp_date,
        scheduled_at = v_temp_date::timestamp at time zone v_enrollment.timezone
    where id = (v_move->>'plan_id')::uuid
      and user_id = v_user_id
      and program_enrollment_id = p_enrollment_id;
  end loop;

  for v_move in select value from jsonb_array_elements(p_moves)
  loop
    update public.workout_plans
    set plan_date = (v_move->>'plan_date')::date,
        scheduled_at = (v_move->>'scheduled_at')::timestamptz
    where id = (v_move->>'plan_id')::uuid
      and user_id = v_user_id
      and program_enrollment_id = p_enrollment_id;
    if not found then
      raise exception 'program_plan_not_found';
    end if;
  end loop;
end;
$$;

revoke all on function public.reschedule_program_plans(uuid, jsonb)
  from public, anon;
grant execute on function public.reschedule_program_plans(uuid, jsonb)
  to authenticated;

-- 기존 단일 계획 이동 RPC로 프로그램의 회복 간격 검증을 우회하지 못하게 한다.
create or replace function public.move_workout_plan(
  p_plan_id uuid,
  p_target_date date,
  p_replace boolean default false
)
returns public.workout_plans
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_plan public.workout_plans%rowtype;
  v_existing_id uuid;
  v_existing_enrollment_id uuid;
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
  if v_plan.program_enrollment_id is not null then
    raise exception 'program_plan_use_reschedule';
  end if;

  select id, program_enrollment_id
    into v_existing_id, v_existing_enrollment_id
  from public.workout_plans
  where user_id = auth.uid()
    and plan_date = p_target_date
    and id <> p_plan_id
  for update;

  if v_existing_id is not null and not coalesce(p_replace, false) then
    raise exception 'plan_date_taken';
  end if;

  if v_existing_enrollment_id is not null then
    raise exception 'program_plan_use_reschedule';
  end if;

  if v_existing_id is not null then
    delete from public.workout_plans where id = v_existing_id;
  end if;

  update public.workout_plans
  set plan_date = p_target_date,
      scheduled_at = null
  where id = p_plan_id
  returning * into v_plan;

  return v_plan;
end;
$$;

revoke all on function public.move_workout_plan(uuid, date, boolean)
  from public, anon;
grant execute on function public.move_workout_plan(uuid, date, boolean)
  to authenticated;

notify pgrst, 'reload schema';

-- 적용 확인: 1행, rls_enabled=true, policy_count=4, active_index=1,
-- authenticated_can_insert/update/delete=false.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'program_enrollments') as policy_count,
  (select count(*) from pg_indexes i
    where i.schemaname = 'public'
      and i.indexname = 'program_enrollments_one_active_version') as active_index,
  has_table_privilege('authenticated', 'public.program_enrollments', 'insert')
    as authenticated_can_insert,
  has_table_privilege('authenticated', 'public.program_enrollments', 'update')
    as authenticated_can_update,
  has_table_privilege('authenticated', 'public.program_enrollments', 'delete')
    as authenticated_can_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'program_enrollments';

commit;
