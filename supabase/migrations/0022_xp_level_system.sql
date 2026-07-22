-- 0022: XP·35레벨·7단계 캐릭터 진화 시스템
-- 설계: docs/superpowers/specs/2026-07-23-xp-level-character-system-design.md
-- 계획: docs/superpowers/plans/2026-07-23-xp-level-character-system.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만)
--
-- 원장 원칙:
--  · xp_transactions가 XP의 공식 원장(source of truth)이다.
--  · user_progress.total_xp는 빠른 조회를 위한 캐시일 뿐이다(원장 SUM으로 재계산 가능).
--  · XP 거래는 원칙적으로 수정·삭제하지 않는다. 정정은 reverse/admin_adjustment 거래를 추가한다.
--  · 이번 XP 규칙 버전은 xp_v1이며 모든 earn 거래의 rule_version에 기록된다.

-- ── level_definitions (전역 읽기, 수정 금지) ──────────────────
create table if not exists public.level_definitions (
  level smallint primary key,
  required_total_xp integer not null check (required_total_xp >= 0),
  stage_index smallint not null check (stage_index between 1 and 7),
  stage_key text not null,
  stage_name text not null,
  character_path text not null,
  reward_key text,
  reward_label text,
  reward_status text not null default 'active'
    check (reward_status in ('active', 'coming_soon', 'data_only')),
  created_at timestamptz not null default now()
);
create unique index if not exists level_definitions_required_xp_unique
  on public.level_definitions (required_total_xp);
alter table public.level_definitions enable row level security;
revoke all on public.level_definitions from anon, authenticated;
grant select on public.level_definitions to authenticated;
drop policy if exists "level_definitions_read" on public.level_definitions;
create policy "level_definitions_read" on public.level_definitions
  for select to authenticated using (true);

-- ── user_progress (본인 select만, 변경은 definer RPC) ─────────
create table if not exists public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  total_xp integer not null default 0 check (total_xp >= 0),
  current_level smallint not null default 1 check (current_level between 1 and 35),
  current_stage smallint not null default 1 check (current_stage between 1 and 7),
  streak_shield_count integer not null default 0 check (streak_shield_count >= 0),
  last_level_up_at timestamptz,
  last_stage_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_progress enable row level security;
revoke all on public.user_progress from anon, authenticated;
grant select on public.user_progress to authenticated;
drop policy if exists "user_progress_own_select" on public.user_progress;
create policy "user_progress_own_select" on public.user_progress
  for select to authenticated using (user_id = auth.uid());

-- ── xp_transactions (본인 select만) ──────────────────────────
create table if not exists public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  transaction_type text not null
    check (transaction_type in ('earn', 'reverse', 'admin_adjustment')),
  reason text not null check (reason in (
    'workout_completed', 'workout_photo', 'weekly_goal',
    'historical_backfill', 'workout_reversal', 'admin_adjustment',
    'level_compensation'
  )),
  reward_group text,
  source_type text not null,
  source_id text not null,
  effective_date date not null,
  rule_version text not null default 'xp_v1',
  metadata jsonb not null default '{}'::jsonb,
  reversed_transaction_id uuid references public.xp_transactions (id),
  created_at timestamptz not null default now()
);
create unique index if not exists xp_transactions_source_unique
  on public.xp_transactions (user_id, reason, source_type, source_id)
  where transaction_type = 'earn';
create unique index if not exists xp_daily_workout_reward_unique
  on public.xp_transactions (user_id, effective_date, reward_group)
  where transaction_type = 'earn' and reward_group = 'daily_workout';
create index if not exists xp_transactions_user_recent
  on public.xp_transactions (user_id, created_at desc);
alter table public.xp_transactions enable row level security;
revoke all on public.xp_transactions from anon, authenticated;
grant select on public.xp_transactions to authenticated;
drop policy if exists "xp_transactions_own_select" on public.xp_transactions;
create policy "xp_transactions_own_select" on public.xp_transactions
  for select to authenticated using (user_id = auth.uid());

-- ── user_unlocks (본인 select만) ─────────────────────────────
create table if not exists public.user_unlocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  unlock_key text not null,
  source_level smallint not null,
  status text not null default 'unlocked'
    check (status in ('unlocked', 'coming_soon')),
  metadata jsonb not null default '{}'::jsonb,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, unlock_key)
);
alter table public.user_unlocks enable row level security;
revoke all on public.user_unlocks from anon, authenticated;
grant select on public.user_unlocks to authenticated;
drop policy if exists "user_unlocks_own_select" on public.user_unlocks;
create policy "user_unlocks_own_select" on public.user_unlocks
  for select to authenticated using (user_id = auth.uid());

-- ── streak_shield_transactions (본인 select만) ───────────────
create table if not exists public.streak_shield_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  reason text not null,
  source_type text not null,
  source_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists streak_shield_source_unique
  on public.streak_shield_transactions (user_id, reason, source_type, source_id);
alter table public.streak_shield_transactions enable row level security;
revoke all on public.streak_shield_transactions from anon, authenticated;
grant select on public.streak_shield_transactions to authenticated;
drop policy if exists "streak_shield_own_select" on public.streak_shield_transactions;
create policy "streak_shield_own_select" on public.streak_shield_transactions
  for select to authenticated using (user_id = auth.uid());

-- ── 35레벨 정의 seed (idempotent) ────────────────────────────
-- reward_status: 이번 스프린트에 실제 동작하는 보상만 'active'. 미구현 보상은
-- 'coming_soon' (UI에서 "준비 중" 표시, 실사용 기능처럼 노출 금지).
insert into public.level_definitions
  (level, required_total_xp, stage_index, stage_key, stage_name, character_path, reward_key, reward_label, reward_status)
values
  (1,0,1,'gaenodap','개노답','/characters/char-1.png','stage_evolve_1','XP 시스템 시작, 개노답 캐릭터','active'),
  (2,200,1,'gaenodap','개노답','/characters/char-1.png','xp_history','XP 획득 내역 화면 해금','active'),
  (3,400,1,'gaenodap','개노답','/characters/char-1.png','weekly_xp_summary','주간 XP 요약 해금','active'),
  (4,600,1,'gaenodap','개노답','/characters/char-1.png','next_stage_preview','다음 진화 미리보기 해금','active'),
  (5,800,1,'gaenodap','개노답','/characters/char-1.png','streak_shield_5','불꽃 보호권 1개','active'),
  (6,1000,2,'nuntteotgae','눈떴개','/characters/char-2.png','stage_evolve_2','눈떴개 캐릭터 진화','active'),
  (7,1400,2,'nuntteotgae','눈떴개','/characters/char-2.png','stats_7d','최근 7일 성장 통계','coming_soon'),
  (8,1800,2,'nuntteotgae','눈떴개','/characters/char-2.png','compare_prev_week','전주 대비 비교','coming_soon'),
  (9,2200,2,'nuntteotgae','눈떴개','/characters/char-2.png','duration_dist','운동시간 분포 통계','coming_soon'),
  (10,2600,2,'nuntteotgae','눈떴개','/characters/char-2.png','streak_shield_10','불꽃 보호권 1개','active'),
  (11,3000,3,'ildanhagae','일단하개','/characters/char-3.png','stage_evolve_3','일단하개 캐릭터 진화','active'),
  (12,3600,3,'ildanhagae','일단하개','/characters/char-3.png','routine_slot_1','운동 루틴 저장 슬롯 1개 추가','coming_soon'),
  (13,4200,3,'ildanhagae','일단하개','/characters/char-3.png','copy_last_workout','지난 운동 복사 바로가기 해금','coming_soon'),
  (14,4800,3,'ildanhagae','일단하개','/characters/char-3.png','challenge_template_1','개인 챌린지 템플릿 1개 저장','coming_soon'),
  (15,5400,3,'ildanhagae','일단하개','/characters/char-3.png','streak_shield_15','불꽃 보호권 1개','active'),
  (16,6000,4,'mulgogagae','물고가개','/characters/char-4.png','stage_evolve_4','물고가개 캐릭터 진화','active'),
  (17,6800,4,'mulgogagae','물고가개','/characters/char-4.png','stats_4w','최근 4주 성장 통계','coming_soon'),
  (18,7600,4,'mulgogagae','물고가개','/characters/char-4.png','exercise_pr_summary','종목별 개인 기록 요약','coming_soon'),
  (19,8400,4,'mulgogagae','물고가개','/characters/char-4.png','weekly_growth_card','주간 성장 카드 공유','coming_soon'),
  (20,9200,4,'mulgogagae','물고가개','/characters/char-4.png','streak_shield_20','불꽃 보호권 1개','active'),
  (21,10000,5,'michyeobogae','미쳐보개','/characters/char-5.png','stage_evolve_5','미쳐보개 캐릭터 진화','active'),
  (22,11000,5,'michyeobogae','미쳐보개','/characters/char-5.png','stats_12w','최근 12주 성장 통계','coming_soon'),
  (23,12000,5,'michyeobogae','미쳐보개','/characters/char-5.png','challenge_concurrent_1','개인 챌린지 동시 진행 수 +1','coming_soon'),
  (24,13000,5,'michyeobogae','미쳐보개','/characters/char-5.png','challenge_advanced','개인 챌린지 고급 조건 해금','coming_soon'),
  (25,14000,5,'michyeobogae','미쳐보개','/characters/char-5.png','streak_shield_25','불꽃 보호권 2개','active'),
  (26,15000,6,'paneuljjagae','판을짜개','/characters/char-6.png','stage_evolve_6','판을짜개 캐릭터 진화','active'),
  (27,16200,6,'paneuljjagae','판을짜개','/characters/char-6.png','routine_slot_2','운동 루틴 저장 슬롯 추가','coming_soon'),
  (28,17400,6,'paneuljjagae','판을짜개','/characters/char-6.png','stats_6m','최근 6개월 성장 통계','coming_soon'),
  (29,18600,6,'paneuljjagae','판을짜개','/characters/char-6.png','monthly_report','월간 성장 리포트 카드','coming_soon'),
  (30,19800,6,'paneuljjagae','판을짜개','/characters/char-6.png','streak_shield_30','불꽃 보호권 2개','active'),
  (31,21000,7,'jeonseorigae','전설이개','/characters/char-7.png','stage_evolve_7','전설이개 캐릭터 진화','active'),
  (32,22250,7,'jeonseorigae','전설이개','/characters/char-7.png','stats_all','전체 기간 성장 통계','coming_soon'),
  (33,23500,7,'jeonseorigae','전설이개','/characters/char-7.png','challenge_concurrent_2','개인 챌린지 동시 진행 수 +1','coming_soon'),
  (34,24750,7,'jeonseorigae','전설이개','/characters/char-7.png','legend_report','전설 성장 리포트','coming_soon'),
  (35,26000,7,'jeonseorigae','전설이개','/characters/char-7.png','eternal_flame','영원한 불꽃 배지, 불꽃 보호권 3개','active')
on conflict (level) do update set
  required_total_xp = excluded.required_total_xp,
  stage_index = excluded.stage_index,
  stage_key = excluded.stage_key,
  stage_name = excluded.stage_name,
  character_path = excluded.character_path,
  reward_key = excluded.reward_key,
  reward_label = excluded.reward_label,
  reward_status = excluded.reward_status;

-- ── 유효 운동 판정 (내부 전용: authenticated도 직접 실행 불가) ──
create or replace function public.is_valid_workout(p_session_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_tabata_minutes int; v_owner uuid; v_completed_sets int;
begin
  select tabata_minutes, user_id into v_tabata_minutes, v_owner
  from workout_sessions where id = p_session_id;
  if not found or v_owner <> auth.uid() then
    raise exception 'not_owner';
  end if;
  if v_tabata_minutes is not null then
    return true; -- 타바타는 완료 자체로 유효(세트 실적 0이라 세트 검사 면제)
  end if;
  select count(*) into v_completed_sets
  from workout_sets ws
  join workout_exercises we on we.id = ws.workout_exercise_id
  where we.session_id = p_session_id and ws.is_completed;
  return v_completed_sets >= 3;
end $$;
revoke all on function public.is_valid_workout(uuid) from public, anon, authenticated;

-- ── 공통 XP·진행 적용 함수 (완료·사진·향후 주간/관리자 공유) ──
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
    -- 3-1) unlock (중복 시 무시)
    insert into user_unlocks (user_id, unlock_key, source_level)
    values (p_user_id, v_reward.reward_key, v_reward.level)
    on conflict (user_id, unlock_key) do nothing;
    get diagnostics v_new_unlock = row_count;

    if v_new_unlock > 0 then
      v_unlocked := v_unlocked || jsonb_build_object('key', v_reward.reward_key, 'label', v_reward.reward_label);

      -- 3-2) 보호권: 신규 unlock일 때만, 거래 성공 시에만 count 증가
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

  return jsonb_build_object('inserted', true, 'amount', p_amount,
    'newTotalXp', v_new_xp, 'previousLevel', v_prev_level, 'newLevel', v_new_level,
    'previousStage', v_prev_stage, 'newStage', v_new_stage,
    'levelUp', v_new_level > v_prev_level, 'stageUp', v_new_stage > v_prev_stage,
    'unlockedRewards', v_unlocked);
end $$;
revoke all on function public.apply_xp_and_progress(uuid, int, text, text, text, text, date, jsonb)
  from public, anon, authenticated;

-- ── 완료 + XP 지급 (원자·멱등) ───────────────────────────────
create or replace function public.complete_workout_v2(p_session_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
  v_dur int; v_valid boolean; v_tabata boolean;
  v_eff date; v_has_daily boolean;
  v_base int := 0; v_time int := 0; v_plan int := 0; v_rec int := 0; v_photo int := 0;
  v_total int := 0;
  v_prog jsonb; v_orig record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into s from workout_sessions
  where id = p_session_id and user_id = auth.uid() for update;
  if not found then raise exception 'session_not_found'; end if;

  -- ── 멱등 처리 ─────────────────────────────────────────────
  if s.status = 'cancelled' then
    raise exception 'invalid_status:cancelled';
  elsif s.status = 'completed' then
    select amount into v_orig from xp_transactions
    where user_id = s.user_id and reason = 'workout_completed'
      and source_type = 'workout' and source_id = p_session_id::text
    limit 1;
    if v_orig is null then
      raise exception 'incomplete_xp_processing';
    end if;
    return (
      select jsonb_build_object(
        'idempotentReplay', true, 'awarded', false,
        'originalXpAwarded', v_orig.amount,
        'currentTotalXp', up.total_xp, 'currentLevel', up.current_level,
        'currentStage', up.current_stage, 'rejectionReason', 'XP_ALREADY_AWARDED')
      from user_progress up where up.user_id = s.user_id
    );
  elsif s.status <> 'active' then
    raise exception 'invalid_status:%', s.status;
  end if;

  -- ── 정상 완료 (status = active) ───────────────────────────
  update workout_sessions
  set status = 'completed', completed_at = now(),
      duration_minutes = floor(extract(epoch from now() - s.started_at) / 60)::int
  where id = p_session_id
  returning * into s;

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
      v_plan := 0; -- 계획-실행 필수판정 스키마 없음 → 0 (0023 계획 완료 보너스에서 교체)
      v_rec := case when exists (
          select 1 from workout_sets ws join workout_exercises we on we.id = ws.workout_exercise_id
          where we.session_id = p_session_id and ws.is_completed
        ) and not exists (
          select 1 from workout_sets ws join workout_exercises we on we.id = ws.workout_exercise_id
          where we.session_id = p_session_id and ws.is_completed and ws.reps is null
        ) then 10 else 0 end;
    end if;
    -- 사진: workout_images 실재로 판정(업로드 성공 시에만 행 생성, image_path not null).
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

  return jsonb_build_object(
    'idempotentReplay', false,
    'awarded', v_total > 0, 'xpAwarded', v_total,
    'breakdown', jsonb_build_object('baseXp', v_base, 'durationXp', v_time,
      'planXp', v_plan, 'recordXp', v_rec, 'photoXp', v_photo),
    'newTotalXp', v_prog->'newTotalXp',
    'previousLevel', v_prog->'previousLevel', 'newLevel', v_prog->'newLevel',
    'previousStage', v_prog->'previousStage', 'newStage', v_prog->'newStage',
    'levelUp', v_prog->'levelUp', 'stageUp', v_prog->'stageUp',
    'unlockedRewards', v_prog->'unlockedRewards'
  );
end $$;
revoke all on function public.complete_workout_v2(uuid) from public, anon;
grant execute on function public.complete_workout_v2(uuid) to authenticated;

-- ── 사진 후등록 XP (공통 함수 사용) ──────────────────────────
create or replace function public.award_workout_photo_xp(p_session_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
  v_eff date;
  v_prog jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into s from workout_sessions
  where id = p_session_id and user_id = auth.uid();
  if not found then raise exception 'session_not_found'; end if;
  if s.status <> 'completed' or s.deleted_at is not null then
    raise exception 'invalid_status';
  end if;

  if not exists (
    select 1 from workout_images wi
    where wi.session_id = p_session_id and wi.user_id = s.user_id and wi.image_path is not null
  ) then
    return jsonb_build_object('awarded', false, 'reason', 'no_photo');
  end if;

  if s.completed_at < now() - interval '30 minutes' then
    return jsonb_build_object('awarded', false, 'reason', 'too_late');
  end if;

  if not exists (
    select 1 from xp_transactions
    where user_id = s.user_id and source_type = 'workout'
      and source_id = p_session_id::text and reason = 'workout_completed'
  ) then
    return jsonb_build_object('awarded', false, 'reason', 'not_daily_workout');
  end if;

  v_eff := (s.completed_at at time zone 'Asia/Seoul')::date;

  v_prog := public.apply_xp_and_progress(
    s.user_id, 10, 'workout_photo', null,
    'workout', p_session_id::text, v_eff, jsonb_build_object('photo_xp', 10));

  if not (v_prog->>'inserted')::boolean then
    return jsonb_build_object('awarded', false, 'reason', 'already_awarded');
  end if;

  return jsonb_build_object('awarded', true, 'xpAwarded', 10,
    'newTotalXp', v_prog->'newTotalXp',
    'previousLevel', v_prog->'previousLevel', 'newLevel', v_prog->'newLevel',
    'previousStage', v_prog->'previousStage', 'newStage', v_prog->'newStage',
    'levelUp', v_prog->'levelUp', 'stageUp', v_prog->'stageUp',
    'unlockedRewards', v_prog->'unlockedRewards');
end $$;
revoke all on function public.award_workout_photo_xp(uuid) from public, anon;
grant execute on function public.award_workout_photo_xp(uuid) to authenticated;
