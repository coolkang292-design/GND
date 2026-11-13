-- 0138: 완료 운동의 챌린지 기여분을 정확히 식별한다.
-- 변경은 get_challenge_period_sessions JSON의 session_id 한 키 추가뿐이다.
-- 기존 필드·참가자/사진/삭제 필터·함수 권한은 그대로 둔다.
-- 운영 적용 직전 사용자 승인 필요. 기존 앱은 추가 키를 무시하므로 먼저 적용 가능.

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
