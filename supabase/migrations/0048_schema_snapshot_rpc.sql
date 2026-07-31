-- 0048: 현행 스키마 스냅샷 RPC — §6.2 "현행 정의는 어디에?" 함정을 없앤다
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0047은 수정 금지.
--
-- 문제: 이 저장소는 마이그레이션마다 create or replace로 같은 함수를 덮어쓴다.
-- 그래서 "지금 이 함수의 정의가 무엇인가"를 알려면 47개 파일에서 마지막으로
-- 덮어쓴 것을 찾아야 한다. start_challenge는 0006 → 0025 → 0045 세 곳에
-- 흩어져 있고, mark_record_beaten은 다섯 번 덮어썼다.
--
-- 이 함정은 문서가 아니라 실제 사고를 냈다. 2026-07-31에 start_challenge만
-- 고치고 같은 전제를 공유하는 approve_challenge_goals를 놓쳐(0045) 챌린지를
-- 영영 시작할 수 없는 상태를 만들었고, 0046으로 다시 고쳐야 했다.
--
-- 해결: DB에서 현행 정의를 통째로 뽑는 읽기 전용 RPC. 이걸로
-- scripts/dump-schema-snapshot.mjs가 docs/db-current-schema.sql을 만든다.
-- 앞으로 "현행 정의"를 알아야 할 때 파일을 뒤지지 말고 그 파일을 보면 된다.
--
-- 함수만이 아니라 **정책·인덱스도 담는다.** 0047에서 정책이 함수만큼 중요하다는
-- 것이 드러났다 — challenge_goal_approvals의 select 정책 하나가 그룹 기준으로
-- 남아 타 그룹 참가자에게 동의 현황이 안 보였다.
--
-- ⚠ 보안: 함수 본문에는 판정 로직이 그대로 들어 있다. 어떤 게이트가 어떻게
--    걸리는지 노출되므로 **service_role 전용**이다. anon·authenticated에서
--    회수하고 service_role에만 grant한다. 스크립트는 .env.local의 서비스 키로만
--    부른다(브라우저 코드에서 부르면 안 된다).

begin;

create or replace function public.admin_schema_snapshot()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'functions', coalesce((
      select jsonb_agg(
        jsonb_build_object('name', p.proname, 'definition', pg_get_functiondef(p.oid))
        order by p.proname
      )
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind = 'f'          -- 집계·윈도우 함수 제외, 일반 함수만
    ), '[]'::jsonb),
    'policies', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'table', tablename, 'name', policyname, 'cmd', cmd,
          'roles', roles, 'using', qual, 'check', with_check
        )
        order by tablename, policyname
      )
      from pg_policies where schemaname = 'public'
    ), '[]'::jsonb),
    'indexes', coalesce((
      select jsonb_agg(
        jsonb_build_object('table', tablename, 'name', indexname, 'def', indexdef)
        order by tablename, indexname
      )
      from pg_indexes where schemaname = 'public'
    ), '[]'::jsonb)
  )
$$;

-- 판정 로직이 노출되므로 사용자 토큰으로는 부를 수 없어야 한다.
revoke all on function public.admin_schema_snapshot() from public, anon, authenticated;
grant execute on function public.admin_schema_snapshot() to service_role;

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 ────────────────────────────────────────────────
-- 로컬에서: node scripts/dump-schema-snapshot.mjs
--   → docs/db-current-schema.sql 이 생성되고 함수·정책·인덱스 개수가 출력된다.
--
-- SQL Editor에서 보려면:
--   select jsonb_array_length(admin_schema_snapshot()->'functions') as fns,
--          jsonb_array_length(admin_schema_snapshot()->'policies') as pols,
--          jsonb_array_length(admin_schema_snapshot()->'indexes')  as idxs;
