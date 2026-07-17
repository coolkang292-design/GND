-- ============================================================
-- Phase 5: 챌린지 — challenges / user_goals + RLS + 시작 게이트 RPC
-- 계획서 §5(KPI 두 층위)·§6(라이프사이클)·§13·§14·§15 기준.
-- 실행: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run
-- ============================================================

-- ── challenges (§13) ─────────────────────────────────────────

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  start_date date not null,
  end_date date not null,
  status text not null default 'setup'
    check (status in ('setup', 'active', 'ended', 'cancelled')),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check (start_date <= end_date)
);

-- 크루당 살아있는(setup/active) 챌린지는 1개
create unique index challenges_one_live
  on public.challenges (group_id) where status in ('setup', 'active');

-- ── user_goals (§13) — 유저당 challenge별 여러 행 ────────────

create table public.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  goal_type text not null
    check (goal_type in ('frequency', 'distance', 'duration', 'volume', 'reps')),
  target_value numeric(10, 1) not null check (target_value > 0),
  unit text, -- 표시용: 회/km/분/kg
  planned_days int not null default 5 check (planned_days between 1 and 7), -- 주 N일
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, challenge_id, goal_type)
);

create trigger user_goals_updated_at
  before update on public.user_goals
  for each row execute function public.set_updated_at();

-- ── RLS 헬퍼 ─────────────────────────────────────────────────

create or replace function public.challenge_in_setup(cid uuid)
returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from challenges where id = cid and status = 'setup'
  )
$$;

-- ── RLS (§14: 크루원 조회, 본인 목표만 생성·수정, 종료 기록 보존) ──

alter table public.challenges enable row level security;
alter table public.user_goals enable row level security;

create policy "challenges_select_member" on public.challenges
  for select using (public.is_group_member(group_id, auth.uid()));
create policy "challenges_insert_member" on public.challenges
  for insert with check (
    created_by = auth.uid()
    and public.is_group_member(group_id, auth.uid())
    and status = 'setup'
  );
create policy "challenges_update_creator" on public.challenges
  for update using (created_by = auth.uid())
  with check (created_by = auth.uid());
create policy "challenges_delete_creator_setup" on public.challenges
  for delete using (created_by = auth.uid() and status = 'setup');

-- user_goals: 크루원 조회(설정 현황·결과 공개용), 쓰기는 본인 + setup 단계만
-- → active 이후 목표 수정 불가 = 종료 기록 보존
create policy "goals_select_member" on public.user_goals
  for select using (public.is_group_member(group_id, auth.uid()));
create policy "goals_insert_own_setup" on public.user_goals
  for insert with check (
    user_id = auth.uid()
    and public.challenge_in_setup(challenge_id)
    and exists (
      select 1 from public.challenges c
      where c.id = challenge_id and c.group_id = user_goals.group_id
    )
    and public.is_group_member(group_id, auth.uid())
  );
create policy "goals_update_own_setup" on public.user_goals
  for update using (user_id = auth.uid() and public.challenge_in_setup(challenge_id))
  with check (user_id = auth.uid() and public.challenge_in_setup(challenge_id));
create policy "goals_delete_own_setup" on public.user_goals
  for delete using (user_id = auth.uid() and public.challenge_in_setup(challenge_id));

-- ── 컬럼 권한: status 전이는 RPC 전용 (§15) ──────────────────

revoke all on public.challenges from anon;
revoke all on public.user_goals from anon;

revoke insert, update on public.challenges from authenticated;
grant insert (id, group_id, name, start_date, end_date, created_by)
  on public.challenges to authenticated;
grant update (name, start_date, end_date)
  on public.challenges to authenticated;

-- ── RPC: 챌린지 시작 — 전원 KPI 게이트 (§6·§15) ──────────────

create or replace function public.start_challenge(p_challenge_id uuid)
returns public.challenges
language plpgsql volatile security definer set search_path = public as $$
declare
  c challenges;
  missing int;
  total int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into c from challenges
  where id = p_challenge_id
  for update;

  if not found or not is_group_member(c.group_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  if c.status <> 'setup' then
    raise exception 'invalid_status:%', c.status;
  end if;

  -- 전원 KPI 게이트: 크루원 전원이 목표 1개 이상
  select count(*) into total from group_members gm where gm.group_id = c.group_id;
  select count(*) into missing
  from group_members gm
  where gm.group_id = c.group_id
    and not exists (
      select 1 from user_goals ug
      where ug.challenge_id = p_challenge_id and ug.user_id = gm.user_id
    );

  if missing > 0 then
    raise exception 'kpi_incomplete:%/%', total - missing, total;
  end if;

  update challenges set status = 'active'
  where id = p_challenge_id
  returning * into c;

  return c;
end $$;

-- ── RPC: 챌린지 취소 (생성자, setup/active) ──────────────────

create or replace function public.cancel_challenge(p_challenge_id uuid)
returns public.challenges
language plpgsql volatile security definer set search_path = public as $$
declare
  c challenges;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into c from challenges
  where id = p_challenge_id and created_by = auth.uid()
  for update;

  if not found then
    raise exception 'challenge_not_found';
  end if;
  if c.status not in ('setup', 'active') then
    raise exception 'invalid_status:%', c.status;
  end if;

  update challenges set status = 'cancelled'
  where id = p_challenge_id
  returning * into c;

  return c;
end $$;

-- ── RPC: 챌린지 종료 확정 — 종료일 지난 active를 ended로 ─────
-- (순위·점수는 저장하지 않고 계산 — §13 불변식. 상태만 확정)

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

  if not found or not is_group_member(c.group_id, auth.uid()) then
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

revoke execute on function public.start_challenge(uuid) from anon, public;
grant execute on function public.start_challenge(uuid) to authenticated;
revoke execute on function public.cancel_challenge(uuid) from anon, public;
grant execute on function public.cancel_challenge(uuid) to authenticated;
revoke execute on function public.finalize_challenge(uuid) from anon, public;
grant execute on function public.finalize_challenge(uuid) to authenticated;
