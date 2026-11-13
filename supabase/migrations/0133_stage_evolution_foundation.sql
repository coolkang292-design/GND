-- 운영 적용 2026-11-13(MCP, 사용자 승인). settings.enabled=false: 규칙은 꺼져 있고 기존 XP 진화가 유지된다. 롤백: docs/superpowers/evolution-gate-rollback-0133-0136.sql
-- 새 규칙 기본 OFF, 기존 XP/캐릭터를 변경하지 않는다.
create schema gnd_evolution;
revoke all on schema gnd_evolution from public, anon, authenticated;

create table public.stage_evolution_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  rule_version text not null default 'stage_growth_v1'
);
insert into public.stage_evolution_settings(singleton) values(true);
create table public.stage_evolution_rules (
  rule_version text not null,
  target_stage smallint not null check(target_stage between 2 and 7),
  min_level smallint not null,
  mode text not null check(mode in ('xp_only','gated')),
  workout_days int not null check(workout_days>=0),
  elapsed_weeks int not null check(elapsed_weeks>=0),
  average_pct numeric, growth_ratio numeric,
  m_min_days int not null default 1 check(m_min_days>=1),
  recent_window_days int, recent_days int,
  -- 2026-11-13 사용자 확정: 4·5단계는 누적 운동일, 6·7단계는 경과 주만 습관 조건으로 쓴다.
  habit_kind text not null default 'days' check(habit_kind in ('days','weeks')),
  -- 성장 경로에서 요구하는 꾸준함(미션) 횟수
  steady_required int not null default 0 check(steady_required>=0),
  -- 성장 대신 쓰는 대체 경로: 운동일(alt_days) 또는 꾸준함 횟수(alt_steady_required). 둘 중 하나만.
  alt_days int check(alt_days>0),
  alt_steady_required int check(alt_steady_required>0),
  -- 운동일 대체 경로를 쓰면 꾸준함 미션을 면제한다(불꽃러)
  alt_exempts_steady boolean not null default false,
  primary key(rule_version,target_stage),
  check(mode='xp_only' or (habit_kind='days' and workout_days>0 and elapsed_weeks=0)
    or (habit_kind='weeks' and elapsed_weeks>0 and workout_days=0)),
  check(not(alt_days is not null and alt_steady_required is not null)),
  check(not alt_exempts_steady or alt_days is not null),
  check((mode='xp_only' and average_pct is null and growth_ratio is null)
    or (mode='gated' and average_pct>0 and growth_ratio>0 and growth_ratio<=1)),
  check((recent_window_days is null and recent_days is null) or
    (recent_window_days>0 and recent_days>0 and recent_days<=recent_window_days))
);
-- 사용자 확정 수치(2026-11-13). 운영 활성화는 별도 승인이며 settings.enabled=false 동안 기존 XP 진화가 유지된다.
-- 출처: docs/superpowers/plans/2026-11-13-evolution-rules-evidence-adjustment.md §2
insert into public.stage_evolution_rules
  (rule_version,target_stage,min_level,mode,workout_days,elapsed_weeks,average_pct,growth_ratio,m_min_days,
   recent_window_days,recent_days,habit_kind,steady_required,alt_days,alt_steady_required,alt_exempts_steady) values
('stage_growth_v1',2,6,'xp_only',0,0,null,null,1,null,null,'days',0,null,null,false),
('stage_growth_v1',3,11,'xp_only',0,0,null,null,1,null,null,'days',0,null,null,false),
('stage_growth_v1',4,16,'gated',36,0,.03,.15,1,null,null,'days',0,54,null,false),
('stage_growth_v1',5,21,'gated',60,0,.05,.20,1,null,null,'days',1,90,null,true),
('stage_growth_v1',6,26,'gated',0,40,.08,.25,1,28,8,'weeks',2,null,4,false),
('stage_growth_v1',7,31,'gated',0,60,.10,.30,1,42,12,'weeks',3,null,6,false);
create table public.user_stage_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  stage smallint not null check(stage between 1 and 7),
  entered_at timestamptz not null,
  history_source text not null check(history_source in ('actual','grandfathered','legacy_xp')),
  rule_version text not null,
  previous_exercise_count int check(previous_exercise_count>=0),
  baseline_ready boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(user_id,stage)
);
create table public.stage_growth_baselines (
  user_id uuid not null,stage smallint not null,
  exercise_key text not null check(length(exercise_key)>0),
  metric_kind text not null check(metric_kind in ('w','r','t','c')),
  points jsonb not null check(jsonb_typeof(points)='array'),
  primary key(user_id,stage,exercise_key,metric_kind),
  foreign key(user_id,stage) references public.user_stage_history(user_id,stage) on delete cascade
);
create table public.stage_evolution_errors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  error_code text not null,phase text not null,occurred_at timestamptz not null default now()
);
alter table public.stage_evolution_settings enable row level security;
alter table public.stage_evolution_rules enable row level security;
alter table public.user_stage_history enable row level security;
alter table public.stage_growth_baselines enable row level security;
alter table public.stage_evolution_errors enable row level security;
revoke all on public.stage_evolution_settings,public.stage_evolution_rules,public.user_stage_history,
  public.stage_growth_baselines,public.stage_evolution_errors from public,anon,authenticated;
grant select on public.stage_evolution_settings,public.stage_evolution_rules,public.user_stage_history,
  public.stage_growth_baselines to authenticated;
create policy stage_evolution_settings_read on public.stage_evolution_settings for select to authenticated using(true);
create policy stage_evolution_rules_read on public.stage_evolution_rules for select to authenticated using(true);
create policy user_stage_history_own on public.user_stage_history for select to authenticated using(user_id=(select auth.uid()));
create policy stage_growth_baselines_own on public.stage_growth_baselines for select to authenticated using(user_id=(select auth.uid()));

-- complete_workout_v2의 현행 유효성(3완료세트 또는 거리/시간 1완료세트 또는 인터벌) + 시간 유효성.
-- auth.uid()에 의존하는 기존 is_valid_workout을 관리자 초기화에서 임의 ID로 호출하지 않는다.
create function gnd_evolution.valid_sessions(p_user_id uuid,p_at timestamptz)
returns setof public.workout_sessions language sql stable set search_path='' as $$
  select s.* from public.workout_sessions s
  where s.user_id=p_user_id and s.status='completed' and s.deleted_at is null
    and s.started_at is not null and s.completed_at<=p_at
    and s.duration_minutes>=0 and s.duration_minutes<360
    and (s.tabata_minutes is not null or
      (select count(*) from public.workout_exercises e join public.workout_sets w on w.workout_exercise_id=e.id
        where e.session_id=s.id and w.is_completed)>=3 or exists
      (select 1 from public.workout_exercises e join public.workout_sets w on w.workout_exercise_id=e.id
        where e.session_id=s.id and w.is_completed and (w.distance_meters>0 or w.duration_seconds>0)))
$$;

create function gnd_evolution.metric_points(p_user_id uuid,p_from timestamptz,p_to timestamptz)
returns jsonb language sql stable set search_path='' as $$
  with raw as (
    select s.id session_id,s.completed_at,e.id exercise_id,btrim(e.exercise_name) name,e.exercise_type,
      w.weight_kg,w.reps,w.duration_seconds,w.distance_meters
    from gnd_evolution.valid_sessions(p_user_id,p_to) s
    join public.workout_exercises e on e.session_id=s.id
    join public.workout_sets w on w.workout_exercise_id=e.id
    where s.completed_at>p_from and w.is_completed is distinct from false and btrim(e.exercise_name)<>''
      and not(s.tabata_minutes is not null and coalesce(e.sort_order,-1) between 0 and 3)
  ), kinds as (
    select *,case when weight_kg>0 and reps between 1 and 30 then 'w'
      when coalesce(weight_kg,0)<=0 and exercise_type is distinct from 'weight' and reps>0 then 'r'
      when coalesce(weight_kg,0)<=0 and exercise_type is distinct from 'weight' and coalesce(reps,0)<=0 and duration_seconds>0 then 't' end kind
    from raw where exercise_type is distinct from 'cardio'
  ), valued as (
    select *,case kind when 'w' then round(weight_kg*(1+reps/30.0),10) when 'r' then reps else duration_seconds end value
    from kinds where kind is not null
  ), resistance as (
    select distinct on(exercise_id) name,kind,value,completed_at,
      jsonb_build_object('weight',case when kind='w' then weight_kg end,'reps',case when kind in ('w','r') then reps end,
        'seconds',case when kind='t' then duration_seconds end) best
    from valued order by exercise_id,case kind when 'w' then 1 when 'r' then 2 else 3 end,value desc
  ), cardio as (
    select name,'c'::text kind,sum(distance_meters) value,completed_at,
      jsonb_build_object('weight',null,'reps',null,'seconds',sum(duration_seconds),'distanceMeters',sum(distance_meters)) best
    from raw where exercise_type='cardio' group by session_id,name,completed_at
    having bool_and(coalesce(distance_meters>0 and duration_seconds>0,false))
  ), points as (select * from resistance union all select * from cardio)
  select coalesce(jsonb_agg(jsonb_build_object('exerciseKey',name,'kind',kind,'value',value,
    'day',to_char(completed_at at time zone 'Asia/Seoul','YYYY-MM-DD'),
    'completedAtMs',extract(epoch from completed_at)*1000,'best',best) order by completed_at,name,kind),'[]'::jsonb) from points
$$;

-- SQL 독립 계산. TS 계산과 로컬 시험에서 대조한다.
create function gnd_evolution.score_points(p_baseline jsonb,p_current jsonb,p_n int)
returns jsonb language plpgsql immutable set search_path='' as $$
declare
  c jsonb; b jsonb; pair record; pct numeric; comparable boolean;
  growths jsonb:='[]'; unmatched jsonb:='[]'; selected jsonb; summary jsonb;
  n_comp int:=0; n_growth int; n_filled int; mean numeric;
begin
  if p_n is null or p_n<1 then raise exception 'invalid_required_count'; end if;
  select null::jsonb bp,null::jsonb cp,null::text mode,null::numeric growth into pair;
  for c in select distinct on(p->>'exerciseKey',p->>'kind') p from jsonb_array_elements(p_current) p
    order by p->>'exerciseKey',p->>'kind',(p->>'value')::numeric desc,p->>'day',(p->>'completedAtMs')::numeric
  loop
    b:=null; pct:=null; comparable:=false;
    if c->>'kind'='c' then
      if not exists(select 1 from jsonb_array_elements(p_baseline) p where p->>'kind'='c' and p->>'exerciseKey'=c->>'exerciseKey') then
        unmatched:=unmatched||jsonb_build_object('exerciseKey',c->>'exerciseKey','kind','c','reason','no_baseline'); continue;
      end if;
      -- 같은 조건의 최고 과거 수행을 고른 뒤, 모든 현재 조건 중 최대 증가율 한 개를 고른다.
      select * into pair from (
        with bs as (select p from jsonb_array_elements(p_baseline) p where p->>'kind'='c' and p->>'exerciseKey'=c->>'exerciseKey'),
        cs as (select p from jsonb_array_elements(p_current) p where p->>'kind'='c' and p->>'exerciseKey'=c->>'exerciseKey'),
        duration_best as (select distinct on((p#>>'{best,seconds}')::numeric) p from bs
          order by (p#>>'{best,seconds}')::numeric,(p#>>'{best,distanceMeters}')::numeric desc,(p->>'completedAtMs')::numeric),
        speed_best as (select distinct on((p#>>'{best,distanceMeters}')::numeric/(p#>>'{best,seconds}')::numeric) p from bs
          order by (p#>>'{best,distanceMeters}')::numeric/(p#>>'{best,seconds}')::numeric,(p#>>'{best,seconds}')::numeric desc,(p->>'completedAtMs')::numeric),
        comparisons as (
          select b.p bp,a.p cp,'distance_at_same_time' mode,(a.p#>>'{best,distanceMeters}')::numeric/(b.p#>>'{best,distanceMeters}')::numeric*100-100 growth
          from cs a join duration_best b on (a.p#>>'{best,seconds}')::numeric=(b.p#>>'{best,seconds}')::numeric
          union all
          select b.p,a.p,'time_at_same_speed',(a.p#>>'{best,seconds}')::numeric/(b.p#>>'{best,seconds}')::numeric*100-100
          from cs a join speed_best b on
            (a.p#>>'{best,distanceMeters}')::numeric*(b.p#>>'{best,seconds}')::numeric=
            (b.p#>>'{best,distanceMeters}')::numeric*(a.p#>>'{best,seconds}')::numeric)
        select * from comparisons order by growth desc,(cp->>'completedAtMs')::numeric,mode limit 1
      ) candidates;
      if not found then
        unmatched:=unmatched||jsonb_build_object('exerciseKey',c->>'exerciseKey','kind','c','reason','cardio_condition'); continue;
      end if;
      b:=pair.bp; c:=pair.cp; pct:=pair.growth; comparable:=true;
    else
      select p into b from jsonb_array_elements(p_baseline) p
        where p->>'exerciseKey'=c->>'exerciseKey' and p->>'kind'=c->>'kind'
        order by (p->>'value')::numeric desc,p->>'day',(p->>'completedAtMs')::numeric limit 1;
      if b is null then
        unmatched:=unmatched||jsonb_build_object('exerciseKey',c->>'exerciseKey','kind',c->>'kind','reason','no_baseline'); continue;
      end if;
      pct:=((c->>'value')::numeric-(b->>'value')::numeric)/(b->>'value')::numeric*100;
      comparable:=true;
    end if;
    if pct>100.000001 then
      unmatched:=unmatched||jsonb_build_object('exerciseKey',c->>'exerciseKey','kind',c->>'kind','reason','jump'); continue;
    end if;
    if comparable then n_comp:=n_comp+1; end if;
    if pct>0 then
      growths:=growths||jsonb_build_object('exerciseKey',c->>'exerciseKey','kind',c->>'kind','growthPct',pct,
        'baseline',case when c->>'kind'='c' and pair.mode='time_at_same_speed' then (b#>>'{best,seconds}')::numeric else (b->>'value')::numeric end,
        'current',case when c->>'kind'='c' and pair.mode='time_at_same_speed' then (c#>>'{best,seconds}')::numeric else (c->>'value')::numeric end,
        'baselineDay',b->>'day','currentDay',c->>'day','baselineBest',b->'best','currentBest',c->'best')
        ||'[]'::jsonb;
      if c->>'kind'='c' then
        growths:=jsonb_set(growths,array[(jsonb_array_length(growths)-1)::text,'cardioComparison'],to_jsonb(pair.mode));
      end if;
    end if;
  end loop;
  select coalesce(jsonb_agg(p order by (p->>'growthPct')::numeric desc,p->>'exerciseKey',p->>'kind'),'[]'::jsonb) into growths from jsonb_array_elements(growths) p;
  select coalesce(jsonb_agg(p order by (p->>'growthPct')::numeric desc,p->>'exerciseKey'),'[]'::jsonb) into selected from
    (select p from (select distinct on(p->>'exerciseKey') p from jsonb_array_elements(growths) p
      order by p->>'exerciseKey',(p->>'growthPct')::numeric desc,p->>'kind') unique_names
      order by (p->>'growthPct')::numeric desc,p->>'exerciseKey' limit p_n) top_n;
  n_growth:=jsonb_array_length(growths); n_filled:=jsonb_array_length(selected);
  select coalesce(sum((p->>'growthPct')::numeric),0)/p_n into mean from jsonb_array_elements(selected) p;
  summary:=jsonb_build_object('growths',growths,'unmatched',unmatched,'comparableCount',n_comp,
    'unchangedCount',n_comp-n_growth,'previousStageExerciseCount',null);
  return jsonb_build_object('summary',summary,'selected',selected,'requiredCount',p_n,'filledCount',n_filled,
    'countMet',n_filled=p_n,'averagePct',mean);
end $$;
revoke all on all functions in schema gnd_evolution from public,anon,authenticated;
