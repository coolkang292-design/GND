-- 0050: 목표 등록을 챌린지 참가자에게도 연다 — 링크 초대의 마지막 조각
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0049는 수정 금지.
--
-- 0049 검증에서 드러났다. 크루 밖 사람이 링크로 참가하는 데까지는 성공했는데
-- **목표를 세울 수 없어** 시작이 kpi_incomplete:1/2로 막혔다. 즉 링크로 들어와도
-- 아무것도 못 하는 반쪽 참가자가 된다.
--
-- 원인 (docs/db-current-schema.sql로 확인한 현행 정의):
--
--   goals_insert_own_setup check:
--     user_id = auth.uid()
--     AND challenge_in_setup(challenge_id)
--     AND EXISTS (challenges c WHERE c.id = challenge_id AND c.group_id = user_goals.group_id)
--     AND is_group_member(group_id, auth.uid())        ← 이 줄
--
-- 마지막 줄이 "이 그룹 사람만 목표를 세울 수 있다"를 강제한다. 챌린지가 그룹
-- 소유였을 때(0006)는 맞는 말이었지만, 0044부터 챌린지는 참가자가 갖는다.
--
-- 0044·0047과 같은 방식으로 **덧붙이기만** 한다(참가자 OR 그룹멤버). 기존 같은
-- 그룹 사용자에게는 판정이 그대로다 — 참이던 것이 거짓이 되지 않는다.
--
-- c.group_id = user_goals.group_id 조건은 그대로 둔다. 앱이 이미 **챌린지의**
-- group_id를 넣고 있고(0044에서 고쳤다), 이 컬럼은 정리 단계에서 드롭된다.
--
-- 전수 확인: docs/db-current-schema.sql에서 그룹 술어가 남은 정책을 모두 훑었고,
-- 링크 참가자를 막는 것은 이 하나뿐이었다.
--   challenges_select_member  0044 참가자 OR 그룹        ✅
--   goals_select_member       0044 참가자 OR 그룹        ✅
--   approvals_select_crew     0047 참가자 OR 그룹        ✅
--   profiles_select_own_or_crew  crew 기준 — D5로 연결됨 ✅
--   sessions_insert_own_draft    group_id null 허용     ✅ (본인 그룹이면 통과)
--   challenges_insert_member     직접 insert 경로 — 앱은 RPC만 쓴다. 그대로 둔다
--
-- ⚠ 진행 중인 7월 GND 챌린지에는 영향이 없다. 참가자 3명 == 그룹 멤버 3명이라
--    어느 arm으로도 같은 결과이고, active라 challenge_in_setup이 이미 false다.

begin;

drop policy if exists "goals_insert_own_setup" on public.user_goals;
create policy "goals_insert_own_setup" on public.user_goals
  for insert with check (
    user_id = auth.uid()
    and public.challenge_in_setup(challenge_id)
    and exists (
      select 1 from public.challenges c
      where c.id = challenge_id and c.group_id = user_goals.group_id
    )
    and (
      public.is_challenge_participant(challenge_id, auth.uid())  -- 0050
      or public.is_group_member(group_id, auth.uid())            -- 정리 단계에서 제거
    )
  );

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 ────────────────────────────────────────────────
-- 로컬에서: node scripts/challenge-invite-link-check.mjs  → 13/13
--
-- SQL Editor에서:
--   select policyname, with_check from pg_policies
--   where schemaname='public' and policyname='goals_insert_own_setup';
--   → with_check에 is_challenge_participant가 있어야 한다
