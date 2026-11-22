-- 0149: 단계별 경험치 방식 — 레벨은 "현재 단계에서 쌓은 경험치(stage_xp)"로 정하고 진화 전까지
--       단계 마지막 레벨에서 멈춘다. 경험치(total_xp)는 계속 쌓이고 하나도 버리지 않는다.
--
-- 사용자 확정(2026-11-22): 운동할 때마다 경험치는 계속 쌓는다 · 각 단계는 "그 단계에서 채울 양"
-- (1단계 1000 · 2단계 2000 · … · 6단계 6000) · 진화하는 순간의 누적 경험치가 새 단계의 출발점이다.
-- 설계·근거: docs/superpowers/plans/2026-11-22-evolution-mission-and-stage-xp.md §3
--
-- ⚠️ 적용 순서(이 파일은 **앱 배포 뒤**에 적용한다):
--    1) 0148(칸 추가) 적용 · 2) stage_xp를 읽는 앱 배포(null이면 옛 방식이라 안전) · 3) 이 파일.
--    앱이 먼저 나가 있지 않으면 옛 폰 앱이 새 조건 항목(`stage_xp`)을 못 읽어 진화 카드가 깨진다.
-- ⚠️ 맨 아래 UPDATE는 기존 행을 바꾼다 — 사용자 승인 후 적용한다(CLAUDE.md §DB 마이그레이션).
-- ⚠️ 단계 경험치는 진입 시각 **초과**(`created_at > entered_at`)만 센다 — 진화를 일으킨 적립은 옛 단계 몫이다.
--
-- 바꾸는 함수: stage_status · evaluate_stage_evolution(gnd_evolution) ·
--             apply_xp_and_progress · complete_workout_v2 · refresh_my_stage_evolution · get_crew_member_profile(public)
-- 새 함수(gnd_evolution, 앱에서 직접 못 부른다): stage_first_level · stage_width · stage_level · stage_xp_since · settle_level

-- ── 1. 단계/레벨 계산 보조 (level_definitions 기준) ─────────────────────────────────────

create or replace function gnd_evolution.stage_first_level(p_stage integer)
 returns integer language sql stable set search_path to ''
as $function$
  select min(d.level)::int from public.level_definitions d where d.stage_index = p_stage
$function$;

-- 단계에서 채울 경험치 양 = 그 단계 첫 레벨 컷과 다음 단계 첫 레벨 컷의 차 (마지막 단계는 35레벨 컷까지)
create or replace function gnd_evolution.stage_width(p_stage integer)
 returns integer language sql stable set search_path to ''
as $function$
  select (coalesce((select min(d.required_total_xp) from public.level_definitions d where d.stage_index = p_stage + 1),
                   (select max(d.required_total_xp) from public.level_definitions d))
          - (select min(d.required_total_xp) from public.level_definitions d where d.stage_index = p_stage))::int
$function$;

-- 단계 안 레벨. 1~6단계는 양을 5등분, 마지막(7)단계는 끝이 35레벨이라 4등분. 앱 `getStageLevelProgress`와 같다.
create or replace function gnd_evolution.stage_level(p_stage integer, p_stage_xp integer)
 returns integer language plpgsql stable set search_path to ''
as $function$
declare first_lv int; w int; step numeric; idx int;
begin
  first_lv := gnd_evolution.stage_first_level(p_stage);
  if first_lv is null then raise exception 'invalid_stage'; end if;
  w := gnd_evolution.stage_width(p_stage);
  step := case when p_stage = (select max(d.stage_index) from public.level_definitions d) then w / 4.0 else w / 5.0 end;
  idx := least(4, floor(greatest(0, coalesce(p_stage_xp, 0)) / step)::int);
  return first_lv + idx;
end $function$;

-- 단계에 들어온 뒤 쌓은 경험치(원장 합, 취소·조정 포함). since가 null이면 가입 후 전체.
--
-- ⚠️ 진입 시각 **초과**(`>`)만 센다. 진화는 경험치를 적립한 같은 트랜잭션 안에서 일어나서 진화를 일으킨
--    적립의 `created_at`이 진입 시각(`now()`)과 **같다** — `>=`로 세면 그 적립이 새 단계로 넘어가
--    새 단계가 0이 아니라 그 적립만큼 앞서 시작하고, 큰 적립 한 번에 여러 단계를 건너뛴다
--    (2026-11-22 리허설에서 1단계 사용자 +900이 2단계 Lv.8로 뛰었다). "진화하는 순간의 누적이 출발점"이다.
create or replace function gnd_evolution.stage_xp_since(p_user_id uuid, p_since timestamp with time zone)
 returns integer language sql stable set search_path to ''
as $function$
  select coalesce(sum(t.amount), 0)::int
  from public.xp_transactions t
  where t.user_id = p_user_id and t.created_at > coalesce(p_since, '-infinity'::timestamptz)
$function$;

-- 레벨 정산 — stage_xp와 레벨을 원장에서 다시 계산해 저장하고, 새로 지난 레벨의 보상을 준다. **여러 번 불러도 안전**
-- (보상은 on conflict do nothing, 방패는 원장 유니크). 진화 판정 뒤·경험치 적립 뒤에 부른다.
create or replace function gnd_evolution.settle_level(p_user_id uuid)
 returns jsonb language plpgsql set search_path to ''
as $function$
declare
  up public.user_progress; h public.user_stage_history;
  v_sxp int; v_prev int; v_new int;
  v_reward record; v_unlocked jsonb := '[]'::jsonb;
  v_new_unlock int; v_shield_ins int; v_shield_amt int;
begin
  select * into up from public.user_progress where user_id = p_user_id for update;
  if not found then
    return jsonb_build_object('previousLevel', 1, 'newLevel', 1, 'stageXp', 0, 'unlocked', '[]'::jsonb);
  end if;
  select * into h from public.user_stage_history where user_id = p_user_id and stage = up.current_stage;
  v_sxp := gnd_evolution.stage_xp_since(p_user_id, h.entered_at);
  v_prev := up.current_level;
  v_new := gnd_evolution.stage_level(up.current_stage, v_sxp);

  update public.user_progress
     set stage_xp = v_sxp, current_level = v_new,
         last_level_up_at = case when v_new > v_prev then now() else last_level_up_at end,
         updated_at = now()
   where user_id = p_user_id;

  for v_reward in
    select d.level, d.reward_key, d.reward_label from public.level_definitions d
    where d.level > v_prev and d.level <= v_new and d.reward_key is not null
    order by d.level asc
  loop
    insert into public.user_unlocks (user_id, unlock_key, source_level)
    values (p_user_id, v_reward.reward_key, v_reward.level)
    on conflict (user_id, unlock_key) do nothing;
    get diagnostics v_new_unlock = row_count;
    if v_new_unlock > 0 then
      v_unlocked := v_unlocked || jsonb_build_object('key', v_reward.reward_key, 'label', v_reward.reward_label);
      if v_reward.reward_key like 'streak_shield%' or v_reward.reward_key = 'eternal_flame' then
        v_shield_amt := case when v_reward.level >= 31 then 3 when v_reward.level >= 25 then 2 else 1 end;
        insert into public.streak_shield_transactions (user_id, amount, reason, source_type, source_id)
        values (p_user_id, v_shield_amt, 'level_reward', 'level', v_reward.level::text)
        on conflict (user_id, reason, source_type, source_id) do nothing;
        get diagnostics v_shield_ins = row_count;
        if v_shield_ins > 0 then
          update public.user_progress set streak_shield_count = streak_shield_count + v_shield_amt where user_id = p_user_id;
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object('previousLevel', v_prev, 'newLevel', v_new, 'stageXp', v_sxp, 'unlocked', v_unlocked);
end $function$;

-- 새 함수는 앱(anon·authenticated)이 직접 못 부른다 — 기존 gnd_evolution 함수와 같다. 호출은 public의
-- SECURITY DEFINER 함수 안에서만 일어난다(소유자 권한).
revoke all on function gnd_evolution.stage_first_level(integer), gnd_evolution.stage_width(integer),
  gnd_evolution.stage_level(integer,integer), gnd_evolution.stage_xp_since(uuid,timestamptz),
  gnd_evolution.settle_level(uuid) from public, anon, authenticated;

-- ── 2. 진화 판정: 경험치 조건을 "이 단계에서 쌓은 경험치 >= 단계 양"으로 ──────────────────────────
-- (0146 본문 + 경험치 조건만 바뀐다. 진화 규칙이 꺼져 있으면(`enabled=false`) 옛 레벨 조건 그대로.)

create or replace function gnd_evolution.stage_status(p_user_id uuid, p_at timestamp with time zone)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare
  up public.user_progress; h public.user_stage_history; r public.stage_evolution_rules;
  enabled boolean; v text; mode text; result jsonb; conditions jsonb:='[]';
  baseline jsonb; current_points jsonb; score jsonb; n int; n_days int; weeks int; recent int;
  since date; day_list date[]; steady int; steady_ok boolean; alt jsonb; base_ok boolean; growth_ok boolean; alt_ok boolean;
  today date:=(p_at at time zone 'Asia/Seoul')::date; state text; err text;
  v_sxp int; v_width int; xp_met boolean;
begin
  select * into up from public.user_progress where user_id=p_user_id;
  if not found then up.current_stage:=1; up.current_level:=1; up.total_xp:=0; end if;
  select s.enabled,s.rule_version into strict enabled,v from public.stage_evolution_settings s where singleton;
  select * into h from public.user_stage_history where user_id=p_user_id and stage=up.current_stage;
  mode:=case when not enabled then 'legacy_xp' when up.current_stage<3 then 'xp_only' else 'gated' end;
  result:=jsonb_build_object('mode',mode,'ruleVersion',v,'currentStage',up.current_stage,'currentLevel',up.current_level,
    'stageEnteredAt',h.entered_at,'nextStage',case when up.current_stage<7 then up.current_stage+1 end,
    'path','growth','growthMetric','top_n_zero_padded_mean','averageGrowthPct',null,
    'comparableCount',0,'requiredGrowthCount',null,'filledGrowthCount',0,'conditions','[]'::jsonb,
    'growthSummary',null,'selectedGrowths','[]'::jsonb);
  if up.current_stage=7 then return result||jsonb_build_object('state','max_stage'); end if;
  select * into r from public.stage_evolution_rules where rule_version=v and target_stage=up.current_stage+1;
  if not found then raise exception 'stage_rule_missing'; end if;
  if enabled then
    -- 단계별 경험치: 진화한 뒤 쌓은 경험치(원장)가 이 단계의 양을 채웠는가. 캐시가 아니라 원장에서 바로 센다.
    v_sxp:=gnd_evolution.stage_xp_since(p_user_id,h.entered_at);
    v_width:=gnd_evolution.stage_width(up.current_stage);
    xp_met:=v_sxp>=v_width;
    conditions:=jsonb_build_array(jsonb_build_object('key','stage_xp','current',v_sxp,'required',v_width,'met',xp_met));
    result:=result||jsonb_build_object('stageXp',v_sxp);
  else
    xp_met:=up.current_level>=r.min_level;
    conditions:=jsonb_build_array(jsonb_build_object('key','xp','current',up.current_level,'required',r.min_level,'met',xp_met));
  end if;
  if not enabled or r.mode='xp_only' then
    return result||jsonb_build_object('conditions',conditions,'state',case when xp_met then 'eligible' else 'blocked' end);
  end if;
  since:=(h.entered_at at time zone 'Asia/Seoul')::date;
  select count(distinct d),
    count(distinct d) filter(where today-d<r.recent_window_days)
    into n_days,recent
    from (select (s.completed_at at time zone 'Asia/Seoul')::date d
          from gnd_evolution.valid_sessions(p_user_id,p_at) s
          where s.completed_at>=h.entered_at) x;
  weeks:=case when since is null then 0 else (today-since)/7 end;
  conditions:=conditions||case when r.habit_kind='days'
    then jsonb_build_array(jsonb_build_object('key','days','current',n_days,'required',r.workout_days,'met',n_days>=r.workout_days))
    else jsonb_build_array(jsonb_build_object('key','weeks','current',weeks,'required',r.elapsed_weeks,'met',weeks>=r.elapsed_weeks)) end;
  if r.recent_window_days is not null then conditions:=conditions||jsonb_build_object('key','recent','current',recent,
    'required',r.recent_days,'met',recent>=r.recent_days,'windowDays',r.recent_window_days); end if;
  if h.baseline_ready is true and h.rule_version=v and h.previous_exercise_count>0 then
    n:=least(h.previous_exercise_count,greatest(3,ceil(h.previous_exercise_count*r.growth_ratio)::int));
    select coalesce(jsonb_agg(p),'[]'::jsonb) into baseline from public.stage_growth_baselines b,
      lateral jsonb_array_elements(b.points) p where b.user_id=p_user_id and b.stage=up.current_stage;
    current_points:=gnd_evolution.metric_points(p_user_id,h.entered_at,p_at);
    score:=gnd_evolution.score_points(baseline,current_points,n);
    score:=jsonb_set(score,'{summary,previousStageExerciseCount}',to_jsonb(h.previous_exercise_count));
    result:=result||jsonb_build_object('averageGrowthPct',score->'averagePct','comparableCount',score#>'{summary,comparableCount}',
      'requiredGrowthCount',n,'filledGrowthCount',score->'filledCount','growthSummary',score->'summary','selectedGrowths',score->'selected');
  end if;
  conditions:=conditions||jsonb_build_array(
    jsonb_build_object('key','growth_count','current',score->'filledCount','required',n,'met',coalesce((score->>'countMet')::boolean,false)),
    jsonb_build_object('key','growth_average','current',score->'averagePct','required',r.average_pct,'met',coalesce((score->>'averagePct')::numeric>=r.average_pct,false)));
  select coalesce(array_agg(distinct (s.completed_at at time zone 'Asia/Seoul')::date),'{}'::date[]) into day_list
    from gnd_evolution.valid_sessions(p_user_id,p_at) s;
  steady:=gnd_evolution.steady_count(day_list,since,today);
  steady_ok:=steady>=r.steady_required;
  if r.steady_required>0 then conditions:=conditions||jsonb_build_array(
    jsonb_build_object('key','steady','current',steady,'required',r.steady_required,'met',steady_ok)); end if;
  if r.alt_days is not null then
    alt:=jsonb_build_object('kind','days','current',n_days,'required',r.alt_days,'exemptsSteady',r.alt_exempts_steady,
      'met',n_days>=r.alt_days and (r.alt_exempts_steady or steady_ok));
  elsif r.alt_steady_required is not null then
    alt:=jsonb_build_object('kind','steady','current',steady,'required',r.alt_steady_required,'exemptsSteady',false,
      'met',steady>=r.alt_steady_required);
  end if;
  base_ok:=not exists(select 1 from jsonb_array_elements(conditions) c
    where c->>'key' in ('xp','stage_xp','days','weeks','recent') and (c->>'met')::boolean is not true);
  growth_ok:=coalesce((score->>'countMet')::boolean,false) and coalesce((score->>'averagePct')::numeric>=r.average_pct,false) and steady_ok;
  alt_ok:=coalesce((alt->>'met')::boolean,false);
  if base_ok and (growth_ok or alt_ok) then state:='eligible';
  elsif n is null then state:='needs_baseline';
  else state:='blocked'; end if;
  select error_code into err from public.stage_evolution_errors where user_id=p_user_id;
  return result||jsonb_build_object('conditions',conditions,'state',case when err is not null then 'error' else state end,'errorCode',err,
    'path',case when growth_ok or not alt_ok then 'growth' else 'alternate' end,'alternate',alt);
end $function$;

-- 진화 재판정 + 레벨 정산. 단계가 바뀌면 레벨이 새 단계 첫 레벨로 올라가고 그 보상이 지급된다.
create or replace function gnd_evolution.evaluate_stage_evolution(p_user_id uuid)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare s jsonb; previous int; next_stage int; i int; l jsonb;
begin
  perform 1 from public.user_progress where user_id=p_user_id for update;
  if not found then raise exception 'progress_not_found'; end if;
  select current_stage into previous from public.user_progress where user_id=p_user_id;
  if (select enabled from public.stage_evolution_settings where singleton) then
    delete from public.stage_evolution_errors where user_id=p_user_id;
    for i in 1..6 loop
      s:=gnd_evolution.stage_status(p_user_id,now());
      exit when s->>'state'<>'eligible';
      next_stage:=(s->>'nextStage')::int;
      perform gnd_evolution.freeze_stage(p_user_id,next_stage,now(),'actual');
      update public.user_progress set current_stage=next_stage,last_stage_up_at=now(),updated_at=now() where user_id=p_user_id;
      exit when next_stage>=4; -- 초기 XP 단계 외에는 한 번의 재판정에 한 단계만 상승.
    end loop;
  end if;
  -- 레벨 정산(단계가 바뀌었든 아니든): stage_xp·레벨을 원장에서 다시 계산하고 새 레벨의 보상을 준다.
  l:=gnd_evolution.settle_level(p_user_id);
  s:=gnd_evolution.stage_status(p_user_id,now());
  return s||jsonb_build_object('previousStage',previous,'stageUp',(s->>'currentStage')::int>previous,
    'previousLevel',l->'previousLevel','newLevel',l->'newLevel','unlockedRewards',l->'unlocked');
end $function$;

-- ── 3. 경험치 지급: 레벨은 정산이 정한다 (진화 규칙이 꺼져 있으면 옛 방식 그대로) ─────────────────────

create or replace function public.apply_xp_and_progress(p_user_id uuid, p_amount integer, p_reason text, p_reward_group text, p_source_type text, p_source_id text, p_effective_date date, p_metadata jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_inserted boolean := false;
  v_gate jsonb; v_settle jsonb; v_i int;
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
  begin
    perform gnd_evolution.bootstrap_user(p_user_id);
  exception when others then
    insert into public.stage_evolution_errors(user_id,error_code,phase) values(p_user_id,sqlstate,'bootstrap')
      on conflict(user_id) do update set error_code=excluded.error_code,phase=excluded.phase,occurred_at=now();
  end;

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

  if (select enabled from public.stage_evolution_settings where singleton) then
    -- 2) 누적 경험치만 먼저 올린다. 레벨은 진화 판정 뒤 정산이 정한다(단계 경험치 · 진화 전 상한).
    update user_progress set total_xp = v_new_xp, updated_at = now() where user_id = p_user_id;
    v_gate := gnd_evolution.safe_evaluate(p_user_id);
    v_new_stage := (v_gate->>'currentStage')::int;
    -- 판정이 실패해도(안전망) 경험치·레벨은 반영한다. 정산은 여러 번 불러도 안전하다.
    begin
      v_settle := gnd_evolution.settle_level(p_user_id);
    exception when others then
      insert into public.stage_evolution_errors(user_id,error_code,phase) values(p_user_id,sqlstate,'settle')
        on conflict(user_id) do update set error_code=excluded.error_code,phase=excluded.phase,occurred_at=now();
    end;
    select current_level into v_new_level from user_progress where user_id = p_user_id;
    v_unlocked := coalesce(v_gate->'unlockedRewards', '[]'::jsonb) || coalesce(v_settle->'unlocked', '[]'::jsonb);
  else
    -- 옛 방식(진화 규칙 꺼짐): 누적 경험치로 레벨·단계를 정한다.
    select level, stage_index into v_new_level, v_new_stage
    from level_definitions where required_total_xp <= v_new_xp
    order by required_total_xp desc limit 1;
    v_new_stage := greatest(v_prev_stage,v_new_stage);

    update user_progress set
      total_xp = v_new_xp, current_level = v_new_level, current_stage = v_new_stage,
      last_level_up_at = case when v_new_level > v_prev_level then now() else last_level_up_at end,
      last_stage_up_at = case when v_new_stage > v_prev_stage then now() else last_stage_up_at end,
      updated_at = now()
    where user_id = p_user_id;

    if v_new_stage > v_prev_stage then
      begin
        for v_i in (v_prev_stage+1)..v_new_stage loop
          perform gnd_evolution.freeze_stage(p_user_id,v_i,now(),'actual');
        end loop;
      exception when others then
        insert into public.stage_evolution_errors(user_id,error_code,phase) values(p_user_id,sqlstate,'legacy_freeze')
          on conflict(user_id) do update set error_code=excluded.error_code,phase=excluded.phase,occurred_at=now();
      end;
    end if;

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
  end if;

  -- 레벨/단계 동시 상승도 알림은 한 곳에서 한 번만 만든다.
  perform gnd_evolution.notify_progress(p_user_id,v_prev_level,v_new_level,v_prev_stage,v_new_stage);

  return jsonb_build_object('inserted', true, 'amount', p_amount,
    'newTotalXp', v_new_xp, 'previousLevel', v_prev_level, 'newLevel', v_new_level,
    'previousStage', v_prev_stage, 'newStage', v_new_stage,
    'levelUp', v_new_level > v_prev_level, 'stageUp', v_new_stage > v_prev_stage,
    'unlockedRewards', v_unlocked);
end $function$;

-- 운동 완료: XP가 0인 같은 날 두 번째 운동에서 진화가 일어날 때 새 레벨·보상을 응답과 알림에 싣는다(한 곳만 바뀜).
create or replace function public.complete_workout_v2(p_session_id uuid, p_paused_seconds integer default 0)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s workout_sessions;
  v_dur int; v_valid boolean; v_tabata boolean;
  v_eff date; v_has_daily boolean;
  v_base int := 0; v_time int := 0; v_plan int := 0; v_rec int := 0; v_photo int := 0;
  v_total int := 0;
  v_prog jsonb; v_orig int; v_gate jsonb; v_before_stage int; v_level int; v_new_level int;
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

  -- 같은 날 두 번째 유효 운동(XP0)도 진화를 재판정한다. 완료 재송신은 앞에서 반환한다.
  if v_total = 0 and v_valid and (select enabled from public.stage_evolution_settings where singleton) then
    select current_stage,current_level into v_before_stage,v_level from public.user_progress
      where user_id=s.user_id for update;
    v_gate := gnd_evolution.safe_evaluate(s.user_id);
    -- 진화하면 레벨이 새 단계 첫 레벨로 오른다(단계별 경험치 방식). 응답·알림에 새 레벨과 보상을 싣는다.
    v_new_level := coalesce((v_gate->>'newLevel')::int, v_level);
    v_prog := v_prog || jsonb_build_object('previousStage',v_before_stage,'newStage',v_gate->'currentStage',
      'stageUp',v_gate->'stageUp','newLevel',v_new_level,'levelUp',v_new_level > v_level,
      'unlockedRewards',coalesce(v_gate->'unlockedRewards','[]'::jsonb));
    perform gnd_evolution.notify_progress(s.user_id,v_level,v_new_level,v_before_stage,(v_gate->>'currentStage')::int);
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

-- 성장 허브에서 본인이 부르는 재판정 — 진화하면 새 레벨·보상을 정산하고 새 레벨을 알린다.
create or replace function public.refresh_my_stage_evolution()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare s jsonb; level int; previous int; v_new_level int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.user_progress(user_id) values(auth.uid()) on conflict(user_id) do nothing;
  select current_level,current_stage into level,previous from public.user_progress where user_id=auth.uid() for update;
  if not (select enabled from public.stage_evolution_settings where singleton) then
    return gnd_evolution.stage_status(auth.uid(),now());
  end if;
  s:=gnd_evolution.safe_evaluate(auth.uid());
  v_new_level:=coalesce((s->>'newLevel')::int,level);
  perform gnd_evolution.notify_progress(auth.uid(),level,v_new_level,previous,(s->>'currentStage')::int);
  return gnd_evolution.stage_status(auth.uid(),now())||jsonb_build_object('previousStage',previous,'stageUp',s->'stageUp',
    'previousLevel',level,'newLevel',v_new_level,'unlockedRewards',coalesce(s->'unlockedRewards','[]'::jsonb));
end $function$;

-- 크루원 프로필: 단계 경험치(`stageXp`)를 함께 준다 · 레벨업 시점은 원장 임계 되감기 대신 `user_level_history`에서
-- 읽는다(단계별 경험치 방식에서는 레벨을 원장만으로 되짚을 수 없다). 나머지는 그대로.
create or replace function public.get_crew_member_profile(p_target_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_bio       text;
  v_instagram text;
  v_youtube   text;
  v_progress user_progress%rowtype;
  v_badges jsonb;
  v_level_ups jsonb;
  v_joined_at timestamptz;
  v_tz text;
  v_count int;
  v_minutes int;
  v_days int;
  v_meters numeric;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  -- 0081: 크루 **또는** 같은 챌린지 (0039는 크루만이었다)
  if p_target_id <> auth.uid()
     and not public.is_crew_with(p_target_id)
     and not public.shares_any_challenge_with(p_target_id) then
    raise exception 'not_crew';
  end if;

  select * into v_progress from user_progress where user_id = p_target_id;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'badgeKey', b.badge_key,
               'periodKey', b.period_key,
               'earnedAt', b.earned_at)
             order by b.earned_at
           ), '[]'::jsonb)
    into v_badges
  from user_badges b
  where b.user_id = p_target_id;

  -- ── 가입일 · 타임존 ────────────────────────────────────────
  -- 0085: bio·SNS를 **여기 얹는다.** 이 select는 이미 profiles를 읽고 있어서
  -- 왕복이 늘지 않는다. 별도 조회를 새로 놓으면 문지기가 두 곳으로 갈라진다.
  select p.created_at, coalesce(nullif(p.timezone, ''), 'Asia/Seoul'),
         p.bio, p.instagram_url, p.youtube_url
    into v_joined_at, v_tz, v_bio, v_instagram, v_youtube
  from profiles p where p.id = p_target_id;

  -- ── 레벨업 시점 ────────────────────────────────────────────
  -- 0149: `user_level_history`(레벨별 진입 시각)에서 읽는다. level 1은 가입이라 뺀다.
  select coalesce(
           jsonb_agg(jsonb_build_object('level', h.level, 'at', h.entered_at) order by h.level),
           '[]'::jsonb)
    into v_level_ups
  from user_level_history h
  where h.user_id = p_target_id and h.level > 1;

  -- ── 누적 성과 ──────────────────────────────────────────────
  --
  -- ⚠ 완료 판정은 앱의 `getCompletedSessions`와 **같은 세 조건**이다
  --   (status='completed' · deleted_at is null · completed_at is not null).
  --   하나라도 빠뜨리면 같은 사람의 숫자가 화면마다 갈린다.
  select count(*),
         coalesce(sum(s.duration_minutes), 0),
         count(distinct (s.completed_at at time zone v_tz)::date)
    into v_count, v_minutes, v_days
  from workout_sessions s
  where s.user_id = p_target_id
    and s.status = 'completed'
    and s.deleted_at is null
    and s.completed_at is not null;

  -- ⚠ 완료된 세트만 센다. 담아 놓고 안 한 세트의 거리는 뛴 것이 아니다.
  select coalesce(sum(st.distance_meters), 0)
    into v_meters
  from workout_sessions s
  join workout_exercises e on e.session_id = s.id
  join workout_sets st on st.workout_exercise_id = e.id
  where s.user_id = p_target_id
    and s.status = 'completed'
    and s.deleted_at is null
    and s.completed_at is not null
    and st.is_completed;

  return jsonb_build_object(
    'totalXp',      coalesce(v_progress.total_xp, 0),
    'currentLevel', coalesce(v_progress.current_level, 1),
    'currentStage', coalesce(v_progress.current_stage, 1),
    -- 0149: 단계 경험치. null = 아직 옛 방식(앱은 누적 경험치로 계산한다)
    'stageXp',      v_progress.stage_xp,
    'badges',       v_badges,
    -- 0081부터
    'joinedAt',       v_joined_at,
    'levelUps',       v_level_ups,
    'workoutCount',   coalesce(v_count, 0),
    'totalMinutes',   coalesce(v_minutes, 0),
    'workoutDays',    coalesce(v_days, 0),
    'distanceMeters', coalesce(v_meters, 0),
    -- 0085 — 소개·SNS. 문지기(본인/크루/같은 챌린지)는 위에서 이미 통과했다.
    'bio',           v_bio,
    'instagramUrl',  v_instagram,
    'youtubeUrl',    v_youtube
  );
end $function$;

-- ── 4. 기존 사용자 전환 (⚠️ 기존 행 UPDATE — 사용자 승인 후) ─────────────────────────────────────
-- 모든 사용자의 stage_xp를 원장에서 채운다. **레벨은 바꾸지 않는다** — 채우기 전에 "새 방식으로 계산한
-- 레벨 = 지금 저장된 레벨"을 모든 행에서 확인하고, 하나라도 다르면 전체를 중단한다(아무것도 안 바뀐다).

do $backfill$
declare mismatch int;
begin
  select count(*) into mismatch
  from public.user_progress up
  left join public.user_stage_history h on h.user_id = up.user_id and h.stage = up.current_stage
  where gnd_evolution.stage_level(up.current_stage, gnd_evolution.stage_xp_since(up.user_id, h.entered_at)) <> up.current_level;
  if mismatch > 0 then
    raise exception 'stage_xp_backfill_level_mismatch: % users', mismatch;
  end if;
end
$backfill$;

update public.user_progress up
   set stage_xp = gnd_evolution.stage_xp_since(
         up.user_id,
         (select h.entered_at from public.user_stage_history h where h.user_id = up.user_id and h.stage = up.current_stage))
 where up.stage_xp is null;
