-- ============================================================
-- 0054: 맨몸 기본 종목 보강 + 스칼레또 0kg 스쿼트 보정 + 열람 알림
-- 적용: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run (1회만)
-- 0001~0053은 수정 금지.
--
-- 배경 (2026-08-01 조사) — 스칼레또의 맨몸 실적이 계속 0이었다.
-- 집계 코드는 멀쩡했고, 원인은 **맨몸으로 분류된 종목을 한 번도 기록하지
-- 않아서**였다. 카탈로그의 '스쿼트'는 weight라, 맨몸 스쿼트를 해도 웨이트
-- 횟수로 들어간다. 게다가 맨몸 카탈로그 25종에 일반 '스쿼트'·'런지'가 없어
-- 검색으로 찾을 방법 자체가 없었다(있는 건 '점프 스쿼트'·'피스톨 스쿼트'뿐).
-- ============================================================

-- ── 1. 맨몸 기본 종목 시드 ───────────────────────────────────
-- body_part는 0004의 CHECK(가슴/등/하체/어깨/팔/코어/유산소)를 따른다.
-- measure는 맨몸만 지정한다(reps/time) — 0008 규칙.
-- 기존 25종과 겹치는 이름은 넣지 않는다. '스쿼트'가 이미 weight로 있으므로
-- 맨몸판은 '맨몸 스쿼트'라는 다른 이름을 쓴다 — seed name이 unique라
-- 같은 이름으로는 유형만 다른 행을 만들 수 없다.
insert into public.exercise_catalog (name, body_part, exercise_type, measure) values
  -- 하체
  ('맨몸 스쿼트', '하체', 'bodyweight', 'reps'),
  ('런지', '하체', 'bodyweight', 'reps'),
  ('리버스 런지', '하체', 'bodyweight', 'reps'),
  ('사이드 런지', '하체', 'bodyweight', 'reps'),
  ('와이드 스쿼트', '하체', 'bodyweight', 'reps'),
  ('스텝업', '하체', 'bodyweight', 'reps'),
  ('카프 레이즈', '하체', 'bodyweight', 'reps'),
  ('힙 브릿지', '하체', 'bodyweight', 'reps'),
  ('월 싯', '하체', 'bodyweight', 'time'),
  ('점핑잭', '하체', 'bodyweight', 'reps'),
  ('하이 니', '하체', 'bodyweight', 'reps'),
  -- 가슴·어깨·팔
  ('니 푸시업', '가슴', 'bodyweight', 'reps'),
  ('와이드 푸시업', '가슴', 'bodyweight', 'reps'),
  ('파이크 푸시업', '어깨', 'bodyweight', 'reps'),
  ('벤치 딥스', '팔', 'bodyweight', 'reps'),
  -- 코어
  ('버드독', '코어', 'bodyweight', 'reps'),
  ('데드버그', '코어', 'bodyweight', 'reps'),
  ('플러터 킥', '코어', 'bodyweight', 'reps'),
  ('힐 터치', '코어', 'bodyweight', 'reps'),
  ('바이시클 크런치', '코어', 'bodyweight', 'reps')
on conflict (name) where created_by is null do nothing;

-- ── 2. 스칼레또의 0kg 스쿼트 보정 ────────────────────────────
-- 사용자 결정(2026-08-01): "0kg은 맨몸운동, 무게가 있는 운동은 웨이트".
-- 대상은 2건 — 2026-07-20·07-25의 `0kg × 35회`. 10kg이 실린 나머지 6건은
-- 규칙대로 웨이트로 남긴다.
--
-- ⚠ 이 두 건은 챌린지 기간(2026-07-27~) **밖**이라 챌린지 성적은 변하지 않는다.
--   바뀌는 것은 전체 기간 맨몸 실적(0 → 70회)뿐이다.
--
-- 안전장치: 완료 세트가 전부 weight_kg=0 이고 이름이 '스쿼트'인 것만 고른다.
-- workout_exercises에는 트리거가 없어 XP·배지·알림이 재발화하지 않는다
-- (트리거는 profiles/workout_sessions/workout_sets/user_goals/reactions/
--  notifications/bug_reports/workout_plans에만 있다 — 0001·0004·0011·0016 등).
update public.workout_exercises we
set exercise_type = 'bodyweight',
    exercise_name = '맨몸 스쿼트',
    measure = 'reps'
from public.workout_sessions s
where we.session_id = s.id
  and s.user_id = '2d195bec-6a36-4ceb-b914-f934436a9d22'  -- 스칼레또
  and we.exercise_name = '스쿼트'
  and we.exercise_type = 'weight'
  -- 완료 세트가 하나 이상 있고, 그 전부가 무게 0
  and exists (
    select 1 from public.workout_sets ws
    where ws.workout_exercise_id = we.id and ws.is_completed
  )
  and not exists (
    select 1 from public.workout_sets ws
    where ws.workout_exercise_id = we.id
      and ws.is_completed
      and coalesce(ws.weight_kg, 0) > 0
  );

-- 적용 후 확인 — **2건**이어야 한다(7/20·7/25). 3건 이상이면 무게 있는 것까지
-- 걸린 것이니 되돌려라(exercise_type='weight', exercise_name='스쿼트').
--   select s.completed_at, we.exercise_name, we.exercise_type
--   from workout_exercises we join workout_sessions s on s.id = we.session_id
--   where s.user_id = '2d195bec-6a36-4ceb-b914-f934436a9d22'
--     and we.exercise_type = 'bodyweight';

-- ── 3. 알림 유형에 challenge_peek_unlocked 추가 ──────────────
-- notifications_type_check는 허용목록 방식이라, 새 type을 쓰려면 목록에 더한다.
-- 현행 정의는 0052가 마지막으로 덮어썼다(18종). 여기서 19종이 된다.
-- ⚠ 기존 18종을 전부 옮겨 적어야 한다 — 하나라도 빠지면 그 알림이 죽는다.
--
-- 적용 후 확인 — **19종**이어야 한다:
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'notifications_type_check';
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'workout_started', 'cheer_received', 'poke', 'reaction_received',
    'rank_change', 'record_viewed', 'morning_briefing',
    'challenge_started', 'challenge_ended', 'record_beaten', 'badge_earned',
    'level_up', 'app_update',
    'crew_request', 'crew_accepted',                     -- 0038
    'challenge_invite',                                  -- 0042
    'bug_reported', 'bug_fixed',                         -- 0052
    'challenge_peek_unlocked'                            -- 0054
  ));

-- ── 4. complete_workout_v2 — 5일 연속 달성 시 열람 알림 ──────
-- 왜: 열람창이 "그날 첫 완료 시각 + 2시간"이라 아침에 운동하면 오전 중에
--     조용히 닫힌다. 스칼레또는 7/29·7/30 두 번 달성했지만 열린 줄도 몰랐다.
--     알려주지 않으면 사실상 못 쓰는 기능이다.
--
-- 현행 정의는 0022가 마지막으로 덮어썼다(docs/db-current-schema.sql 기준).
-- 아래는 그 전문에 **4번 블록만** 더한 것이다. 나머지는 손대지 않았다.
--
-- 형제 함수 확인: 구버전 public.complete_workout(0004)이 아직 살아 있으나
-- 앱은 workout.ts:319에서 v2만 부른다. v1은 일부 검증 스크립트 전용이라
-- 알림을 달지 않는다 — 픽스처가 실사용자에게 알림을 쏘면 안 된다.
CREATE OR REPLACE FUNCTION public.complete_workout_v2(p_session_id uuid)
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
    'newBadges', v_badges
  );
end $function$;
