-- ============================================================
-- Phase 5.2: 챌린지 목표 카테고리 우선 개편 + 맨몸 측정단위(measure)
-- 사용자 결정(2026-07-17): 목표를 웨이트/유산소/맨몸 카테고리로 나누고
-- 각 카테고리를 횟수·시간·거리·운동일로 설정. 맨몸은 횟수형/시간형 구분.
-- 실행: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run
-- ============================================================

-- ── exercise_catalog.measure (맨몸 횟수형/시간형 구분) ──
alter table public.exercise_catalog
  add column measure text
  check (measure is null or measure in ('reps', 'time'));

-- 홀드형(시간)으로 표시
update public.exercise_catalog set measure = 'time'
  where name in ('플랭크');
-- 나머지 맨몸은 횟수형
update public.exercise_catalog set measure = 'reps'
  where exercise_type = 'bodyweight' and measure is null;

-- 매달리기 신규 시드 (그립·광배 → 등)
insert into public.exercise_catalog (name, body_part, exercise_type, measure)
  values ('매달리기', '등', 'bodyweight', 'time')
  on conflict do nothing;

-- ── workout_exercises.measure (재로딩·복사 카드 렌더링용) ──
alter table public.workout_exercises
  add column measure text
  check (measure is null or measure in ('reps', 'time'));

update public.workout_exercises we
  set measure = ec.measure
  from public.exercise_catalog ec
  where we.measure is null and ec.name = we.exercise_name;

-- ── user_goals.goal_type 카테고리 우선으로 확장 ──
alter table public.user_goals drop constraint user_goals_goal_type_check;

update public.user_goals set goal_type = case goal_type
  when 'frequency' then 'weight_days'
  when 'distance'  then 'cardio_distance'
  when 'duration'  then 'cardio_time'
  when 'reps'      then 'weight_reps'
  else goal_type end;  -- 'volume'은 레거시로 유지

alter table public.user_goals add constraint user_goals_goal_type_check
  check (goal_type in (
    'weight_reps', 'weight_days',
    'cardio_distance', 'cardio_time',
    'bodyweight_reps', 'bodyweight_time', 'bodyweight_days',
    'volume'
  ));
