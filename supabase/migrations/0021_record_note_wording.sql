-- 0021: 기록 갱신 문구를 종목별 서술로 바꾸면서 알림 문장·길이 제한 조정
-- 설계: docs/superpowers/specs/2026-07-21-per-exercise-record-beaten-design.md
-- 0020 대비 바뀐 것 ①문구 길이 40 → 80 ②알림 body가 "{닉네임}님이 {문구}." 형태
-- 배지 지급 로직은 0020과 동일하다.
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만)

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
     or length(p_note) > 80 then
    raise exception 'invalid_note';
  end if;

  update workout_sessions
  set record_note = p_note
  where id = p_session_id;

  select nickname into v_nickname
  from profiles
  where id = v_session.user_id;

  -- 크루에게 칭찬 요청 알림 (→ 0016 트리거가 푸시 발송)
  -- 문구가 "벤치프레스를 2회 더 하셨어요" 형태라 닉네임만 앞에 붙이면 문장이 된다.
  insert into notifications (user_id, actor_id, type, reference_id, title, body)
  select distinct
    gm.user_id,
    v_session.user_id,
    'record_beaten',
    p_session_id,
    '🏅 기록 갱신! 칭찬해주세요',
    coalesce(v_nickname, '크루원') || '님이 ' || p_note
      || '. 칭찬 한마디 남겨주세요! 👏'
  from group_members gm
  where gm.user_id <> v_session.user_id
    and gm.group_id in (
      select group_id
      from group_members
      where user_id = v_session.user_id
    );

  -- 배지 지급 — 임계값은 여기가 단일 원천이다 (0020과 동일).
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
