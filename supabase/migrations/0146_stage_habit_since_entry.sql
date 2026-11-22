-- 0146: 진화 판정의 "운동 습관" 조건을 이 단계에 들어온 시점부터 센다.
--
-- 문제: stage_status가 운동일 합계(days)·경과 주(weeks)·최근 N일(recent)을 첫 운동일부터
--       전체 기록으로 셌다. 성과 조건(운동별 증가율)·꾸준함은 이미 "단계 진입 시각
--       (user_stage_history.entered_at)" 이후만 세는데 습관 조건만 달랐다.
--       그래서 진화 직후에도 recent(최근 28일 8일 이상)가 이미 충족돼 있었다
--       (2026-11-22 오뎅끼데스까: recent 22/8 ✓, 진화한 지 하루).
--
-- 바꾸는 것 (이 파일은 **함수 본문만** 바꾼다 — 규칙 숫자는 0147에서 따로, 승인 후):
--   1) days / weeks / recent 를 단계 진입 시각 이후로만 센다. weeks는 진입일부터 경과 주.
--   2) 요구 운동 수 N 에 하한을 둔다: N = least(이전 단계 운동 수, greatest(3, ceil(이전 수 × ratio))).
--      이전 단계 운동 종류가 적으면 N 이 1이 되어 "운동 1개 +3%"로 통과되던 구멍을 막는다.
--
-- 건드리지 않는 것: 이미 진화한 단계(user_progress.current_stage), 기준 기록(stage_growth_baselines),
--   규칙 버전(rule_version — 올리면 기존 사용자의 기준 기록이 무효가 되므로 올리지 않는다).
--
-- ⚠️ 규칙 숫자(workout_days·alt_days·elapsed_weeks)는 "누적" 기준으로 설계돼 있다.
--    함수만 먼저 바꾸면 그 숫자가 "단계당"으로 읽혀 진화가 크게 어려워진다.
--    그래서 0147(규칙 숫자 갱신)과 **같이** 적용한다. 단독 적용 금지.

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
  conditions:=jsonb_build_array(jsonb_build_object('key','xp','current',up.current_level,'required',r.min_level,'met',up.current_level>=r.min_level));
  if not enabled or r.mode='xp_only' then
    return result||jsonb_build_object('conditions',conditions,'state',case when up.current_level>=r.min_level then 'eligible' else 'blocked' end);
  end if;
  -- 습관 조건: 현재 단계 진입 시각 이후만 센다. 진입 기록이 없으면(h.entered_at null) 0으로 센다.
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
    -- 요구 운동 수 하한 3 (이전 단계 운동 수가 3보다 적으면 그 수까지).
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
  -- 꾸준함: 현재 단계 진입 날짜(KST) 이후만 센다. 진입 기록이 없으면 0회.
  select coalesce(array_agg(distinct (s.completed_at at time zone 'Asia/Seoul')::date),'{}'::date[]) into day_list
    from gnd_evolution.valid_sessions(p_user_id,p_at) s;
  steady:=gnd_evolution.steady_count(day_list,since,today);
  steady_ok:=steady>=r.steady_required;
  if r.steady_required>0 then conditions:=conditions||jsonb_build_array(
    jsonb_build_object('key','steady','current',steady,'required',r.steady_required,'met',steady_ok)); end if;
  -- 대체 경로(성장 대신). 운동일 경로는 면제 규칙이 있으면 꾸준함을 요구하지 않는다.
  if r.alt_days is not null then
    alt:=jsonb_build_object('kind','days','current',n_days,'required',r.alt_days,'exemptsSteady',r.alt_exempts_steady,
      'met',n_days>=r.alt_days and (r.alt_exempts_steady or steady_ok));
  elsif r.alt_steady_required is not null then
    alt:=jsonb_build_object('kind','steady','current',steady,'required',r.alt_steady_required,'exemptsSteady',false,
      'met',steady>=r.alt_steady_required);
  end if;
  base_ok:=not exists(select 1 from jsonb_array_elements(conditions) c
    where c->>'key' in ('xp','days','weeks','recent') and (c->>'met')::boolean is not true);
  growth_ok:=coalesce((score->>'countMet')::boolean,false) and coalesce((score->>'averagePct')::numeric>=r.average_pct,false) and steady_ok;
  alt_ok:=coalesce((alt->>'met')::boolean,false);
  if base_ok and (growth_ok or alt_ok) then state:='eligible';
  elsif n is null then state:='needs_baseline';
  else state:='blocked'; end if;
  select error_code into err from public.stage_evolution_errors where user_id=p_user_id;
  return result||jsonb_build_object('conditions',conditions,'state',case when err is not null then 'error' else state end,'errorCode',err,
    'path',case when growth_ok or not alt_ok then 'growth' else 'alternate' end,'alternate',alt);
end $function$;
