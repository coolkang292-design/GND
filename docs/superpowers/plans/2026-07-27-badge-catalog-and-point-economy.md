# 배지 카탈로그 30종 + 포인트 경제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 배지를 3개 → 30종으로 늘리고, 운동과 배지에 포인트를 붙여 아이템 상점의 수입원을 만든다.

**Architecture:** 배지 조건을 `badge_definitions` **테이블 데이터**로 빼고, `evaluate_badges(user)` 하나가 6지표를 집계해 판정·지급한다. 포인트는 `xp_transactions`와 같은 원장 구조(`point_transactions` + `user_wallet` 캐시)를 쓰되 음수를 허용한다. 운동 완료 RPC 끝에 한 줄씩 붙이는 방식이라 기존 XP 경로를 건드리지 않는다.

**Tech Stack:** Next.js 16(App Router)·React 19·TypeScript·Tailwind v4·Supabase(Postgres RPC·RLS)·vitest. DB는 SQL Editor에 **수동 Run**.

**설계 문서:** `docs/superpowers/specs/2026-07-27-badge-catalog-and-point-economy-design.md`
**이미지:** `public/badges/` 30장 **제작 완료** (`/badges/{badge_key}.png`)

---

## 0. 콜드 에이전트 필독

- 프로덕션 **https://gnd-one.vercel.app**. 저장소 `workout-app`, 브랜치 `main`.
- **게이트(모든 커밋 전):** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- **마이그레이션:** 0030까지 운영 적용됨 → **수정 금지**. 이 계획은 **0031·0032**를 쓴다. 에이전트는 DDL을 실행할 수 없으므로 파일을 만든 뒤 **사용자에게 SQL Editor Run을 요청하고 기다린다.**
- **커밋 시점:** 자동 검증 통과 → 사용자 실기기 확인 → 그다음 커밋·배포.
- 테스트 관례: 순수 도메인 `src/lib/domain/*.test.ts`, 컴포넌트는 `renderToStaticMarkup` SSR. 훅·이벤트 테스트가 필요하면 파일 상단에 `// @vitest-environment jsdom`.
- 현재 단위 테스트 **438개** 통과가 기준선이다.

**실측 참고 위치**

| 대상 | 위치 |
|---|---|
| XP 지급 RPC | `supabase/migrations/0027_record_bonus_cardio.sql` — `complete_workout_v2` 최신본 |
| 레벨 적용 공통 | `supabase/migrations/0029_level_up_notification.sql` — `apply_xp_and_progress` 최신본 |
| 기록 갱신 RPC | `supabase/migrations/0021_record_note_wording.sql` — `mark_record_beaten` 최신본 (**배지 하드코딩이 여기 있다**) |
| 배지 도메인 | `src/lib/domain/badges.ts` — `BADGE_CATALOG`(3개)·`badgeShelf`·`earnedBadgeCount` |
| 배지 조회 | `src/lib/badges.ts` — `getMyBadges()` |
| 배지 UI(제거 대상) | `src/components/record/badge-shelf.tsx`, 사용처 `src/components/record/calendar-view.tsx:432` |
| 크루 배지 표시 | `src/components/crew/member-profile-sheet.tsx` — `badgeShelf` 사용 |
| 성장 허브 | `src/components/profile/growth-hub.tsx` |
| 완료 모달 이벤트 | `src/lib/domain/xp-events.ts` — `XpEvent`·`buildXpEvents` |
| 완료 모달 | `src/components/record/xp-result-modal.tsx` |
| 불꽃 규칙(TS) | `src/lib/domain/streak.ts` — `currentStreak`, `STREAK_EXPIRY_DAYS = 5` |
| 실 DB 스크립트 관례 | `scripts/poke-levelup-check.mjs` |

---

## 1. 파일 구조

| 구분 | 파일 | 책임 |
|---|---|---|
| Create | `supabase/migrations/0031_badge_point_schema.sql` | 4테이블 + 30종 seed + RLS |
| Create | `supabase/migrations/0032_badge_point_engine.sql` | 불꽃 SQL·배수·포인트 지급·배지 판정 + 기존 RPC 2개 재정의 |
| Create | `scripts/badge-point-check.mjs` | 실 DB 검증 |
| Create | `scripts/streak-parity-check.mjs` | 불꽃 SQL ↔ TS 대조 |
| Modify | `src/lib/domain/badges.ts` | 카탈로그를 상수 → **인자**로. 반복 배지 개수 계산 추가 |
| Create | `src/lib/points.ts` | 지갑·포인트 내역 조회 |
| Modify | `src/lib/badges.ts` | 카탈로그 조회 + `period_key` 포함 보유 조회 |
| Create | `src/components/profile/point-summary.tsx` | 포인트·배수·불꽃 3칸 |
| Create | `src/components/profile/badge-showcase.tsx` | 보유 배지 6개 + 전체 보기 |
| Create | `src/components/profile/badge-sheet.tsx` | 배지 전체 시트(지표별 그룹·진행바) |
| Modify | `src/components/profile/growth-hub.tsx` | 위 셋 배선 |
| Modify | `src/components/crew/member-profile-sheet.tsx` | 새 `badgeShelf` 시그니처 대응 |
| Modify | `src/components/record/calendar-view.tsx` | `BadgeShelf` 제거 |
| Delete | `src/components/record/badge-shelf.tsx` | 프로필로 일원화 |
| Modify | `src/lib/domain/xp-events.ts` | `point`·`badge` 이벤트 추가 |
| Modify | `src/components/record/xp-result-modal.tsx` | 두 이벤트 렌더 |
| Modify | `src/lib/workout.ts` | `WorkoutXpResult`에 포인트·신규배지 필드 |

**세 페이즈는 순서대로 실행한다.** A(엔진)가 끝나야 B(조회)가 의미 있고, B가 끝나야 C(화면)가 붙는다.

---

# PHASE A — DB 엔진

## Task 1: 0031 — 스키마 + 배지 30종 seed

**Files:** Create `supabase/migrations/0031_badge_point_schema.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 0031: 배지 카탈로그 + 포인트 경제 — 스키마와 seed
-- 설계: docs/superpowers/specs/2026-07-27-badge-catalog-and-point-economy-design.md
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
select tier, count(*) from public.badge_definitions group by tier order by tier;
select count(*) as 총배지수 from public.badge_definitions;
select user_id, badge_key, period_key from public.user_badges order by earned_at;
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/migrations/0031_badge_point_schema.sql
git commit -m "feat: 0031 배지 정의·포인트 원장 스키마 + 30종 seed"
```

- [ ] **Step 3: 사용자에게 Run 요청 후 대기**

> `supabase/migrations/0031_badge_point_schema.sql` 전체를 SQL Editor에 붙여넣고 Run 해주세요.
> 마지막에 나오는 표 세 개를 확인하고 싶습니다:
> ① 티어별 개수 = bronze 8 · silver 9 · gold 7 · legend 6
> ② 총 배지수 = 30
> ③ 기존 배지 2건이 `period_key = lifetime`으로 살아있는지

> **티어 개수 주의:** legend는 6이 맞다 — 설계 §5.1의 5개에 `streak_5`(bronze)를 뺀
> 수가 아니라, seed 실제 값 기준이다. bronze 8 = workout_1·10, minutes_300,
> streak_5, volume_1t·5t, record_beaten_1·5. silver 9, gold 7, legend 5.
> **합계 29 + streak_5 중복 계산 금지 → bronze 8에 streak_5가 포함되어 총 30이다.**

---

## Task 2: 0032 — 판정·지급 엔진

**Files:** Create `supabase/migrations/0032_badge_point_engine.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 0032: 배지 판정 + 포인트 지급 엔진
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 선행: 0031.
--
-- 구성:
--   current_streak_days  — 불꽃 일수 (domain/streak.ts와 같은 규칙)
--   point_multiplier     — 불꽃 → 배수
--   award_points         — 포인트 원장 기록 + 지갑 갱신 (멱등)
--   evaluate_badges      — 6지표 집계 → 배지 지급 → 포인트 지급 (멱등)
--   complete_workout_v2  — 끝에 포인트·배지 훅 추가 (0027 기반 재정의)
--   mark_record_beaten   — 하드코딩 배지 블록 제거 → evaluate_badges로 대체

-- ── 불꽃 일수 — TS currentStreak과 같은 규칙 ─────────────────
-- 규칙: 운동일 사이 간격이 5일 미만이면 사슬이 이어진다.
--       마지막 운동일로부터 오늘까지 5일 이상 지났으면 0.
-- 이 규칙이 domain/streak.ts와 어긋나면 홈 🔥와 배지가 다른 숫자를 말한다.
-- scripts/streak-parity-check.mjs가 양쪽을 대조한다.
create or replace function public.current_streak_days(p_user_id uuid)
returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_last date;
  v_count int := 0;
  v_prev date := null;
  r record;
begin
  select max((completed_at at time zone 'Asia/Seoul')::date) into v_last
  from workout_sessions
  where user_id = p_user_id and status = 'completed'
    and deleted_at is null and completed_at is not null;

  if v_last is null or (v_today - v_last) >= 5 then
    return 0;
  end if;

  for r in
    select distinct (completed_at at time zone 'Asia/Seoul')::date as d
    from workout_sessions
    where user_id = p_user_id and status = 'completed'
      and deleted_at is null and completed_at is not null
    order by d desc
  loop
    if v_prev is not null and (v_prev - r.d) >= 5 then
      exit;
    end if;
    v_count := v_count + 1;
    v_prev := r.d;
  end loop;

  return v_count;
end $$;
revoke all on function public.current_streak_days(uuid) from public, anon;
grant execute on function public.current_streak_days(uuid) to authenticated;

-- ── 불꽃 → 포인트 배수 ──────────────────────────────────────
create or replace function public.point_multiplier(p_streak int)
returns numeric
language sql immutable set search_path = public as $$
  select case
    when p_streak >= 25 then 4.0
    when p_streak >= 15 then 3.0
    when p_streak >= 10 then 2.0
    when p_streak >= 5  then 1.5
    else 1.0
  end::numeric
$$;
revoke all on function public.point_multiplier(int) from public, anon;
grant execute on function public.point_multiplier(int) to authenticated;

-- ── 포인트 지급 (내부 전용·멱등) ─────────────────────────────
create or replace function public.award_points(
  p_user_id uuid, p_amount int, p_reason text,
  p_source_type text, p_source_id text,
  p_multiplier numeric, p_metadata jsonb
) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_balance int;
begin
  if p_amount <= 0 then return 0; end if;

  insert into user_wallet (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select balance into v_balance from user_wallet where user_id = p_user_id for update;

  begin
    insert into point_transactions
      (user_id, amount, transaction_type, reason, source_type, source_id,
       multiplier, balance_after, metadata)
    values (p_user_id, p_amount, 'earn', p_reason, p_source_type, p_source_id,
            p_multiplier, v_balance + p_amount, coalesce(p_metadata, '{}'::jsonb));
  exception when unique_violation then
    return 0; -- 이미 지급됨
  end;

  update user_wallet
  set balance = balance + p_amount,
      lifetime_earned = lifetime_earned + p_amount,
      updated_at = now()
  where user_id = p_user_id;

  return p_amount;
end $$;
revoke all on function public.award_points(uuid, int, text, text, text, numeric, jsonb)
  from public, anon, authenticated;

-- ── 배지 판정·지급 (멱등) ────────────────────────────────────
-- 반환: 새로 획득한 배지 jsonb 배열 [{badgeKey, emoji, name, tier, points}]
create or replace function public.evaluate_badges(p_user_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_today text := to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD');
  v_metrics jsonb;
  v_new jsonb := '[]'::jsonb;
  v_value numeric;
  v_period text;
  v_inserted int;
  d record;
begin
  -- 지표 6종을 한 번에 집계한다
  select jsonb_build_object(
    'workout_count', coalesce(count(*), 0),
    'total_minutes', coalesce(sum(s.duration_minutes), 0),
    'record_beaten', coalesce(count(*) filter (where s.record_note is not null), 0)
  ) into v_metrics
  from workout_sessions s
  where s.user_id = p_user_id and s.status = 'completed' and s.deleted_at is null;

  v_metrics := v_metrics
    || jsonb_build_object('streak_days', public.current_streak_days(p_user_id))
    || (
      select jsonb_build_object(
        'weight_volume_kg', coalesce(sum(
          case when we.exercise_type = 'weight'
               then coalesce(ws.weight_kg, 0) * coalesce(ws.reps, 0) else 0 end), 0),
        'cardio_distance_m', coalesce(sum(
          case when we.exercise_type = 'cardio'
               then coalesce(ws.distance_meters, 0) else 0 end), 0))
      from workout_sets ws
      join workout_exercises we on we.id = ws.workout_exercise_id
      join workout_sessions s on s.id = we.session_id
      where s.user_id = p_user_id and s.status = 'completed'
        and s.deleted_at is null and ws.is_completed
    );

  for d in
    select * from badge_definitions where status = 'active' order by sort_order
  loop
    v_value := (v_metrics ->> d.metric_key)::numeric;

    if d.repeatable then
      -- 반복형: 지표가 repeat_step의 배수에 닿은 날마다 1개.
      -- period_key가 날짜라 사슬이 끊겨 다시 채워도 다른 행이 되어 쌓인다.
      continue when v_value <= 0 or (v_value::bigint % d.repeat_step::bigint) <> 0;
      v_period := v_today;
    else
      continue when v_value < d.threshold;
      v_period := 'lifetime';
    end if;

    insert into user_badges (user_id, badge_key, period_key)
    values (p_user_id, d.badge_key, v_period)
    on conflict (user_id, badge_key, period_key) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then continue; end if;

    perform public.award_points(
      p_user_id, d.point_reward, 'badge_earned',
      'badge', d.badge_key || ':' || v_period, null,
      jsonb_build_object('tier', d.tier, 'metric', d.metric_key));

    v_new := v_new || jsonb_build_object(
      'badgeKey', d.badge_key, 'emoji', d.emoji, 'name', d.name,
      'tier', d.tier, 'points', d.point_reward);
  end loop;

  if jsonb_array_length(v_new) > 0 then
    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    values (p_user_id, p_user_id, 'badge_earned', null,
            '🏅 배지 획득!',
            '새 배지 ' || jsonb_array_length(v_new) || '개를 얻었어요 — 내 정보에서 확인해 보세요');
  end if;

  return v_new;
end $$;
revoke all on function public.evaluate_badges(uuid) from public, anon, authenticated;

-- ── complete_workout_v2 — 포인트·배지 훅 추가 (0027 기반) ────
create or replace function public.complete_workout_v2(p_session_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
  v_dur int; v_valid boolean; v_tabata boolean;
  v_eff date; v_has_daily boolean;
  v_base int := 0; v_time int := 0; v_plan int := 0; v_rec int := 0; v_photo int := 0;
  v_total int := 0;
  v_prog jsonb; v_orig int;
  v_streak int; v_mult numeric; v_points int := 0; v_badges jsonb := '[]'::jsonb;
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

  update workout_sessions
  set status = 'completed', completed_at = now(),
      duration_minutes = floor(extract(epoch from now() - s.started_at) / 60)::int
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
        'duration_source', 'server_elapsed', 'is_tabata', v_tabata));
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
    'newBadges', v_badges
  );
end $$;
revoke all on function public.complete_workout_v2(uuid) from public, anon;
grant execute on function public.complete_workout_v2(uuid) to authenticated;

-- ── mark_record_beaten — 하드코딩 배지 제거 (0021 기반) ──────
create or replace function public.mark_record_beaten(
  p_session_id uuid, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_session workout_sessions%rowtype;
  v_nickname text;
begin
  select * into v_session from workout_sessions where id = p_session_id;

  if not found or v_session.user_id <> auth.uid() then
    raise exception 'not_owner';
  end if;
  if v_session.status <> 'completed' or v_session.deleted_at is not null then
    raise exception 'invalid_status';
  end if;
  if v_session.record_note is not null then
    raise exception 'already_marked';
  end if;
  if p_note is null or length(trim(p_note)) = 0 or length(p_note) > 80 then
    raise exception 'invalid_note';
  end if;

  update workout_sessions set record_note = p_note where id = p_session_id;

  select nickname into v_nickname from profiles where id = v_session.user_id;

  insert into notifications (user_id, actor_id, type, reference_id, title, body)
  select distinct gm.user_id, v_session.user_id, 'record_beaten', p_session_id,
    '🏅 기록 갱신! 칭찬해주세요',
    coalesce(v_nickname, '크루원') || '님이 ' || p_note
      || '. 칭찬 한마디 남겨주세요! 👏'
  from group_members gm
  where gm.user_id <> v_session.user_id
    and gm.group_id in (
      select group_id from group_members where user_id = v_session.user_id);

  -- 배지는 evaluate_badges가 판정한다. 임계값은 badge_definitions가 단일 원천이다.
  perform public.evaluate_badges(v_session.user_id);
end $$;
revoke all on function public.mark_record_beaten(uuid, text) from public, anon;
grant execute on function public.mark_record_beaten(uuid, text) to authenticated;

-- ── get_crew_member_profile — period_key 추가 (0026 기반) ────
-- 반복 배지가 생겼으므로 크루원 프로필도 period_key를 알아야 한다.
-- 없으면 "불꽃 5일 ×3"을 남의 프로필에서 셀 수 없다.
create or replace function public.get_crew_member_profile(p_target_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_progress user_progress%rowtype;
  v_badges jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_target_id <> auth.uid() and not shares_group_with(p_target_id) then
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

  return jsonb_build_object(
    'totalXp',      coalesce(v_progress.total_xp, 0),
    'currentLevel', coalesce(v_progress.current_level, 1),
    'currentStage', coalesce(v_progress.current_stage, 1),
    'badges',       v_badges
  );
end $$;
revoke all on function public.get_crew_member_profile(uuid) from public, anon;
grant execute on function public.get_crew_member_profile(uuid) to authenticated;
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/migrations/0032_badge_point_engine.sql
git commit -m "feat: 0032 배지 판정·포인트 지급 엔진"
```

- [ ] **Step 3: 사용자에게 Run 요청 후 대기**

> `supabase/migrations/0032_badge_point_engine.sql`을 SQL Editor에 붙여넣고 Run 해주세요.
> 적용되면 검증 스크립트를 돌리겠습니다.

---

## Task 3: 실 DB 검증

**Files:** Create `scripts/badge-point-check.mjs`

- [ ] **Step 1: 스크립트 작성**

```js
// 0031·0032 검증: 배지 판정 + 포인트 지급
// 실행: node scripts/badge-point-check.mjs
// 사전조건: 0031·0032 적용.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error(".env.local에 Supabase 설정이 없습니다");
}

const RUN = Date.now().toString(36).slice(-5);
let passed = 0, failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (ok) passed++; else failed++;
}

async function api(token, method, path, body, prefer = "return=representation") {
  const service = token === SERVICE_KEY;
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: {
      apikey: service ? SERVICE_KEY : ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* 본문 없음 */ }
  return { status: res.status, json };
}

async function anonUser(nick) {
  const res = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("익명 가입 실패: " + JSON.stringify(json));
  const user = { token: json.access_token, id: json.user.id };
  await api(user.token, "POST", "/rest/v1/profiles", {
    id: user.id, nickname: `${nick}-${RUN}`, weekly_goal: 3,
  });
  return user;
}

async function deleteAuthUser(id) {
  return fetch(`${URL}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

/** 지정한 종목·세트로 세션을 만들고 완료까지 */
async function runWorkout(user, exercises) {
  const draft = await api(user.token, "POST", "/rest/v1/workout_sessions", {
    user_id: user.id, timezone: "Asia/Seoul", visibility: "private",
  });
  const session = draft.json?.[0];
  for (const [i, ex] of exercises.entries()) {
    const created = await api(user.token, "POST", "/rest/v1/workout_exercises", {
      session_id: session.id, exercise_name: ex.name,
      exercise_type: ex.type, sort_order: i,
    });
    const exercise = created.json?.[0];
    for (const [j, set] of ex.sets.entries()) {
      await api(user.token, "POST", "/rest/v1/workout_sets", {
        workout_exercise_id: exercise.id, set_number: j + 1,
        weight_kg: set.weight_kg ?? null, reps: set.reps ?? null,
        duration_seconds: set.duration_seconds ?? null,
        distance_meters: set.distance_meters ?? null,
        is_completed: true,
      });
    }
  }
  await api(user.token, "POST", "/rest/v1/rpc/start_workout", { p_session_id: session.id });
  const done = await api(user.token, "POST", "/rest/v1/rpc/complete_workout_v2", {
    p_session_id: session.id,
  });
  return { session, done };
}

const W3 = [
  { weight_kg: 100, reps: 10 },
  { weight_kg: 100, reps: 10 },
  { weight_kg: 100, reps: 10 },
];

let users = [];

try {
  // ── 1) 첫 운동 → 배지·포인트 ──
  const A = await anonUser("bpA");
  users.push(A);
  const r1 = await runWorkout(A, [{ name: "스쿼트", type: "weight", sets: W3 }]);

  check(
    "첫 운동에 포인트 100 지급 (불꽃 1일 → 배수 1.0)",
    r1.done.json?.pointsAwarded === 100 && Number(r1.done.json?.pointMultiplier) === 1,
    JSON.stringify({ p: r1.done.json?.pointsAwarded, m: r1.done.json?.pointMultiplier }),
  );

  const keys = (r1.done.json?.newBadges ?? []).map((b) => b.badgeKey).sort();
  check(
    "첫 운동 배지 = workout_1 · volume_1t · volume_5t",
    JSON.stringify(keys) === JSON.stringify(["volume_1t", "volume_5t", "workout_1"]),
    JSON.stringify(keys),
  );

  const wallet = await api(A.token, "GET", "/rest/v1/user_wallet?select=balance,lifetime_earned");
  check(
    "지갑 = 운동 100 + 배지 300×3 = 1,000 P",
    wallet.json?.[0]?.balance === 1000,
    JSON.stringify(wallet.json),
  );

  // ── 2) 같은 날 2번째 운동 → 포인트 0 ──
  const r2 = await runWorkout(A, [{ name: "벤치", type: "weight", sets: W3 }]);
  check(
    "같은 날 2번째 운동은 포인트 0 (XP와 같은 제한)",
    r2.done.json?.pointsAwarded === 0,
    JSON.stringify(r2.done.json?.pointsAwarded),
  );

  // ── 3) 배지 멱등 — 재평가해도 중복 지급 없음 ──
  const before = await api(A.token, "GET", "/rest/v1/point_transactions?select=id");
  const r3 = await runWorkout(A, [{ name: "데드", type: "weight", sets: W3 }]);
  const after = await api(A.token, "GET", "/rest/v1/point_transactions?select=id");
  check(
    "이미 딴 배지는 다시 지급되지 않는다",
    (r3.done.json?.newBadges ?? []).length === 0 &&
      before.json.length === after.json.length,
    `new=${JSON.stringify(r3.done.json?.newBadges)} tx ${before.json.length}→${after.json.length}`,
  );

  // ── 4) 불꽃 5일 → 반복 배지 1개 ──
  // 과거 5일치 세션을 service_role로 심는다(오늘 포함).
  const B = await anonUser("bpB");
  users.push(B);
  for (let i = 4; i >= 1; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString();
    await api(SERVICE_KEY, "POST", "/rest/v1/workout_sessions", {
      user_id: B.id, timezone: "Asia/Seoul", visibility: "private",
      status: "completed", started_at: day, completed_at: day, duration_minutes: 30,
    });
  }
  const rB = await runWorkout(B, [{ name: "스쿼트", type: "weight", sets: W3 }]);
  const bKeys = (rB.done.json?.newBadges ?? []).map((b) => b.badgeKey);
  check(
    "불꽃 5일 → streak_5 획득",
    bKeys.includes("streak_5") && rB.done.json?.streakDays === 5,
    `streak=${rB.done.json?.streakDays} keys=${JSON.stringify(bKeys)}`,
  );
  check(
    "불꽃 5일 → 배수 1.5 적용 (100 × 1.5 = 150)",
    rB.done.json?.pointsAwarded === 150,
    JSON.stringify(rB.done.json?.pointsAwarded),
  );

  // ── 5) 반복 배지는 period_key가 날짜다 ──
  const rows = await api(B.token, "GET",
    "/rest/v1/user_badges?select=badge_key,period_key&badge_key=eq.streak_5");
  check(
    "streak_5의 period_key = 오늘 날짜",
    rows.json?.[0]?.period_key === new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10),
    JSON.stringify(rows.json),
  );

  // ── 6) 위조 차단 ──
  const forgeBadge = await api(A.token, "POST", "/rest/v1/user_badges", {
    user_id: A.id, badge_key: "volume_250t", period_key: "lifetime",
  });
  check("배지 직접 insert 차단", forgeBadge.status >= 400,
    `${forgeBadge.status} ${JSON.stringify(forgeBadge.json)}`);

  const forgePoint = await api(A.token, "POST", "/rest/v1/point_transactions", {
    user_id: A.id, amount: 99999, transaction_type: "earn",
    reason: "admin_adjustment", source_type: "hack", source_id: "1", balance_after: 0,
  });
  check("포인트 직접 insert 차단", forgePoint.status >= 400,
    `${forgePoint.status} ${JSON.stringify(forgePoint.json)}`);

  const otherWallet = await api(B.token, "GET",
    `/rest/v1/user_wallet?select=balance&user_id=eq.${A.id}`);
  check("타인 지갑 조회 0건", otherWallet.json?.length === 0,
    JSON.stringify(otherWallet.json));

  // ── 7) 카탈로그는 전원 읽기 ──
  const cat = await api(A.token, "GET", "/rest/v1/badge_definitions?select=badge_key");
  check("배지 카탈로그 30종 조회 가능", cat.json?.length === 30, `${cat.json?.length}종`);
} finally {
  for (const u of users) await deleteAuthUser(u.id);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: 실행**

Run: `node scripts/badge-point-check.mjs`
Expected: `11/11 passed`

- [ ] **Step 3: 커밋**

```bash
git add scripts/badge-point-check.mjs
git commit -m "test: 배지·포인트 엔진 실 DB 검증"
```

---

## Task 4: 불꽃 SQL ↔ TS 대조

홈 🔥와 배지가 다른 숫자를 말하면 사용자는 버그로 본다. 두 구현이 같은 값을 내는지 실계정 데이터로 대조한다.

**Files:** Create `scripts/streak-parity-check.mjs`

- [ ] **Step 1: 스크립트 작성**

```js
// 불꽃 일수: SQL current_streak_days ↔ TS currentStreak 대조
// 실행: node scripts/streak-parity-check.mjs
// 사전조건: 0032 적용.
//
// 두 구현이 갈라지면 홈 🔥와 배지가 서로 다른 숫자를 말한다.
// 실계정 데이터로 전원을 대조한다(읽기 전용).
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const get = async (p) => (await fetch(`${URL}${p}`, { headers: h })).json();

// domain/streak.ts와 같은 규칙을 그대로 옮긴 것
const EXPIRY = 5;
function daysBetween(a, b) {
  const u = (k) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((u(b) - u(a)) / 86400000);
}
function currentStreak(dayKeys, todayKey) {
  const keys = [...dayKeys].sort();
  const last = keys.at(-1);
  if (!last || daysBetween(last, todayKey) >= EXPIRY) return 0;
  let streak = 1;
  for (let i = keys.length - 2; i >= 0; i--) {
    if (daysBetween(keys[i], keys[i + 1]) >= EXPIRY) break;
    streak++;
  }
  return streak;
}
const kst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);

const profiles = await get("/rest/v1/profiles?select=id,nickname");
const sessions = await get(
  "/rest/v1/workout_sessions?select=user_id,completed_at&status=eq.completed&deleted_at=is.null&completed_at=not.is.null",
);
const today = kst(new Date().toISOString());
const byUser = new Map();
for (const s of sessions) {
  const a = byUser.get(s.user_id) ?? new Set();
  a.add(kst(s.completed_at));
  byUser.set(s.user_id, a);
}

let bad = 0;
for (const p of profiles) {
  const days = [...(byUser.get(p.id) ?? [])];
  const ts = currentStreak(days, today);
  const res = await fetch(`${URL}/rest/v1/rpc/current_streak_days`, {
    method: "POST", headers: h, body: JSON.stringify({ p_user_id: p.id }),
  });
  const sql = await res.json();
  const ok = sql === ts;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"} ${p.nickname.padEnd(14)} SQL ${sql} / TS ${ts}`);
}
console.log(`\n불일치 ${bad}건`);
if (bad > 0) process.exit(1);
```

- [ ] **Step 2: 실행**

Run: `node scripts/streak-parity-check.mjs`
Expected: 모든 계정 PASS, `불일치 0건`

> `current_streak_days`는 `authenticated`에게만 grant돼 있다. service_role은 RLS를
> 우회하지만 함수 실행 권한은 별개다. 403이 나오면 0032에
> `grant execute on function public.current_streak_days(uuid) to service_role;`를
> 추가하고 다시 Run한다.

- [ ] **Step 3: 커밋**

```bash
git add scripts/streak-parity-check.mjs
git commit -m "test: 불꽃 일수 SQL↔TS 대조"
```

---

# PHASE B — 클라이언트 조회

## Task 5: 배지 도메인 리팩터 (TDD)

카탈로그가 DB로 옮겨가므로 `BADGE_CATALOG` 상수를 없애고 **인자로 받는다.** 반복 배지는 개수를 세야 한다.

**Files:** Modify `src/lib/domain/badges.ts` · `src/lib/domain/badges.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/domain/badges.test.ts`를 아래로 **교체**한다.

```ts
import { describe, expect, it } from "vitest";
import {
  badgeShelf,
  earnedBadgeCount,
  groupByMetric,
  type BadgeMeta,
  type EarnedBadge,
} from "./badges";

const CATALOG: BadgeMeta[] = [
  { key: "workout_1", emoji: "🐣", name: "첫 발", description: "d1", tier: "bronze",
    metricKey: "workout_count", threshold: 1, pointReward: 300, repeatable: false,
    repeatStep: null, sortOrder: 101 },
  { key: "workout_10", emoji: "🦴", name: "열 번", description: "d2", tier: "bronze",
    metricKey: "workout_count", threshold: 10, pointReward: 300, repeatable: false,
    repeatStep: null, sortOrder: 102 },
  { key: "streak_5", emoji: "🔥", name: "불꽃 5일", description: "d3", tier: "bronze",
    metricKey: "streak_days", threshold: 5, pointReward: 500, repeatable: true,
    repeatStep: 5, sortOrder: 301 },
];

function earned(key: string, periodKey: string, day: string): EarnedBadge {
  return { badgeKey: key, periodKey, earnedAt: new Date(day) };
}

describe("badgeShelf", () => {
  it("카탈로그 순서를 지키고 미획득은 earnedAt이 null이다", () => {
    const shelf = badgeShelf(CATALOG, [earned("workout_1", "lifetime", "2026-07-20")]);
    expect(shelf.map((s) => s.key)).toEqual(["workout_1", "workout_10", "streak_5"]);
    expect(shelf[0].earnedAt).not.toBeNull();
    expect(shelf[1].earnedAt).toBeNull();
  });

  it("반복 배지는 획득 횟수를 센다", () => {
    const shelf = badgeShelf(CATALOG, [
      earned("streak_5", "2026-07-10", "2026-07-10"),
      earned("streak_5", "2026-07-20", "2026-07-20"),
      earned("streak_5", "2026-07-25", "2026-07-25"),
    ]);
    const streak = shelf.find((s) => s.key === "streak_5")!;
    expect(streak.count).toBe(3);
    // 가장 최근 획득일을 대표로 쓴다
    expect(streak.earnedAt?.toISOString().slice(0, 10)).toBe("2026-07-25");
  });

  it("1회성 배지의 count는 획득 시 1, 미획득 시 0", () => {
    const shelf = badgeShelf(CATALOG, [earned("workout_1", "lifetime", "2026-07-20")]);
    expect(shelf.find((s) => s.key === "workout_1")!.count).toBe(1);
    expect(shelf.find((s) => s.key === "workout_10")!.count).toBe(0);
  });

  it("카탈로그에 없는 배지 키는 무시한다", () => {
    const shelf = badgeShelf(CATALOG, [earned("future_badge", "lifetime", "2026-07-20")]);
    expect(shelf.every((s) => s.earnedAt === null)).toBe(true);
  });
});

describe("earnedBadgeCount", () => {
  it("반복 배지를 여러 번 따도 종류 수로 센다", () => {
    const n = earnedBadgeCount(CATALOG, [
      earned("workout_1", "lifetime", "2026-07-20"),
      earned("streak_5", "2026-07-10", "2026-07-10"),
      earned("streak_5", "2026-07-20", "2026-07-20"),
    ]);
    expect(n).toBe(2);
  });

  it("카탈로그 밖의 키는 세지 않는다", () => {
    expect(earnedBadgeCount(CATALOG, [earned("nope", "lifetime", "2026-07-20")])).toBe(0);
  });
});

describe("groupByMetric", () => {
  it("지표별로 묶고 카탈로그 순서를 유지한다", () => {
    const groups = groupByMetric(badgeShelf(CATALOG, []));
    expect(groups.map((g) => g.metricKey)).toEqual(["workout_count", "streak_days"]);
    expect(groups[0].items.map((i) => i.key)).toEqual(["workout_1", "workout_10"]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/domain/badges.test.ts`
Expected: FAIL — `groupByMetric` 없음, `badgeShelf` 인자 수 불일치

- [ ] **Step 3: `src/lib/domain/badges.ts`를 아래로 교체**

```ts
/**
 * 배지 도메인 (설계 2026-07-27).
 *
 * 카탈로그는 **DB(`badge_definitions`)가 단일 원천**이다. 여기는 표시 계산만 한다.
 * 예전에는 카탈로그가 이 파일의 상수였으나, 30종으로 늘면서 데이터로 뺐다.
 */
export type BadgeTier = "bronze" | "silver" | "gold" | "legend";

export type BadgeMetricKey =
  | "workout_count"
  | "total_minutes"
  | "streak_days"
  | "weight_volume_kg"
  | "cardio_distance_m"
  | "record_beaten";

export type BadgeMeta = {
  key: string;
  emoji: string;
  name: string;
  description: string;
  tier: BadgeTier;
  metricKey: BadgeMetricKey;
  threshold: number;
  pointReward: number;
  repeatable: boolean;
  repeatStep: number | null;
  sortOrder: number;
};

/** DB에서 읽어온 획득 배지. 반복 배지는 같은 key가 여러 행으로 온다. */
export type EarnedBadge = {
  badgeKey: string;
  periodKey: string;
  earnedAt: Date;
};

/** 진열대 한 칸 — earnedAt이 null이면 미획득(잠금) */
export type BadgeShelfItem = BadgeMeta & {
  earnedAt: Date | null;
  /** 획득 횟수. 반복 배지는 2 이상이 될 수 있다. */
  count: number;
};

export function badgeShelf(
  catalog: BadgeMeta[],
  earned: EarnedBadge[],
): BadgeShelfItem[] {
  const byKey = new Map<string, EarnedBadge[]>();
  for (const b of earned) {
    const list = byKey.get(b.badgeKey) ?? [];
    list.push(b);
    byKey.set(b.badgeKey, list);
  }
  return [...catalog]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((meta) => {
      const rows = byKey.get(meta.key) ?? [];
      // 대표 획득일은 가장 최근 것 — 반복 배지에서 "마지막으로 딴 날"이 자연스럽다
      const latest = rows.reduce<Date | null>(
        (acc, r) => (acc === null || r.earnedAt > acc ? r.earnedAt : acc),
        null,
      );
      return { ...meta, earnedAt: latest, count: rows.length };
    });
}

/** 획득한 배지 **종류** 수. 반복 배지를 여러 번 따도 1로 센다. */
export function earnedBadgeCount(
  catalog: BadgeMeta[],
  earned: EarnedBadge[],
): number {
  const keys = new Set(catalog.map((m) => m.key));
  return new Set(
    earned.map((b) => b.badgeKey).filter((k) => keys.has(k)),
  ).size;
}

export type BadgeGroup = {
  metricKey: BadgeMetricKey;
  items: BadgeShelfItem[];
};

/** 지표별 묶음. 배지 전체 화면이 섹션으로 나눠 그릴 때 쓴다. */
export function groupByMetric(shelf: BadgeShelfItem[]): BadgeGroup[] {
  const groups: BadgeGroup[] = [];
  for (const item of shelf) {
    const g = groups.find((x) => x.metricKey === item.metricKey);
    if (g) g.items.push(item);
    else groups.push({ metricKey: item.metricKey, items: [item] });
  }
  return groups;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/domain/badges.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: 커밋** (이 시점엔 `badge-shelf.tsx`·`member-profile-sheet.tsx`가 깨진다. Task 10에서 고친다. 타입 검사는 Task 10 이후에 통과한다.)

```bash
git add src/lib/domain/badges.ts src/lib/domain/badges.test.ts
git commit -m "refactor: 배지 카탈로그를 상수에서 인자로 — DB 단일 원천 대비"
```

---

## Task 6: 조회 함수

**Files:** Modify `src/lib/badges.ts` · Create `src/lib/points.ts`

- [ ] **Step 1: `src/lib/badges.ts`를 아래로 교체**

```ts
import type { BadgeMeta, EarnedBadge } from "@/lib/domain/badges";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** 배지 카탈로그 (0031). 전역 데이터라 누구나 읽는다. */
export async function getBadgeCatalog(): Promise<BadgeMeta[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("badge_definitions")
    .select(
      "badge_key, emoji, name, description, tier, metric_key, threshold, point_reward, repeatable, repeat_step, sort_order",
    )
    .eq("status", "active")
    .order("sort_order", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((r) => ({
    key: r.badge_key,
    emoji: r.emoji,
    name: r.name,
    description: r.description,
    tier: r.tier,
    metricKey: r.metric_key,
    threshold: Number(r.threshold),
    pointReward: r.point_reward,
    repeatable: r.repeatable,
    repeatStep: r.repeat_step === null ? null : Number(r.repeat_step),
    sortOrder: r.sort_order,
  }));
}

/** 내 획득 배지 — RLS가 본인 행만 돌려준다. 반복 배지는 여러 행으로 온다. */
export async function getMyBadges(): Promise<EarnedBadge[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("user_badges")
    .select("badge_key, period_key, earned_at")
    .order("earned_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    badgeKey: row.badge_key,
    periodKey: row.period_key,
    earnedAt: new Date(row.earned_at),
  }));
}
```

- [ ] **Step 2: `src/lib/points.ts` 작성**

```ts
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export interface Wallet {
  balance: number;
  lifetimeEarned: number;
}

/** 내 지갑 (0031). 행이 없으면 0 P인 신규 사용자. */
export async function getMyWallet(): Promise<Wallet> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("user_wallet")
    .select("balance, lifetime_earned")
    .maybeSingle();
  if (error) throw error;
  return {
    balance: data?.balance ?? 0,
    lifetimeEarned: data?.lifetime_earned ?? 0,
  };
}

export interface PointTransactionRow {
  id: string;
  amount: number;
  reason: string;
  multiplier: number | null;
  createdAt: string;
}

/** 최근 포인트 내역 20건. 회수(refund)만 빼고 보여준다. */
export async function getRecentPointTransactions(): Promise<PointTransactionRow[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("point_transactions")
    .select("id, amount, reason, multiplier, created_at")
    .neq("transaction_type", "refund")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    amount: r.amount,
    reason: r.reason,
    multiplier: r.multiplier === null ? null : Number(r.multiplier),
    createdAt: r.created_at,
  }));
}
```

- [ ] **Step 3: `src/lib/progression.ts`의 크루 배지 매핑에 `periodKey` 추가**

`CrewProfileRow` 타입의 `badges` 줄을 교체:

```ts
  badges?: { badgeKey: string; periodKey: string; earnedAt: string }[];
```

`getCrewMemberProfile` 반환의 `badges` 매핑을 교체:

```ts
    badges: (row.badges ?? []).map((b) => ({
      badgeKey: b.badgeKey,
      periodKey: b.periodKey,
      earnedAt: new Date(b.earnedAt),
    })),
```

- [ ] **Step 4: 배지 키 ↔ 이미지 파일 일치 테스트로 교체**

`src/lib/badge-keys.test.ts`를 아래로 **교체**한다. 예전에는 TS 상수와 SQL의 키를
맞췄지만 상수가 사라졌다. 이제 조용히 틀리는 지점은 **seed의 키와 이미지 파일명**이다 —
어긋나면 배지가 지급돼도 화면에 깨진 이미지가 뜬다.

```ts
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 배지 키는 seed(지급·표시의 단일 원천)와 이미지 파일명이 반드시 같아야 한다.
 * 어긋나면 배지를 따도 화면엔 깨진 이미지가 뜬다 — 조용히 틀리는 버그다.
 */
const SEED_PATH = path.join(
  process.cwd(), "supabase", "migrations", "0031_badge_point_schema.sql",
);
const BADGE_DIR = path.join(process.cwd(), "public", "badges");

/** seed VALUES의 첫 컬럼(badge_key)만 뽑는다 */
function seedKeys(sql: string): string[] {
  const body = sql.slice(sql.indexOf("insert into public.badge_definitions"));
  return [...body.matchAll(/^\s*\('([a-z0-9_]+)','/gm)].map((m) => m[1]);
}

describe("배지 키 ↔ 이미지 일치", () => {
  const keys = seedKeys(readFileSync(SEED_PATH, "utf8"));
  const files = readdirSync(BADGE_DIR)
    .filter((f) => f.endsWith(".png"))
    .map((f) => f.replace(/\.png$/, ""));

  it("seed에서 배지 키를 찾아낸다", () => {
    // 정규식이 헛도는 채로 통과하지 않도록 먼저 고정한다
    expect(keys.length).toBe(30);
  });

  it("모든 배지 키에 이미지가 있다", () => {
    expect(keys.filter((k) => !files.includes(k))).toEqual([]);
  });

  it("쓰이지 않는 이미지가 없다", () => {
    expect(files.filter((f) => !keys.includes(f))).toEqual([]);
  });
});
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm vitest run src/lib/badge-keys.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 6: 커밋**

```bash
git add src/lib/badges.ts src/lib/points.ts src/lib/progression.ts src/lib/badge-keys.test.ts
git commit -m "feat: 배지 카탈로그·지갑 조회 함수, 키↔이미지 일치 테스트"
```

---

# PHASE C — 화면

## Task 7: 포인트 요약 3칸 (TDD)

**Files:** Create `src/components/profile/point-summary.tsx` · `src/components/profile/point-summary.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PointSummary } from "./point-summary";

describe("PointSummary", () => {
  it("잔액·배수·불꽃을 3칸으로 보여준다", () => {
    const html = renderToStaticMarkup(
      <PointSummary balance={12840} streakDays={27} />,
    );
    expect(html).toContain("12,840");
    expect(html).toContain("×4");
    expect(html).toContain("27일");
  });

  it("불꽃 구간별 배수를 맞게 계산한다", () => {
    const cases: [number, string][] = [
      [0, "×1"],
      [4, "×1"],
      [5, "×1.5"],
      [9, "×1.5"],
      [10, "×2"],
      [14, "×2"],
      [15, "×3"],
      [24, "×3"],
      [25, "×4"],
    ];
    for (const [streak, label] of cases) {
      const html = renderToStaticMarkup(
        <PointSummary balance={0} streakDays={streak} />,
      );
      expect(html, `불꽃 ${streak}일`).toContain(label);
    }
  });

  it("불꽃이 0이면 다음 배수까지 남은 일수를 안내한다", () => {
    const html = renderToStaticMarkup(<PointSummary balance={0} streakDays={0} />);
    expect(html).toContain("5일 더");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/components/profile/point-summary.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```tsx
"use client";

/**
 * 포인트 요약 3칸 — 잔액 · 불꽃 배수 · 불꽃 일수.
 * 배수 구간은 SQL `point_multiplier`와 **같은 값**이어야 한다(0032).
 */
const TIERS: { min: number; mult: number; label: string }[] = [
  { min: 25, mult: 4, label: "×4" },
  { min: 15, mult: 3, label: "×3" },
  { min: 10, mult: 2, label: "×2" },
  { min: 5, mult: 1.5, label: "×1.5" },
  { min: 0, mult: 1, label: "×1" },
];

export function multiplierFor(streakDays: number): { label: string; next: number | null } {
  const tier = TIERS.find((t) => streakDays >= t.min)!;
  const higher = [...TIERS].reverse().find((t) => t.min > streakDays);
  return { label: tier.label, next: higher ? higher.min - streakDays : null };
}

export function PointSummary({
  balance,
  streakDays,
}: {
  balance: number;
  streakDays: number;
}) {
  const { label, next } = multiplierFor(streakDays);

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-extrabold text-accent">
            {balance.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">GND 포인트</p>
        </div>
        <div className="border-x border-line">
          <p className="text-lg font-extrabold text-accent">⚡{label}</p>
          <p className="mt-0.5 text-[11px] text-muted">포인트 배수</p>
        </div>
        <div>
          <p className="text-lg font-extrabold text-accent">🔥{streakDays}일</p>
          <p className="mt-0.5 text-[11px] text-muted">연속</p>
        </div>
      </div>
      {next !== null && (
        <p className="mt-2.5 text-center text-[11px] text-faint">
          {next}일 더 이어가면 배수가 올라가요
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/components/profile/point-summary.test.tsx`
Expected: PASS — 3 tests

- [ ] **Step 5: 커밋**

```bash
git add src/components/profile/point-summary.tsx src/components/profile/point-summary.test.tsx
git commit -m "feat: 프로필 포인트 요약 3칸"
```

---

## Task 8: 배지 진열 + 전체 시트 (TDD)

**Files:** Create `src/components/profile/badge-showcase.tsx` · `src/components/profile/badge-sheet.tsx` · `src/components/profile/badge-showcase.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BadgeShowcase } from "./badge-showcase";
import { BadgeSheet } from "./badge-sheet";
import { badgeShelf, type BadgeMeta } from "@/lib/domain/badges";

const CATALOG: BadgeMeta[] = [
  { key: "workout_1", emoji: "🐣", name: "첫 발", description: "시작이 반", tier: "bronze",
    metricKey: "workout_count", threshold: 1, pointReward: 300, repeatable: false,
    repeatStep: null, sortOrder: 101 },
  { key: "workout_10", emoji: "🦴", name: "열 번 찍었개", description: "안 넘어가는 나무",
    tier: "bronze", metricKey: "workout_count", threshold: 10, pointReward: 300,
    repeatable: false, repeatStep: null, sortOrder: 102 },
  { key: "streak_5", emoji: "🔥", name: "불꽃 5일", description: "또 모았개", tier: "bronze",
    metricKey: "streak_days", threshold: 5, pointReward: 500, repeatable: true,
    repeatStep: 5, sortOrder: 301 },
];

const EARNED = [
  { badgeKey: "workout_1", periodKey: "lifetime", earnedAt: new Date("2026-07-20") },
  { badgeKey: "streak_5", periodKey: "2026-07-20", earnedAt: new Date("2026-07-20") },
  { badgeKey: "streak_5", periodKey: "2026-07-25", earnedAt: new Date("2026-07-25") },
];

describe("BadgeShowcase", () => {
  it("획득 종류 수와 전체 수를 보여준다", () => {
    const html = renderToStaticMarkup(
      <BadgeShowcase shelf={badgeShelf(CATALOG, EARNED)} onOpenAll={() => {}} />,
    );
    expect(html).toContain("2 / 3");
    expect(html).toContain("전체 보기");
  });

  it("획득한 배지만 진열한다", () => {
    const html = renderToStaticMarkup(
      <BadgeShowcase shelf={badgeShelf(CATALOG, EARNED)} onOpenAll={() => {}} />,
    );
    expect(html).toContain("/badges/workout_1.png");
    expect(html).toContain("/badges/streak_5.png");
    expect(html).not.toContain("/badges/workout_10.png");
  });

  it("반복 배지는 개수를 붙인다", () => {
    const html = renderToStaticMarkup(
      <BadgeShowcase shelf={badgeShelf(CATALOG, EARNED)} onOpenAll={() => {}} />,
    );
    expect(html).toContain("×2");
  });

  it("하나도 없으면 안내 문구", () => {
    const html = renderToStaticMarkup(
      <BadgeShowcase shelf={badgeShelf(CATALOG, [])} onOpenAll={() => {}} />,
    );
    expect(html).toContain("아직 획득한 배지가 없어요");
  });
});

describe("BadgeSheet", () => {
  it("미획득 배지도 비유 문구와 함께 보여준다", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet shelf={badgeShelf(CATALOG, EARNED)} onClose={() => {}} />,
    );
    expect(html).toContain("열 번 찍었개");
    expect(html).toContain("안 넘어가는 나무");
  });

  it("지표별로 섹션을 나눈다", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet shelf={badgeShelf(CATALOG, EARNED)} onClose={() => {}} />,
    );
    expect(html).toContain("운동 횟수");
    expect(html).toContain("불꽃");
  });

  it("접근성: dialog 역할과 닫기", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet shelf={badgeShelf(CATALOG, [])} onClose={() => {}} />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("닫기");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/components/profile/badge-showcase.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: `src/components/profile/badge-showcase.tsx` 작성**

```tsx
"use client";

import Image from "next/image";
import type { BadgeShelfItem } from "@/lib/domain/badges";

/** 프로필 보유 배지 — 최근 획득 6개까지. 전체는 시트에서 본다. */
export function BadgeShowcase({
  shelf,
  onOpenAll,
}: {
  shelf: BadgeShelfItem[];
  onOpenAll: () => void;
}) {
  const owned = shelf.filter((b) => b.earnedAt !== null);
  const recent = [...owned]
    .sort((a, b) => (b.earnedAt!.getTime() - a.earnedAt!.getTime()))
    .slice(0, 6);

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-extrabold">보유 배지</h3>
        <button
          type="button"
          onClick={onOpenAll}
          className="text-[11px] font-bold text-accent"
        >
          {owned.length} / {shelf.length} · 전체 보기 ›
        </button>
      </div>

      {owned.length === 0 ? (
        <p className="mt-2 text-[11.5px] text-muted">
          아직 획득한 배지가 없어요. 오늘 운동을 완료하면 첫 배지를 받아요.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2.5">
          {recent.map((b) => (
            <li key={b.key} className="relative">
              <Image
                src={`/badges/${b.key}.png`}
                alt={b.name}
                width={48}
                height={48}
                sizes="48px"
              />
              {b.count > 1 && (
                <span className="absolute -right-1 -bottom-1 rounded-full bg-accent px-1.5 text-[10px] font-extrabold text-accent-ink">
                  ×{b.count}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: `src/components/profile/badge-sheet.tsx` 작성**

```tsx
"use client";

import Image from "next/image";
import {
  groupByMetric,
  type BadgeMetricKey,
  type BadgeShelfItem,
} from "@/lib/domain/badges";

const METRIC_LABEL: Record<BadgeMetricKey, string> = {
  workout_count: "운동 횟수",
  total_minutes: "총 운동 시간",
  streak_days: "불꽃",
  weight_volume_kg: "웨이트 볼륨",
  cardio_distance_m: "유산소 거리",
  record_beaten: "기록 갱신",
};

/** 배지 전체 시트 — 미획득도 비유 문구와 함께 보여준다(다음 목표가 되도록). */
export function BadgeSheet({
  shelf,
  onClose,
}: {
  shelf: BadgeShelfItem[];
  onClose: () => void;
}) {
  const groups = groupByMetric(shelf);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-sheet-title"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[22px] border-t border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <h3 id="badge-sheet-title" className="text-lg font-extrabold">
          배지
        </h3>

        {groups.map((g) => (
          <section key={g.metricKey} className="mt-4">
            <h4 className="text-[12.5px] font-extrabold text-muted">
              {METRIC_LABEL[g.metricKey]}
            </h4>
            <ul className="mt-2 flex flex-col gap-2">
              {g.items.map((b) => (
                <li key={b.key} className="flex items-center gap-3">
                  <Image
                    src={`/badges/${b.key}.png`}
                    alt=""
                    width={44}
                    height={44}
                    sizes="44px"
                    className={b.earnedAt ? "" : "opacity-30 grayscale"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">
                      {b.name}
                      {b.count > 1 && (
                        <span className="ml-1 text-accent">×{b.count}</span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {b.description}
                    </p>
                  </div>
                  <span className="flex-none text-[11px] font-bold text-faint">
                    {b.earnedAt ? `+${b.pointReward} P` : "🔒"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-12 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink"
        >
          닫기
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm vitest run src/components/profile/badge-showcase.test.tsx`
Expected: PASS — 7 tests

- [ ] **Step 6: 커밋**

```bash
git add src/components/profile/badge-showcase.tsx src/components/profile/badge-sheet.tsx src/components/profile/badge-showcase.test.tsx
git commit -m "feat: 프로필 배지 진열 + 전체 시트"
```

---

## Task 9: 성장 허브 배선 · 기록 탭 정리 · 크루 시트 대응

**Files:** Modify `src/components/profile/growth-hub.tsx` · `src/components/record/calendar-view.tsx` · `src/components/crew/member-profile-sheet.tsx` · Delete `src/components/record/badge-shelf.tsx`

- [ ] **Step 1: `growth-hub.tsx` — import·상태 추가**

import 블록에 추가:

```tsx
import { BadgeSheet } from "@/components/profile/badge-sheet";
import { BadgeShowcase } from "@/components/profile/badge-showcase";
import { PointSummary } from "@/components/profile/point-summary";
import { getBadgeCatalog, getMyBadges } from "@/lib/badges";
import { getMyWallet } from "@/lib/points";
import { badgeShelf, type BadgeShelfItem } from "@/lib/domain/badges";
import { currentStreak, workoutDayKeys } from "@/lib/domain/streak";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
```

`HubData` 인터페이스를 아래로 교체:

```tsx
interface HubData {
  summary: ProgressSummary;
  rewards: LevelReward[];
  unlocks: Set<string>;
  transactions: XpTransactionRow[];
  balance: number;
  streakDays: number;
  shelf: BadgeShelfItem[];
}
```

`const [stageGuideOpen, setStageGuideOpen] = useState(false);` 아래에 추가:

```tsx
  const [badgeSheetOpen, setBadgeSheetOpen] = useState(false);
```

- [ ] **Step 2: 조회 effect 확장**

`Promise.all` 블록을 아래로 교체한다. 불꽃은 홈 🔥와 같은 함수로 계산해야 화면끼리 어긋나지 않는다.

```tsx
        const supabase = getSupabaseBrowserClient();
        const [summary, rewards, unlocks, transactions, wallet, catalog, earned, sessions] =
          await Promise.all([
            getProgressSummary(),
            getLevelRewards(),
            getMyUnlocks(),
            getRecentXpTransactions(),
            getMyWallet(),
            getBadgeCatalog(),
            getMyBadges(),
            supabase
              .from("workout_sessions")
              .select("completed_at")
              .eq("status", "completed")
              .is("deleted_at", null)
              .not("completed_at", "is", null),
          ]);
        if (sessions.error) throw sessions.error;
        const instants = (sessions.data ?? []).map(
          (r) => new Date(r.completed_at as string),
        );
        const streakDays = currentStreak(
          workoutDayKeys(instants, DEFAULT_TIMEZONE),
          dayKey(new Date(), DEFAULT_TIMEZONE),
        );
        if (!cancelled)
          setData({
            summary, rewards, unlocks, transactions,
            balance: wallet.balance,
            streakDays,
            shelf: badgeShelf(catalog, earned),
          });
```

- [ ] **Step 3: 렌더 배선**

`const { summary, rewards, unlocks, transactions } = data;`를 아래로 교체:

```tsx
  const { summary, rewards, unlocks, transactions, balance, streakDays, shelf } = data;
```

`<CurrentStageCard ... />` 바로 아래에 추가:

```tsx
      <PointSummary balance={balance} streakDays={streakDays} />

      <BadgeShowcase shelf={shelf} onOpenAll={() => setBadgeSheetOpen(true)} />
```

`{stageGuideOpen && (...)}` 블록 아래에 추가:

```tsx
      {badgeSheetOpen && (
        <BadgeSheet shelf={shelf} onClose={() => setBadgeSheetOpen(false)} />
      )}
```

- [ ] **Step 4: 기록 탭에서 배지 제거**

`src/components/record/calendar-view.tsx`에서 아래 두 줄을 삭제한다:

```tsx
import { BadgeShelf } from "./badge-shelf";
```

```tsx
      <BadgeShelf />
```

그리고 파일을 지운다:

```bash
git rm src/components/record/badge-shelf.tsx
```

- [ ] **Step 5: 크루 프로필 시트를 새 시그니처에 맞춘다**

`src/components/crew/member-profile-sheet.tsx`에서 import를 교체:

```tsx
import { badgeShelf, earnedBadgeCount, type BadgeMeta } from "@/lib/domain/badges";
import { getBadgeCatalog } from "@/lib/badges";
```

`MemberProfileBody`의 시그니처와 첫 세 줄을 교체:

```tsx
export function MemberProfileBody({
  profile,
  catalog,
}: {
  profile: CrewMemberProfile;
  catalog: BadgeMeta[];
}) {
  const pct = Math.min(100, Math.round(profile.levelProgressPercent));
  const maxed = profile.nextLevelRequiredXp === null;
  const shelf = badgeShelf(catalog, profile.badges);
  const owned = earnedBadgeCount(catalog, profile.badges);
```

배지 칩의 이미지도 교체한다 — 이제 실제 배지 그림이 있다. `<span className="text-sm">{badge.earnedAt ? badge.emoji : "🔒"}</span>`를 아래로:

```tsx
              {badge.earnedAt ? (
                <Image src={`/badges/${badge.key}.png`} alt="" width={18} height={18} />
              ) : (
                <span className="text-sm">🔒</span>
              )}
```

셸(`MemberProfileSheet`)에는 카탈로그 조회를 더한다. `const [profile, setProfile] = useState<CrewMemberProfile | null>(null);` 아래에 추가:

```tsx
  const [catalog, setCatalog] = useState<BadgeMeta[] | null>(null);
```

effect의 `getCrewMemberProfile(userId)`를 아래로 교체:

```tsx
    Promise.all([getCrewMemberProfile(userId), getBadgeCatalog()])
      .then(([p, c]) => {
        if (cancelled) return;
        setProfile(p);
        setCatalog(c);
      })
```

본문 렌더 조건도 교체:

```tsx
        {!failure && (!profile || !catalog) && (
          <p aria-busy="true" className="mt-4 text-[12.5px] text-muted">
            불러오는 중…
          </p>
        )}

        {!failure && profile && catalog && (
          <MemberProfileBody profile={profile} catalog={catalog} />
        )}
```

- [ ] **Step 6: 크루 시트 테스트 갱신**

`src/components/crew/member-profile-sheet.test.tsx`의 import 아래에 카탈로그 상수를 추가한다:

```tsx
import type { BadgeMeta } from "@/lib/domain/badges";

const CATALOG: BadgeMeta[] = [
  { key: "record_beaten_1", emoji: "🏅", name: "어제의 나를 이겼개",
    description: "처음으로 지난 기록을 넘었개", tier: "bronze",
    metricKey: "record_beaten", threshold: 1, pointReward: 300,
    repeatable: false, repeatStep: null, sortOrder: 601 },
  { key: "record_beaten_5", emoji: "💪", name: "다섯 번 넘었개",
    description: "우연이 아니었개", tier: "bronze",
    metricKey: "record_beaten", threshold: 5, pointReward: 300,
    repeatable: false, repeatStep: null, sortOrder: 602 },
  { key: "record_beaten_10", emoji: "🔥", name: "기록이 무섭개",
    description: "열 번을 갱신했개", tier: "silver",
    metricKey: "record_beaten", threshold: 10, pointReward: 800,
    repeatable: false, repeatStep: null, sortOrder: 603 },
];
```

`profile()` 픽스처의 `badges`에 `periodKey`를 더한다:

```tsx
    badges: [
      { badgeKey: "record_beaten_1", periodKey: "lifetime",
        earnedAt: new Date("2026-07-20T10:00:00+09:00") },
      { badgeKey: "record_beaten_5", periodKey: "lifetime",
        earnedAt: new Date("2026-07-24T10:00:00+09:00") },
    ],
```

`MemberProfileBody` 호출을 전부 `<MemberProfileBody profile={profile()} catalog={CATALOG} />`
형태로 바꾸고, 배지 관련 기대 문구를 새 이름에 맞춘다:

```tsx
    expect(html).toContain("어제의 나를 이겼개");
    expect(html).toContain("다섯 번 넘었개");
    expect(html).toContain("기록이 무섭개"); // 미획득도 진열한다
    expect(html).toContain("🔒");
    expect(html).toContain("2 / 3");
```

"카탈로그에 없는 배지 키는 표시하지 않는다" 테스트의 픽스처도 `periodKey`를 넣는다:

```tsx
          badges: [
            { badgeKey: "future_badge_99", periodKey: "lifetime",
              earnedAt: new Date("2026-07-26") },
          ],
```

- [ ] **Step 7: 게이트 + 커밋**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: 전부 통과 — 여기서 Task 5 이후 깨져 있던 타입 검사가 비로소 통과한다

```bash
git add -A src/components src/lib
git commit -m "feat: 프로필에 포인트·배지 배선, 기록 탭 배지 제거"
```

---

## Task 10: 완료 모달에 포인트·배지 (TDD)

**Files:** Modify `src/lib/workout.ts` · `src/lib/domain/xp-events.ts` · `src/lib/domain/xp-events.test.ts` · `src/components/record/xp-result-modal.tsx`

- [ ] **Step 1: 실패하는 테스트 추가**

`src/lib/domain/xp-events.test.ts` 끝에 추가:

```ts
describe("buildXpEvents — 포인트·배지 (0032)", () => {
  it("포인트를 받으면 point 이벤트가 xp 다음에 온다", () => {
    const events = buildXpEvents({
      idempotentReplay: false, awarded: true, xpAwarded: 140,
      pointsAwarded: 150, pointMultiplier: 1.5, streakDays: 5,
    });
    expect(events.map((e) => e.type)).toEqual(["xp", "point"]);
    const point = events[1] as Extract<XpEvent, { type: "point" }>;
    expect(point.amount).toBe(150);
    expect(point.multiplier).toBe(1.5);
  });

  it("신규 배지가 있으면 badge 이벤트가 마지막에 온다", () => {
    const events = buildXpEvents({
      idempotentReplay: false, awarded: true, xpAwarded: 100,
      pointsAwarded: 100, pointMultiplier: 1,
      newBadges: [
        { badgeKey: "workout_1", emoji: "🐣", name: "첫 발", tier: "bronze", points: 300 },
      ],
    });
    expect(events.at(-1)?.type).toBe("badge");
  });

  it("포인트가 0이면 point 이벤트를 만들지 않는다", () => {
    const events = buildXpEvents({
      idempotentReplay: false, awarded: false, xpAwarded: 0, pointsAwarded: 0,
    });
    expect(events).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/domain/xp-events.test.ts`
Expected: FAIL — `point` 이벤트 없음

- [ ] **Step 3: `src/lib/workout.ts`의 `WorkoutXpResult`에 필드 추가**

`unlockedRewards?: { key: string; label: string }[];` 아래에 추가:

```ts
  // 0032 포인트·배지
  pointsAwarded?: number;
  pointMultiplier?: number;
  streakDays?: number;
  newBadges?: {
    badgeKey: string;
    emoji: string;
    name: string;
    tier: string;
    points: number;
  }[];
```

- [ ] **Step 4: `src/lib/domain/xp-events.ts` 확장**

`XpEvent` 유니온에 두 줄 추가:

```ts
  | { type: "point"; amount: number; multiplier: number; streakDays: number }
  | { type: "badge"; badges: { badgeKey: string; name: string; points: number }[] };
```

`buildXpEvents`의 `if (amount > 0) { ... }` 블록 **바로 다음**에 추가:

```ts
  const points = result.pointsAwarded ?? 0;
  if (points > 0) {
    events.push({
      type: "point",
      amount: points,
      multiplier: result.pointMultiplier ?? 1,
      streakDays: result.streakDays ?? 0,
    });
  }
```

`return events;` **바로 앞**에 추가:

```ts
  if (result.newBadges && result.newBadges.length > 0) {
    events.push({
      type: "badge",
      badges: result.newBadges.map((b) => ({
        badgeKey: b.badgeKey,
        name: b.name,
        points: b.points,
      })),
    });
  }
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm vitest run src/lib/domain/xp-events.test.ts`
Expected: PASS

- [ ] **Step 6: 모달에 두 이벤트 렌더**

`src/components/record/xp-result-modal.tsx`에서 이벤트 종류를 분기하는 곳에 아래 두 갈래를 더한다. (파일 안의 `event.type === "xp"` 분기 옆에 같은 형태로 둔다.)

```tsx
        {event.type === "point" && (
          <>
            <p className="text-center text-5xl">🅿️</p>
            <p className="mt-3 text-center text-2xl font-extrabold text-accent">
              +{event.amount.toLocaleString()} P
            </p>
            <p className="mt-1 text-center text-[12.5px] text-muted">
              불꽃 {event.streakDays}일 · 배수 ×{event.multiplier}
            </p>
          </>
        )}

        {event.type === "badge" && (
          <>
            <p className="text-center text-lg font-extrabold">🏅 새 배지!</p>
            <ul className="mt-3 flex flex-col gap-2">
              {event.badges.map((b) => (
                <li key={b.badgeKey} className="flex items-center gap-2.5">
                  <Image
                    src={`/badges/${b.badgeKey}.png`}
                    alt=""
                    width={40}
                    height={40}
                    sizes="40px"
                  />
                  <span className="flex-1 text-left text-sm font-bold">{b.name}</span>
                  <span className="text-xs font-extrabold text-accent">
                    +{b.points} P
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
```

- [ ] **Step 7: 게이트 + 커밋**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: 전부 통과

```bash
git add src/lib/workout.ts src/lib/domain/xp-events.ts src/lib/domain/xp-events.test.ts src/components/record/xp-result-modal.tsx
git commit -m "feat: 운동 완료 모달에 포인트·신규 배지"
```

---

## Task 11: 기존 크루 소급 평가

배지 30종이 새로 생겼지만 **기존 운동 기록에는 아무도 배지를 못 받은 상태**다. `evaluate_badges`는 운동을 완료해야 돌기 때문이다. 한 번 돌려 현재 실적만큼 지급한다.

**Files:** Create `supabase/migrations/0033_badge_initial_evaluation.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 0033: 기존 사용자에게 배지 최초 판정을 1회 돌린다
-- 적용: SQL Editor에 붙여넣고 Run. **여러 번 돌려도 안전하다(evaluate_badges가 멱등).**
--
-- 왜: 0031·0032로 배지 30종이 생겼지만 판정은 운동 완료 시점에만 돈다.
--     이미 쌓인 실적(스칼레또 10회·5.4톤·18.3km 등)에 대해 한 번 돌려줘야
--     도입 즉시 진열대가 채워진다.
--
-- 반복 배지 주의: streak_5는 "오늘 불꽃이 5의 배수일 때"만 지급된다. 소급으로
-- 과거 사슬을 되짚어 여러 개를 주지는 않는다 — 과거 어느 날 불꽃이 몇이었는지는
-- 지금 데이터로 재구성할 수 있지만, 그 값이 당시 화면에 보인 숫자와 같다는 보장이
-- 없다. 앞으로 쌓이는 것만 센다.

do $$
declare
  u record;
  v_new jsonb;
  v_total int := 0;
begin
  for u in select user_id from user_progress loop
    v_new := public.evaluate_badges(u.user_id);
    v_total := v_total + jsonb_array_length(v_new);
  end loop;
  raise notice '소급 지급 배지 % 개', v_total;
end $$;

-- 확인
select p.nickname,
       count(distinct ub.badge_key) as 배지종류,
       coalesce(w.balance, 0) as 포인트
from profiles p
left join user_badges ub on ub.user_id = p.id
left join user_wallet w on w.user_id = p.id
group by p.nickname, w.balance
order by 배지종류 desc;
```

- [ ] **Step 2: 커밋 + Run 요청**

```bash
git add supabase/migrations/0033_badge_initial_evaluation.sql
git commit -m "feat: 0033 기존 사용자 배지 최초 판정"
```

> `0033`을 Run 해주세요. 마지막 표에서 스칼레또 7종·오뎅끼데스까 6종·낭만송곳니 1종
> 근처가 나오면 정상입니다(설계 §4의 대입 결과).

---

## Task 12: 최종 게이트 · 실기기 · 배포

- [ ] **Step 1: 전체 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: lint 0 · 타입 0 · 테스트 전부 PASS(기존 438 + 신규 20 − 교체분 2 = 456 내외) · 빌드 성공

- [ ] **Step 2: 실 DB 재검증**

```bash
node scripts/badge-point-check.mjs
node scripts/streak-parity-check.mjs
```
Expected: `11/11 passed` · `불일치 0건`

- [ ] **Step 3: 사용자 실기기 확인 요청**

> 폰에서 확인해주세요:
> 1. 내 정보 → 포인트 3칸(잔액·⚡배수·🔥연속)이 뜨는지
> 2. 보유 배지 그림이 제대로 보이는지 — **브론즈와 골드가 구분되는지**
> 3. "전체 보기" → 30종이 지표별로 묶여 나오고, 미획득은 흐리게 + 비유 문구가 보이는지
> 4. 운동 완료 → XP 다음에 **포인트**, 그다음 **새 배지**가 순서대로 뜨는지
> 5. 기록 탭 달력에서 배지 진열대가 사라졌는지
> 6. 피드에서 크루원 프로필 → 배지가 그림으로 나오는지

- [ ] **Step 4: 배포 + 번들 검증**

```bash
pnpm dlx vercel deploy --prod --yes
```

배포 URL에서 `/profile`·`/record`·`/feed` 200 확인 후, 배포된 청크에서 grep:
`GND 포인트` · `포인트 배수` · `보유 배지` · `아직 획득한 배지가 없어요`

- [ ] **Step 5: PROGRESS.md 갱신 + 커밋**

최상단에 섹션 추가 — 배지 30종·포인트 경제·마이그레이션 0031~0033 적용 여부·검증 실측치·커밋 해시.

```bash
git add PROGRESS.md
git commit -m "docs: 배지 30종·포인트 경제 진행 기록"
```

---

## 2. Self-Review 체크리스트

- [ ] 0031~0033은 신규 파일이며 0022~0030을 수정하지 않았다
- [ ] `user_badges` PK 확장 후 기존 2건이 `period_key='lifetime'`으로 살아있다
- [ ] 배지 임계값의 단일 원천은 `badge_definitions`다 — 클라이언트에 하드코딩이 없다
- [ ] 불꽃 SQL과 `domain/streak.ts`가 같은 값을 낸다(parity 스크립트로 검증)
- [ ] 포인트 배수 구간이 SQL `point_multiplier`와 `point-summary.tsx`의 `TIERS`에서 같다
- [ ] 하루 2번째 운동은 XP도 포인트도 0이다
- [ ] `user_badges`·`point_transactions`에 authenticated의 insert 권한이 없다
- [ ] `record_beaten_1/5/10`의 키가 유지돼 기존 보유 배지가 사라지지 않았다
- [ ] 배지 이미지 경로가 `/badges/{badge_key}.png`로 카탈로그 키와 일치한다
- [ ] 테스트 계정(`bpA-`·`bpB-`) 정리됨, 실계정 미접촉

## 3. 인수인계 메모

- **Run이 세 번 끼어 있다** — 0031(스키마) → 0032(엔진) → 0033(소급). 각각 적용 확인 후 다음으로 간다. 0032를 적용하기 전에 Task 3 검증을 돌리면 전부 실패한다.
- **Task 5에서 타입 검사가 일시적으로 깨진다.** `badgeShelf` 시그니처가 바뀌는데 호출부는 Task 9에서 고친다. 그 사이 커밋은 단위 테스트만 통과하면 된다.
- **아이템 상점은 이 계획 밖이다.** 포인트를 **쓰는** 쪽(`spend`)은 스키마에만 있고 UI가 없다. 다음 스펙에서 다룬다.
- **가격표 재산정이 남아 있다** — 설계 §5.4. 목업의 롤렉스 1,500P는 이 수입 구조(운동당 100P×배수)와 맞지 않는다. 아이템 스펙에서 수입 기준으로 다시 짠다.
- **브론즈와 골드 색 구분**이 40px에서 약할 수 있다. 실기기에서 확인하고, 구분이 안 되면 `docs/badge-asset-prompts.md`의 브론즈 프롬프트를 더 어둡게 바꿔 시트 1만 재생성한 뒤 `node scripts/slice-badge-sheets.mjs`로 다시 자른다.
