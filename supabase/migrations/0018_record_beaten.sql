-- 0018: 기록 갱신 보상 (설계 docs/superpowers/specs/2026-07-19-record-beaten-design.md)
-- ① 세션 갱신 문구 컬럼 ② 알림 type에 record_beaten 추가 ③ 마킹+크루 알림 RPC
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만)

alter table public.workout_sessions
  add column if not exists record_note text;

-- notifications.type 체크 제약을 이름과 무관하게 찾아 record_beaten 포함으로 교체
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
    'challenge_started', 'challenge_ended', 'record_beaten'
  ));

-- 본인 완료 세션에 1회만 갱신 문구를 기록하고 크루에게 알림(→ 0016 트리거가 푸시)
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

  insert into notifications (user_id, actor_id, type, reference_id, title, body)
  select distinct
    gm.user_id,
    v_session.user_id,
    'record_beaten',
    p_session_id,
    '🏅 기록 갱신!',
    coalesce(v_nickname, '크루원') || '님이 지난 기록을 넘었어요 — ' || p_note
  from group_members gm
  where gm.user_id <> v_session.user_id
    and gm.group_id in (
      select group_id
      from group_members
      where user_id = v_session.user_id
    );
end;
$$;

revoke all on function public.mark_record_beaten(uuid, text) from public, anon;
grant execute on function public.mark_record_beaten(uuid, text) to authenticated;
