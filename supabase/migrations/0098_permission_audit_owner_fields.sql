-- 0098 : permission_audit_snapshot()에 owner 드리프트 필드 3개 추가
--
-- ✅ **2026-09-02 운영 DB에 이미 적용돼 있었다** (Supabase MCP).
--    이 파일은 **뒤늦게 쓴 기록**이다 — 적용 세션이 파일을 못 만들고 중단했고,
--    2026-09-02 후속 세션이 운영 DB의 `pg_get_functiondef` 본문을 받아 적었다.
--    즉 이 SQL은 추정이 아니다 — **주석과 공백을 지우고 비교했을 때 운영 본문과 문자 단위로 같다**
--    (설명 주석만 0097의 것을 되살렸다. 운영 본문에는 그 주석이 없다).
--
-- ⚠️ 다시 Run해도 안전하다(멱등). 같은 본문으로 덮어쓴다.
--
-- ── 왜 필요한가 ──────────────────────────────────────────────
--
-- 0096 STEP 3은 `postgres`의 기본권한만 좁혔다. **`supabase_admin`의 기본권한은
-- 못 바꾼다** — `42501 permission denied`(플랫폼 제약). 그쪽은 지금도 anon·authenticated에
-- `arwdDxtm`(**TRUNCATE 포함**)를 준다.
--
-- 그래서 **지금 안전한 진짜 이유는 "좁힌 기본값"이 아니다.**
-- `public`의 소유자가 `postgres` 하나뿐이라는 사실이다 (테이블 40 · 함수 99 전부).
-- `pg_default_acl`은 **객체를 만든 롤**의 것이 걸리므로, public에 postgres 아닌
-- 소유자의 객체가 하나라도 생기는 순간 그 객체는 **넓은 기본값을 그대로 물려받는다.**
--
-- 이 세 필드가 그 전제를 감시한다. 스크립트는 `scripts/default-privilege-check.mjs`.
--
-- ⚠️ **`supabase_admin` 기본권한이 넓다는 사실 자체는 FAIL로 만들지 마라.**
--    고칠 수 없는 것을 매번 빨갛게 하면 진짜 회귀가 그 밑에 묻힌다.
--    `[알고 있음]` 한 줄로 찍기만 하고, 단언은 owner 쪽에 건다.
--
-- ── 안전 설계 (0097과 동일하다) ──────────────────────────────
--
--   · 읽기 전용(`stable`) · service_role 전용 · `security definer` + `search_path=''`
--   · **개인정보 없음** — 객체 이름·소유자 롤 이름·개수뿐이다
--   · 권한을 하나도 넓히지 않는다. 0097 대비 바뀐 것은 **반환 필드뿐**이다
--
-- 0097 대비 차이 (이것이 전부다):
--   ① 'measured_functions'    — 가드. 0이면 아래 둘이 공허하게 통과한다
--   ② 'tables_not_postgres'   — public 테이블 중 소유자 ≠ postgres
--   ③ 'functions_not_postgres'— public 함수 중 소유자 ≠ postgres
--   ④ locked_functions 목록에 'permission_audit_snapshot' 자신을 추가
--      (감사 RPC가 스스로 잠겨 있는지도 보게 했다)

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

    -- 0096 STEP 1이 잠근 4개 + 0097의 감사 RPC 자신.
    -- SECURITY DEFINER + 인자 미검증이라 열리면 남의 데이터가 샌다.
    'locked_functions', (
      select coalesce(jsonb_object_agg(p.proname, coalesce(p.proacl::text, '(기본값)')), '{}'::jsonb)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('current_streak_days','notify_challenge_peek_unlock',
                          'is_blocked_between','pending_bug_report_count',
                          'permission_audit_snapshot')),

    -- 늘어나면 새 함수가 anon에 열린 것이다. 2026-09-02 기준선 21.
    'anon_execute_functions', (
      select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and coalesce(p.proacl::text, '') like '%anon=X%'),

    'live_policies', (select count(*) from pg_catalog.pg_policies where schemaname = 'public'),

    -- 0098 — owner 드리프트 가드용. supabase_admin 기본권한을 못 좁히는 대신,
    -- **postgres 아닌 소유자로 public 객체가 생기는 순간**을 잡는다.
    -- 개인정보 없음: 객체명·소유자명·개수뿐이다.
    'measured_functions', (
      select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'),
    'tables_not_postgres', (
      select coalesce(jsonb_agg(c.relname || ' / ' || pg_catalog.pg_get_userbyid(c.relowner)
                                order by c.relname), '[]'::jsonb)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p')
        and pg_catalog.pg_get_userbyid(c.relowner) <> 'postgres'),
    'functions_not_postgres', (
      select coalesce(jsonb_agg(p.proname || ' / ' || pg_catalog.pg_get_userbyid(p.proowner)
                                order by p.proname), '[]'::jsonb)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and pg_catalog.pg_get_userbyid(p.proowner) <> 'postgres')
  );
$$;

-- ⚠️ `create or replace`는 ACL을 유지하지만, 본문을 바꿀 때는 **습관적으로 다시 건다.**
-- `from public`만으로는 anon이 안 빠진다 — Supabase는 anon에 **직접** 부여한다.
revoke execute on function public.permission_audit_snapshot() from public, anon, authenticated;
grant  execute on function public.permission_audit_snapshot() to service_role;

notify pgrst, 'reload schema';

-- 적용 확인 (2026-09-02 실측, service_role로 RPC 호출):
--   proacl                 = {postgres=X/postgres,service_role=X/postgres}  ← anon·authenticated 없음
--   prosecdef = true · proconfig = search_path=""
--   measured_tables        = 40    · measured_functions   = 99
--   tables_not_postgres    = []    · functions_not_postgres = []
--   risky_table_grants     = []    · anon_execute_functions = 21 · live_policies = 79
