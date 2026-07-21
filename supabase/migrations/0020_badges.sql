-- 0020: 배지 시스템 + 칭찬 CTA 알림
-- 설계: docs/superpowers/specs/2026-07-21-beep-boost-praise-badges-design.md
-- ① user_badges 테이블(본인 select만) ② notifications type에 badge_earned 추가
-- ③ mark_record_beaten 교체 — 칭찬 문구 + 배지 지급 + 본인 배지 알림
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만)

-- ── 획득 배지 (지급은 definer RPC만) ────────────────────────

create table if not exists public.user_badges (
  user_id uuid not null
    references public.profiles (id) on delete cascade,
  badge_key text not null,
  session_id uuid references public.workout_sessions (id) on delete set null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);

alter table public.user_badges enable row level security;
revoke all on public.user_badges from anon, authenticated;
-- select만 준다. insert/update/delete 권한이 없으므로 앱에서 배지를 위조할 수 없고,
-- 지급은 security definer 함수 경로로만 일어난다.
grant select on public.user_badges to authenticated;

drop policy if exists "user_badges_own_select" on public.user_badges;
create policy "user_badges_own_select" on public.user_badges
  for select to authenticated
  using (user_id = auth.uid());

-- ── notifications.type에 badge_earned 추가 (0018과 같은 이름 무관 교체) ──

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.notifications'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%workout_started%';
  if v_conname is not null then
    execute format(
      'alter table public.notifications drop constraint %I',
      v_conname
    );
  end if;
end $$;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'workout_started', 'cheer_received', 'poke', 'reaction_received',
    'rank_change', 'record_viewed', 'morning_briefing',
    'challenge_started', 'challenge_ended', 'record_beaten', 'badge_earned'
  ));

-- ── 기록 갱신 마킹 + 칭찬 알림 + 배지 지급 ──────────────────

create or replace function public.mark_record_beaten(
  p_session_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session workout_sessions%rowtype;
  v_nickname text;
  v_beaten_count int;
  v_tier record;
  v_inserted int;
  v_awarded int := 0;
begin
  select * into v_session
  from workout_sessions
  where id = p_session_id;

  if not found or v_session.user_id <> auth.uid() then
    raise exception 'not_owner';
  end if;
  if v_session.status <> 'completed' or v_session.deleted_at is not null then
    raise exception 'invalid_status';
  end if;
  if v_session.record_note is not null then
    raise exception 'already_marked';
  end if;
  if p_note is null
     or length(trim(p_note)) = 0
     or length(p_note) > 40 then
    raise exception 'invalid_note';
  end if;

  update workout_sessions
  set record_note = p_note
  where id = p_session_id;

  select nickname into v_nickname
  from profiles
  where id = v_session.user_id;

  -- 크루에게 칭찬 요청 알림 (→ 0016 트리거가 푸시 발송)
  insert into notifications (user_id, actor_id, type, reference_id, title, body)
  select distinct
    gm.user_id,
    v_session.user_id,
    'record_beaten',
    p_session_id,
    '🏅 기록 갱신! 칭찬해주세요',
    coalesce(v_nickname, '크루원') || '님이 지난 기록을 넘었어요 — '
      || p_note || '. 칭찬 한마디 남겨주세요! 👏'
  from group_members gm
  where gm.user_id <> v_session.user_id
    and gm.group_id in (
      select group_id
      from group_members
      where user_id = v_session.user_id
    );

  -- 배지 지급 — 임계값은 여기가 단일 원천이다.
  select count(*) into v_beaten_count
  from workout_sessions
  where user_id = v_session.user_id
    and status = 'completed'
    and deleted_at is null
    and record_note is not null;

  for v_tier in
    select t.badge_key, t.threshold
    from (values
      ('record_beaten_1', 1),
      ('record_beaten_5', 5),
      ('record_beaten_10', 10)
    ) as t(badge_key, threshold)
    where v_beaten_count >= t.threshold
  loop
    insert into user_badges (user_id, badge_key, session_id)
    values (v_session.user_id, v_tier.badge_key, p_session_id)
    on conflict (user_id, badge_key) do nothing;

    get diagnostics v_inserted = row_count;
    v_awarded := v_awarded + v_inserted;
  end loop;

  -- 새로 얻은 배지가 있을 때만 본인에게 1건 알린다.
  if v_awarded > 0 then
    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    values (
      v_session.user_id,
      v_session.user_id,
      'badge_earned',
      p_session_id,
      '🏅 배지 획득!',
      '새 배지를 얻었어요 — 기록 탭 달력에서 확인해 보세요'
    );
  end if;
end;
$$;

revoke all on function public.mark_record_beaten(uuid, text) from public, anon;
grant execute on function public.mark_record_beaten(uuid, text) to authenticated;
