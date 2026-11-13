-- 로컬 메모리 DB 전용. 운영 데이터·키·푸시 연결 없음.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create table public.profiles(id uuid primary key references auth.users, nickname text, created_at timestamptz default now());
create table public.user_progress(user_id uuid primary key references auth.users, total_xp int default 0,
  current_level smallint default 1, current_stage smallint default 1, streak_shield_count int default 0,
  last_level_up_at timestamptz,last_stage_up_at timestamptz,updated_at timestamptz default now());
create table public.level_definitions(level smallint primary key, required_total_xp int,
  stage_index smallint, stage_name text, reward_key text, reward_label text);
insert into public.level_definitions
select n, xp, ceil(n/5.0), (array['개노답','꿈틀러','시동러','꾸준러','불꽃러','대장','전설'])[ceil(n/5.0)::int],
  case when n=21 then 'test_reward' end, case when n=21 then '21레벨 혜택' end
from unnest(array[0,200,400,600,800,1000,1400,1800,2200,2600,3000,3600,4200,4800,5400,6000,6800,7600,8400,9200,10000,11000,12000,13000,14000,15000,16200,17400,18600,19800,21000,22250,23500,24750,26000]) with ordinality a(xp,n);
create table public.xp_transactions(id uuid primary key default gen_random_uuid(), user_id uuid,
  amount int,transaction_type text,reason text,reward_group text,source_type text,source_id text,
  effective_date date,rule_version text,metadata jsonb,created_at timestamptz default now(),
  unique(user_id,reason,source_type,source_id));
create unique index daily_xp on public.xp_transactions(user_id,effective_date,reward_group)
  where transaction_type='earn' and reward_group='daily_workout';
create table public.user_level_history(user_id uuid, level smallint,entered_at timestamptz,entry_xp int,
  source_transaction_id uuid, history_source text, unique(user_id,level));
create table public.user_unlocks(user_id uuid,unlock_key text,source_level int,unique(user_id,unlock_key));
create table public.streak_shield_transactions(user_id uuid,amount int,reason text,source_type text,source_id text,
  unique(user_id,reason,source_type,source_id));
create table public.crew_links(user_a uuid,user_b uuid);
create table public.notifications(id uuid default gen_random_uuid(),user_id uuid,actor_id uuid,type text,
  reference_id uuid,title text,body text);
create table public.workout_sessions(id uuid primary key default gen_random_uuid(),user_id uuid,
  started_at timestamptz,completed_at timestamptz,duration_minutes int,tabata_minutes int,
  paused_seconds int default 0,status text default 'active',deleted_at timestamptz);
create table public.workout_exercises(id uuid primary key default gen_random_uuid(),session_id uuid,
  exercise_name text,exercise_type text,sort_order int);
create table public.workout_sets(id uuid default gen_random_uuid(),workout_exercise_id uuid,weight_kg numeric,
  reps int,duration_seconds int,distance_meters numeric,is_completed boolean default true);
create table public.workout_events(session_id uuid,user_id uuid,event_type text);
create table public.workout_images(session_id uuid,user_id uuid,image_path text);
-- 아래는 이번 변경 밖의 포인트/배지 기능. 실제 XP·운동 완료 본문은 현행 스냅샷을 사용한다.
create function public.current_streak_days(uuid) returns int language sql as $$select 1$$;
create function public.point_multiplier(int) returns numeric language sql as $$select 1::numeric$$;
create function public.award_points(uuid,int,text,text,text,numeric,jsonb) returns int language sql as $$select $2$$;
create function public.evaluate_badges(uuid) returns jsonb language sql as $$select '[]'::jsonb$$;
create function public.notify_challenge_peek_unlock(uuid) returns void language sql as $$select$$;
