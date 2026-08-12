-- 0073: 주당 횟수를 사용자가 정한다 — 2~5회 (사용자 확정 2026-08-12)
-- 적용: 사용자가 Supabase SQL Editor에서 이 파일 전체를 한 번 Run한다.
--
-- 왜: 주 3회가 화면·RPC·테이블 check 세 곳에 박혀 있었다. 사람마다 낼 수 있는
--     시간이 다른데 앱이 3일을 강요했다.
--
-- ⚠️ **총 18회는 그대로다.** 주당 횟수는 18회를 며칠에 나눠 담을지만 정하고,
--    기간이 그만큼 늘거나 줄어든다 (주 2회 → 약 9주, 주 5회 → 약 4주).
--
-- ⚠️ **회차 번호는 안 바뀐다.** `program_week`(1~6)·`program_session`(1~3)은
--    주당 횟수와 무관하다 — 배치는 날짜 순서로 18칸을 채우고 A·B·C를 돌 뿐이라
--    주 2회든 5회든 같은 번호가 나온다. 그래서 0066의 컬럼 제약과 회차 순서
--    검사(`program_invalid_slot_order`)를 **하나도 건드리지 않는다.**
--
-- ⚠️ 상한 5는 회복 때문이 아니라 A·B·C 세 회차 구성 때문이다. 주 6~7회면 한 주에
--    같은 회차를 세 번 하게 되어 프로그램이 의미를 잃는다.
--
-- 바뀐 것
--   ① program_enrollments.preferred_slots check — 길이 3 → 2~5
--   ② create_program_enrollment — 슬롯 길이 3 → 2~5
--   ③ create_program_enrollment — 서로 다른 요일 수를 **슬롯 개수와** 비교
--                                 (3 고정이 아니라)
--
-- ⚠️ 기존 등록 행은 전부 슬롯 3개라 넓힌 check를 그대로 통과한다.
-- ⚠️ 적용된 0066~0072는 고치지 않는다. 함수를 여기서 다시 만든다. 본문은
--    `docs/db-current-schema.sql`의 현행 정의(0072 적용 뒤 실측)에서 기계적으로
--    옮기고 위 두 곳만 바꿨다.
--
-- ⚠️ 배포 순서: 이 SQL을 먼저 Run하고 앱을 배포한다. 반대로 하면 사용자가
--    주 2·4·5회를 고를 수 있는데 서버가 등록을 거절한다.

begin;

-- ① 슬롯 개수 2~5 — 기존 3개짜리 행은 그대로 통과한다
alter table public.program_enrollments
  drop constraint if exists program_enrollments_preferred_slots_check;
alter table public.program_enrollments
  add constraint program_enrollments_preferred_slots_check
  check (
    jsonb_typeof(preferred_slots) = 'array'
    and jsonb_array_length(preferred_slots) between 2 and 5
    and octet_length(preferred_slots::text) <= 2000
  );

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
  v_tabata_minutes smallint;
  v_is_interval boolean;
  v_interval_plans int := 0;
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
    or p_level_at_start not in ('beginner', 'moderate', 'experienced') then
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
    or jsonb_array_length(p_preferred_slots) not between 2 and 5
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
  if v_bad_count <> jsonb_array_length(p_preferred_slots) then
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

    -- 0070: `tabata_minutes`가 있으면 인터벌 회차다. 이 한 컬럼이 판별자다.
    if v_plan ? 'tabata_minutes'
      and v_plan->'tabata_minutes' is distinct from 'null'::jsonb then
      if jsonb_typeof(v_plan->'tabata_minutes') is distinct from 'number'
        or (v_plan->>'tabata_minutes') not in ('4', '8', '16') then
        raise exception 'program_invalid_tabata_minutes';
      end if;
      v_tabata_minutes := (v_plan->>'tabata_minutes')::smallint;
    else
      v_tabata_minutes := null;
    end if;
    v_is_interval := v_tabata_minutes is not null;
    if v_is_interval then
      v_interval_plans := v_interval_plans + 1;
    end if;

    if jsonb_typeof(v_plan->'title') is distinct from 'string'
      or char_length(btrim(v_plan->>'title')) not between 1 and 80 then
      raise exception 'program_invalid_plan_title';
    end if;
    if jsonb_typeof(v_plan->'exercises') is distinct from 'array'
      or (v_is_interval
          and jsonb_array_length(v_plan->'exercises') <> 4)
      or (not v_is_interval
          and jsonb_array_length(v_plan->'exercises') not between 5 and 6)
      or octet_length((v_plan->'exercises')::text) > 200000 then
      raise exception 'program_invalid_exercises';
    end if;

    for v_exercise in select value from jsonb_array_elements(v_plan->'exercises')
    loop
      if jsonb_typeof(v_exercise) is distinct from 'object'
        or not (v_exercise ?& array[
          'name', 'bodyPart', 'exerciseType', 'measure', 'isCustom', 'sets'
        ])
        or (not v_is_interval and not (v_exercise ? 'prescription'))
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
        or (v_is_interval
            and jsonb_array_length(v_exercise->'sets') <> 1)
        or (not v_is_interval
            and jsonb_array_length(v_exercise->'sets') not between 1 and 4)
        or (not v_is_interval
            and jsonb_typeof(v_exercise->'prescription')
                is distinct from 'object') then
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

      -- 인터벌은 20초/10초를 음원이 정한다 — 처방을 요구하지 않는다
      if not v_is_interval then
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
      end if;
    end loop;
  end loop;

  -- 한 등록 안에 두 모양이 섞이면 진행률·재배치·무게 추천이 회차마다 갈라진다
  if v_interval_plans not in (0, 18) then
    raise exception 'program_mixed_plan_kinds';
  end if;

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
        tabata_minutes,
        program_enrollment_id, program_week, program_session,
        program_template_version
      ) values (
        v_user_id,
        (v_plan->>'plan_date')::date,
        null,
        v_plan->'exercises',
        btrim(v_plan->>'title'),
        (v_plan->>'scheduled_at')::timestamptz,
        case
          when v_plan ? 'tabata_minutes'
            and v_plan->'tabata_minutes' is distinct from 'null'::jsonb
          then (v_plan->>'tabata_minutes')::smallint
        end,
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
-- 권한은 0066·0069·0070과 같은 규약이다.
revoke all on function public.create_program_enrollment(
  text, int, text, text, date, text, jsonb, jsonb
) from public, anon;
grant execute on function public.create_program_enrollment(
  text, int, text, text, date, text, jsonb, jsonb
) to authenticated;

commit;

-- ── 적용 확인 (Run 뒤 따로 실행) ────────────────────────────
--
-- 1) 테이블 check가 2~5를 받는가 → between 2 and 5가 보여야 한다
-- select pg_get_constraintdef(c.oid)
--   from pg_constraint c
--   join pg_class t on t.oid = c.conrelid
--   join pg_namespace n on n.oid = t.relnamespace
--  where n.nspname = 'public'
--    and t.relname = 'program_enrollments'
--    and c.conname = 'program_enrollments_preferred_slots_check';
--
-- 2) RPC가 2~5를 받는가 → 1행이어야 한다
-- select p.proname
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname = 'create_program_enrollment'
--    and pg_get_functiondef(p.oid) like '%not between 2 and 5%';
--
-- 3) 권한 → authenticated=true, anon=false
-- select has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_execute
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'create_program_enrollment';
