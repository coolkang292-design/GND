-- 롤백: 0133~0136 적용 취소 (2026-11-13 작성, 적용 직전 운영 현행 정의와 본문 해시가 일치함을 확인)
-- ⚠️ 이 파일의 drop은 파괴적이다. 실행 전에 사용자 승인이 필요하다. 자동으로 실행하지 마라.
-- 새 테이블에는 진화 이력(user_stage_history)·기준(stage_growth_baselines)이 쌓인다. 규칙을 켠 뒤에는 이력이 사용자 단계의 근거가 되므로
-- 켠 뒤의 롤백은 이 파일만으로 끝나지 않는다(단계 복원 별도 검토).
-- 순서: 1) 기존 함수 정의 복원(새 스키마를 더는 참조하지 않게) 2) 새 객체 제거.
-- 정의 출처: docs/db-current-schema.sql(0136 적용 이전 스냅샷, 운영 본문과 md5 일치)

CREATE OR REPLACE FUNCTION public.apply_xp_and_progress(p_user_id uuid, p_amount integer, p_reason text, p_reward_group text, p_source_type text, p_source_id text, p_effective_date date, p_metadata jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inserted boolean := false;
  v_prev_xp int; v_new_xp int;
  v_prev_level int; v_new_level int;
  v_prev_stage int; v_new_stage int;
  v_reward record; v_unlocked jsonb := '[]'::jsonb;
  v_new_unlock int; v_shield_ins int; v_shield_amt int;
  v_nick text; v_stage_name text; v_title text; v_body text;
begin
  insert into user_progress (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select total_xp, current_level, current_stage
    into v_prev_xp, v_prev_level, v_prev_stage
  from user_progress where user_id = p_user_id for update;
  v_new_xp := v_prev_xp;

  -- 1) 원장 insert (중복 방지 인덱스가 병렬/재시도 방어)
  begin
    insert into xp_transactions
      (user_id, amount, transaction_type, reason, reward_group,
       source_type, source_id, effective_date, rule_version, metadata)
    values (p_user_id, p_amount, 'earn', p_reason, p_reward_group,
            p_source_type, p_source_id, p_effective_date, 'xp_v1', coalesce(p_metadata, '{}'::jsonb));
    v_inserted := true;
    v_new_xp := v_prev_xp + p_amount;
  exception when unique_violation then
    v_inserted := false; -- 이미 지급됨 → 진행 변경 없음
  end;

  if not v_inserted then
    return jsonb_build_object('inserted', false, 'amount', 0,
      'newTotalXp', v_prev_xp, 'previousLevel', v_prev_level, 'newLevel', v_prev_level,
      'previousStage', v_prev_stage, 'newStage', v_prev_stage,
      'levelUp', false, 'stageUp', false, 'unlockedRewards', '[]'::jsonb);
  end if;

  -- 2) 레벨/단계 재계산 (컷 = level_definitions)
  select level, stage_index into v_new_level, v_new_stage
  from level_definitions where required_total_xp <= v_new_xp
  order by required_total_xp desc limit 1;

  update user_progress set
    total_xp = v_new_xp, current_level = v_new_level, current_stage = v_new_stage,
    last_level_up_at = case when v_new_level > v_prev_level then now() else last_level_up_at end,
    last_stage_up_at = case when v_new_stage > v_prev_stage then now() else last_stage_up_at end,
    updated_at = now()
  where user_id = p_user_id;

  -- 3) 통과한 레벨 보상 (prev < lv <= new) — 한 번에 여러 레벨도 모두 지급
  for v_reward in
    select level, reward_key, reward_label from level_definitions
    where level > v_prev_level and level <= v_new_level and reward_key is not null
    order by level asc
  loop
    insert into user_unlocks (user_id, unlock_key, source_level)
    values (p_user_id, v_reward.reward_key, v_reward.level)
    on conflict (user_id, unlock_key) do nothing;
    get diagnostics v_new_unlock = row_count;

    if v_new_unlock > 0 then
      v_unlocked := v_unlocked || jsonb_build_object('key', v_reward.reward_key, 'label', v_reward.reward_label);

      if v_reward.reward_key like 'streak_shield%' or v_reward.reward_key = 'eternal_flame' then
        v_shield_amt := case when v_reward.level >= 31 then 3 when v_reward.level >= 25 then 2 else 1 end;
        insert into streak_shield_transactions (user_id, amount, reason, source_type, source_id)
        values (p_user_id, v_shield_amt, 'level_reward', 'level', v_reward.level::text)
        on conflict (user_id, reason, source_type, source_id) do nothing;
        get diagnostics v_shield_ins = row_count;
        if v_shield_ins > 0 then
          update user_progress set streak_shield_count = streak_shield_count + v_shield_amt
          where user_id = p_user_id;
        end if;
      end if;
    end if;
  end loop;

  -- ⬇ 4) 0029: 레벨이 올랐으면 크루 전원에게 알린다.
  --    크루가 없으면(혼자모드) select가 0행이라 아무 일도 일어나지 않는다.
  if v_new_level > v_prev_level then
    select nickname into v_nick from profiles where id = p_user_id;
    select stage_name into v_stage_name
    from level_definitions where level = v_new_level;

    if v_new_stage > v_prev_stage then
      v_title := '🎉 ' || coalesce(v_nick, '크루원') || '님이 진화했어요!';
      -- 단계명 뒤에 '단계로'를 붙여 받침에 따른 조사 문제를 피한다
      v_body := 'Lv.' || v_new_level || ' 달성 — '
                || coalesce(v_stage_name, '다음') || ' 단계로 진화했어요 ✨';
    else
      v_title := '⬆️ ' || coalesce(v_nick, '크루원') || '님이 레벨업!';
      v_body := 'Lv.' || v_prev_level || ' → Lv.' || v_new_level
                || ' 달성했어요. 축하해주세요 👏';
    end if;

    -- reference_id는 uuid 컬럼이다. 타입 없는 null을 select 목록에 그대로 두면
    -- Postgres가 text로 추론해 42804로 죽고, 완료 트랜잭션 전체가 롤백된다.
    -- 0039로 팬아웃을 바꿔도 이 캐스트는 그대로 둔다.
    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    select case when l.user_a = p_user_id then l.user_b else l.user_a end,
           p_user_id, 'level_up', null::uuid, v_title, v_body
    from crew_links l                                    -- 0039
    where p_user_id in (l.user_a, l.user_b);
  end if;

  return jsonb_build_object('inserted', true, 'amount', p_amount,
    'newTotalXp', v_new_xp, 'previousLevel', v_prev_level, 'newLevel', v_new_level,
    'previousStage', v_prev_stage, 'newStage', v_new_stage,
    'levelUp', v_new_level > v_prev_level, 'stageUp', v_new_stage > v_prev_stage,
    'unlockedRewards', v_unlocked);
end $function$;

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

-- 2) 새 객체 제거
drop function if exists public.get_my_stage_evolution_status();
drop function if exists public.refresh_my_stage_evolution();
drop schema if exists gnd_evolution cascade;
drop table if exists public.stage_growth_baselines;
drop table if exists public.user_stage_history;
drop table if exists public.stage_evolution_errors;
drop table if exists public.stage_evolution_rules;
drop table if exists public.stage_evolution_settings;
