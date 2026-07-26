-- 0029: 레벨업하면 크루에게 알린다
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회). 0022는 수정하지 않는다.
--
-- 왜 (2026-07-26 사용자 요청):
--   레벨은 자랑하라고 만든 지표인데 지금은 오르는 순간을 본인만 안다.
--   크루에게 알리면 축하가 오가고, 남의 성장이 내 자극이 된다.
--
-- 어디에 넣나:
--   apply_xp_and_progress가 레벨 변화를 계산하는 **유일한** 지점이다.
--   complete_workout_v2·award_workout_photo_xp가 모두 이 함수를 거치므로
--   여기 한 곳에만 넣으면 모든 레벨업 경로가 덮인다.
--
-- 문구는 두 갈래다. 단계(7단계 캐릭터)까지 바뀌면 더 크게 알린다 —
-- 레벨업은 5레벨마다 한 번씩 단계 진화를 겸하고, 그때가 진짜 사건이다.
--
-- 알림 설정 토글은 두지 않는다. 기록 갱신(record_beaten)·배지(badge_earned)와
-- 같은 축하성 알림이고, 그 둘도 토글이 없다.

-- ── notifications.type에 level_up 추가 ──────────────────────
-- 0020이 만든 제약을 이름과 무관하게 찾아 교체한다(0020과 같은 방식).
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.notifications'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%workout_started%';
  if v_conname is not null then
    execute format(
      'alter table public.notifications drop constraint %I',
      v_conname
    );
  end if;
end $$;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'workout_started', 'cheer_received', 'poke', 'reaction_received',
    'rank_change', 'record_viewed', 'morning_briefing',
    'challenge_started', 'challenge_ended', 'record_beaten', 'badge_earned',
    'level_up'
  ));

-- ── 레벨업 알림을 포함한 apply_xp_and_progress ──────────────
create or replace function public.apply_xp_and_progress(
  p_user_id uuid, p_amount int, p_reason text, p_reward_group text,
  p_source_type text, p_source_id text, p_effective_date date, p_metadata jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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

  -- ⬇ 4) 0029 추가: 레벨이 올랐으면 크루 전원에게 알린다.
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
    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    select distinct gm.user_id, p_user_id, 'level_up', null::uuid, v_title, v_body
    from group_members gm
    where gm.user_id <> p_user_id
      and gm.group_id in (
        select group_id from group_members where user_id = p_user_id
      );
  end if;

  return jsonb_build_object('inserted', true, 'amount', p_amount,
    'newTotalXp', v_new_xp, 'previousLevel', v_prev_level, 'newLevel', v_new_level,
    'previousStage', v_prev_stage, 'newStage', v_new_stage,
    'levelUp', v_new_level > v_prev_level, 'stageUp', v_new_stage > v_prev_stage,
    'unlockedRewards', v_unlocked);
end $$;
revoke all on function public.apply_xp_and_progress(uuid, int, text, text, text, text, date, jsonb)
  from public, anon, authenticated;
