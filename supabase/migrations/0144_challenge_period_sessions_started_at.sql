-- 0144: 챌린지 '운동 횟수' 쪼개기 방지(2026-11-21)의 재료 — 운동 시작 시각.
-- get_challenge_period_sessions JSON에 started_at 한 키만 더한다. 나머지 본문·권한·필터는
-- 현행 정의(0138, 운영 DB와 대조 완료 2026-11-21) 그대로. 비파괴: create or replace,
-- 반환 타입 jsonb 그대로 — 옛 앱은 모르는 키를 무시한다.
-- 규칙 자체(1시간 안에 이어 한 운동은 횟수에서 제외)는 앱 코드(session-gap.ts)에 있고,
-- 규칙 시작 시각 이후에 시작한 운동에만 적용된다. 이전 기록은 바뀌지 않는다.

CREATE OR REPLACE FUNCTION public.get_challenge_period_sessions(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c public.challenges;
  v_rows jsonb;
begin
  select * into c from public.challenges where id = p_challenge_id;
  if not found then raise exception 'challenge_not_found'; end if;
  if coalesce((select auth.role()), '') <> 'service_role'
     and not public.shares_challenge_with(
       p_challenge_id,
       (select auth.uid())
     ) then
    raise exception 'challenge_not_found';
  end if;

  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'session_id', s.id,
      'started_at', s.started_at,
      'user_id', s.user_id,
      'completed_at', s.completed_at,
      'duration_minutes', s.duration_minutes,
      'tabata_minutes', s.tabata_minutes,
      'workout_exercises', coalesce((
        select jsonb_agg(jsonb_build_object(
          'exercise_type', we.exercise_type,
          'exercise_name', we.exercise_name,
          'body_part', we.body_part,
          'workout_sets', coalesce((
            select jsonb_agg(jsonb_build_object(
              'weight_kg', ws.weight_kg,
              'reps', ws.reps,
              'distance_meters', ws.distance_meters,
              'duration_seconds', ws.duration_seconds,
              'is_completed', ws.is_completed
            ))
            from public.workout_sets ws where ws.workout_exercise_id = we.id
          ), '[]'::jsonb)
        ))
        from public.workout_exercises we where we.session_id = s.id
      ), '[]'::jsonb)
    ) as row
    from public.workout_sessions s
    join public.challenge_participants cp
      on cp.user_id = s.user_id
     and cp.challenge_id = p_challenge_id
     and cp.status in ('joined', 'dropped')
    where s.status = 'completed'
      and s.deleted_at is null
      and s.completed_at >= (c.start_date - 1)::timestamptz
      and s.completed_at <  (c.end_date + 2)::timestamptz
      -- 사진 인증 필수 챌린지는 사진 있는 세션만 (앱의 workout_images!inner와 같다)
      and (
        not c.photo_required
        or exists (
          select 1
          from public.workout_images wi
          where wi.session_id = s.id
        )
      )
  ) t;

  return v_rows;
end $function$;

-- 권한은 건드리지 않는다(create or replace는 기존 grant 유지).
-- 확인(적용 후):
-- select position('started_at' in pg_get_functiondef('public.get_challenge_period_sessions(uuid)'::regprocedure)) > 0 as has_started_at,
--        (select proconfig from pg_proc where oid = 'public.get_challenge_period_sessions(uuid)'::regprocedure) as cfg;
-- 기대: has_started_at = true, cfg = {"search_path=public, pg_temp"}. 이어서 pnpm db:snapshot.
