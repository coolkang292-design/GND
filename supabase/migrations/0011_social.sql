-- ============================================================
-- Phase 6: 소셜 — workout_events·reactions·cheers·notifications
--          ·notification_settings·record_views + RLS + RPC/트리거
-- 설계: docs/superpowers/specs/2026-07-17-phase6-social-design.md
-- 원칙(§14 대체 결정): 타인용 알림은 service_role 대신
--   security definer RPC·트리거가 생성한다. 클라이언트는
--   notifications·cheers·workout_events에 insert 권한이 없다.
-- 재실행 안전: if not exists / create or replace / DO 블록.
-- 실행: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run
-- ============================================================

-- ── 1. 테이블 ────────────────────────────────────────────────

create table if not exists public.workout_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null
    check (event_type in ('workout_started', 'workout_completed', 'workout_cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists workout_events_session_idx on public.workout_events (session_id);
create index if not exists workout_events_user_time_idx on public.workout_events (user_id, created_at desc);

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('fire', 'clap', 'like')),
  created_at timestamptz not null default now(),
  unique (session_id, user_id, reaction_type)
);
create index if not exists reactions_session_idx on public.reactions (session_id);

create table if not exists public.cheers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  cheer_type text not null check (cheer_type in ('fire', 'power', 'clap', 'finish', 'custom')),
  message text check (message is null or char_length(message) <= 30),
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);
create index if not exists cheers_session_sender_idx on public.cheers (session_id, sender_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in (
    'workout_started', 'cheer_received', 'poke', 'reaction_received', 'rank_change',
    'record_viewed', 'morning_briefing', 'challenge_started', 'challenge_ended'
  )),
  reference_id uuid,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_time_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table if not exists public.notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  morning_brief boolean not null default true,
  cheers boolean not null default true,
  pokes boolean not null default true,
  ranks boolean not null default true,
  record_views boolean not null default true
);

-- 꾸준왕 열람 기록 — 테이블만 선반영, UI·열람 게이트는 후속 계획
create table if not exists public.record_views (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid references public.challenges(id) on delete cascade,
  viewed_at timestamptz not null default now()
);

-- ── 2. RLS 헬퍼 — 상태 무관 "같은 크루의 세션인가" (진행 중 카드·응원용) ──

create or replace function public.session_crew_shared(sid uuid)
returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from workout_sessions s
    where s.id = sid
      and s.visibility = 'group'
      and s.group_id is not null
      and public.is_group_member(s.group_id, auth.uid())
  )
$$;

-- ── 3. RLS 정책 + 권한 ──────────────────────────────────────

alter table public.workout_events enable row level security;
alter table public.reactions enable row level security;
alter table public.cheers enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_settings enable row level security;
alter table public.record_views enable row level security;

revoke all on public.workout_events from anon, authenticated;
revoke all on public.reactions from anon, authenticated;
revoke all on public.cheers from anon, authenticated;
revoke all on public.notifications from anon, authenticated;
revoke all on public.notification_settings from anon, authenticated;
revoke all on public.record_views from anon, authenticated;

-- workout_events: 본인 + 같은 크루 조회. 쓰기는 RPC만.
grant select on public.workout_events to authenticated;
drop policy if exists "events_select_own_or_crew" on public.workout_events;
create policy "events_select_own_or_crew" on public.workout_events
  for select to authenticated
  using (user_id = auth.uid() or public.session_crew_shared(session_id));

-- reactions: 크루 공개 completed 세션에 크루원이 생성, 본인 것만 삭제.
grant select, insert, delete on public.reactions to authenticated;
drop policy if exists "reactions_select_visible" on public.reactions;
create policy "reactions_select_visible" on public.reactions
  for select to authenticated
  using (user_id = auth.uid() or public.workout_session_crew_visible(session_id));
drop policy if exists "reactions_insert_crew" on public.reactions;
create policy "reactions_insert_crew" on public.reactions
  for insert to authenticated
  with check (user_id = auth.uid() and public.workout_session_crew_visible(session_id));
drop policy if exists "reactions_delete_own" on public.reactions;
create policy "reactions_delete_own" on public.reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- cheers: 조회 = 발신자·수신자·같은 크루. 생성 = send_cheer RPC만. 삭제 = 발신자.
grant select, delete on public.cheers to authenticated;
drop policy if exists "cheers_select_related" on public.cheers;
create policy "cheers_select_related" on public.cheers
  for select to authenticated
  using (
    sender_id = auth.uid() or receiver_id = auth.uid()
    or public.session_crew_shared(session_id)
  );
drop policy if exists "cheers_delete_own" on public.cheers;
create policy "cheers_delete_own" on public.cheers
  for delete to authenticated
  using (sender_id = auth.uid());

-- notifications: 본인 조회 + read_at만 갱신(컬럼 권한). 생성은 RPC·트리거만.
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- notification_settings: 본인 행만 (행 없음 = 전부 on).
grant select, insert, update on public.notification_settings to authenticated;
drop policy if exists "notif_settings_own" on public.notification_settings;
create policy "notif_settings_own" on public.notification_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- record_views: viewer가 같은 크루 대상에 생성, viewer·target 본인 조회.
grant select, insert on public.record_views to authenticated;
drop policy if exists "record_views_select_related" on public.record_views;
create policy "record_views_select_related" on public.record_views
  for select to authenticated
  using (viewer_id = auth.uid() or target_id = auth.uid());
drop policy if exists "record_views_insert_own" on public.record_views;
create policy "record_views_insert_own" on public.record_views
  for insert to authenticated
  with check (viewer_id = auth.uid() and public.shares_group_with(target_id));

-- ── 4. 알림 생성 내부 헬퍼 (definer 전용 — execute 권한 미부여) ──

create or replace function public.notify(
  p_user_id uuid, p_actor_id uuid, p_type text,
  p_reference_id uuid, p_title text, p_body text
) returns void
language sql volatile security definer set search_path = public as
$$
  insert into notifications (user_id, actor_id, type, reference_id, title, body)
  values (p_user_id, p_actor_id, p_type, p_reference_id, p_title, p_body)
$$;
revoke execute on function public.notify(uuid, uuid, text, uuid, text, text) from anon, authenticated, public;

-- ── 5. 상태전이 RPC 수정 — 이벤트 기록 + 시작 시 크루 알림 (0004 대체) ──

create or replace function public.start_workout(p_session_id uuid)
returns public.workout_sessions
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
  v_nick text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into s from workout_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;
  if s.status <> 'draft' then
    raise exception 'invalid_status:%', s.status;
  end if;
  if exists (
    select 1 from workout_sessions
    where user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'active_session_exists';
  end if;

  update workout_sessions
  set status = 'active', started_at = now()
  where id = p_session_id
  returning * into s;

  insert into workout_events (session_id, user_id, event_type)
  values (s.id, s.user_id, 'workout_started');

  -- 크루 공개 세션이면 다른 크루원 전원에게 시작 알림
  if s.visibility = 'group' and s.group_id is not null then
    select nickname into v_nick from profiles where id = s.user_id;
    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    select gm.user_id, s.user_id, 'workout_started', s.id,
           coalesce(v_nick, '크루원') || '님이 운동을 시작했어요 💪',
           '응원을 보내볼까요?'
    from group_members gm
    where gm.group_id = s.group_id and gm.user_id <> s.user_id;
  end if;

  return s;
end $$;

create or replace function public.complete_workout(p_session_id uuid)
returns public.workout_sessions
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into s from workout_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;
  if s.status <> 'active' then
    raise exception 'invalid_status:%', s.status;
  end if;

  update workout_sessions
  set status = 'completed',
      completed_at = now(),
      duration_minutes = greatest(
        1, round(extract(epoch from now() - s.started_at) / 60)::int
      )
  where id = p_session_id
  returning * into s;

  insert into workout_events (session_id, user_id, event_type)
  values (s.id, s.user_id, 'workout_completed');

  return s;
end $$;

create or replace function public.cancel_workout(p_session_id uuid)
returns public.workout_sessions
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into s from workout_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;
  if s.status not in ('draft', 'active') then
    raise exception 'invalid_status:%', s.status;
  end if;

  update workout_sessions
  set status = 'cancelled'
  where id = p_session_id
  returning * into s;

  -- draft 취소는 시작 안 한 세션이라 이벤트 남기지 않음
  if s.started_at is not null then
    insert into workout_events (session_id, user_id, event_type)
    values (s.id, s.user_id, 'workout_cancelled');
  end if;

  return s;
end $$;

-- ── 6. 응원 RPC — 스팸 제한(세션당 3회·10초 쿨다운)은 여기서 강제 ──

create or replace function public.send_cheer(
  p_session_id uuid, p_cheer_type text, p_message text default null
) returns public.cheers
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
  c cheers;
  v_count int;
  v_last timestamptz;
  v_nick text;
  v_wants boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into s from workout_sessions where id = p_session_id;

  if not found or s.visibility <> 'group' or s.group_id is null
     or not is_group_member(s.group_id, auth.uid()) then
    raise exception 'session_not_found';
  end if;
  if s.user_id = auth.uid() then
    raise exception 'own_session';
  end if;
  if s.status <> 'active' then
    raise exception 'not_active';
  end if;

  select count(*), max(created_at) into v_count, v_last
  from cheers where session_id = p_session_id and sender_id = auth.uid();

  if v_count >= 3 then
    raise exception 'cheer_limit';
  end if;
  if v_last is not null and v_last > now() - interval '10 seconds' then
    raise exception 'cheer_cooldown';
  end if;

  insert into cheers (session_id, sender_id, receiver_id, cheer_type, message)
  values (p_session_id, auth.uid(), s.user_id, p_cheer_type, p_message)
  returning * into c;

  -- 수신자가 응원 알림을 꺼둔 경우: 응원 행은 남기고 알림만 생략
  select coalesce(ns.cheers, true) into v_wants
  from (select true) one
  left join notification_settings ns on ns.user_id = s.user_id;

  if v_wants then
    select nickname into v_nick from profiles where id = auth.uid();
    perform notify(
      s.user_id, auth.uid(), 'cheer_received', c.id,
      coalesce(v_nick, '크루원') || '님의 응원 📣',
      coalesce(p_message, p_cheer_type)
    );
  end if;

  return c;
end $$;

-- ── 7. 찌르기 RPC — 같은 크루·본인 금지·동일 대상 24시간 1회 ──

create or replace function public.poke_user(p_target_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_nick text;
  v_wants boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_target_id = auth.uid() then
    raise exception 'self_poke';
  end if;
  if not shares_group_with(p_target_id) then
    raise exception 'not_crew';
  end if;
  if exists (
    select 1 from notifications
    where type = 'poke' and actor_id = auth.uid() and user_id = p_target_id
      and created_at > now() - interval '24 hours'
  ) then
    raise exception 'poke_cooldown';
  end if;

  select coalesce(ns.pokes, true) into v_wants
  from (select true) one
  left join notification_settings ns on ns.user_id = p_target_id;
  if not v_wants then
    raise exception 'pokes_disabled';
  end if;

  select nickname into v_nick from profiles where id = auth.uid();
  perform notify(
    p_target_id, auth.uid(), 'poke', null,
    coalesce(v_nick, '크루원') || '님이 콕 찔렀어요 👉',
    '오늘 운동 어때요?'
  );
end $$;

-- ── 8. 반응 알림 트리거 — 본인 세션 반응은 알림 생략 ──

create or replace function public.notify_reaction()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_nick text;
begin
  select user_id into v_owner from workout_sessions where id = new.session_id;
  if v_owner is not null and v_owner <> new.user_id then
    select nickname into v_nick from profiles where id = new.user_id;
    perform notify(
      v_owner, new.user_id, 'reaction_received', new.session_id,
      coalesce(v_nick, '크루원') || '님이 내 운동에 반응했어요',
      new.reaction_type
    );
  end if;
  return new;
end $$;

drop trigger if exists reactions_notify on public.reactions;
create trigger reactions_notify
  after insert on public.reactions
  for each row execute function public.notify_reaction();

-- ── 9. 챌린지 종료 알림 (0006 finalize_challenge 대체) ──
-- 진행중 비공개 정책상 등수 변동은 종료 시점에만 드러난다(§6) —
-- Phase 5 이월 "등수변동 알림"의 실질 형태 = 종료 알림.

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

  insert into notifications (user_id, actor_id, type, reference_id, title, body)
  select distinct ug.user_id, auth.uid(), 'challenge_ended', c.id,
         '챌린지 "' || c.name || '" 종료 🏁',
         '시상대에서 결과를 확인해보세요!'
  from user_goals ug
  where ug.challenge_id = c.id;

  return c;
end $$;

-- ── 10. 실행 권한 + Realtime ──

revoke execute on function public.send_cheer(uuid, text, text) from anon, public;
grant execute on function public.send_cheer(uuid, text, text) to authenticated;
revoke execute on function public.poke_user(uuid) from anon, public;
grant execute on function public.poke_user(uuid) to authenticated;
-- start/complete/cancel_workout·finalize_challenge의 권한은 0004·0006에서 부여됨(대체해도 유지).

-- notifications 인서트를 Realtime으로 구독 (배너·뱃지). 중복 추가 에러는 무시.
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then
  null;
end $$;
