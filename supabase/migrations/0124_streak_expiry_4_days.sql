-- 0124: 스트릭 소멸선 5일 → 4일 (2026-11-11 사용자 지시)
--
-- "스트릭 유지는 3일 운동을 하지 않으면 4일차에 꺼지게." 마지막 운동일 D → D+1~D+3 휴식 →
-- D+4에 소멸. 앱 쪽 `src/lib/domain/streak.ts`의 STREAK_EXPIRY_DAYS = 4와 **같은 값**이어야 한다.
--
-- ⚠️ 적용 시점: **앱 배포와 같은 때.** 먼저 적용하면 아직 5일 규칙인 운영 앱과 DB 값이
--    어긋나 배지 지표(badge metrics)가 앱 화면과 다르게 나온다.
-- ⚠️ 배포 순간 마지막 운동이 정확히 4일 전인 사용자는 스트릭이 0이 된다. 배포 전에 인원을 센다.
-- ⚠️ 챌린지 레벨(level.ts)은 이 규칙과 무관하게 5일 유지다(진행 중 챌린지 규칙 소급 금지).
--
-- 비파괴: create or replace function (본문만 임계값 5→4). 권한·소유자는 그대로 유지된다.

create or replace function public.current_streak_days(p_user_id uuid)
 returns integer
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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

  if v_last is null or (v_today - v_last) >= 4 then
    return 0;
  end if;

  for r in
    select distinct (completed_at at time zone 'Asia/Seoul')::date as d
    from workout_sessions
    where user_id = p_user_id and status = 'completed'
      and deleted_at is null and completed_at is not null
    order by d desc
  loop
    if v_prev is not null and (v_prev - r.d) >= 4 then
      exit;
    end if;
    v_count := v_count + 1;
    v_prev := r.d;
  end loop;

  return v_count;
end;
$function$;
