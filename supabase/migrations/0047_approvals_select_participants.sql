-- 0047: challenge_goal_approvals 읽기를 참가자에게도 연다 (0044·0046의 마지막 조각)
-- 계획: docs/superpowers/plans/2026-07-30-challenge-rooms-0044.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0046은 수정 금지.
--
-- 챌린지 관련 정책을 전수 조사한 결과 그룹 기준으로 남은 마지막 한 곳이다.
--
--   challenges                 0044 — 참가자 or 그룹  ✅
--   user_goals                 0044 — 참가자 or 그룹  ✅
--   challenge_participants     0042 — 참가자          ✅
--   challenge_peek_picks       0040 — 본인            ✅
--   challenge_goal_approvals   0025 — **그룹뿐**      ← 이 파일이 고친다
--
-- 증상: 타 그룹에서 초대로 참가한 사람은 setup 화면의 "동의 현황"이 전원
-- 미동의로 보인다. 자기가 누른 동의조차 안 보인다 — 동의는 됐는데 화면이
-- 안 읽어서, 사용자는 버튼이 고장 났다고 판단하게 된다.
--
-- 0044와 같은 방식으로 **덧붙이기만** 한다(참가자 OR 그룹멤버). 기존 같은 그룹
-- 사용자에게는 판정 결과가 그대로다 — 참이던 것이 거짓이 되지 않는다.
--
-- ⚠ 진행 중인 7월 GND 챌린지에는 영향이 없다. 참가자 3명 == 그룹 멤버 3명이라
--    어느 arm으로도 같은 결과다. 쓰기 경로(RPC 전용)는 손대지 않는다.

begin;

drop policy if exists "approvals_select_crew" on public.challenge_goal_approvals;
create policy "approvals_select_crew" on public.challenge_goal_approvals
  for select using (
    public.is_challenge_participant(challenge_id, auth.uid())   -- 0047
    or exists (
      select 1 from public.challenges c
      where c.id = challenge_id and public.is_group_member(c.group_id, auth.uid())
    )
  );

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) qual에 is_challenge_participant가 있어야 한다
--   select policyname, qual from pg_policies
--   where schemaname='public' and tablename='challenge_goal_approvals';
--
-- (2) 챌린지 경로에 그룹 의존이 남았는지 최종 확인 — 전부 false여야 한다
--   select proname,
--          pg_get_functiondef(oid) ilike '%is_group_member%'
--       or pg_get_functiondef(oid) ilike '%group_members%' as still_group_based
--   from pg_proc
--   where proname in ('start_challenge','approve_challenge_goals',
--                     'unapprove_challenge_goals','finalize_challenge');
--   ※ create_challenge_room은 예외다 — challenges.group_id(not null)를 채우려고
--     일부러 group_members를 읽는다. 그 컬럼을 드롭하는 정리 단계에서 없어진다.
