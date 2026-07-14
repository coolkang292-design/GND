-- ============================================================
-- Phase 2: 신원·크루 — profiles / groups / group_members + RLS
-- 계획서 §13(스키마)·§14(RLS)·§4(크루/초대) 기준.
-- 실행: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run
-- ============================================================

-- ── 테이블 ──────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  avatar_url text, -- 이모지 문자 또는 storage 경로
  weekly_goal int not null default 3 check (weekly_goal between 1 and 7),
  timezone text not null default 'Asia/Seoul',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30),
  invite_code text not null unique,
  owner_id uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── RLS 헬퍼 (재귀 없는 멤버십 판정: security definer) ──────

create or replace function public.is_group_member(gid uuid, uid uuid)
returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = uid
  )
$$;

-- uid가 현재 사용자와 같은 크루에 속해 있는가 (프로필 공개 범위)
create or replace function public.shares_group_with(uid uuid)
returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1
    from group_members mine
    join group_members theirs on mine.group_id = theirs.group_id
    where mine.user_id = auth.uid() and theirs.user_id = uid
  )
$$;

-- ── RLS 정책 (§14) ──────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- profiles: 본인 CRUD + 같은 크루원 조회
create policy "profiles_select_own_or_crew" on public.profiles
  for select using (id = auth.uid() or public.shares_group_with(id));
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- groups: 크루원만 조회, owner만 수정/삭제, 생성은 본인이 owner일 때만
create policy "groups_select_member" on public.groups
  for select using (public.is_group_member(id, auth.uid()));
create policy "groups_insert_owner" on public.groups
  for insert with check (owner_id = auth.uid());
create policy "groups_update_owner" on public.groups
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "groups_delete_owner" on public.groups
  for delete using (owner_id = auth.uid());

-- group_members: 크루원만 조회. 직접 insert는 '그룹 owner의 본인 추가'만
-- (초대코드 참여는 join_group_with_code RPC를 통해서만)
create policy "group_members_select_member" on public.group_members
  for select using (public.is_group_member(group_id, auth.uid()));
create policy "group_members_insert_owner_self" on public.group_members
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.groups g
      where g.id = group_id and g.owner_id = auth.uid()
    )
  );
create policy "group_members_delete_self_or_owner" on public.group_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.owner_id = auth.uid()
    )
  );

-- ── 초대코드 생성 ────────────────────────────────────────────
-- 혼동 문자(0/O/1/I/L) 제외 32자 알파벳 5자리: "GND-XXXXX"

create or replace function public.generate_invite_code()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  code text := '';
  i int;
begin
  for i in 1..5 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return 'GND-' || code;
end $$;

-- ── RPC: 크루 만들기 (그룹 + owner 멤버십을 한 트랜잭션으로) ──

create or replace function public.create_group(p_name text)
returns public.groups
language plpgsql volatile security invoker set search_path = public as $$
declare
  g public.groups;
  attempts int := 0;
begin
  loop
    begin
      insert into groups (name, invite_code, owner_id)
      values (trim(p_name), generate_invite_code(), auth.uid())
      returning * into g;
      exit;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts >= 5 then raise; end if;
    end;
  end loop;

  insert into group_members (group_id, user_id, role)
  values (g.id, auth.uid(), 'owner');

  return g;
end $$;

-- ── RPC: 초대코드로 참여 (비멤버는 그룹을 못 읽으므로 definer) ──

create or replace function public.join_group_with_code(p_code text)
returns table (group_id uuid, group_name text)
language plpgsql volatile security definer set search_path = public as $$
declare
  g public.groups;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into g from groups
  where invite_code = upper(trim(p_code));

  if not found then
    raise exception 'invalid_invite_code';
  end if;

  insert into group_members (group_id, user_id, role)
  values (g.id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  return query select g.id, g.name;
end $$;

-- 함수 실행 권한: 로그인(익명 포함) 사용자만
revoke execute on function public.join_group_with_code(text) from anon, public;
grant execute on function public.join_group_with_code(text) to authenticated;
revoke execute on function public.create_group(text) from anon, public;
grant execute on function public.create_group(text) to authenticated;
