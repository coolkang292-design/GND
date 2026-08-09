-- 0065: 챌린지 성과 열람권 — **한 번 쓰면 카운터가 다시 0부터**
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0064는 수정 금지.
--
-- 사용자 신고 (2026-08-09):
--   "챌린지에서 5일 운동하면 크루 성과 확인하게 하는 기능이 한번 열어 보면
--    리셋이 되어야 할듯. 어제 확인 했는데 오늘도 같은 보상이 지급이 됨"
--
-- 무엇이 문제였나. 열람권 판정에 **사용 기록이 전혀 안 들어갔다.** 조건이
-- "오늘 포함 엄밀 5연속" 하나뿐이라, 5일을 채운 뒤로는 연속이 끊길 때까지
-- **매일** 새 2시간 창이 열리고 알림도 매일 갔다. 잠금이 장식이었다.
--
-- 바로 옆의 꾸준왕 열람권은 처음부터 `record_views`를 봐서 `used` 상태를 가졌다 —
-- 챌린지 쪽만 그 개념이 빠져 있었다.
--
-- 새 규칙 한 줄:
--   마지막으로 **사용한 날 다음 날부터** 오늘까지 끊김 없이 5일을 채우면 다시 열린다.
--   한 번도 사용한 적이 없으면 지금과 같다(엄밀 연속 5일).
--   "사용" = 대상을 골랐다(`challenge_peek_picks`에 행이 생겼다). 잠금 화면을
--   본 것은 사용이 아니다 — 아무것도 못 봤으니까.
--
-- ⚠️ **화면과 같은 판정이어야 한다.** `src/lib/domain/viewing-pass.ts`의
--    `challengePassStatus(…, lastUsedDayKey)`가 짝이다. 한쪽만 고치면
--    "🎟️ 2시간 시작!" 푸시를 받고 들어갔더니 자물쇠가 걸린 막다른 길이 된다
--    (0045 → 0046 → 0047 사고와 같은 종류).
--
-- ⚠️ **오늘 쓴 것은 오늘 창을 닫지 않는다.** 대상을 고르고 나서도 그날 남은
--    2시간 동안은 고른 사람의 성과를 봐야 한다. 카운터는 내일부터 0이다.
--
-- 실행 시점: `create or replace`뿐이고 기존 행을 바꾸지 않는다. **지금 돌려도
-- 안전하다.** 앱 배포보다 **먼저** 돌려라 — 반대로 하면 알림은 매일 오는데
-- 카드는 잠겨 있는 막다른 길이 잠시 생긴다.

-- ── 1. 열람창 알림 판정 (0054의 인라인 블록을 여기로 뺐다) ────────
--
-- 조건이 `complete_workout_v2` 안에 통째로 박혀 있으면 화면 쪽 규칙과 맞춰
-- 고칠 때마다 150줄짜리 함수를 통째로 다시 써야 한다. 규칙만 따로 둔다.
create or replace function public.notify_challenge_peek_unlock(p_user_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_today     date := (now() at time zone 'Asia/Seoul')::date;
  v_challenge uuid;
  v_last_use  date;
  v_consec    int := 0;
  v_day       date;
begin
  -- 참가 중인 active 챌린지가 있을 때만 의미가 있다.
  select c.id into v_challenge
  from challenge_participants cp
  join challenges c on c.id = cp.challenge_id
  where cp.user_id = p_user_id and c.status = 'active'
  order by c.created_at desc
  limit 1;

  if v_challenge is null then return; end if;

  -- 이 챌린지에서 마지막으로 **쓴** 날. 없으면 null.
  select max(pick_date) into v_last_use
  from challenge_peek_picks
  where viewer_id = p_user_id and challenge_id = v_challenge;

  -- 오늘 쓴 것은 카운터를 끊지 않는다 (오늘 창은 유지된다).
  if v_last_use = v_today then
    v_last_use := null;
  end if;

  -- 오늘부터 뒤로 연속 운동일을 센다. 마지막으로 쓴 날에 닿으면 멈춘다 —
  -- 그날과 그 이전은 이미 보상으로 바뀐 날들이라 이번 블록에 안 쳐 준다.
  --
  -- ⚠️ current_streak_days를 쓰지 마라. 그건 "간격 5일 미만이면 이어짐"이라
  --    빈 날이 있어도 이어진 것으로 센다. 열람 조건은 **엄밀 연속**이다.
  for i in 0..364 loop
    v_day := v_today - i;
    exit when v_last_use is not null and v_day <= v_last_use;
    exit when not exists (
      select 1 from workout_sessions w
      where w.user_id = p_user_id
        and w.status = 'completed'
        and w.deleted_at is null
        and w.completed_at is not null
        and (w.completed_at at time zone 'Asia/Seoul')::date = v_day
    );
    v_consec := v_consec + 1;
  end loop;

  if v_consec < 5 then return; end if;

  -- dedupe_key로 하루 1건만. 열람창 자체가 KST 하루에 하나뿐이다.
  insert into notifications (user_id, type, reference_id, title, body, dedupe_key)
  values (
    p_user_id, 'challenge_peek_unlocked', v_challenge,
    '🎟️ 챌린지 성과 열람 2시간 시작!',
    '5일 연속 운동 달성! 지금부터 2시간 동안 챌린지 탭에서 참가자 한 명의 성과를 볼 수 있어요.',
    'peek_unlock:' || p_user_id::text || ':' || v_today::text
  )
  on conflict (dedupe_key) do nothing;
end $$;

revoke all on function public.notify_challenge_peek_unlock(uuid) from public, anon;
-- 호출은 complete_workout_v2(security definer) 안에서만 일어난다.

-- ── 2. complete_workout_v2 — 인라인 조건을 위 함수 호출로 바꾼다 ──
--
-- ⚠️ 아래 본문은 `docs/db-current-schema.sql`의 **현행 정의**를 그대로 옮긴 것이다
--    (CLAUDE.md §DB 마이그레이션: "파일에서 베끼지 마라"). 0054에서 베끼면
--    0055의 pausedSeconds 등 그 뒤 변경이 통째로 되돌아간다.
--    바뀐 곳은 두 군데뿐이다: `v_consec`·`v_challenge` 선언 제거, 0054 블록 →
--    `perform public.notify_challenge_peek_unlock(s.user_id);`

CREATE OR REPLACE FUNCTION public.complete_workout_v2(p_session_id uuid, p_paused_seconds integer DEFAULT 0)
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

  -- ⬇ 0065: 열람창 알림. 판정 규칙은 `notify_challenge_peek_unlock`이 갖는다.
  --   예전에는 이 자리에 조건이 통째로 박혀 있었고 "오늘 포함 5연속"만 봤다 —
  --   그래서 5일을 채운 뒤로는 연속이 끊길 때까지 **매일** 알림이 갔다.
  --   viewing-pass.ts의 challengePassStatus와 **같은 판정**이어야 한다.
  perform public.notify_challenge_peek_unlock(s.user_id);

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


-- ── 3. 적용 뒤 ────────────────────────────────────────────────
-- `pnpm db:snapshot`으로 docs/db-current-schema.sql을 다시 뽑아라.
