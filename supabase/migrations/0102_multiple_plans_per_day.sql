-- 0102: 같은 날에 계획을 여러 개 담는다 (사장님 지시 2026-09-04)
-- 적용: 사용자가 Supabase SQL Editor에서 이 파일 전체를 한 번 Run한다.
--
-- ⛔⛔ **순서가 반대다. 앱을 먼저 배포하고 이 SQL을 Run한다.** ⛔⛔
--
--   0073·0100·0101은 "SQL 먼저, 앱 나중"이었고 그것이 보통의 순서다.
--   여기는 **반대로 해야 한다.** 지금 운영 중인 앱은 계획을 저장할 때
--   `upsert(..., onConflict: "user_id,plan_date")`를 쓴다. 이 SQL이 그
--   unique 제약을 없애는 순간 Postgres가 42P10
--   ("no unique or exclusion constraint matching the ON CONFLICT
--   specification")로 거절한다 — **계획 저장·수정이 통째로 죽는다.**
--
--   새 앱은 upsert를 쓰지 않는다(만들기=insert, 고치기=update by id). 그래서
--   새 앱을 먼저 배포하면 제약이 있든 없든 둘 다 정상 동작한다.
--
--   배포 ~ Run 사이의 짧은 동안: 같은 날 **두 번째** 계획을 만들려 하면
--   23505가 난다. 화면은 "그날은 아직 계획을 하나만 담을 수 있어요"라고
--   알린다(`plan-save-error.ts`). 기존 기능은 하나도 안 막힌다.
--
-- 무엇 때문에: 오전에 풀업 5세트를 하고 인증한 뒤, 오후에 헬스장에서 가슴
--   루틴을 따로 하고 싶다. **기록(`workout_sessions`)은 이미 하루에 여러 번
--   된다** — 하루 1개 제약이 없다. 막혀 있던 것은 **계획**뿐이었다.
--
-- 바뀐 것
--   ① workout_plans: unique (user_id, plan_date) **삭제** (0015)
--      조회용 비유일 인덱스 workout_plans_user_date는 그대로 남는다
--   ② create_program_enrollment: 남의 계획이 있는 날짜를 거절하던 검사 삭제
--      (같은 등록 안의 날짜 중복은 그대로 막는다)
--   ③ move_workout_plan: 대상 날짜의 계획을 찾아 막거나 **지우던** 것 삭제
--      ⚠️ 이건 정리가 아니라 필수다 — `select ... into`가 같은 날 계획이
--         둘이면 21000으로 터진다
--   ④ reschedule_program_plans: 충돌 대상을 **같은 프로그램 회차로만** 축소
--
-- ⚠️ 함수 본문은 `docs/db-current-schema.sql`의 현행 정의(**0101 적용 뒤
--    실측**)를 프로그램으로 떠서 위 세 곳만 바꿨다. 눈으로 베끼지 않았다.
--
--    ⚠️⚠️ 이 파일을 처음 썼을 때는 0100·0101 **적용 전** 스냅샷에서 떴었다.
--       그대로 Run했으면 사다리 24회 지원과 주차 1~8을 **통째로 되돌렸을
--       것**이다. 같은 함수를 여러 마이그레이션이 덮어쓰는 구조에서는,
--       마이그레이션을 하나 적용할 때마다 **아직 안 낸 마이그레이션의 본문을
--       다시 떠야 한다.** 아래 확인 4번이 그 회귀를 잡는다.
--
-- ⚠️ 되돌리기: 같은 날 계획이 2개 이상인 행이 이미 있으면 unique 제약을
--    되살릴 수 없다. 먼저 아래로 확인하고 정리해야 한다.
--      select user_id, plan_date, count(*) from public.workout_plans
--       group by 1,2 having count(*) > 1;

begin;

-- ① 하루 1계획 제약을 없앤다 (0015). 조회 인덱스는 건드리지 않는다.
alter table public.workout_plans
  drop constraint if exists workout_plans_user_id_plan_date_key;

-- ② 프로그램 등록 — 남의 계획이 있는 날짜를 더는 거절하지 않는다
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

  /*
    0102: 등록하려는 날짜에 **다른 계획이 있어도 막지 않는다.**

    이 검사 때문에 진행 중인 프로그램이나 손으로 만든 계획이 하나만 겹쳐도
    등록 전체가 거절됐다. 오전 풀업 사다리와 저녁 근력 프로그램을 함께
    돌리는 것이 이 변경의 목적이다.

    ⚠️ **같은 등록 안**에서 날짜가 겹치는 것은 위에서 여전히 막는다
       (`program_plan_date_duplicate`·`program_plan_date_order`). 한 프로그램의
       두 회차가 같은 날 서는 것은 주 N회가 아니다.
  */
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
      -- 0102로 (user_id, plan_date) unique가 사라져 이 길은 이제 안 온다.
      -- 제약이 되살아나는 경우(복구·롤백)를 위해 남겨 둔다.
      raise exception 'program_plan_date_taken:%', v_plan->>'plan_date';
    end;
  end loop;

  return v_enrollment_id;
end;
$function$;

-- ③ 계획 옮기기 — 대상 날짜의 계획을 지우지도, 막지도 않는다
CREATE OR REPLACE FUNCTION public.move_workout_plan(p_plan_id uuid, p_target_date date, p_replace boolean DEFAULT false)
 RETURNS workout_plans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_plan public.workout_plans%rowtype;
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

  /*
    0102: 옮겨 갈 날짜에 계획이 있어도 **그냥 옮긴다.**

    예전에는 그 날짜의 계획을 찾아 `plan_date_taken`으로 막거나,
    `p_replace`면 **지웠다.** 하루에 계획을 하나만 둘 수 있었으니 둘 중
    하나를 골라야 했다. 이제는 나란히 선다.

    ⚠️ 위 `select ... into`는 지우기만 한 것이 아니라 **지워야만 했다.**
       같은 날 계획이 둘이면 `select into`가 21000(more than one row)으로
       터진다 — 제약을 푸는 순간 옮기기가 통째로 죽는 자리였다.

    ⚠️ `p_replace` 인자는 **남겨 둔다.** 서명을 바꾸면 배포 순서에 따라
       옛 앱이 함수를 못 찾는다. 값은 이제 아무 일도 하지 않는다.
  */

  update public.workout_plans
  set plan_date = p_target_date,
      scheduled_at = null
  where id = p_plan_id
  returning * into v_plan;

  return v_plan;
end;
$function$;

-- ④ 프로그램 회차 재배치 — 충돌은 같은 프로그램 안에서만 본다
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

  /*
    0102: 충돌 대상을 **같은 프로그램의 회차로만** 좁힌다.

    예전에는 다른 프로그램과 일반 계획까지 전부 충돌로 봤다. 이제 다른 계획
    옆에 나란히 설 수 있으므로 남의 계획을 피할 이유가 없다. 남는 규칙은
    "한 프로그램의 두 회차가 같은 날 서지 않는다" 하나이고, 그것은 아래
    `program_plan_date_order`가 최종 날짜로 다시 확인한다.
  */
  select min(plan_date) into v_conflict_date
  from public.workout_plans
  where user_id = v_user_id
    and program_enrollment_id = p_enrollment_id
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

-- 권한은 0066·0069·0070·0073·0100·0101과 같은 규약이다.
revoke all on function public.create_program_enrollment(
  text, int, text, text, date, text, jsonb, jsonb
) from public, anon;
grant execute on function public.create_program_enrollment(
  text, int, text, text, date, text, jsonb, jsonb
) to authenticated;
revoke all on function public.move_workout_plan(uuid, date, boolean)
  from public, anon;
grant execute on function public.move_workout_plan(uuid, date, boolean)
  to authenticated;
revoke all on function public.reschedule_program_plans(uuid, jsonb)
  from public, anon;
grant execute on function public.reschedule_program_plans(uuid, jsonb)
  to authenticated;

commit;

-- ── 적용 확인 (Run 뒤 따로 실행) ────────────────────────────
--
-- 1) 제약이 없어졌는가 → **0행**이어야 한다
-- select conname from pg_constraint c
--   join pg_class t on t.oid = c.conrelid
--   join pg_namespace n on n.oid = t.relnamespace
--  where n.nspname = 'public' and t.relname = 'workout_plans'
--    and conname = 'workout_plans_user_id_plan_date_key';
--
-- 2) 조회 인덱스는 남았는가 → 1행이어야 한다
-- select indexname from pg_indexes
--  where schemaname = 'public' and tablename = 'workout_plans'
--    and indexname = 'workout_plans_user_date';
--
-- 3) move_workout_plan이 더는 지우지 않는가 → **0행**이어야 한다
-- select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'move_workout_plan'
--    and pg_get_functiondef(p.oid) like '%delete from public.workout_plans%';
--
-- 4) 0100·0101을 되돌리지 않았는가 → **2행**이어야 한다
-- select 'ladder' as kept from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'create_program_enrollment'
--    and pg_get_functiondef(p.oid) like '%program_invalid_ladder_set%'
-- union all
-- select '18/24' from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'create_program_enrollment'
--    and pg_get_functiondef(p.oid) like '%not in (18, 24)%';
