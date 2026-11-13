-- 운영 적용 2026-11-13(MCP, 사용자 승인). settings.enabled=false: 규칙은 꺼져 있고 기존 XP 진화가 유지된다. 롤백: docs/superpowers/evolution-gate-rollback-0133-0136.sql
-- 내부 함수는 비공개 스키마, 공개 RPC는 auth.uid() 본인만 사용.
-- 꾸준함 횟수(2026-11-13 확정): 연속 4개 달력 주(월~일) 중 3주 이상에서 서로 다른 운동일이 2일 이상이면 1회.
-- 구간은 겹치지 않게 앞에서부터 센다. 구간 마지막 주가 오늘이 속한 주를 넘으면 세지 않는다.
-- p_days는 Asia/Seoul 날짜, p_since는 현재 단계 진입 날짜(이전 날짜는 세지 않음). TS countSteadyWindows와 독립 구현.
create function gnd_evolution.steady_count(p_days date[],p_since date,p_today date)
returns int language plpgsql immutable set search_path='' as $$
declare cnt int:=0; start_w date; last_w date; q int; o int; wk date;
begin
  if p_since is null or p_days is null or cardinality(p_days)=0 then return 0; end if;
  start_w:=date_trunc('week',p_since::timestamp)::date;
  last_w:=date_trunc('week',p_today::timestamp)::date;
  while start_w+21<=last_w loop
    q:=0;
    for o in 0..3 loop
      wk:=start_w+o*7;
      if (select count(distinct d) from unnest(p_days) d where d>=p_since and d<=p_today and d>=wk and d<wk+7)>=2 then q:=q+1; end if;
    end loop;
    if q>=3 then cnt:=cnt+1; start_w:=start_w+28; else start_w:=start_w+7; end if;
  end loop;
  return cnt;
end $$;

create function gnd_evolution.freeze_stage(p_user_id uuid,p_stage int,p_entered_at timestamptz,p_source text)
returns void language plpgsql set search_path='' as $$
declare points jsonb; previous_at timestamptz; m int; n_insert int; v text; min_days int;
begin
  if exists(select 1 from public.user_stage_history where user_id=p_user_id and stage=p_stage) then return; end if;
  select rule_version into strict v from public.stage_evolution_settings where singleton;
  select entered_at into previous_at from public.user_stage_history where user_id=p_user_id and stage=p_stage-1;
  points:=gnd_evolution.metric_points(p_user_id,'-infinity',p_entered_at);
  select coalesce(m_min_days,1) into min_days from public.stage_evolution_rules where rule_version=v and target_stage=least(7,p_stage+1);
  if p_stage=1 then m:=0;
  elsif previous_at is not null then
    select count(*) into m from (select p->>'exerciseKey' from jsonb_array_elements(points) p
      where (p->>'completedAtMs')::numeric>extract(epoch from previous_at)*1000
      group by p->>'exerciseKey' having count(distinct p->>'day')>=min_days) names;
  end if;
  insert into public.user_stage_history(user_id,stage,entered_at,history_source,rule_version,previous_exercise_count)
    values(p_user_id,p_stage,p_entered_at,p_source,v,m) on conflict(user_id,stage) do nothing;
  get diagnostics n_insert=row_count;
  if n_insert=0 then return; end if; -- 이미 고정된 기준은 원본 수정·삭제 후에도 바꾸지 않는다.
  insert into public.stage_growth_baselines(user_id,stage,exercise_key,metric_kind,points)
  select p_user_id,p_stage,p->>'exerciseKey',p->>'kind',jsonb_agg(p order by (p->>'value')::numeric desc,p->>'day')
  from (
    -- 근력 최고 하나 + 유산소의 각 동일 시간/속도 조건 최고 수행 묶음.
    select distinct on(p->>'exerciseKey',p->>'kind') p from jsonb_array_elements(points) p where p->>'kind'<>'c'
      order by p->>'exerciseKey',p->>'kind',(p->>'value')::numeric desc,p->>'day',(p->>'completedAtMs')::numeric
  ) strength group by p->>'exerciseKey',p->>'kind';
  insert into public.stage_growth_baselines(user_id,stage,exercise_key,metric_kind,points)
  select p_user_id,p_stage,p->>'exerciseKey','c',jsonb_agg(p order by (p->>'completedAtMs')::numeric)
  from (
    (select distinct on(p->>'exerciseKey',(p#>>'{best,seconds}')::numeric) p from jsonb_array_elements(points) p where p->>'kind'='c'
      order by p->>'exerciseKey',(p#>>'{best,seconds}')::numeric,(p#>>'{best,distanceMeters}')::numeric desc,(p->>'completedAtMs')::numeric)
    union
    (select distinct on(p->>'exerciseKey',(p#>>'{best,distanceMeters}')::numeric/(p#>>'{best,seconds}')::numeric) p from jsonb_array_elements(points) p where p->>'kind'='c'
      order by p->>'exerciseKey',(p#>>'{best,distanceMeters}')::numeric/(p#>>'{best,seconds}')::numeric,(p#>>'{best,seconds}')::numeric desc,(p->>'completedAtMs')::numeric)
  ) cardio group by p->>'exerciseKey';
  update public.user_stage_history set baseline_ready=true where user_id=p_user_id and stage=p_stage;
end $$;

create function gnd_evolution.stage_status(p_user_id uuid,p_at timestamptz)
returns jsonb language plpgsql stable set search_path='' as $$
declare
  up public.user_progress; h public.user_stage_history; r public.stage_evolution_rules;
  enabled boolean; v text; mode text; result jsonb; conditions jsonb:='[]';
  baseline jsonb; current_points jsonb; score jsonb; n int; n_days int; weeks int; recent int;
  first_day date; day_list date[]; steady int; steady_ok boolean; alt jsonb; base_ok boolean; growth_ok boolean; alt_ok boolean;
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
  select count(distinct (s.completed_at at time zone 'Asia/Seoul')::date),min((s.completed_at at time zone 'Asia/Seoul')::date),
    count(distinct (s.completed_at at time zone 'Asia/Seoul')::date) filter(where today-(s.completed_at at time zone 'Asia/Seoul')::date<r.recent_window_days)
    into n_days,first_day,recent from gnd_evolution.valid_sessions(p_user_id,p_at) s;
  weeks:=case when first_day is null then 0 else (today-first_day)/7 end;
  conditions:=conditions||case when r.habit_kind='days'
    then jsonb_build_array(jsonb_build_object('key','days','current',n_days,'required',r.workout_days,'met',n_days>=r.workout_days))
    else jsonb_build_array(jsonb_build_object('key','weeks','current',weeks,'required',r.elapsed_weeks,'met',weeks>=r.elapsed_weeks)) end;
  if r.recent_window_days is not null then conditions:=conditions||jsonb_build_object('key','recent','current',recent,
    'required',r.recent_days,'met',recent>=r.recent_days,'windowDays',r.recent_window_days); end if;
  if h.baseline_ready is true and h.rule_version=v and h.previous_exercise_count>0 then
    n:=greatest(1,ceil(h.previous_exercise_count*r.growth_ratio)::int);
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
  steady:=gnd_evolution.steady_count(day_list,(h.entered_at at time zone 'Asia/Seoul')::date,today);
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
end $$;

create function gnd_evolution.evaluate_stage_evolution(p_user_id uuid)
returns jsonb language plpgsql set search_path='' as $$
declare s jsonb; previous int; next_stage int; i int;
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
  s:=gnd_evolution.stage_status(p_user_id,now());
  return s||jsonb_build_object('previousStage',previous,'stageUp',(s->>'currentStage')::int>previous);
end $$;

-- XP·운동 완료는 성공시키고 판정의 부분 갱신만 예외 블록에서 되돌린다.
create function gnd_evolution.safe_evaluate(p_user_id uuid)
returns jsonb language plpgsql set search_path='' as $$
declare s jsonb;
begin
  begin
    s:=gnd_evolution.evaluate_stage_evolution(p_user_id);
    delete from public.stage_evolution_errors where user_id=p_user_id;
    return s;
  exception when others then
    insert into public.stage_evolution_errors(user_id,error_code,phase) values(p_user_id,sqlstate,'evaluate')
      on conflict(user_id) do update set error_code=excluded.error_code,phase=excluded.phase,occurred_at=now();
    return jsonb_build_object('currentStage',(select current_stage from public.user_progress where user_id=p_user_id),
      'stageUp',false,'state','error','errorCode',sqlstate);
  end;
end $$;

create function gnd_evolution.notify_progress(p_user_id uuid,p_previous_level int,p_level int,p_previous_stage int,p_stage int)
returns void language plpgsql set search_path='' as $$
declare nick text; stage_name text; title text; body text;
begin
  if p_level<=p_previous_level and p_stage<=p_previous_stage then return; end if;
  select p.nickname into nick from public.profiles p where p.id=p_user_id;
  if p_stage>p_previous_stage then
    select d.stage_name into stage_name from public.level_definitions d where d.stage_index=p_stage order by level limit 1;
    title:='🎉 '||coalesce(nick,'크루원')||'님이 진화했어요!';
    body:='Lv.'||p_level||' — '||coalesce(stage_name,'다음')||' 단계로 진화했어요 ✨';
  else
    title:='⬆️ '||coalesce(nick,'크루원')||'님이 레벨업!';
    body:='Lv.'||p_previous_level||' → Lv.'||p_level||' 달성했어요. 축하해주세요 👏';
  end if;
  insert into public.notifications(user_id,actor_id,type,reference_id,title,body)
    select case when l.user_a=p_user_id then l.user_b else l.user_a end,p_user_id,'level_up',null::uuid,title,body
    from public.crew_links l where p_user_id in(l.user_a,l.user_b);
end $$;

create function public.get_my_stage_evolution_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return gnd_evolution.stage_status(auth.uid(),now());
end $$;
create function public.refresh_my_stage_evolution()
returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; level int; previous int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.user_progress(user_id) values(auth.uid()) on conflict(user_id) do nothing;
  select current_level,current_stage into level,previous from public.user_progress where user_id=auth.uid() for update;
  if not (select enabled from public.stage_evolution_settings where singleton) then
    return gnd_evolution.stage_status(auth.uid(),now());
  end if;
  s:=gnd_evolution.safe_evaluate(auth.uid());
  perform gnd_evolution.notify_progress(auth.uid(),level,level,previous,(s->>'currentStage')::int);
  return gnd_evolution.stage_status(auth.uid(),now())||jsonb_build_object('previousStage',previous,'stageUp',s->'stageUp');
end $$;
revoke all on all functions in schema gnd_evolution from public,anon,authenticated;
revoke all on function public.get_my_stage_evolution_status(),public.refresh_my_stage_evolution() from public,anon,authenticated;
grant execute on function public.get_my_stage_evolution_status(),public.refresh_my_stage_evolution() to authenticated;
