-- 0069: 주 3회는 유지하되 운동일 간격 제한을 없앤다 (사용자 확정 2026-08-12)
-- 적용: 사용자가 Supabase SQL Editor에서 이 파일 전체를 한 번 Run한다.
--
-- 왜: 금·토·일처럼 몰아서 하는 사람을 앱이 막고 있었다. 주 3회라는 약속은
--     유지하되 **언제 하는지는 사용자가 정한다.**
--
-- ⚠️ 적용된 0066은 고치지 않는다. 두 함수를 여기서 통째로 다시 만든다.
--    본문은 `docs/db-current-schema.sql`의 현행 정의(0066 적용 뒤 실측)를
--    그대로 옮기고 **간격 검사 세 곳만** 바꿨다.
--
-- 바뀐 것
--   ① create_program_enrollment — 요일 간격 검사 블록 삭제
--   ② create_program_enrollment — 계획 날짜 간격 `< 2` → `< 1`
--                                 (오류명도 program_plan_date_order로)
--   ③ reschedule_program_plans  — 재배치 결과 간격 `< 2` → `< 1`
--
-- 바뀌지 않은 것: 서로 다른 요일 3개, 18회, 주차·회차 범위, 소유권·권한,
--                 원자성. 같은 날 두 회차는 여전히 막는다.
--
-- ⚠️ 배포 순서: 이 SQL을 먼저 Run하고 앱을 배포한다. 앱을 먼저 배포하면
--    사용자가 연속 요일을 고를 수 있는데 서버가 등록을 거절한다.

begin;

-- ── ① 등록 RPC 재정의 ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_program_enrollment(p_program_key text, p_program_version integer, p_title_snapshot text, p_level_at_start text, p_start_date date, p_timezone text, p_preferred_slots jsonb, p_plans jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- 0069: 요일 간격 제한 제거 (사용자 확정 2026-08-12).
  --       서로 다른 요일 3개 조건은 바로 위에서 이미 지킨다.

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
    -- 0069: 같은 날 두 회차와 날짜 역행만 막는다
    if v_previous_date is not null and v_plan_date - v_previous_date < 1 then
      raise exception 'program_plan_date_order';
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
$function$;

-- ── ② 재배치 RPC 재정의 ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reschedule_program_plans(p_enrollment_id uuid, p_moves jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and final_date - previous_date < 1;  -- 0069
  if v_bad_count > 0 then
    raise exception 'program_plan_date_order';
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
$function$;

-- 권한은 0066과 동일하게 다시 못 박는다 — create or replace는 기존 권한을
-- 유지하지만, 이 파일만 읽고도 최종 상태를 알 수 있어야 한다.
revoke all on function public.create_program_enrollment(
  text, int, text, text, date, text, jsonb, jsonb
) from public, anon;
grant execute on function public.create_program_enrollment(
  text, int, text, text, date, text, jsonb, jsonb
) to authenticated;

revoke all on function public.reschedule_program_plans(uuid, jsonb) from public, anon;
grant execute on function public.reschedule_program_plans(uuid, jsonb) to authenticated;


commit;

-- ── 적용 확인 (Run 뒤 따로 실행) ────────────────────────────
--
-- 1) 두 함수 본문에 회복 간격 검사가 남지 않았는가 → 0행이어야 한다
-- select p.proname
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('create_program_enrollment', 'reschedule_program_plans')
--    and pg_get_functiondef(p.oid) like '%program_recovery_gap%';
--
-- 2) 권한이 그대로인가 → authenticated=true, anon=false
-- select p.proname,
--        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_execute
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('create_program_enrollment', 'reschedule_program_plans');
