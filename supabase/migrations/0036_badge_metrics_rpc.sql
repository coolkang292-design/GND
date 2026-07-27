-- 0036: 배지 진행 지표를 조회 가능한 RPC로 노출 + 판정과 SQL 공유(DRY)
-- 적용: SQL Editor Run. 0022~0035 수정 금지. 이 파일이 0036.
--
-- 왜: 퀘스트 UI의 진행바(9/10 등)는 사용자의 현재 지표값이 필요하다. 그 값은
--     evaluate_badges가 이미 내부에서 계산하지만 밖으로 주지 않았다. 같은 SQL을
--     badge_metrics()로 빼서 판정·진행바가 한 원천을 쓰게 한다(갈라짐 방지).

-- 지표 6종 집계 (판정·조회 공용)
create or replace function public.badge_metrics(p_user_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'workout_count', coalesce(count(*), 0),
    'total_minutes', coalesce(sum(s.duration_minutes), 0),
    'record_beaten', coalesce(count(*) filter (where s.record_note is not null), 0)
  ) into v
  from workout_sessions s
  where s.user_id = p_user_id and s.status = 'completed' and s.deleted_at is null;

  v := v
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
  return v;
end $$;
revoke all on function public.badge_metrics(uuid) from public, anon, authenticated;

-- 클라이언트용: 본인 지표만
create or replace function public.get_my_badge_metrics()
returns jsonb
language sql stable security definer set search_path = public as $$
  select public.badge_metrics(auth.uid());
$$;
revoke all on function public.get_my_badge_metrics() from public, anon;
grant execute on function public.get_my_badge_metrics() to authenticated;

-- evaluate_badges를 badge_metrics 사용으로 교체(DRY). 판정 로직은 그대로.
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
  v_metrics := public.badge_metrics(p_user_id);

  for d in
    select * from badge_definitions where status = 'active' order by sort_order
  loop
    v_value := (v_metrics ->> d.metric_key)::numeric;

    if d.repeatable then
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

-- 확인: 본인 지표
select public.get_my_badge_metrics();
