-- 0025: 챌린지 목표 상호 동의 — 전원이 서로의 목표에 동의해야 시작
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회). 0022~0024는 수정하지 않는다.
--
-- 흐름: setup에서 전원이 목표를 세팅한 뒤, 각 크루원이 "전원의 목표에 동의"를
-- 1회 기록한다. 전원 동의가 모이면 start_challenge가 통과된다.

create table if not exists public.challenge_goal_approvals (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  approver_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  approved_at timestamptz not null default now(),
  primary key (challenge_id, approver_id)
);

alter table public.challenge_goal_approvals enable row level security;
revoke all on public.challenge_goal_approvals from anon, authenticated;
grant select on public.challenge_goal_approvals to authenticated;

-- 같은 크루의 동의만 조회 (setup 현황 표시용)
drop policy if exists "approvals_select_crew" on public.challenge_goal_approvals;
create policy "approvals_select_crew" on public.challenge_goal_approvals
  for select using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and public.is_group_member(c.group_id, auth.uid())
    )
  );
-- insert/delete는 아래 정의자 RPC만 (직접 쓰기 금지 — 위조 방지)

-- ── 동의 기록 (setup·전원 목표 세팅 완료 상태에서만) ──────────
create or replace function public.approve_challenge_goals(p_challenge_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare c challenges; v_missing int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from challenges where id = p_challenge_id;
  if not found or not is_group_member(c.group_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;
  -- 전원 목표 세팅 전에는 동의 불가 (목표가 확정돼야 동의가 의미 있음)
  select count(*) into v_missing from group_members gm
  where gm.group_id = c.group_id
    and not exists (select 1 from user_goals ug
                    where ug.challenge_id = p_challenge_id and ug.user_id = gm.user_id);
  if v_missing > 0 then raise exception 'kpi_incomplete'; end if;

  insert into challenge_goal_approvals (challenge_id, approver_id)
  values (p_challenge_id, auth.uid())
  on conflict (challenge_id, approver_id) do nothing;
end $$;
revoke all on function public.approve_challenge_goals(uuid) from anon, public;
grant execute on function public.approve_challenge_goals(uuid) to authenticated;

-- ── 동의 철회 (누군가 목표를 수정하면 동의도 리셋되게 하는 용도) ──
create or replace function public.unapprove_challenge_goals(p_challenge_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare c challenges;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from challenges where id = p_challenge_id;
  if not found or not is_group_member(c.group_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  delete from challenge_goal_approvals
  where challenge_id = p_challenge_id and approver_id = auth.uid();
end $$;
revoke all on function public.unapprove_challenge_goals(uuid) from anon, public;
grant execute on function public.unapprove_challenge_goals(uuid) to authenticated;

-- ── start_challenge 재정의: 전원 목표 + 전원 동의 게이트 추가 ──
create or replace function public.start_challenge(p_challenge_id uuid)
returns public.challenges
language plpgsql volatile security definer set search_path = public as $$
declare c challenges; total int; missing int; approvals int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from challenges where id = p_challenge_id for update;
  if not found or not is_group_member(c.group_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  select count(*) into total from group_members gm where gm.group_id = c.group_id;
  select count(*) into missing from group_members gm
  where gm.group_id = c.group_id
    and not exists (select 1 from user_goals ug
                    where ug.challenge_id = p_challenge_id and ug.user_id = gm.user_id);
  if missing > 0 then raise exception 'kpi_incomplete:%/%', total - missing, total; end if;

  -- 신규: 전원 동의 게이트
  select count(*) into approvals from challenge_goal_approvals a
  where a.challenge_id = p_challenge_id
    and exists (select 1 from group_members gm
                where gm.group_id = c.group_id and gm.user_id = a.approver_id);
  if approvals < total then raise exception 'consent_incomplete:%/%', approvals, total; end if;

  update challenges set status = 'active' where id = p_challenge_id returning * into c;
  return c;
end $$;
revoke execute on function public.start_challenge(uuid) from anon, public;
grant execute on function public.start_challenge(uuid) to authenticated;
