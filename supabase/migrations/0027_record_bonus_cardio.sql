-- 0027: 기록 완성 보너스(+10) — 유산소·시간 종목 세트를 차별하지 않는다
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회). 0022~0026은 수정하지 않는다.
--
-- 문제 (2026-07-26 사용자 신고 "60분 넘게 했는데 130밖에 안 들어옴"):
--   v_rec가 "완료 세트 중 reps가 null인 것이 하나도 없을 것"을 요구했다.
--   유산소·시간 종목 세트는 설계상 reps가 null이고 거리/시간으로 기록한다.
--   그래서 웨이트를 아무리 꼼꼼히 적어도 유산소 1세트가 섞이면 0점이 됐다.
--   실측: 오뎅끼데스까 7/25 세션 — 웨이트 21세트 전부 reps 기록 + 트레드밀
--   1세트(1920초·3700m) → recordXp=0. 130 XP(100+30)만 지급.
--
-- 설계는 이미 예외를 규정하고 있었다 —
--   specs/2026-07-23-xp-level-character-system-design.md §5·6·8:
--   "기록 완성(+10): 완료 세트에 reps 존재 … **유산소는 앱 필수값(현재 시간만)
--    충족 시 인정**". 구현이 이 문장을 빠뜨린 것이다.
--   0024가 is_valid_workout에서 같은 종류의 유산소 차별을 이미 고쳤다. 같은 계열.
--
-- 수정: 완료 세트는 **실적이 하나라도 기록돼 있으면** 충족으로 본다.
--   reps 있음  OR  duration_seconds > 0  OR  distance_meters > 0
--   → 기존 규칙보다 엄격해지는 경우가 없다(순수 웨이트 판정은 그대로).
--   → 무게만 적고 횟수를 비운 세트는 여전히 0점(과다 지급 방지).
--
-- 검증: scripts/xp-bonus-check.mjs (적용 전 4/6 → 적용 후 6/6)

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
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into s from workout_sessions
  where id = p_session_id and user_id = auth.uid() for update;
  if not found then raise exception 'session_not_found'; end if;

  -- ── 멱등 처리 (0023 결함 B) ───────────────────────────────
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

  -- ── 정상 완료 (status = active) ───────────────────────────
  update workout_sessions
  set status = 'completed', completed_at = now(),
      duration_minutes = floor(extract(epoch from now() - s.started_at) / 60)::int
  where id = p_session_id
  returning * into s;

  -- 0023 결함 A: 진행 중 카드가 이 이벤트로 완료를 판정한다.
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
      v_plan := 0; -- 계획-실행 필수판정 스키마 없음 → 0
      -- ⬇ 0027 변경점: 실적이 하나도 없는 완료 세트가 있을 때만 0점.
      --   유산소·시간 종목은 거리/시간이 실적이다(설계 §5·6·8).
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

  return jsonb_build_object(
    'idempotentReplay', false,
    'awarded', v_total > 0, 'xpAwarded', v_total,
    'breakdown', jsonb_build_object('baseXp', v_base, 'durationXp', v_time,
      'planXp', v_plan, 'recordXp', v_rec, 'photoXp', v_photo),
    'newTotalXp', v_prog->'newTotalXp',
    'previousLevel', v_prog->'previousLevel', 'newLevel', v_prog->'newLevel',
    'previousStage', v_prog->'previousStage', 'newStage', v_prog->'newStage',
    'levelUp', v_prog->'levelUp', 'stageUp', v_prog->'stageUp',
    'unlockedRewards', v_prog->'unlockedRewards'
  );
end $$;
revoke all on function public.complete_workout_v2(uuid) from public, anon;
grant execute on function public.complete_workout_v2(uuid) to authenticated;
