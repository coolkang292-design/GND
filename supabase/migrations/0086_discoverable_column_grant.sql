-- 0086: challenges.discoverable 컬럼 UPDATE 권한
-- 설계: docs/superpowers/plans/2026-08-31-follow-profile-discoverable.md
-- 적용: Supabase Dashboard -> SQL Editor에 전체 붙여넣고 Run (1회만).
--       0001~0085는 수정하지 않는다.
--
-- 배포보다 먼저 Run 해도 안전하다. 컬럼 하나에 UPDATE를 여는 것뿐이고,
-- 운영 앱은 아직 그 컬럼을 쓰지 않는다.
--
-- ── 왜 필요한가 ────────────────────────────────────────────
--
-- 0085에서 방장이 `discoverable`을 **직접 UPDATE**하게 설계했다. 근거는
-- `challenges_update_creator` 정책(`created_by = auth.uid()`)이 이미 있다는
-- 것이었는데, **그것만으로는 못 쓴다.**
--
--   RLS 정책 = 어떤 **행**을 건드릴 수 있나
--   GRANT    = 그 **작업 자체**를 할 수 있나
--
-- 둘 다 있어야 한다. 운영 DB를 확인하니 `authenticated`의 challenges 권한은
-- `DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE` 뿐 — **UPDATE가 없다.**
-- 그래서 직접 UPDATE는 RLS에 닿기도 전에 `42501 permission denied`로 죽는다.
-- (실제로 흉내 내 보고 잡았다.)
--
-- ── 왜 테이블 전체가 아니라 컬럼 하나인가 ──────────────────
--
-- 이 스키마가 이미 그렇게 하고 있다. `workout_sessions`도 테이블 UPDATE는 없고
-- **컬럼 단위로만** 열려 있다:
--   deleted_at, group_id, intensity, memo, timezone, title, visibility, workout_type
-- `completed_at`·`started_at`·`status`처럼 **서버 시간이 진실인 칸은 빠져 있다** —
-- 그건 RPC만 쓴다. 같은 사상을 따른다.
--
-- ⚠️⚠️ **`grant update on challenges`(테이블 전체)로 바꾸지 마라.** 그러면 방장이
--    REST를 직접 불러 `status`를 `setup -> active`로 바꿀 수 있게 된다 —
--    `start_challenge`의 전원 목표·동의 게이트를 통째로 건너뛴다.
--    (0085 계획서에 "이미 그럴 여지가 있다"고 부채로 적었는데, **틀렸다.**
--     GRANT가 없어서 애초에 불가능했다. 여기서 그 문을 열면 안 된다.)
--
-- 되돌리기: revoke update (discoverable) on public.challenges from authenticated;

begin;

grant update (discoverable) on public.challenges to authenticated;

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) 컬럼 권한이 생겼나 — true
--   select has_column_privilege('authenticated','public.challenges','discoverable','UPDATE');
--
-- (2) ⚠️ 테이블 전체 UPDATE는 여전히 **없어야** 한다 — false
--     true가 나오면 방장이 status를 직접 바꿀 수 있다는 뜻이다.
--   select has_table_privilege('authenticated','public.challenges','UPDATE');
--
-- (3) status 컬럼은 여전히 잠겨 있어야 한다 — false
--   select has_column_privilege('authenticated','public.challenges','status','UPDATE');
