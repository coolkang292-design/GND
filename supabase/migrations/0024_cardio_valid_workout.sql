-- 0024: is_valid_workout — 유산소·시간 종목도 유효 운동으로 인정 (A안)
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회). 0022는 수정하지 않는다.
--
-- 문제(2026-07-24 사용자 지적):
--   기존 is_valid_workout는 (타바타) 또는 (완료 세트 3개 이상)만 유효로 봤다.
--   그래서 러닝 1세션(세트 1개)·플랭크처럼 세트 수가 적은 정당한 운동이
--   무효 → 0 XP가 됐다. 세트 수 기준은 웨이트에만 맞아 유산소를 차별한다.
--
-- 수정(A안): 아래 중 하나면 유효.
--   1) 타바타
--   2) 완료 세트 3개 이상 (웨이트/근력 — 기존 기준)
--   3) 실제 거리 또는 시간이 기록된 완료 세트가 하나라도 있음
--      (cardio distance_meters/duration_seconds, 시간 종목 duration_seconds)
--   → 러닝·플랭크도 기본 100 XP를 받는다. 하루 1회 제한이 어뷰징을 막는다.
--
-- 거리·시간이 0인 채 완료만 찍은 유산소 세트는 실제 기록이 없으므로 무효 유지.

create or replace function public.is_valid_workout(p_session_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_tabata_minutes int; v_owner uuid;
  v_completed_sets int; v_cardio_time int;
begin
  select tabata_minutes, user_id into v_tabata_minutes, v_owner
  from workout_sessions where id = p_session_id;
  if not found or v_owner <> auth.uid() then
    raise exception 'not_owner';
  end if;

  -- 1) 타바타: 완료 자체로 유효
  if v_tabata_minutes is not null then
    return true;
  end if;

  -- 2) 완료 세트 3개 이상: 웨이트/근력 기존 기준
  select count(*) into v_completed_sets
  from workout_sets ws
  join workout_exercises we on we.id = ws.workout_exercise_id
  where we.session_id = p_session_id and ws.is_completed;
  if v_completed_sets >= 3 then
    return true;
  end if;

  -- 3) 유산소·시간 종목: 실제 거리 또는 시간이 기록된 완료 세트가 있으면 유효
  select count(*) into v_cardio_time
  from workout_sets ws
  join workout_exercises we on we.id = ws.workout_exercise_id
  where we.session_id = p_session_id and ws.is_completed
    and (coalesce(ws.distance_meters, 0) > 0 or coalesce(ws.duration_seconds, 0) > 0);
  return v_cardio_time >= 1;
end $$;
revoke all on function public.is_valid_workout(uuid) from public, anon, authenticated;
