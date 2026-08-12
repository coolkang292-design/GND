-- 0072: 그만두기가 `cancelled_at`을 함께 채운다 (0071 수정)
-- 적용: 사용자가 Supabase SQL Editor에서 이 파일 전체를 한 번 Run한다.
--
-- 왜: 0071이 `status = 'cancelled'`만 쓰고 `cancelled_at`을 비워 뒀다.
--     0066의 테이블 check가 **상태와 타임스탬프를 함께** 요구한다:
--
--       check (
--         (status = 'active'    and completed_at is null and cancelled_at is null)
--         or (status = 'completed' and completed_at is not null and cancelled_at is null)
--         or (status = 'cancelled' and completed_at is null and cancelled_at is not null)
--       )
--
--     그래서 그만두기를 누르면 23514(check 위반)로 통째로 거절됐다. 계획도
--     안 지워지고 상태도 안 바뀐다 — 트랜잭션이라 전부 롤백됐다.
--
-- ⚠️ 이건 **정적 검사로는 못 잡는다.** 0071의 계약 테스트는 SQL 문자열만 읽어서
--    `set status = 'cancelled'`가 있는 것만 확인했다. 테이블 제약은 실제로
--    insert/update가 일어나야 드러난다. 운영에서 한 번 돌려 본 것이 잡았다
--    (`scripts/program-interval-enrollment-test.mjs`).
--
-- ⚠️ 적용된 0071은 고치지 않는다. 함수를 여기서 다시 만든다.
--
-- 바뀐 것: update 문 한 줄. 나머지(소유권·상태 검사·잠금·삭제·권한)는 그대로다.

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

  -- ⚠️ `cancelled_at`을 같이 채운다. 0066의 check가 둘을 묶어 두었다 —
  --    상태만 바꾸면 행 전체가 거절된다.
  update public.program_enrollments
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_enrollment_id and user_id = v_user_id;

  return v_removed;
end;
$function$;

-- 권한은 0071과 같게 다시 못 박는다.
revoke all on function public.cancel_program_enrollment(uuid) from public, anon;
grant execute on function public.cancel_program_enrollment(uuid) to authenticated;

commit;

-- ── 적용 확인 (Run 뒤 따로 실행) ────────────────────────────
--
-- 1) 함수가 cancelled_at을 채우는가 → 1행이어야 한다
-- select p.proname
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname = 'cancel_program_enrollment'
--    and pg_get_functiondef(p.oid) like '%cancelled_at = now()%';
--
-- 2) 권한 → authenticated=true, anon=false
-- select has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_execute
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'cancel_program_enrollment';
