-- 0032: 배지 판정 + 포인트 지급 엔진
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). **선행: 0031.**
--
-- 구성:
--   current_streak_days      — 불꽃 일수 (domain/streak.ts와 같은 규칙)
--   point_multiplier         — 불꽃 → 배수
--   award_points             — 포인트 원장 기록 + 지갑 갱신 (멱등)
--   evaluate_badges          — 6지표 집계 → 배지 지급 → 포인트 지급 (멱등)
--   complete_workout_v2      — 끝에 포인트·배지 훅 추가 (0027 기반 재정의)
--   mark_record_beaten       — 하드코딩 배지 블록 제거 → evaluate_badges로 대체
--   get_crew_member_profile  — period_key 추가 (0026 기반 재정의)

-- ── 불꽃 일수 — TS currentStreak과 같은 규칙 ─────────────────
-- 규칙: 운동일 사이 간격이 5일 미만이면 사슬이 이어진다.
--       마지막 운동일로부터 오늘까지 5일 이상 지났으면 0.
-- 이 규칙이 domain/streak.ts와 어긋나면 홈 🔥와 배지가 다른 숫자를 말한다.
-- scripts/streak-parity-check.mjs가 양쪽을 대조한다.
create or replace function public.current_streak_days(p_user_id uuid)
returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_last date;
  v_count int := 0;
  v_prev date := null;
  r record;
begin
  select max((completed_at at time zone 'Asia/Seoul')::date) into v_last
  from workout_sessions
  where user_id = p_user_id and status = 'completed'
    and deleted_at is null and completed_at is not null;

  if v_last is null or (v_today - v_last) >= 5 then
    return 0;
  end if;

  for r in
    select distinct (completed_at at time zone 'Asia/Seoul')::date as d
    from workout_sessions
    where user_id = p_user_id and status = 'completed'
      and deleted_at is null and completed_at is not null
    order by d desc
  loop
    if v_prev is not null and (v_prev - r.d) >= 5 then
      exit;
    end if;
    v_count := v_count + 1;
    v_prev := r.d;
  end loop;

  return v_count;
end $$;
revoke all on function public.current_streak_days(uuid) from public, anon;
grant execute on function public.current_streak_days(uuid) to authenticated;
-- 대조 스크립트가 service_role로 호출한다
grant execute on function public.current_streak_days(uuid) to service_role;

-- ── 불꽃 → 포인트 배수 ──────────────────────────────────────
-- 이 구간표는 src/components/profile/point-summary.tsx의 TIERS와 같아야 한다.
create or replace function public.point_multiplier(p_streak int)
returns numeric
language sql immutable set search_path = public as $$
  select case
    when p_streak >= 25 then 4.0
    when p_streak >= 15 then 3.0
    when p_streak >= 10 then 2.0
    when p_streak >= 5  then 1.5
    else 1.0
  end::numeric
$$;
revoke all on function public.point_multiplier(int) from public, anon;
grant execute on function public.point_multiplier(int) to authenticated;

-- ── 포인트 지급 (내부 전용·멱등) ─────────────────────────────
create or replace function public.award_points(
  p_user_id uuid, p_amount int, p_reason text,
  p_source_type text, p_source_id text,
  p_multiplier numeric, p_metadata jsonb
) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_balance int;
begin
  if p_amount <= 0 then return 0; end if;

  insert into user_wallet (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select balance into v_balance from user_wallet where user_id = p_user_id for update;

  begin
    insert into point_transactions
      (user_id, amount, transaction_type, reason, source_type, source_id,
       multiplier, balance_after, metadata)
    values (p_user_id, p_amount, 'earn', p_reason, p_source_type, p_source_id,
            p_multiplier, v_balance + p_amount, coalesce(p_metadata, '{}'::jsonb));
  exception when unique_violation then
    return 0; -- 이미 지급됨
  end;

  update user_wallet
  set balance = balance + p_amount,
      lifetime_earned = lifetime_earned + p_amount,
      updated_at = now()
  where user_id = p_user_id;

  return p_amount;
end $$;
revoke all on function public.award_points(uuid, int, text, text, text, numeric, jsonb)
  from public, anon, authenticated;

-- ── 배지 판정·지급 (멱등) ────────────────────────────────────
-- 반환: 새로 획득한 배지 jsonb 배열 [{badgeKey, emoji, name, tier, points}]
create or replace function public.evaluate_badges(p_user_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_today text := to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD');
  v_metrics jsonb;
  v_new jsonb := '[]'::jsonb;
  v_value numeric;
  v_period text;
  v_inserted int;
  d record;
begin
  -- 지표 6종을 한 번에 집계한다
  select jsonb_build_object(
    'workout_count', coalesce(count(*), 0),
    'total_minutes', coalesce(sum(s.duration_minutes), 0),
    'record_beaten', coalesce(count(*) filter (where s.record_note is not null), 0)
  ) into v_metrics
  from workout_sessions s
  where s.user_id = p_user_id and s.status = 'completed' and s.deleted_at is null;

  v_metrics := v_metrics
    || jsonb_build_object('streak_days', public.current_streak_days(p_user_id))
    || (
      select jsonb_build_object(
        'weight_volume_kg', coalesce(sum(
          case when we.exercise_type = 'weight'
               then coalesce(ws.weight_kg, 0) * coalesce(ws.reps, 0) else 0 end), 0),
        'cardio_distance_m', coalesce(sum(
          case when we.exercise_type = 'cardio'
               then coalesce(ws.distance_meters, 0) else 0 end), 0))
      from workout_sets ws
      join workout_exercises we on we.id = ws.workout_exercise_id
      join workout_sessions s on s.id = we.session_id
      where s.user_id = p_user_id and s.status = 'completed'
        and s.deleted_at is null and ws.is_completed
    );

  for d in
    select * from badge_definitions where status = 'active' order by sort_order
  loop
    v_value := (v_metrics ->> d.metric_key)::numeric;

    if d.repeatable then
      -- 반복형: 지표가 repeat_step의 배수에 닿은 날마다 1개.
      -- period_key가 날짜라 사슬이 끊겨 다시 채워도 다른 행이 되어 쌓인다.
      if v_value <= 0 or (v_value::bigint % d.repeat_step::bigint) <> 0 then
        continue;
      end if;
      v_period := v_today;
    else
      if v_value < d.threshold then
        continue;
      end if;
      v_period := 'lifetime';
    end if;

    insert into user_badges (user_id, badge_key, period_key)
    values (p_user_id, d.badge_key, v_period)
    on conflict (user_id, badge_key, period_key) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then continue; end if;

    perform public.award_points(
      p_user_id, d.point_reward, 'badge_earned',
      'badge', d.badge_key || ':' || v_period, null,
      jsonb_build_object('tier', d.tier, 'metric', d.metric_key));

    v_new := v_new || jsonb_build_object(
      'badgeKey', d.badge_key, 'emoji', d.emoji, 'name', d.name,
      'tier', d.tier, 'points', d.point_reward);
  end loop;

  if jsonb_array_length(v_new) > 0 then
    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    values (p_user_id, p_user_id, 'badge_earned', null,
            '🏅 배지 획득!',
            '새 배지 ' || jsonb_array_length(v_new) || '개를 얻었어요 — 내 정보에서 확인해 보세요');
  end if;

  return v_new;
end $$;
revoke all on function public.evaluate_badges(uuid) from public, anon, authenticated;

-- ── complete_workout_v2 — 포인트·배지 훅 추가 (0027 기반) ────
create or replace function public.complete_workout_v2(p_session_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
  v_dur int; v_valid boolean; v_tabata boolean;
  v_eff date; v_has_daily boolean;
  v_base int := 0; v_time int := 0; v_plan int := 0; v_rec int := 0; v_photo int := 0;
  v_total int := 0;
  v_prog jsonb; v_orig int;
  v_streak int; v_mult numeric; v_points int := 0; v_badges jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into s from workout_sessions
  where id = p_session_id and user_id = auth.uid() for update;
  if not found then raise exception 'session_not_found'; end if;

  if s.status = 'cancelled' then
    raise exception 'invalid_status:cancelled';
  elsif s.status = 'completed' then
    select amount into v_orig from xp_transactions
    where user_id = s.user_id and reason = 'workout_completed'
      and source_type = 'workout' and source_id = p_session_id::text
    limit 1;
    return (
      select jsonb_build_object(
        'idempotentReplay', true, 'awarded', false,
        'originalXpAwarded', coalesce(v_orig, 0),
        'currentTotalXp', up.total_xp, 'currentLevel', up.current_level,
        'currentStage', up.current_stage, 'rejectionReason', 'XP_ALREADY_AWARDED')
      from user_progress up where up.user_id = s.user_id
    );
  elsif s.status <> 'active' then
    raise exception 'invalid_status:%', s.status;
  end if;

  update workout_sessions
  set status = 'completed', completed_at = now(),
      duration_minutes = floor(extract(epoch from now() - s.started_at) / 60)::int
  where id = p_session_id
  returning * into s;

  insert into workout_events (session_id, user_id, event_type)
  values (s.id, s.user_id, 'workout_completed');

  v_dur := s.duration_minutes;
  v_tabata := s.tabata_minutes is not null;
  v_valid := public.is_valid_workout(p_session_id)
             and s.started_at is not null and s.completed_at is not null
             and v_dur >= 0 and v_dur < 360;

  v_eff := (now() at time zone 'Asia/Seoul')::date;
  select exists (
    select 1 from xp_transactions
    where user_id = s.user_id and transaction_type = 'earn'
      and reward_group = 'daily_workout' and effective_date = v_eff
  ) into v_has_daily;

  if v_valid and not v_has_daily then
    v_base := 100;
    v_time := case when v_dur >= 90 then 40 when v_dur >= 60 then 30
                   when v_dur >= 40 then 20 when v_dur >= 20 then 10 else 0 end;
    if not v_tabata then
      v_plan := 0;
      -- 0027: 완료 세트는 실적(횟수·시간·거리)이 하나라도 있으면 충족
      v_rec := case when exists (
          select 1 from workout_sets ws join workout_exercises we on we.id = ws.workout_exercise_id
          where we.session_id = p_session_id and ws.is_completed
        ) and not exists (
          select 1 from workout_sets ws join workout_exercises we on we.id = ws.workout_exercise_id
          where we.session_id = p_session_id and ws.is_completed
            and ws.reps is null
            and coalesce(ws.duration_seconds, 0) <= 0
            and coalesce(ws.distance_meters, 0) <= 0
        ) then 10 else 0 end;
    end if;
    v_photo := case when exists (
      select 1 from workout_images wi
      where wi.session_id = p_session_id and wi.user_id = s.user_id and wi.image_path is not null
    ) then 10 else 0 end;
    v_total := v_base + v_time + v_plan + v_rec + v_photo;
  end if;

  if v_total > 0 then
    v_prog := public.apply_xp_and_progress(
      s.user_id, v_total, 'workout_completed', 'daily_workout',
      'workout', p_session_id::text, v_eff,
      jsonb_build_object('base_xp', v_base, 'duration_xp', v_time, 'plan_xp', v_plan,
        'record_xp', v_rec, 'photo_xp', v_photo, 'duration_minutes', v_dur,
        'duration_source', 'server_elapsed', 'is_tabata', v_tabata));
    if not (v_prog->>'inserted')::boolean then v_total := 0; end if;
  else
    insert into user_progress (user_id) values (s.user_id) on conflict (user_id) do nothing;
    select jsonb_build_object('newTotalXp', total_xp, 'previousLevel', current_level,
      'newLevel', current_level, 'previousStage', current_stage, 'newStage', current_stage,
      'levelUp', false, 'stageUp', false, 'unlockedRewards', '[]'::jsonb)
    into v_prog from user_progress where user_id = s.user_id;
  end if;

  -- ⬇ 0032 추가: 운동 포인트. XP와 같은 조건(그날 첫 유효 운동)에서만 준다.
  --   포인트만 무제한이면 하루에 짧게 여러 번 끊어 하는 악용이 생긴다.
  v_streak := public.current_streak_days(s.user_id);
  v_mult := public.point_multiplier(v_streak);
  if v_total > 0 then
    v_points := public.award_points(
      s.user_id, floor(100 * v_mult)::int, 'workout_completed',
      'workout', p_session_id::text, v_mult,
      jsonb_build_object('base', 100, 'streak_days', v_streak));
  end if;

  -- ⬇ 0032 추가: 배지 판정. 포인트 지급 뒤라 배지 보너스가 위에 쌓인다.
  v_badges := public.evaluate_badges(s.user_id);

  return jsonb_build_object(
    'idempotentReplay', false,
    'awarded', v_total > 0, 'xpAwarded', v_total,
    'breakdown', jsonb_build_object('baseXp', v_base, 'durationXp', v_time,
      'planXp', v_plan, 'recordXp', v_rec, 'photoXp', v_photo),
    'newTotalXp', v_prog->'newTotalXp',
    'previousLevel', v_prog->'previousLevel', 'newLevel', v_prog->'newLevel',
    'previousStage', v_prog->'previousStage', 'newStage', v_prog->'newStage',
    'levelUp', v_prog->'levelUp', 'stageUp', v_prog->'stageUp',
    'unlockedRewards', v_prog->'unlockedRewards',
    'pointsAwarded', v_points, 'pointMultiplier', v_mult, 'streakDays', v_streak,
    'newBadges', v_badges
  );
end $$;
revoke all on function public.complete_workout_v2(uuid) from public, anon;
grant execute on function public.complete_workout_v2(uuid) to authenticated;

-- ── mark_record_beaten — 하드코딩 배지 제거 (0021 기반) ──────
create or replace function public.mark_record_beaten(
  p_session_id uuid, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_session workout_sessions%rowtype;
  v_nickname text;
begin
  select * into v_session from workout_sessions where id = p_session_id;

  if not found or v_session.user_id <> auth.uid() then
    raise exception 'not_owner';
  end if;
  if v_session.status <> 'completed' or v_session.deleted_at is not null then
    raise exception 'invalid_status';
  end if;
  if v_session.record_note is not null then
    raise exception 'already_marked';
  end if;
  if p_note is null or length(trim(p_note)) = 0 or length(p_note) > 80 then
    raise exception 'invalid_note';
  end if;

  update workout_sessions set record_note = p_note where id = p_session_id;

  select nickname into v_nickname from profiles where id = v_session.user_id;

  insert into notifications (user_id, actor_id, type, reference_id, title, body)
  select distinct gm.user_id, v_session.user_id, 'record_beaten', p_session_id,
    '🏅 기록 갱신! 칭찬해주세요',
    coalesce(v_nickname, '크루원') || '님이 ' || p_note
      || '. 칭찬 한마디 남겨주세요! 👏'
  from group_members gm
  where gm.user_id <> v_session.user_id
    and gm.group_id in (
      select group_id from group_members where user_id = v_session.user_id);

  -- 배지는 evaluate_badges가 판정한다. 임계값은 badge_definitions가 단일 원천이다.
  perform public.evaluate_badges(v_session.user_id);
end $$;
revoke all on function public.mark_record_beaten(uuid, text) from public, anon;
grant execute on function public.mark_record_beaten(uuid, text) to authenticated;

-- ── get_crew_member_profile — period_key 추가 (0026 기반) ────
-- 반복 배지가 생겼으므로 크루원 프로필도 period_key를 알아야 한다.
-- 없으면 "불꽃 5일 ×3"을 남의 프로필에서 셀 수 없다.
create or replace function public.get_crew_member_profile(p_target_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_progress user_progress%rowtype;
  v_badges jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_target_id <> auth.uid() and not shares_group_with(p_target_id) then
    raise exception 'not_crew';
  end if;

  select * into v_progress from user_progress where user_id = p_target_id;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'badgeKey', b.badge_key,
               'periodKey', b.period_key,
               'earnedAt', b.earned_at)
             order by b.earned_at
           ), '[]'::jsonb)
    into v_badges
  from user_badges b
  where b.user_id = p_target_id;

  return jsonb_build_object(
    'totalXp',      coalesce(v_progress.total_xp, 0),
    'currentLevel', coalesce(v_progress.current_level, 1),
    'currentStage', coalesce(v_progress.current_stage, 1),
    'badges',       v_badges
  );
end $$;
revoke all on function public.get_crew_member_profile(uuid) from public, anon;
grant execute on function public.get_crew_member_profile(uuid) to authenticated;
