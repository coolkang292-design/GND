-- 0045: start_challenge의 게이트를 그룹 멤버 → 챌린지 참가자로
-- 계획: docs/superpowers/plans/2026-07-30-challenge-rooms-0044.md (0044 마무리)
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0044는 수정 금지.
--
-- 0044가 집계·랭킹·화면을 challenge_participants로 옮겼는데 **시작 게이트만
-- group_members에 남아 있었다.** 그래서 새 챌린지를 만들면:
--   · 초대하지 않은 크루원까지 "참여자"로 세어지고
--   · 그 사람이 목표를 세우고 동의해야 시작됐다
-- 크루 3명 중 2명만으로 챌린지를 돌리는 것이 불가능했다. 2026-07-31 실사용에서
-- 드러났다.
--
-- ⚠ 진행 중인 7월 GND 챌린지에는 영향이 없다. 이 함수는 status='setup'에서만
--    동작하고, 그 챌린지는 이미 active다. 점수도 건드리지 않는다.
--
-- 판정 대상은 status='joined'인 참가자다.
--   · invited — 아직 수락 전이라 참가자가 아니다. 이 사람 때문에 시작이 막히면
--     초대해 놓고 답이 없을 때 방장이 영영 시작할 수 없다.
--   · dropped — autostart가 "목표 0개"인 사람을 빼는 상태다. 수동 시작에서도
--     같은 뜻이어야 하므로 게이트 대상에서 뺀다.
--
-- 접근 판정도 함께 옮긴다. 예전엔 is_group_member로 "이 그룹 사람인가"를 봤는데,
-- 0044부터 타 그룹 사람이 초대로 참가할 수 있으므로 그 판정으로는 정작 참가자가
-- 자기 챌린지를 시작하지 못한다.

begin;

create or replace function public.start_challenge(p_challenge_id uuid)
returns public.challenges
language plpgsql volatile security definer set search_path = public as $$
declare c challenges; total int; missing int; approvals int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from challenges where id = p_challenge_id for update;
  -- 0045: is_group_member → is_challenge_participant
  if not found or not public.is_challenge_participant(p_challenge_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  -- 0045: group_members → challenge_participants (joined만)
  select count(*) into total from challenge_participants cp
  where cp.challenge_id = p_challenge_id and cp.status = 'joined';

  -- 참가자가 0명인 상태로 시작되면 랭킹도 집계도 빈 껍데기가 된다.
  -- create_challenge_room이 방장을 host·joined로 넣으므로 정상 경로에선 1 이상이다.
  if total = 0 then raise exception 'no_participants'; end if;

  select count(*) into missing from challenge_participants cp
  where cp.challenge_id = p_challenge_id
    and cp.status = 'joined'
    and not exists (select 1 from user_goals ug
                    where ug.challenge_id = p_challenge_id and ug.user_id = cp.user_id);
  if missing > 0 then raise exception 'kpi_incomplete:%/%', total - missing, total; end if;

  -- 전원 동의 게이트 (0025). 대상만 참가자로 바뀐다.
  select count(*) into approvals from challenge_goal_approvals a
  where a.challenge_id = p_challenge_id
    and exists (select 1 from challenge_participants cp
                where cp.challenge_id = p_challenge_id
                  and cp.user_id = a.approver_id
                  and cp.status = 'joined');
  if approvals < total then raise exception 'consent_incomplete:%/%', approvals, total; end if;

  update challenges set status = 'active' where id = p_challenge_id returning * into c;
  return c;
end $$;
revoke execute on function public.start_challenge(uuid) from anon, public;
grant execute on function public.start_challenge(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) 본문이 참가자 기준인가 — group_members가 없고 challenge_participants가 있어야 한다
--   select pg_get_functiondef(oid) from pg_proc where proname = 'start_challenge';
--
-- (2) 진행 중 챌린지는 그대로인가 — active 1건, 목표 9개
--   select status, count(*) from challenges group by status;
--   select count(*) from user_goals ug join challenges c on c.id = ug.challenge_id
--   where c.status = 'active';
