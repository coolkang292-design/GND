-- 0096 (제안) : 과도한 GRANT / EXECUTE 회수 + default privileges 축소
--
-- ⛔⛔ **이 파일은 아직 운영 DB에 적용되지 않았다.** 2026-09-01 기준.
--     파일 이름에 `_PROPOSAL`이 붙어 있는 동안은 "제안"이다. 승인·적용한 뒤
--     `0096_permission_tightening.sql`로 이름을 바꾸고 이 머리말을 지운다.
--
--     "NNNN까지 반영됐는지"는 이 저장소에서 **객체 존재로** 확인한다
--     (`list_migrations`가 빈 배열이다). 이 파일이 있다고 적용된 것이 아니다.
--
-- 근거 문서: docs/security/public-beta-rpc-audit.md  ← 먼저 읽어라
-- 사용자 지시(2026-09-01): "REVOKE / ALTER DEFAULT PRIVILEGES는 적용 직전에
--                          멈추고 승인 요청". 그래서 파일만 만들어 둔다.
--
-- ── 왜 필요한가 ──────────────────────────────────────────────
--
-- cross-user 공격 43종 중 40종은 막혔다. 뚫린 3종은 전부 한 패턴이다:
--
--   SECURITY DEFINER + 남의 user_id를 인자로 받음 + 본문에 auth.uid() 검사 없음
--                    + authenticated에게 EXECUTE가 열림
--
-- SECURITY DEFINER는 RLS를 지나간다. 인자를 검증하지 않으면 호출자가 누구든
-- 그 id의 데이터로 동작한다. 실측(scripts/cross-user-abuse-check.mjs):
--
--   current_streak_days(B)          → 200, 값 3        ← A가 B의 스트릭을 읽었다
--   notify_challenge_peek_unlock(B) → 204              ← A가 B 대상 알림 경로를 돌렸다
--   is_blocked_between(B, 제3자)    → 200, false       ← 남 둘의 차단 관계를 캤다
--
-- ⭐ 같은 부류 5개는 **이미 잠겨 있다** — award_points · apply_xp_and_progress ·
--    badge_metrics · evaluate_badges · notify. 0077은 remind_upcoming_challenges를
--    같은 이유로 service_role 전용으로 만들었다. 새 규칙이 아니라 **빠뜨린 3개에
--    기존 규칙을 적용**하는 것이다.
--
-- ── ⚠️ 회수하면 안 되는 것 (같은 모양인데 실제로 쓰인다) ─────
--
--   autostart_due_challenges · autofinalize_due_challenges
--       → src/app/(tabs)/challenge/page.tsx:363-364 가 **클라이언트에서** 부른다.
--         회수하면 챌린지 화면이 깨진다. 악용해도 이미 기한이 지난 전이를
--         앞당기는 것뿐이라(미래 챌린지는 못 연다) 정상 UI와 결과가 같다.
--   is_challenge_participant · is_group_member · challenge_in_setup 등 정책 헬퍼 10개
--       → RLS 정책 본문이 부른다. 정책 평가는 **호출 롤 권한으로** 되므로
--         EXECUTE를 회수하면 정책이 통째로 깨진다.
--   get_session_actor_profiles → 앱이 화면에서 부른다.
--
-- ── ⚠️ 이 파일을 적용하기 전에 반드시 할 것 ──────────────────
--
--   1. 카탈로그 재조회 (이 감사는 Supabase MCP 없이 PostgREST로만 쟀다):
--        - pg_default_acl 현재 값        ← STEP 3이 이것에 의존한다
--        - authenticated TRUNCATE 보유 12개 목록
--        - 함수 owner가 정말 postgres인지
--   2. STEP 1만 먼저 적용 → scripts/cross-user-abuse-check.mjs 가 43/43 이 되는지
--   3. 그다음 STEP 2 → 회귀 34종
--   4. 마지막에 STEP 3 → 재발 감시 테스트 신설(scripts/default-privilege-check.mjs)
--
--   롤백 SQL은 감사 문서 §8-E에 전부 있다.

begin;

-- ════════════════════════════════════════════════════════════
-- STEP 1 — 함수 EXECUTE 회수 (영향 0이 실측으로 증명된 4개)
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
--                                   peek-reset-check.mjs (service_role)
--   is_blocked_between           ← get_challenge_activity · get_my_crew · is_crew_with ·
--                                   list_discoverable_challenges ·
--                                   shares_active_challenge_with (전부 SD) 내부
--   pending_bug_report_count     ← src/app/api/briefing/route.ts (service_role)
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
-- STEP 2 — 죽은 테이블 권한 회수
-- ════════════════════════════════════════════════════════════
--
-- RLS는 정책이 없으면 기본 거부다. 아래는 GRANT가 있어도 **아무 행에도 도달하지
-- 못한다** — 즉 회수해도 기능이 하나도 안 바뀐다 (감사 §4-4에서 정책 79개 전수 확인).
--
--   bug_reports      INSERT/UPDATE/DELETE 정책 0개 (SELECT 정책만 있다).
--                    신고는 submit_bug_report(SD)가 RLS를 지나쳐 넣으므로 영향 없다
--   profile_views    UPDATE/DELETE 정책 0개
--   exercise_catalog UPDATE 정책 0개
--   group_members    UPDATE 정책 0개
--   profiles         DELETE 정책 0개
--
-- ⚠️ push_subscriptions·notification_settings는 **여기 넣지 마라.** 둘은 cmd=ALL
--    정책(user_id = auth.uid())이 있어 GRANT가 실제로 쓰인다. 명령별로만 세면
--    ALL 정책을 놓친다 (이번 감사에서 실제로 한 번 잘못 넣었다가 뺐다).

revoke insert, update, delete on public.bug_reports      from anon, authenticated;
revoke update, delete         on public.profile_views    from anon, authenticated;
revoke update                 on public.exercise_catalog from anon, authenticated;
revoke update                 on public.group_members    from anon, authenticated;
revoke delete                 on public.profiles         from anon, authenticated;

-- TRUNCATE — PostgREST에 경로 자체가 없어 기능 영향 0이고, 사고가 나면 피해는 최대다.
-- ⚠️ 대상 12개 목록은 인수인계서 값이다(이번 세션에서 재확인 못 했다). 적용 전 카탈로그로 확인.
revoke truncate on all tables in schema public from anon, authenticated;

-- REFERENCES · TRIGGER — 앱이 쓸 일이 없다.
-- ⚠️ MAINTAIN은 PG17+ 권한이다. 서버 버전을 확인하고 있으면 아래 줄에 추가한다.
revoke references, trigger on all tables in schema public from anon, authenticated;

-- ⚠️ DELETE 전체를 회수하지 않는다. 17개 중 대부분은 소유권 정책이 붙은 정상 기능이다
--    (cheers_delete_own · catalog_delete_own_custom · group_members_delete_self_or_owner 등).

commit;

-- ════════════════════════════════════════════════════════════
-- STEP 3 — ALTER DEFAULT PRIVILEGES  ⛔ 별도 승인 · 별도 실행
-- ════════════════════════════════════════════════════════════
--
-- ⛔ **위 commit과 분리했다.** 영향 범위가 전역이고, 되돌리는 방법이 다르며,
--    Supabase가 나중에 되돌려 놓을 수 있어 감시 테스트가 함께 필요하다.
--
-- ⛔ **`[미검증]`.** 이 세션은 pg_default_acl을 재조회하지 못했다. 아래는
--    인수인계서 §2 실측값을 전제로 한 제안이다. **재조회 후에 적용하라.**
--
-- 근본 원인 (인수인계서 §2 실측):
--   postgres / supabase_admin  · public · TABLE → anon=arwdDxtm, authenticated=arwdDxtm
--   postgres / supabase_admin  · public · FUNC  → anon=X,        authenticated=X
--   postgres                   · public · SEQ   → anon=rwU
--   (a=INSERT r=SELECT w=UPDATE d=DELETE D=TRUNCATE x=REFERENCES t=TRIGGER m=MAINTAIN)
--
-- 즉 public에 새 테이블을 만드는 순간 anon·authenticated가 TRUNCATE 포함 전 권한을
-- 받는다. 0093에서 analytics_events가 실제로 그랬다 — grant insert 하나만 줬는데
-- 직후 조회하니 둘 다 전 권한을 갖고 있었다.
--
-- ⚠️ **REVOKE ALL로 밀지 않는다.** 남길 최소 권한을 먼저 가른다:
--
--   TABLE    authenticated  남긴다: SELECT, INSERT, UPDATE, DELETE
--                           뺀다  : TRUNCATE, REFERENCES, TRIGGER (+PG17 MAINTAIN)
--   TABLE    anon           전부 뺀다 — 필요하면 그 테이블에서 명시적으로 준다
--   TABLE    service_role   **건드리지 않는다** — admin·회귀·cron이 전부 의존한다
--   FUNCTION authenticated  EXECUTE 남긴다 — 새 RPC마다 손으로 grant하면 반드시 빠뜨린다
--   FUNCTION anon           EXECUTE 뺀다 — 정책 헬퍼는 그때 명시적으로 준다
--   SEQUENCE anon           전부 뺀다
--
-- owner가 둘(postgres · supabase_admin)이라 둘 다 건다. 지금 객체는 전부 postgres
-- 소유지만 supabase_admin 항목이 남아 있어 어느 쪽이 미래 객체에 걸릴지 단정할 수 없다.

-- begin;
--
-- alter default privileges for role postgres       in schema public
--   revoke truncate, references, trigger on tables from authenticated;
-- alter default privileges for role supabase_admin in schema public
--   revoke truncate, references, trigger on tables from authenticated;
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
--   2. scripts/default-privilege-check.mjs 신설 — 새 테이블을 pg_temp/rollback으로
--      만들어 anon·authenticated에 TRUNCATE·DELETE가 자동으로 안 붙는지 단언
--   3. scripts/regression-baselines.json 에 등록
--   4. pnpm db:snapshot 으로 docs/db-current-schema.sql 갱신

notify pgrst, 'reload schema';
