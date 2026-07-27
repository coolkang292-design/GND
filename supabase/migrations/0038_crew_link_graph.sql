-- 0038: 크루 연결 그래프 — 닉네임 검색 · 상호 수락 (추가만)
-- 설계: docs/superpowers/specs/2026-07-28-crew-link-graph-design.md
-- 계획: docs/superpowers/plans/2026-07-28-crew-link-graph.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0037은 수정 금지.
--
-- 이 파일은 테이블·판정함수·알림유형·RPC를 "추가"만 한다. 기존 그룹 기반 권한
-- 검사는 그대로라 적용 직후에도 앱은 지금과 똑같이 돈다. 실제 전환은 0039다.
-- 순서를 나눈 이유: 0038만 적용된 상태로 크루 화면을 먼저 배포해 실기기로 확인한
-- 뒤 0039로 전환해야, 문제가 생겨도 되돌릴 지점이 있다.

-- ── 1. 요청 이력 ─────────────────────────────────────────────
create table if not exists public.crew_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'canceled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint crew_requests_not_self check (requester_id <> addressee_id)
);

-- 진행 중 요청은 방향당 1건. 거절 뒤 재요청은 새 행으로 허용된다.
create unique index if not exists crew_requests_pending_unique
  on public.crew_requests (requester_id, addressee_id)
  where status = 'pending';
create index if not exists crew_requests_inbox_idx
  on public.crew_requests (addressee_id, status);
create index if not exists crew_requests_outbox_idx
  on public.crew_requests (requester_id, status);

-- ── 2. 수락된 연결 ───────────────────────────────────────────
-- user_a < user_b 정규화: 대칭 관계를 두 행으로 저장하면 한쪽만 지워진 반쪽
-- 상태가 생긴다. "쌍 하나 = 행 하나"를 DB가 강제한다.
create table if not exists public.crew_links (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint crew_links_ordered check (user_a < user_b)
);
create index if not exists crew_links_user_b_idx on public.crew_links (user_b);

-- ── 3. RLS — 읽기만 열고 쓰기는 RPC로만 ──────────────────────
alter table public.crew_requests enable row level security;
alter table public.crew_links enable row level security;
revoke all on public.crew_requests from anon, authenticated;
revoke all on public.crew_links from anon, authenticated;
grant select on public.crew_requests to authenticated;
grant select on public.crew_links to authenticated;

drop policy if exists "crew_requests_mine_select" on public.crew_requests;
create policy "crew_requests_mine_select" on public.crew_requests
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "crew_links_mine_select" on public.crew_links;
create policy "crew_links_mine_select" on public.crew_links
  for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- ── 4. 관계 판정 — 0039가 shares_group_with 자리에 이걸 넣는다 ─
-- RLS 정책이 부르는 판정 함수라 revoke하지 않는다(0001의 shares_group_with와 같다).
-- 정책은 호출자 권한으로 평가되므로 revoke하면 anon 요청이 0행이 아니라 42501로 죽는다.
create or replace function public.is_crew_with(uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crew_links
    where user_a = least((select auth.uid()), uid)
      and user_b = greatest((select auth.uid()), uid)
  )
$$;

-- ── 5. 알림 유형 2종 추가 (0034 목록에 이어붙임) ─────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'workout_started', 'cheer_received', 'poke', 'reaction_received',
  'rank_change', 'record_viewed', 'morning_briefing',
  'challenge_started', 'challenge_ended', 'record_beaten', 'badge_earned',
  'level_up', 'app_update',
  'crew_request', 'crew_accepted'
));

-- ── 6. 기존 크루원 자동 연결 ─────────────────────────────────
-- 같은 그룹에 있던 모든 쌍을 연결로 옮긴다. 리얼GND 3명 → 3쌍.
-- crew_links가 비어 있을 때만 돈다 — 이 파일을 다시 Run해도 "해제한 사이"가
-- 되살아나지 않게 하려는 것이다. on conflict만으로는 중복만 막고 삭제는 못 막는다.
-- 프로필 없는 계정(온보딩 미완)은 FK가 막으므로 미리 걸러 낸다.
insert into public.crew_links (user_a, user_b)
select distinct a.user_id, b.user_id
from public.group_members a
join public.group_members b
  on a.group_id = b.group_id and a.user_id < b.user_id
where not exists (select 1 from public.crew_links)
  and exists (select 1 from public.profiles p where p.id = a.user_id)
  and exists (select 1 from public.profiles p where p.id = b.user_id)
on conflict do nothing;

-- ── 7. RPC ───────────────────────────────────────────────────
-- 검색은 정확 일치 1행만 준다. 앞글자 검색을 열면 전체 가입자 명단을 훑을 수
-- 있고, 유료 확장 시 그대로 위험이 된다. 닉네임은 0017에서 유일값이다.
-- relation을 서버가 실어 주므로 화면이 버튼 상태를 추측하지 않는다.
create or replace function public.search_profile_by_nickname(p_nickname text)
returns table (
  id uuid, nickname text, avatar_url text,
  relation text, request_id uuid
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.nickname, p.avatar_url,
    case
      when p.id = auth.uid()            then 'self'
      when public.is_crew_with(p.id)    then 'crew'
      when r_out.id is not null         then 'request_sent'
      when r_in.id is not null          then 'request_received'
      else 'none'
    end,
    coalesce(r_out.id, r_in.id)
  from public.profiles p
  left join public.crew_requests r_out
    on r_out.requester_id = auth.uid()
   and r_out.addressee_id = p.id
   and r_out.status = 'pending'
  left join public.crew_requests r_in
    on r_in.requester_id = p.id
   and r_in.addressee_id = auth.uid()
   and r_in.status = 'pending'
  where auth.uid() is not null
    and btrim(p_nickname) <> ''
    and lower(btrim(p.nickname)) = lower(btrim(p_nickname))
  limit 1
$$;
revoke all on function public.search_profile_by_nickname(text) from public, anon;
grant execute on function public.search_profile_by_nickname(text) to authenticated;

-- 수락 RPC (요청 RPC가 이걸 부르므로 먼저 정의한다)
create or replace function public.accept_crew_request(p_request_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_req crew_requests%rowtype;
  v_nick text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into v_req from crew_requests where id = p_request_id for update;
  if not found or v_req.addressee_id <> v_me then
    raise exception 'not_addressee';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'not_pending';
  end if;

  insert into crew_links (user_a, user_b)
  values (least(v_req.requester_id, v_req.addressee_id),
          greatest(v_req.requester_id, v_req.addressee_id))
  on conflict do nothing;

  update crew_requests
     set status = 'accepted', responded_at = now()
   where id = p_request_id;

  -- 반대 방향에 남아 있던 pending도 함께 닫는다. 안 닫으면 이미 크루가 된
  -- 뒤에도 상대 받은함에 요청이 남아 "수락" 버튼이 계속 보인다.
  update crew_requests
     set status = 'accepted', responded_at = now()
   where requester_id = v_req.addressee_id
     and addressee_id = v_req.requester_id
     and status = 'pending';

  select nickname into v_nick from profiles where id = v_me;
  perform notify(
    v_req.requester_id, v_me, 'crew_accepted', p_request_id,
    coalesce(v_nick, '누군가') || '님과 크루가 됐어요 🤝',
    '이제 서로의 운동 소식을 받아볼 수 있어요'
  );
  return jsonb_build_object('status', 'accepted');
end $$;
revoke all on function public.accept_crew_request(uuid) from public, anon;
grant execute on function public.accept_crew_request(uuid) to authenticated;

-- 요청 RPC (역방향 자동 수락 포함)
create or replace function public.send_crew_request(p_target_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_nick text;
  v_reverse crew_requests%rowtype;
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_target_id = v_me then raise exception 'self_request'; end if;
  if not exists (select 1 from profiles where id = p_target_id) then
    raise exception 'target_not_found';
  end if;
  if public.is_crew_with(p_target_id) then raise exception 'already_crew'; end if;

  -- 역방향 pending이 있으면 양쪽이 서로를 원한 것이다 → 즉시 맺는다.
  -- 이게 없으면 "둘 다 요청했는데 아무 일도 안 일어남"이 되고, 사용자는
  -- 원인을 알 수 없다.
  select * into v_reverse from crew_requests
  where requester_id = p_target_id and addressee_id = v_me
    and status = 'pending'
  limit 1;
  if found then
    perform public.accept_crew_request(v_reverse.id);
    return jsonb_build_object('status', 'accepted', 'requestId', v_reverse.id);
  end if;

  if exists (select 1 from crew_requests
             where requester_id = v_me and addressee_id = p_target_id
               and status = 'pending') then
    raise exception 'request_exists';
  end if;

  insert into crew_requests (requester_id, addressee_id)
  values (v_me, p_target_id)
  returning id into v_id;

  select nickname into v_nick from profiles where id = v_me;
  perform notify(
    p_target_id, v_me, 'crew_request', v_id,
    coalesce(v_nick, '누군가') || '님이 크루 요청을 보냈어요 🤝',
    '수락하면 서로의 운동 소식을 받아볼 수 있어요'
  );
  return jsonb_build_object('status', 'pending', 'requestId', v_id);
end $$;
revoke all on function public.send_crew_request(uuid) from public, anon;
grant execute on function public.send_crew_request(uuid) to authenticated;

-- 거절·취소·해제 RPC — 세 개 모두 알림을 보내지 않는다.
-- 거절당한 사실을 통보하면 지인 기반 앱에서 관계가 상한다.
-- cancel_crew_request는 서버에만 둔다. 화면에서 request_sent는 비활성
-- "요청됨"이라 취소 버튼이 없다. 나중에 취소 UI를 붙일 때 RPC는 이미 있다.
create or replace function public.reject_crew_request(p_request_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_req crew_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_req from crew_requests where id = p_request_id for update;
  if not found or v_req.addressee_id <> auth.uid() then
    raise exception 'not_addressee';
  end if;
  if v_req.status <> 'pending' then raise exception 'not_pending'; end if;
  update crew_requests set status = 'rejected', responded_at = now()
   where id = p_request_id;
  return jsonb_build_object('status', 'rejected');
end $$;

create or replace function public.cancel_crew_request(p_request_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_req crew_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_req from crew_requests where id = p_request_id for update;
  if not found or v_req.requester_id <> auth.uid() then
    raise exception 'not_requester';
  end if;
  if v_req.status <> 'pending' then raise exception 'not_pending'; end if;
  update crew_requests set status = 'canceled', responded_at = now()
   where id = p_request_id;
  return jsonb_build_object('status', 'canceled');
end $$;

create or replace function public.remove_crew(p_target_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_count int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from crew_links
   where user_a = least(auth.uid(), p_target_id)
     and user_b = greatest(auth.uid(), p_target_id);
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'not_crew'; end if;
  return jsonb_build_object('status', 'removed');
end $$;

revoke all on function public.reject_crew_request(uuid) from public, anon;
revoke all on function public.cancel_crew_request(uuid) from public, anon;
revoke all on function public.remove_crew(uuid) from public, anon;
grant execute on function public.reject_crew_request(uuid) to authenticated;
grant execute on function public.cancel_crew_request(uuid) to authenticated;
grant execute on function public.remove_crew(uuid) to authenticated;

-- 목록 조회 RPC 2개 — user_progress는 본인 전용 RLS(0022)라 클라가 남의
-- 레벨을 직접 못 읽는다. 0026이 쓴 정의자 패턴을 그대로 따라 레벨까지 함께
-- 돌려준다(왕복 1회, 권한 검사 1곳).
create or replace function public.get_my_crew()
returns table (
  id uuid, nickname text, avatar_url text,
  total_xp integer, current_level smallint, current_stage smallint,
  linked_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.nickname, p.avatar_url,
         coalesce(up.total_xp, 0),
         coalesce(up.current_level, 1::smallint),
         coalesce(up.current_stage, 1::smallint),
         l.created_at
  from public.crew_links l
  join public.profiles p
    on p.id = case when l.user_a = auth.uid() then l.user_b else l.user_a end
  left join public.user_progress up on up.user_id = p.id
  where auth.uid() in (l.user_a, l.user_b)
  order by p.nickname
$$;

create or replace function public.get_incoming_crew_requests()
returns table (
  request_id uuid, requester_id uuid,
  nickname text, avatar_url text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.requester_id, p.nickname, p.avatar_url, r.created_at
  from public.crew_requests r
  join public.profiles p on p.id = r.requester_id
  where r.addressee_id = auth.uid() and r.status = 'pending'
  order by r.created_at desc
$$;

revoke all on function public.get_my_crew() from public, anon;
revoke all on function public.get_incoming_crew_requests() from public, anon;
grant execute on function public.get_my_crew() to authenticated;
grant execute on function public.get_incoming_crew_requests() to authenticated;
