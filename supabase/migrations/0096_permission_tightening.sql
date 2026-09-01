-- 0096 : 과도한 GRANT / EXECUTE 회수 (배포 B)
--
-- ✅ **STEP 1 · STEP 2 는 2026-09-02 운영 DB에 적용됐다** (Supabase MCP, 사용자 승인 후).
-- ⬜ **STEP 3 (ALTER DEFAULT PRIVILEGES) 은 아직 적용하지 않았다.** 맨 아래를 보라.
--
--     "NNNN까지 반영됐는지"는 이 저장소에서 **객체 존재로** 확인한다
--     (`list_migrations`가 빈 배열이다). 이 파일이 있다고 적용된 것이 아니다.
--     아래 §검증 SQL을 그대로 돌리면 지금 상태를 다시 잴 수 있다.
--
-- 근거 문서: docs/security/public-beta-rpc-audit.md  ← 먼저 읽어라
--
-- ── 왜 필요했나 ──────────────────────────────────────────────
--
-- cross-user 공격 43종 중 40종은 막혀 있었고, 뚫린 3종은 전부 한 패턴이었다:
--
--   SECURITY DEFINER + 남의 user_id를 인자로 받음 + 본문에 auth.uid() 검사 없음
--                    + authenticated에게 EXECUTE가 열림
--
-- SECURITY DEFINER는 RLS를 지나간다. 인자를 검증하지 않으면 호출자가 누구든
-- 그 id의 데이터로 동작한다. 적용 **전** 실측(scripts/cross-user-abuse-check.mjs):
--
--   current_streak_days(B)          → 200, 값 3        ← A가 B의 스트릭을 읽었다
--   notify_challenge_peek_unlock(B) → 204              ← A가 B 대상 알림 경로를 돌렸다
--   is_blocked_between(B, 제3자)    → 200, false       ← 남 둘의 차단 관계를 캤다
--
-- 적용 **후** 같은 스크립트가 51/51 (기능 보존 단언 8건을 더한 뒤의 수).
--
-- ⭐ 같은 부류 5개는 **이미 잠겨 있었다** — award_points · apply_xp_and_progress ·
--    badge_metrics · evaluate_badges · notify. 0077은 remind_upcoming_challenges를
--    같은 이유로 service_role 전용으로 만들었다. 새 규칙이 아니라 **빠뜨린 3개에
--    기존 규칙을 적용**한 것이다.
--
-- ── ⚠️⚠️ 이것은 "크루에게 보이던 정보를 숨기는 것"이 아니다 ──
--
-- 사용자 지시(2026-09-02): **크루끼리 서로의 스트릭을 보는 것은 GND 핵심 기능이고
-- 절대 없애면 안 된다.** 닫은 것은 관계 검사를 우회하는 **직접 RPC 경로 하나**뿐이다.
--
-- 화면이 그리는 스트릭은 이 RPC를 **한 번도 부르지 않는다**:
--   · 홈 크루 카드      → src/lib/domain/friend-board.ts:132  currentStreak(keys, todayKey)
--   · 🔥 연속 N일 시트  → member-profile-sheet.tsx 는 streak를 **prop으로** 받는다
--   · 원재료            → RLS가 허용한 workout_sessions 행 (sessions_select_own_or_crew)
--   · `grep -rn current_streak_days src/` → **0건**
--
-- 2026-09-02 화면 확인(localhost:3000, 픽스처 A 로그인)으로 적용 후에도 그대로임을 봤다:
--   홈 크루 카드  오뎅끼데스까 연속 33일 · 근육은퇴근중 연속 3일
--   프로필 시트   근육은퇴근중님 🔥 3 · 누적 운동 19회 · 🔥 연속 3일 · 이번 주 1일
--   피드          오뎅끼데스까🔥33 · 근육은퇴근중🔥3 · 헬스장주주(나)🔥1
-- 화면 3 · service_role RPC 3 · 회귀 단언 19 · DB 실측 19 가 전부 같은 값이었다.
--
-- ── ⚠️ 회수하면 안 되는 것 (같은 모양인데 실제로 쓰인다) ─────
--
--   autostart_due_challenges · autofinalize_due_challenges
--       → src/app/(tabs)/challenge/page.tsx:363-364 가 **클라이언트에서** 부른다.
--         회수하면 챌린지 화면이 깨진다.
--   is_challenge_participant · is_group_member · challenge_in_setup 등 정책 헬퍼 10개
--       → RLS 정책 본문이 부른다. 정책 평가는 **호출 롤 권한으로** 되므로
--         EXECUTE를 회수하면 정책이 통째로 깨진다.
--   get_session_actor_profiles → 앱이 화면에서 부른다.
--
-- ── 적용 전에 확인한 것 (2026-09-02 카탈로그 실측) ───────────
--
--   테이블 40 · RLS 40/40 · 함수 98 · SECURITY DEFINER 89 · 정책 79 · PG 17.6
--   함수 owner ≠ postgres : **0개** (전부 postgres)
--   정책 79개 중 아래 4함수를 부르는 것 : **0개**  ← 회수해도 RLS가 안 깨진다
--   내부 호출자 7개 : badge_metrics · complete_workout_v2 · get_challenge_activity ·
--                     get_my_crew · is_crew_with · list_discoverable_challenges ·
--                     shares_active_challenge_with — **전부 SECURITY DEFINER**
--   authenticated TRUNCATE 보유 : 12개 테이블 / anon : 3개

begin;

-- ════════════════════════════════════════════════════════════
-- STEP 1 — 함수 EXECUTE 회수 (영향 0이 실측으로 증명된 4개)   ✅ 적용됨 2026-09-02
-- ════════════════════════════════════════════════════════════
--
-- ⚠️ `from public`만으로는 anon이 안 빠진다. Supabase는 anon에 **직접** 부여한다
--    (0093에서 실제로 겪었다). `from anon`을 반드시 함께 쓴다.
-- ⚠️ revoke 뒤에 service_role grant를 반드시 붙인다 (0048과 같은 순서).
--
-- 호출부 전수 확인 — 넷 다 앱 화면·RLS 정책에서 부르지 않는다:
--   current_streak_days          ← badge_metrics(SD) · complete_workout_v2(SD) 내부,
--                                   streak-parity-check.mjs (service_role)
--   notify_challenge_peek_unlock ← complete_workout_v2(SD) 내부,
--                                   peek-reset-check.mjs (**service_role 전용 스크립트**)
--   is_blocked_between           ← get_challenge_activity · get_my_crew · is_crew_with ·
--                                   list_discoverable_challenges ·
--                                   shares_active_challenge_with (전부 SD) 내부
--   pending_bug_report_count     ← **아무도 안 부른다.** briefing/route.ts:29 는 이 RPC를
--                                   쓰지 않는 이유를 주석으로 적고 직접 센다(new만 세기 때문)
--
-- **내부 호출자가 전부 SECURITY DEFINER다.** SD 함수 안에서는 소유자(postgres)
-- 권한으로 실행되므로 anon/authenticated EXECUTE를 빼도 내부 호출은 그대로 된다.

revoke execute on function public.current_streak_days(uuid)          from public, anon, authenticated;
revoke execute on function public.notify_challenge_peek_unlock(uuid) from public, anon, authenticated;
revoke execute on function public.is_blocked_between(uuid, uuid)     from public, anon, authenticated;
revoke execute on function public.pending_bug_report_count()         from public, anon, authenticated;

grant execute on function public.current_streak_days(uuid)          to service_role;
grant execute on function public.notify_challenge_peek_unlock(uuid) to service_role;
grant execute on function public.is_blocked_between(uuid, uuid)     to service_role;
grant execute on function public.pending_bug_report_count()         to service_role;

-- ════════════════════════════════════════════════════════════
-- STEP 2 — 죽은 테이블 권한 회수                              ✅ 적용됨 2026-09-02
-- ════════════════════════════════════════════════════════════
--
-- RLS는 정책이 없으면 기본 거부다. 아래는 GRANT가 있어도 **아무 행에도 도달하지
-- 못한다** — 즉 회수해도 기능이 하나도 안 바뀐다 (정책 79개 전수 확인).
--
--   bug_reports      SELECT 정책만 (INSERT/UPDATE/DELETE 0).
--                    신고는 submit_bug_report(text,text,jsonb,jsonb)가 **SECURITY DEFINER**로
--                    넣으므로 영향 없다 — 적용 후 bug-report-check 20/20으로 확인했다
--   profile_views    INSERT·SELECT 정책만 (UPDATE/DELETE 0)
--   exercise_catalog DELETE·INSERT·SELECT 정책만 (UPDATE 0)
--   group_members    DELETE·INSERT·SELECT 정책만 (UPDATE 0)
--   profiles         INSERT·SELECT·UPDATE 정책만 (DELETE 0)
--
-- ⚠️ push_subscriptions·notification_settings는 **여기 넣지 마라.** 둘은 cmd=ALL
--    정책(user_id = auth.uid())이 있어 GRANT가 실제로 쓰인다. 명령별로만 세면
--    ALL 정책을 놓친다 (이번 감사에서 실제로 한 번 잘못 넣었다가 뺐다).

revoke insert, update, delete on public.bug_reports      from anon, authenticated;
revoke update, delete         on public.profile_views    from anon, authenticated;
revoke update                 on public.exercise_catalog from anon, authenticated;
revoke update                 on public.group_members    from anon, authenticated;
revoke delete                 on public.profiles         from anon, authenticated;

-- TRUNCATE — **RLS를 우회한다.** PostgREST에 경로가 없어 기능 영향 0이고, 사고가 나면
-- 피해는 최대다(테이블 전체 소멸). 적용 전 실측: authenticated 12개 · anon 3개.
revoke truncate on all tables in schema public from anon, authenticated;

-- REFERENCES · TRIGGER · MAINTAIN — 앱은 DDL을 하지 않는다.
-- ⚠️ MAINTAIN은 PG17+ 권한이다. 이 서버는 **17.6**이라 실재한다(실측하고 넣었다).
revoke references, trigger, maintain on all tables in schema public from anon, authenticated;

-- ⚠️ DELETE 전체를 회수하지 않는다. 17개 중 대부분은 소유권 정책이 붙은 정상 기능이다
--    (cheers_delete_own · catalog_delete_own_custom · group_members_delete_self_or_owner 등).

commit;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════
-- 검증 SQL — "명령이 성공했다"는 확인이 아니다. 객체를 다시 조회한다.
-- ════════════════════════════════════════════════════════════
--
-- 2026-09-02 적용 직후 실측값을 오른쪽에 적어 둔다.
--
--   with acl as (
--     select c.relname tbl, pg_get_userbyid(a.grantee) role, a.privilege_type p
--     from pg_class c
--     join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
--     cross join lateral aclexplode(c.relacl) a
--     where c.relkind in ('r','p') and pg_get_userbyid(a.grantee) in ('anon','authenticated'))
--   select
--     (select count(distinct tbl) from acl where p='TRUNCATE')                                    -- 0  (전 12)
--   , (select count(distinct tbl) from acl where p in ('REFERENCES','TRIGGER','MAINTAIN'))        -- 0
--   , (select count(*) from acl where tbl='bug_reports' and p in ('INSERT','UPDATE','DELETE'))    -- 0
--   , (select count(*) from acl where tbl='profiles' and role='authenticated'
--        and p in ('SELECT','INSERT','UPDATE'))                                                  -- 3 ← 살아 있어야 한다
--   , (select count(*) from acl where tbl='push_subscriptions'
--        and p in ('SELECT','INSERT','UPDATE','DELETE'));                                        -- 4 ← 살아 있어야 한다
--
--   select p.oid::regprocedure::text, p.proacl::text from pg_proc p
--   join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
--   where p.proname in ('current_streak_days','notify_challenge_peek_unlock',
--                       'is_blocked_between','pending_bug_report_count');
--   -- 넷 다 {postgres=X/postgres,service_role=X/postgres} 여야 한다 (authenticated 없음)
--
-- 적용 후 회귀 (2026-09-02, 전부 통과):
--   cross-user-abuse-check 51/51 · rls-test 129/129 · crew-link-check 53/53
--   bug-report-check 20/20 · block-report-goal-check 23/23 · readonly 5종 전부
--   lint 0 error · typecheck 통과 · test 2983/2983 · build 성공
--
-- 롤백 (기능이 깨졌을 때만):
--   grant execute on function public.current_streak_days(uuid) to authenticated;   -- 필요한 것만
--   grant insert, update, delete on public.bug_reports to authenticated;           -- 등
--   ⚠️ TRUNCATE·MAINTAIN은 되돌리지 마라. 그건 애초에 실수로 붙은 것이다.

-- ════════════════════════════════════════════════════════════
-- STEP 3 — ALTER DEFAULT PRIVILEGES  ⛔ 아직 적용 안 함 · 별도 승인 필요
-- ════════════════════════════════════════════════════════════
--
-- ⛔ **위 commit과 분리했다.** 영향 범위가 전역이고, 되돌리는 방법이 다르며,
--    Supabase가 나중에 되돌려 놓을 수 있어 감시 테스트가 함께 필요하다.
--
-- 근본 원인 — **2026-09-02에 카탈로그로 실측했다**(더는 [미검증]이 아니다):
--
--   postgres        · public · TABLE → anon=arwdDxtm, authenticated=arwdDxtm
--   supabase_admin  · public · TABLE → anon=arwdDxtm, authenticated=arwdDxtm
--   postgres        · public · FUNC  → anon=X,        authenticated=X
--   supabase_admin  · public · FUNC  → anon=X,        authenticated=X
--   postgres        · public · SEQ   → anon=rwU,      authenticated=rwU
--   (a=INSERT r=SELECT w=UPDATE d=DELETE D=TRUNCATE x=REFERENCES t=TRIGGER m=MAINTAIN)
--
-- 즉 public에 새 테이블을 만드는 순간 anon·authenticated가 **TRUNCATE 포함 전 권한**을
-- 받는다. 0093에서 analytics_events가 실제로 그랬다 — grant insert 하나만 줬는데
-- 직후 조회하니 둘 다 전 권한을 갖고 있었다. **STEP 2를 해도 다음 테이블에서 재발한다.**
--
-- ⚠️ **REVOKE ALL로 밀지 않는다.** 남길 최소 권한을 먼저 가른다:
--
--   TABLE    authenticated  남긴다: SELECT, INSERT, UPDATE, DELETE
--                           뺀다  : TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
--   TABLE    anon           전부 뺀다 — 필요하면 그 테이블에서 명시적으로 준다
--   TABLE    service_role   **건드리지 않는다** — admin·회귀·cron이 전부 의존한다
--   FUNCTION authenticated  EXECUTE 남긴다 — 새 RPC마다 손으로 grant하면 반드시 빠뜨린다
--   FUNCTION anon           EXECUTE 뺀다 — 정책 헬퍼는 그때 명시적으로 준다
--   SEQUENCE anon           전부 뺀다
--
-- owner가 둘(postgres · supabase_admin)이라 **둘 다** 건다. 지금 객체는 전부 postgres
-- 소유지만 supabase_admin 항목이 살아 있어 어느 쪽이 미래 객체에 걸릴지 단정할 수 없다.

-- begin;
--
-- alter default privileges for role postgres       in schema public
--   revoke truncate, references, trigger, maintain on tables from authenticated;
-- alter default privileges for role supabase_admin in schema public
--   revoke truncate, references, trigger, maintain on tables from authenticated;
--
-- alter default privileges for role postgres       in schema public revoke all on tables    from anon;
-- alter default privileges for role supabase_admin in schema public revoke all on tables    from anon;
-- alter default privileges for role postgres       in schema public revoke all on sequences from anon;
-- alter default privileges for role postgres       in schema public revoke execute on functions from anon;
-- alter default privileges for role supabase_admin in schema public revoke execute on functions from anon;
--
-- commit;
--
-- 적용 후 반드시:
--   1. pg_default_acl 재조회 → 의도한 대로 바뀌었는지 **객체로** 확인
--   2. scripts/default-privilege-check.mjs 신설 — 새 테이블을 만들었다 되돌리며
--      anon·authenticated에 TRUNCATE·DELETE가 자동으로 안 붙는지 단언
--      (⚠️ 이건 create table 이라 파괴적 목록은 아니지만 운영 DB에 쓴다.
--        block-report-goal-check 처럼 "되돌렸는지까지" 단언해야 한다)
--   3. scripts/regression-baselines.json 에 등록
--   4. pnpm db:snapshot 으로 docs/db-current-schema.sql 갱신
