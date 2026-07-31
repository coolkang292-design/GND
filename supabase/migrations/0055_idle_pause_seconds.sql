-- 0055: 무동작 정지 시간을 운동 시간에서 뺀다 (설계 2026-08-01)
--
-- 앱만 켜 두고 운동하지 않은 시간이 운동 시간·XP로 잡히는 오남용을 막는다.
-- 클라이언트가 무동작 5분을 감지하면 카운팅을 멈추고, 종료할 때 멈춰 있던
-- 총 시간을 p_paused_seconds로 보낸다.
--
-- 주의: complete_workout_v2 본문은 docs/db-current-schema.sql의 **현행 정의**를
-- 그대로 옮긴 것이다(0022 → 0027 → 0032 → 0054 누적). duration 계산과
-- paused_seconds 기록만 바뀌었다. 파일에서 베끼지 말고 스냅샷에서 베낄 것.

-- ── 1. 정지 시간 컬럼 ──────────────────────────────────────────
alter table public.workout_sessions
  add column if not exists paused_seconds int not null default 0
    check (paused_seconds >= 0);

comment on column public.workout_sessions.paused_seconds is
  '무동작으로 멈춰 있던 총 시간(초). duration_minutes에서 이미 빠져 있다.';

-- ── 2. complete_workout_v2 — 인자 추가 ─────────────────────────
-- 인자가 늘어나므로 기존 1-인자 함수를 지우고 다시 만든다. p_paused_seconds에
-- 기본값이 있어 구버전 앱의 1-인자 호출도 그대로 동작한다(배포 순서: DB → 앱).
drop function if exists public.complete_workout_v2(uuid);

CREATE OR REPLACE FUNCTION public.complete_workout_v2(
  p_session_id uuid,
  p_paused_seconds int default 0
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s workout_sessions;
  v_dur int; v_valid boolean; v_tabata boolean;
  v_eff date; v_has_daily boolean;
  v_base int := 0; v_time int := 0; v_plan int := 0; v_rec int := 0; v_photo int := 0;
  v_total int := 0;
  v_prog jsonb; v_orig int;
  v_streak int; v_mult numeric; v_points int := 0; v_badges jsonb := '[]'::jsonb;
  v_consec int; v_challenge uuid;
  v_elapsed int; v_paused int;
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

  -- ⬇ 0055: 정지 시간은 클라이언트가 보내는 값이므로 0 ~ 실제 경과초로 클램프한다.
  --   과대 신고해도 자기 XP만 줄고, 음수 duration은 생기지 않는다.
  v_elapsed := floor(extract(epoch from now() - s.started_at))::int;
  v_paused := least(greatest(coalesce(p_paused_seconds, 0), 0), greatest(v_elapsed, 0));

  update workout_sessions
  set status = 'completed', completed_at = now(),
      paused_seconds = v_paused,
      duration_minutes = greatest(0, floor((v_elapsed - v_paused) / 60.0))::int
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
        'duration_source', 'server_elapsed', 'is_tabata', v_tabata,
        'paused_seconds', v_paused));
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

  -- ⬇ 0054 추가: 챌린지 성과 열람창이 열렸음을 알린다.
  --   current_streak_days는 "간격 5일 미만이면 이어짐"이라 여기 쓸 수 없다.
  --   열람 조건은 **엄밀 연속**(빈 날 없음)이고 오늘을 포함해야 한다 —
  --   viewing-pass.ts의 challengePassStatus와 같은 판정이어야 한다.
  --   generate_series로 오늘부터 뒤로 5일을 만들고 전부 운동일인지 본다.
  select count(*) into v_consec
  from generate_series(0, 4) g(i)
  where exists (
    select 1 from workout_sessions w
    where w.user_id = s.user_id
      and w.status = 'completed'
      and w.deleted_at is null
      and w.completed_at is not null
      and (w.completed_at at time zone 'Asia/Seoul')::date
          = ((now() at time zone 'Asia/Seoul')::date - g.i)
  );

  if v_consec = 5 then
    -- 참가 중인 active 챌린지가 있을 때만 의미가 있다.
    select c.id into v_challenge
    from challenge_participants cp
    join challenges c on c.id = cp.challenge_id
    where cp.user_id = s.user_id and c.status = 'active'
    order by c.created_at desc
    limit 1;

    if v_challenge is not null then
      -- dedupe_key로 하루 1건만. 열람창 자체가 KST 하루에 하나뿐이다.
      insert into notifications (user_id, type, reference_id, title, body, dedupe_key)
      values (
        s.user_id, 'challenge_peek_unlocked', v_challenge,
        '🎟️ 챌린지 성과 열람 2시간 시작!',
        '5일 연속 운동 달성! 지금부터 2시간 동안 홈에서 참가자 한 명의 성과를 볼 수 있어요.',
        'peek_unlock:' || s.user_id::text || ':'
          || ((now() at time zone 'Asia/Seoul')::date)::text
      )
      on conflict (dedupe_key) do nothing;
    end if;
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
    'unlockedRewards', v_prog->'unlockedRewards',
    'pointsAwarded', v_points, 'pointMultiplier', v_mult, 'streakDays', v_streak,
    'newBadges', v_badges,
    'pausedSeconds', v_paused
  );
end $function$;

-- 0022 이후로 이어 온 권한 — drop하면 기본값(PUBLIC EXECUTE)으로 돌아가므로
-- 반드시 다시 걸어야 한다. anon이 남의 세션을 종료할 수 있으면 안 된다.
revoke all on function public.complete_workout_v2(uuid, int) from public, anon;
grant execute on function public.complete_workout_v2(uuid, int) to authenticated;

-- PostgREST가 새 시그니처를 즉시 인식하도록 스키마 캐시를 다시 읽게 한다.
notify pgrst, 'reload schema';
