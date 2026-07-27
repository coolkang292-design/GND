-- 0031: 배지 카탈로그 + 포인트 경제 — 스키마와 seed
-- 설계: docs/superpowers/specs/2026-07-27-badge-catalog-and-point-economy-design.md
-- 계획: docs/superpowers/plans/2026-07-27-badge-catalog-and-point-economy.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0022~0030은 수정 금지.
--
-- 이 파일은 **스키마와 데이터만** 만든다. 판정·지급 로직은 0032에 있다.
-- 나눈 이유: 스키마를 먼저 적용해 seed가 제대로 들어갔는지 확인한 뒤
-- 로직을 얹어야, 문제가 생겼을 때 어느 쪽인지 바로 안다.

-- ── 배지 정의 (전역 읽기, 수정은 마이그레이션으로만) ──────────
create table if not exists public.badge_definitions (
  badge_key     text primary key,
  emoji         text not null,
  name          text not null,
  description   text not null,
  tier          text not null check (tier in ('bronze','silver','gold','legend')),
  metric_key    text not null check (metric_key in (
                  'workout_count','total_minutes','streak_days',
                  'weight_volume_kg','cardio_distance_m','record_beaten')),
  threshold     numeric not null check (threshold > 0),
  point_reward  int not null check (point_reward >= 0),
  repeatable    boolean not null default false,
  repeat_step   numeric,
  sort_order    int not null default 0,
  status        text not null default 'active' check (status in ('active','hidden')),
  created_at    timestamptz not null default now(),
  constraint badge_repeat_step_required
    check (not repeatable or repeat_step is not null)
);
alter table public.badge_definitions enable row level security;
revoke all on public.badge_definitions from anon, authenticated;
grant select on public.badge_definitions to authenticated;
drop policy if exists "badge_definitions_read" on public.badge_definitions;
create policy "badge_definitions_read" on public.badge_definitions
  for select to authenticated using (true);

-- ── user_badges 확장 — 반복 획득을 담는다 ────────────────────
-- 기존 행은 period_key='lifetime'으로 자동 편입된다(default). 손실 없음.
-- 반복형은 period_key에 **달성한 날(KST)**을 넣는다. 불꽃은 하루에 최대 1만
-- 늘어나므로 같은 이정표를 같은 날 두 번 밟을 수 없어 유일성이 보장되고,
-- 사슬이 끊긴 뒤 다시 채우면 다른 날짜 = 다른 행이 되어 자연히 스택된다.
alter table public.user_badges
  add column if not exists period_key text not null default 'lifetime';

do $$
declare v_pk text;
begin
  select conname into v_pk
  from pg_constraint
  where conrelid = 'public.user_badges'::regclass and contype = 'p';
  if v_pk is not null then
    execute format('alter table public.user_badges drop constraint %I', v_pk);
  end if;
end $$;

alter table public.user_badges
  add constraint user_badges_pkey primary key (user_id, badge_key, period_key);

-- ── 포인트 원장 (음수 허용 = 사용) ───────────────────────────
create table if not exists public.point_transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  amount           int not null,
  transaction_type text not null
                   check (transaction_type in ('earn','spend','refund','admin_adjustment')),
  reason           text not null check (reason in (
                     'workout_completed','badge_earned','item_purchase',
                     'refund','admin_adjustment')),
  source_type      text not null,
  source_id        text not null,
  multiplier       numeric,
  balance_after    int not null,
  rule_version     text not null default 'point_v1',
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create unique index if not exists point_transactions_source_unique
  on public.point_transactions (user_id, reason, source_type, source_id)
  where transaction_type = 'earn';
create index if not exists point_transactions_user_recent
  on public.point_transactions (user_id, created_at desc);
alter table public.point_transactions enable row level security;
revoke all on public.point_transactions from anon, authenticated;
grant select on public.point_transactions to authenticated;
drop policy if exists "point_transactions_own_select" on public.point_transactions;
create policy "point_transactions_own_select" on public.point_transactions
  for select to authenticated using (user_id = auth.uid());

-- ── 지갑 (캐시 — 원장 SUM으로 언제든 재계산 가능) ────────────
create table if not exists public.user_wallet (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  balance         int not null default 0 check (balance >= 0),
  lifetime_earned int not null default 0 check (lifetime_earned >= 0),
  updated_at      timestamptz not null default now()
);
alter table public.user_wallet enable row level security;
revoke all on public.user_wallet from anon, authenticated;
grant select on public.user_wallet to authenticated;
drop policy if exists "user_wallet_own_select" on public.user_wallet;
create policy "user_wallet_own_select" on public.user_wallet
  for select to authenticated using (user_id = auth.uid());

-- ── 배지 30종 seed (idempotent) ──────────────────────────────
-- threshold 단위: 시간=분, 볼륨=kg, 거리=m, 나머지=회/일
-- 이미지는 public/badges/{badge_key}.png — 키가 파일명이다(테스트로 강제).
insert into public.badge_definitions
  (badge_key, emoji, name, description, tier, metric_key, threshold, point_reward, repeatable, repeat_step, sort_order)
values
  ('workout_1','🐣','첫 발','시작이 반이라지만 사실 반도 안 됐개','bronze','workout_count',1,300,false,null,101),
  ('workout_10','🦴','열 번 찍었개','안 넘어가는 나무 없다더니','bronze','workout_count',10,300,false,null,102),
  ('workout_30','💪','습관이 됐개','이제 안 하면 이상하개','silver','workout_count',30,800,false,null,103),
  ('workout_50','🔥','쉰 번째','개가 좀 달라졌개','silver','workout_count',50,800,false,null,104),
  ('workout_100','💯','세 자릿수 클럽','백 번을 했개','gold','workout_count',100,2000,false,null,105),
  ('workout_200','🏆','전설이개도 고개 숙임','이백 번. 할 말이 없개','legend','workout_count',200,5000,false,null,106),

  ('minutes_300','🎬','영화 세 편','볼 시간에 땀을 흘렸개','bronze','total_minutes',300,300,false,null,201),
  ('minutes_1200','✈️','인천에서 상파울루','지구 반대편까지 날아갈 시간','silver','total_minutes',1200,800,false,null,202),
  ('minutes_3000','😴','이틀 꼬박','개가 이틀 내리 자는 시간만큼','gold','total_minutes',3000,2000,false,null,203),
  ('minutes_6000','📅','나흘을 통째로','백 시간을 갈아 넣었개','legend','total_minutes',6000,5000,false,null,204),

  ('streak_5','🔥','불꽃 5일','5일치 불꽃을 또 모았개','bronze','streak_days',5,500,true,5,301),
  ('streak_best_15','🔥','슬슬 진심이개','보름을 버텼개','silver','streak_days',15,800,false,null,302),
  ('streak_best_30','📆','개근상','한 달 내내 불이 안 꺼졌개','gold','streak_days',30,2000,false,null,303),
  ('streak_best_60','🩺','이쯤 되면 병이개','두 달째. 걱정되기 시작하개','gold','streak_days',60,2000,false,null,304),
  ('streak_best_100','🎉','개도 백일잔치','백일. 상 받아야 하개','legend','streak_days',100,5000,false,null,305),

  ('volume_1t','🐕','대형견 25마리','골든리트리버 스물다섯 마리를 들었개','bronze','weight_volume_kg',1000,300,false,null,401),
  ('volume_5t','🐘','코끼리 한 마리','개가 코끼리를 이겼개','bronze','weight_volume_kg',5000,300,false,null,402),
  ('volume_20t','🚌','시내버스 두 대','버스를 들어올린 개','silver','weight_volume_kg',20000,800,false,null,403),
  ('volume_50t','🦕','티라노사우루스 여섯 마리','멸종한 놈들도 못 든 무게','silver','weight_volume_kg',50000,800,false,null,404),
  ('volume_100t','✈️','보잉 737 한 대','비행기를 들었개','gold','weight_volume_kg',100000,2000,false,null,405),
  ('volume_250t','🗽','자유의 여신상','뉴욕에서 데려와도 들겠개','legend','weight_volume_kg',250000,5000,false,null,406),

  ('cardio_10k','🐾','동네 한 바퀴 백 번','산책이라기엔 좀 많이 걸었개','bronze','cardio_distance_m',10000,300,false,null,501),
  ('cardio_42k','🏃','마라톤 풀코스','개도 헥헥거리는 거리','silver','cardio_distance_m',42195,800,false,null,502),
  ('cardio_100k','🚌','서울에서 평택까지','걸어서 갔개','silver','cardio_distance_m',100000,800,false,null,503),
  ('cardio_250k','🚄','서울에서 대구까지','KTX 타면 1시간 40분인 거리','gold','cardio_distance_m',250000,2000,false,null,504),
  ('cardio_500k','🌊','서울에서 부산 찍고 대전까지','개가 반도를 종단했개','legend','cardio_distance_m',500000,5000,false,null,505),

  ('record_beaten_1','🏅','어제의 나를 이겼개','처음으로 지난 기록을 넘었개','bronze','record_beaten',1,300,false,null,601),
  ('record_beaten_5','💪','다섯 번 넘었개','우연이 아니었개','bronze','record_beaten',5,300,false,null,602),
  ('record_beaten_10','🔥','기록이 무섭개','열 번을 갱신했개','silver','record_beaten',10,800,false,null,603),
  ('record_beaten_25','👑','갱신이 취미개','스물다섯 번. 기록이 도망가개','gold','record_beaten',25,2000,false,null,604)
on conflict (badge_key) do update set
  emoji = excluded.emoji, name = excluded.name, description = excluded.description,
  tier = excluded.tier, metric_key = excluded.metric_key, threshold = excluded.threshold,
  point_reward = excluded.point_reward, repeatable = excluded.repeatable,
  repeat_step = excluded.repeat_step, sort_order = excluded.sort_order;

-- ── 확인 ────────────────────────────────────────────────────
select tier, count(*) as 개수 from public.badge_definitions group by tier order by tier;
select count(*) as 총배지수 from public.badge_definitions;
select user_id, badge_key, period_key from public.user_badges order by earned_at;
