-- 0046: 남은 챌린지 RPC 3개의 그룹 의존을 참가자로 (0045의 마무리)
-- 계획: docs/superpowers/plans/2026-07-30-challenge-rooms-0044.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0045는 수정 금지.
--
-- 0045가 start_challenge만 고쳤는데, 같은 전제를 공유하는 형제 함수 3개가 남아
-- 있었다. 실측으로 드러났다 — 그룹 3명 중 2명만 참가한 챌린지에서
-- start_challenge의 분모는 2로 맞게 나왔지만(0045 적용됨) 동의가 영원히 0이라
-- consent_incomplete:0/2로 시작이 막혔다.
--
-- 원인: approve_challenge_goals가 "전원 목표 세팅" 여부를 **group_members**로
-- 센다(0025:41). 참가하지 않은 크루원은 목표가 없으니 v_missing > 0이 되어
-- 동의 자체가 kpi_incomplete로 거부된다. 즉 0045만으로는 그 챌린지를 영영
-- 시작할 수 없었다.
--
-- 함께 고치는 두 곳도 같은 계열이다. 접근 판정이 is_group_member라, 타 그룹에서
-- 초대로 참가한 사람이 동의를 철회하거나 결과를 확정하지 못한다.
--
-- ⚠ 진행 중인 7월 GND 챌린지에는 영향이 없다. 그 챌린지는 참가자 3명 == 그룹
--    멤버 3명이라 어느 기준으로 세도 결과가 같다. finalize도 종료일(2026-09-30)
--    전에는 not_ended_yet으로 막히는 것이 그대로다.

begin;

-- ── 1. approve_challenge_goals ───────────────────────────────
-- 접근 판정과 "전원 목표 세팅" 판정을 둘 다 참가자 기준으로.
create or replace function public.approve_challenge_goals(p_challenge_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare c challenges; v_missing int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from challenges where id = p_challenge_id;
  -- 0046: is_group_member → is_challenge_participant
  if not found or not public.is_challenge_participant(p_challenge_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  -- 전원 목표 세팅 전에는 동의 불가 (목표가 확정돼야 동의가 의미 있음).
  -- 0046: group_members → challenge_participants(joined). 참가하지 않은
  -- 크루원의 목표를 기다리면 동의가 영영 불가능해진다.
  select count(*) into v_missing from challenge_participants cp
  where cp.challenge_id = p_challenge_id
    and cp.status = 'joined'
    and not exists (select 1 from user_goals ug
                    where ug.challenge_id = p_challenge_id and ug.user_id = cp.user_id);
  if v_missing > 0 then raise exception 'kpi_incomplete'; end if;

  insert into challenge_goal_approvals (challenge_id, approver_id)
  values (p_challenge_id, auth.uid())
  on conflict (challenge_id, approver_id) do nothing;
end $$;
revoke all on function public.approve_challenge_goals(uuid) from anon, public;
grant execute on function public.approve_challenge_goals(uuid) to authenticated;

-- ── 2. unapprove_challenge_goals ─────────────────────────────
create or replace function public.unapprove_challenge_goals(p_challenge_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare c challenges;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from challenges where id = p_challenge_id;
  -- 0046: is_group_member → is_challenge_participant
  if not found or not public.is_challenge_participant(p_challenge_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  delete from challenge_goal_approvals
  where challenge_id = p_challenge_id and approver_id = auth.uid();
end $$;
revoke all on function public.unapprove_challenge_goals(uuid) from anon, public;
grant execute on function public.unapprove_challenge_goals(uuid) to authenticated;

-- ── 3. finalize_challenge ────────────────────────────────────
-- 본문은 0013 그대로고 접근 판정 한 줄만 바꾼다.
create or replace function public.finalize_challenge(p_challenge_id uuid)
returns public.challenges
language plpgsql volatile security definer set search_path = public as $$
declare
  c challenges;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into c from challenges
  where id = p_challenge_id
  for update;

  -- 0046: is_group_member → is_challenge_participant
  if not found or not public.is_challenge_participant(p_challenge_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  if c.status <> 'active' then
    raise exception 'invalid_status:%', c.status;
  end if;
  if c.end_date >= (now() at time zone 'Asia/Seoul')::date then
    raise exception 'not_ended_yet';
  end if;

  update challenges set status = 'ended'
  where id = p_challenge_id
  returning * into c;
  return c;
end $$;
revoke execute on function public.finalize_challenge(uuid) from anon, public;
grant execute on function public.finalize_challenge(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) 세 함수 본문에 group_members·is_group_member가 없어야 한다
--   select proname, pg_get_functiondef(oid) ilike '%is_group_member%'
--            or pg_get_functiondef(oid) ilike '%group_members%' as still_group_based
--   from pg_proc
--   where proname in ('approve_challenge_goals','unapprove_challenge_goals',
--                     'finalize_challenge','start_challenge');
--   → 네 행 모두 still_group_based = false
--
-- (2) 진행 중 챌린지는 그대로인가 — active 1건, 목표 9개
--   select status, count(*) from challenges group by status;
