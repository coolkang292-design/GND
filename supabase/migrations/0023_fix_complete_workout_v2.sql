-- 0023: complete_workout_v2 두 가지 결함 수정 + 백필
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회). 0022는 수정하지 않는다.
--
-- ⚠️ 이 마이그레이션은 선택이 아니라 필수다. 적용 전까지 v2로 완료한 운동은
--    크루 피드에 최대 6시간 '운동 중'으로 남는다(아래 결함 A).
--
-- 결함 A (2026-07-24 사용자 신고 "종료했는데 200분 넘게 운동중"):
--   구 complete_workout(0011)은 완료 시 workout_events에 'workout_completed'를
--   남겨, 진행 중 카드(active-workout-cards)가 이 이벤트로 완료를 판정한다.
--   complete_workout_v2(0022)는 이 이벤트를 **안 남긴다**. 그래서 v2로 완료한
--   세션은 workout_started만 있고 닫는 이벤트가 없어, 시작 후 6시간(유령 컷오프)
--   동안 '운동 중'으로 표시된다. 실제로 스칼레또 7/23 세션 1건이 이 상태였다.
--
-- 결함 B (같은 신고 계열 "종료가 안 됨"):
--   0 XP로 완료된 세션(당일 2번째·완료 세트 3 미만)은 workout_completed 원장이
--   없어, 재종료 시 replay 분기가 incomplete_xp_processing을 raise → HTTP 400.
--   운동은 이미 완료됐으므로 raise 대신 멱등 응답을 돌려준다.
--
-- 조사 근거: scripts/finish-repro.mjs, workout_events 실 DB 조회.

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

  -- ── 멱등 처리 ─────────────────────────────────────────────
  if s.status = 'cancelled' then
    raise exception 'invalid_status:cancelled';
  elsif s.status = 'completed' then
    -- 결함 B: 원장이 있으면 그 금액, 없으면 0 XP로 완료된 것. 어느 쪽이든
    -- raise하지 않는다 — 운동은 이미 끝났고 재종료는 무해하다.
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

  -- 결함 A: 진행 중 카드가 이 이벤트로 완료를 판정한다(구 complete_workout과 동일).
  -- 없으면 크루 피드에 최대 6시간 '운동 중'으로 남는다.
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
      v_plan := 0; -- 계획-실행 필수판정 스키마 없음 → 0 (0024 계획 완료 보너스에서 교체)
      v_rec := case when exists (
          select 1 from workout_sets ws join workout_exercises we on we.id = ws.workout_exercise_id
          where we.session_id = p_session_id and ws.is_completed
        ) and not exists (
          select 1 from workout_sets ws join workout_exercises we on we.id = ws.workout_exercise_id
          where we.session_id = p_session_id and ws.is_completed and ws.reps is null
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

-- ── 백필 ─────────────────────────────────────────────────────
-- v2로 완료됐지만 완료 이벤트가 없어 '운동 중'으로 남은 세션에 이벤트를 채운다.
-- workout_started가 있고 닫는 이벤트(completed/cancelled)가 없는 완료 세션만.
-- not exists 가드로 재실행해도 중복 삽입되지 않는다(멱등).
insert into public.workout_events (session_id, user_id, event_type)
select s.id, s.user_id, 'workout_completed'
from public.workout_sessions s
where s.status = 'completed'
  and exists (
    select 1 from public.workout_events e
    where e.session_id = s.id and e.event_type = 'workout_started')
  and not exists (
    select 1 from public.workout_events e
    where e.session_id = s.id and e.event_type in ('workout_completed', 'workout_cancelled'));
