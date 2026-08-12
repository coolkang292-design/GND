-- 0071: 진행 중인 프로그램을 그만둔다 (사용자 지시 2026-08-12)
-- 적용: 사용자가 Supabase SQL Editor에서 이 파일 전체를 한 번 Run한다.
--
-- 왜: 등록만 되고 되돌릴 길이 없었다. `program_enrollments.status`에
--     'cancelled'·'completed' 값은 0066부터 있었지만 **그 값을 쓰는 곳이
--     아무 데도 없었다.** 잘못 등록하면 6주 내내 달력에 남는다.
--
-- 무엇을 지우나
--   · 그 등록의 `workout_plans` 행 **전부**
--   · 등록 자체는 지우지 않고 `status = 'cancelled'`로 남긴다
--
-- ⚠️ **완료한 운동은 사라지지 않는다.** 회차를 마치면 그 계획 행은 이미
--    지워진다(`record/page.tsx`가 완료 직후 `deleteWorkoutPlan`을 부른다).
--    그래서 여기 남아 있는 행은 **전부 미완료**다 — 날짜로 거를 필요가 없다.
--    기록은 `workout_sessions`에 있고 이 함수는 그걸 건드리지 않는다.
--
-- ⚠️ 등록 행을 지우지 않는 이유: 같은 프로그램을 다시 등록할 수 있어야 하는데
--    (0066의 unique 제약은 **active**만 막는다), 지워 버리면 "예전에 이걸
--    했었다"는 사실도 함께 사라진다.
--
-- ⚠️ 배포 순서: 이 SQL을 먼저 Run하고 앱을 배포한다. 반대로 하면 사용자가
--    `그만두기`를 누를 수 있는데 서버에 함수가 없다.

begin;

create or replace function public.cancel_program_enrollment(
  p_enrollment_id uuid
)
returns int
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_removed int;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  -- 같은 사용자의 등록 RPC와 한 줄로 세운다 — 취소와 재등록이 겹치면
  -- 계획을 지우는 중에 새 계획이 들어올 수 있다.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select status into v_status
  from public.program_enrollments
  where id = p_enrollment_id and user_id = v_user_id
  for update;
  if not found then
    -- 남의 등록도 여기로 온다 — 존재 여부를 알려 주지 않는다
    raise exception 'program_enrollment_not_found';
  end if;
  if v_status <> 'active' then
    raise exception 'program_not_active';
  end if;

  delete from public.workout_plans
  where program_enrollment_id = p_enrollment_id
    and user_id = v_user_id;
  get diagnostics v_removed = row_count;

  update public.program_enrollments
  set status = 'cancelled'
  where id = p_enrollment_id and user_id = v_user_id;

  return v_removed;
end;
$function$;

-- 권한은 0066·0069·0070과 같은 규약이다.
revoke all on function public.cancel_program_enrollment(uuid) from public, anon;
grant execute on function public.cancel_program_enrollment(uuid) to authenticated;

commit;

-- ── 적용 확인 (Run 뒤 따로 실행) ────────────────────────────
--
-- 1) 함수가 생겼는가 → 1행이어야 한다
-- select p.proname
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'cancel_program_enrollment';
--
-- 2) 권한 → authenticated=true, anon=false
-- select has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_execute
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'cancel_program_enrollment';
