-- 0101: 0100의 `pg_catalog.coalesce` 오류를 고친다 (2026-09-04)
-- 적용: 사용자가 Supabase SQL Editor에서 이 파일 전체를 한 번 Run한다.
--
-- ⛔ **0100을 적용했으면 프로그램 등록이 지금 전부 죽어 있다.** 사다리뿐
--    아니라 근력·인터벌 등록도 같이 막힌다 — 죽는 줄이 세 종류가 모두
--    지나가는 자리이기 때문이다. 이 파일이 그 한 줄을 고친다.
--
--      ERROR: function pg_catalog.coalesce(text, text) does not exist (42883)
--
-- 무엇이 틀렸나: **COALESCE는 함수가 아니라 SQL 문법 구조다.** CASE·NULLIF·
--   GREATEST·LEAST와 같은 부류라 `pg_catalog.`을 붙일 수 없다. 0100은
--   `SET search_path TO ''` 때문에 이름을 전부 스키마로 묶어야 한다고 보고
--   기계적으로 붙였는데, search_path가 적용되는 것은 **함수 이름**이지
--   문법 구조가 아니다. 저장소의 다른 coalesce는 전부 맨이름이다.
--
-- ⚠️ 이 오류는 **문법 검사로는 안 잡힌다.** plpgsql 본문은 CREATE 시점에
--    파싱만 하고 이름 해석은 실행할 때 한다 — 0100은 아무 경고 없이
--    "성공"으로 끝났고, 등록을 한 번 눌러 봐야 드러났다.
--
-- 바뀐 것
--   ① `pg_catalog.coalesce` → `coalesce` (위 오류)
--   ② 회차 수: 18 고정 → **근력·인터벌 18 · 사다리 24**
--      사장님 지적(2026-09-04): 18은 원문이 아니라 이 RPC의 제약에서 온
--      숫자였다. 원문 "5일 훈련 1일 휴식 × 4주"를 훈련일로 세면 24이고,
--      24회는 28일 = **정확히 4주**에 떨어진다. 제약이 프로그램을 줄이고
--      있었던 것이라 제약을 고친다.
--   ③ `program_week` 1~6 → **1~8** (24회 = 3개씩 8묶음).
--      RPC의 정규식과 `workout_plans` 컬럼 check **둘 다** 고친다
--   ④ `reschedule_program_plans`의 이동 개수 상한 18 → 24
--
-- ⚠️ 본문은 `docs/db-current-schema.sql`의 **현행 정의**(0100 적용 뒤 실측)를
--    프로그램으로 떠서 그 한 곳만 바꿨다. 눈으로 베끼지 않았다.
--
-- ⚠️ 0102(같은 날 여러 계획)는 이 파일과 **순서가 다르다** — 새 앱을 배포한
--    뒤에 Run한다. 0102 머리말 참조.

begin;

-- ③ 컬럼 제약 — 24회는 8묶음까지 간다. 기존 행(1~6)은 그대로 통과한다.
--
-- ⚠️ **이름으로 지우지 않는다.** 0066이 `check (program_week between 1 and 6)`을
--    컬럼에 인라인으로 붙였는데, 그때 Postgres가 붙인 이름을 저장소가 기록해
--    두지 않았다(`db:snapshot`은 테이블 check를 안 담는다). 이름을 찍었다가
--    틀리면 `drop ... if exists`가 **조용히 넘어가고** 옛 1~6 제약이 남는다 —
--    그러면 7·8주차 회차가 insert에서 거절되어 사다리 등록이 통째로 실패한다.
--    이름 대신 **정의로 찾아** 지운다.
do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'workout_plans'
       and c.contype = 'c'
       and pg_catalog.pg_get_constraintdef(c.oid) like '%program_week%'
  loop
    execute pg_catalog.format(
      'alter table public.workout_plans drop constraint %I', v_name
    );
  end loop;
end $$;

alter table public.workout_plans
  add constraint workout_plans_program_week_check
  check (program_week is null or program_week between 1 and 8);

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
  -- 0100: 사다리 회차 (종목 1 · 세트 5 · 세트마다 목표 횟수)
  v_kind text;
  v_ladder_plans int := 0;
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

  /*
    0101: 회차 수가 프로그램마다 다르다 — 근력·인터벌 18 · **사다리 24**.
    어느 쪽인지는 회차를 하나라도 읽어야(`plan_kind`) 알 수 있어서, 여기서는
    **둘 중 하나**인지만 보고 종류별 정확한 수는 루프가 끝난 뒤 확인한다.
  */
  if p_plans is null
    or jsonb_typeof(p_plans) <> 'array'
    or jsonb_array_length(p_plans) not in (18, 24)
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
      -- 0101: 24회 = 3개씩 8묶음. 컬럼 check도 1~8로 같이 넓혔다
      or (v_plan->>'week') !~ '^[1-8]$'
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

    /*
      0100: 회차 종류를 payload가 직접 말한다.

      `plan_kind`가 없으면 **예전 그대로** 판정한다(인터벌 아니면 근력) —
      이미 배포된 앱이 보내는 payload가 한 글자도 안 바뀌고 통과해야 하기
      때문이다. 사다리만 이 칸을 채워 보낸다.

      ⚠️ 인터벌은 `tabata_minutes`와 **서로를 증명해야** 한다. 한쪽만 오면
         회차 모양 검사와 실제 저장이 갈라진다.
    */
    /*
      ⚠️ `coalesce`에 **스키마를 붙이지 마라.** COALESCE는 함수가 아니라 SQL
         문법 구조라(CASE·NULLIF·GREATEST와 같은 부류) `pg_catalog.`를 붙이면
         42883으로 죽는다. `search_path = ''`가 걸려 있어도 마찬가지다 —
         search_path가 적용되는 것은 **함수 이름**이고 문법 구조는 아니다.
         0100이 정확히 이걸로 죽었다.
    */
    v_kind := coalesce(
      v_plan->>'plan_kind',
      case when v_is_interval then 'interval' else 'strength' end
    );
    if v_kind not in ('strength', 'interval', 'ladder')
      or (v_is_interval and v_kind <> 'interval')
      or (v_kind = 'interval' and not v_is_interval) then
      raise exception 'program_invalid_plan_kind';
    end if;
    if v_kind = 'interval' then
      v_interval_plans := v_interval_plans + 1;
    elsif v_kind = 'ladder' then
      v_ladder_plans := v_ladder_plans + 1;
    end if;

    if jsonb_typeof(v_plan->'title') is distinct from 'string'
      or char_length(btrim(v_plan->>'title')) not between 1 and 80 then
      raise exception 'program_invalid_plan_title';
    end if;
    -- 0100: 사다리는 종목이 **하나**다 — 풀업만 하는 프로그램이다
    if jsonb_typeof(v_plan->'exercises') is distinct from 'array'
      or (v_kind = 'interval'
          and jsonb_array_length(v_plan->'exercises') <> 4)
      or (v_kind = 'ladder'
          and jsonb_array_length(v_plan->'exercises') <> 1)
      or (v_kind = 'strength'
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
        or (v_kind <> 'interval' and not (v_exercise ? 'prescription'))
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
        or (v_kind = 'interval'
            and jsonb_array_length(v_exercise->'sets') <> 1)
        -- 0100: 원문이 "하루 5세트를 나누어"라고 세트 수까지 정한다
        or (v_kind = 'ladder'
            and jsonb_array_length(v_exercise->'sets') <> 5)
        or (v_kind = 'strength'
            and jsonb_array_length(v_exercise->'sets') not between 1 and 4)
        or (v_kind <> 'interval'
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

        /*
          0100: 사다리는 **세트의 횟수가 곧 처방**이다(5·4·3·2·1). 다른
          종류는 빈 세트(0회)를 깔고 처방이 범위를 주지만, 사다리에서 0회는
          "그날 아무것도 안 한다"는 뜻이 된다.
        */
        if v_kind = 'ladder'
          and ((v_set->>'reps')::numeric < 1
               or (v_set->>'reps')::numeric > 100) then
          raise exception 'program_invalid_ladder_set';
        end if;
      end loop;

      -- 인터벌은 20초/10초를 음원이 정한다 — 처방을 요구하지 않는다.
      -- 사다리는 요구한다 (0100) — 휴식·반복 범위를 기록 화면이 읽는다.
      if v_kind <> 'interval' then
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

  /*
    한 등록 안에 두 모양이 섞이면 진행률·재배치·무게 추천이 회차마다 갈라진다.
    "0 아니면 전부"로 본다 — 전체 개수가 18일 수도 24일 수도 있으므로
    상수와 비교하지 않고 **전체와** 비교한다.
  */
  if v_interval_plans not in (0, jsonb_array_length(p_plans))
    or v_ladder_plans not in (0, jsonb_array_length(p_plans)) then
    raise exception 'program_mixed_plan_kinds';
  end if;

  /*
    0101: 종류별 회차 수. 위 개수 검사는 18·24 둘 다 통과시키므로 여기서
    못 박는다. 사다리 24는 원문의 "5일 훈련 1일 휴식 × 4주"를 훈련일로 센
    값이고, 28일에 정확히 떨어진다.
  */
  if (v_ladder_plans > 0 and jsonb_array_length(p_plans) <> 24)
    or (v_ladder_plans = 0 and jsonb_array_length(p_plans) <> 18) then
    raise exception 'program_plans_count';
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

-- ④ 재배치 이동 개수 상한 — 사다리 24회를 통째로 다시 잡을 수 있어야 한다
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
    -- 0101: 사다리가 24회라 상한을 24로 넓힌다 (근력·인터벌 18은 그대로 통과)
    or jsonb_array_length(p_moves) not between 1 and 24
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

  -- 실제 UPDATE 전에 최종 주차·회차 순서를 검증한다.
  -- 0069: 예전에는 최소 48시간(2일)을 요구했다. 이제 같은 날 두 회차와
  --       날짜 역행만 막는다 — 연속 3일은 사용자가 고를 수 있다.
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
-- 권한은 0066·0069·0070·0073·0100과 같은 규약이다.
revoke all on function public.create_program_enrollment(
  text, int, text, text, date, text, jsonb, jsonb
) from public, anon;
grant execute on function public.create_program_enrollment(
  text, int, text, text, date, text, jsonb, jsonb
) to authenticated;
revoke all on function public.reschedule_program_plans(uuid, jsonb)
  from public, anon;
grant execute on function public.reschedule_program_plans(uuid, jsonb)
  to authenticated;

commit;

-- ── 적용 확인 (Run 뒤 따로 실행) ────────────────────────────
--
-- 1) 잘못된 호출이 사라졌는가 → **0행**이어야 한다
-- select p.proname
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname = 'create_program_enrollment'
--    and pg_get_functiondef(p.oid) like '%pg_catalog.coalesce%';
--
-- 2) 0100의 사다리 분기는 그대로인가 → 1행이어야 한다
-- select p.proname
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname = 'create_program_enrollment'
--    and pg_get_functiondef(p.oid) like '%program_invalid_ladder_set%';
--
-- 3) 권한 → anon=false, authenticated=true
-- select has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_execute
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'create_program_enrollment';
