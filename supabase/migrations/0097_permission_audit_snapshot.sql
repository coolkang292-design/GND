-- 0097 : 권한 감사 스냅샷 RPC (읽기 전용 · service_role 전용)
--
-- ✅ **2026-09-02 운영 DB에 적용됐다** (Supabase MCP). 0096 STEP 3과 한 세트다.
--
-- ── 왜 필요한가 ──────────────────────────────────────────────
--
-- ⚠️⚠️ **`pnpm db:snapshot`은 GRANT를 한 줄도 담지 않는다.**
--    `docs/db-current-schema.sql`에는 함수·정책·인덱스만 들어간다
--    (`grep -c "grant\|revoke"` → **0**, 2026-09-02 실측).
--    즉 **권한이 도로 넓어져도 저장소 diff는 아무것도 안 보여준다.**
--    코드 리뷰로도 안 잡힌다 — DB에만 존재하는 상태이기 때문이다.
--
-- 그런데 회귀 스크립트(node)는 **PostgREST로만** 말하므로 `pg_catalog`를 못 읽는다.
-- 2026-09-01 세션이 정확히 여기서 막혀 감시 테스트를 못 만들었다.
-- 이 RPC가 그 벽을 넘는 **유일한 통로**다. `scripts/default-privilege-check.mjs`가 쓴다.
--
-- ── 안전 설계 ────────────────────────────────────────────────
--
--   · **읽기 전용이다.** `stable` 이고 본문에 쓰기가 한 줄도 없다
--   · **service_role 전용.** anon·authenticated에서 회수했다.
--     열려 있으면 공격자가 "어디가 약한지"를 한 번에 읽는다 —
--     `cross-user-abuse-check` [10-1]이 A 토큰으로 막혔는지 매번 확인한다
--   · `security definer` + `set search_path = ''` (0092와 같은 규약).
--     `pg_catalog`를 전부 스키마 한정으로 부른다
--   · **개인정보를 담지 않는다.** 롤 이름·권한 문자·객체 이름·개수뿐이다
--
-- ⚠️ 여기 담는 것을 늘릴 때는 **집계로** 담아라. 행 내용을 담기 시작하면
--    이 함수가 "관리자용 데이터 유출구"가 된다.

create or replace function public.permission_audit_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    -- 가드용. 0이면 회귀 스크립트의 단언이 전부 공허하게 통과한다.
    'measured_tables', (
      select count(*) from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p')),

    -- 앞으로 만들 객체가 받을 권한. 0096 STEP 3이 좁힌 대상.
    -- 키는 '<grantor>:<objtype>' (r=TABLE, S=SEQUENCE, f=FUNCTION).
    'default_acl', (
      select coalesce(jsonb_object_agg(
               pg_catalog.pg_get_userbyid(d.defaclrole) || ':' || d.defaclobjtype::text,
               coalesce(d.defaclacl::text, '')), '{}'::jsonb)
      from pg_catalog.pg_default_acl d
      join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
      where n.nspname = 'public'),

    -- 지금 있는 객체 중 위험 권한. ⚠️ TRUNCATE는 **RLS를 우회한다.**
    'risky_table_grants', (
      select coalesce(jsonb_agg(distinct c.relname || ' / ' ||
                                pg_catalog.pg_get_userbyid(a.grantee) || ' / ' || a.privilege_type),
                      '[]'::jsonb)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      cross join pg_catalog.aclexplode(c.relacl) a
      where n.nspname = 'public' and c.relkind in ('r','p')
        and pg_catalog.pg_get_userbyid(a.grantee) in ('anon','authenticated')
        and a.privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')),

    -- 0096 STEP 1이 잠근 4개. SECURITY DEFINER + 인자 미검증이라 열리면 남의 데이터가 샌다.
    'locked_functions', (
      select coalesce(jsonb_object_agg(p.proname, coalesce(p.proacl::text, '(기본값)')), '{}'::jsonb)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('current_streak_days','notify_challenge_peek_unlock',
                          'is_blocked_between','pending_bug_report_count')),

    -- 늘어나면 새 함수가 anon에 열린 것이다. 2026-09-02 기준선 21.
    'anon_execute_functions', (
      select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and coalesce(p.proacl::text, '') like '%anon=X%'),

    'live_policies', (select count(*) from pg_catalog.pg_policies where schemaname = 'public')
  );
$$;

-- ⚠️ `from public`만으로는 anon이 안 빠진다. Supabase는 anon에 **직접** 부여한다.
revoke execute on function public.permission_audit_snapshot() from public, anon, authenticated;
grant  execute on function public.permission_audit_snapshot() to service_role;

notify pgrst, 'reload schema';

-- 적용 확인 (2026-09-02 실측):
--   proacl = {postgres=X/postgres,service_role=X/postgres}   ← authenticated·anon 없음
--   prosecdef = true · proconfig = search_path=""
--
-- 감시 스크립트가 진짜인지도 확인했다 — `pending_bug_report_count`(아무도 안 부르는 함수)에
-- 일부러 `grant execute ... to authenticated`를 걸었더니 17/0 → **16/1**로 정확히 그 항목이
-- 빨개졌고, 회수하니 다시 17/0이 됐다 (CLAUDE.md §테스트가 진짜 테스트인지 확인한다).
