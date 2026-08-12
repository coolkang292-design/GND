-- 0068: 0067의 프로그램 등록 소유권 검사 함수를 최신 security-definer 기준으로 보강한다.
-- 적용: 사용자가 Supabase SQL Editor에서 이 파일 전체를 한 번 Run한다.

begin;

create or replace function public.owns_program_enrollment(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
      from public.program_enrollments
     where id = eid
       and user_id = auth.uid()
  )
$function$;

revoke all on function public.owns_program_enrollment(uuid) from public, anon;
grant execute on function public.owns_program_enrollment(uuid) to authenticated;

commit;

-- 적용 확인:
-- select p.proname, p.proconfig,
--        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'owns_program_enrollment';
-- 기대: proconfig={search_path=""}, anon_can_execute=false, authenticated_can_execute=true
