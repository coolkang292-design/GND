-- ============================================================
-- Phase 5.1: 목표 개편 — frequency = '웨이트 운동일' (부위 조건부)
-- 사용자 결정(2026-07-17): 운동횟수 목표를 웨이트 운동일로 변경,
-- 하루에 N부위 이상 웨이트 완료 세트가 있어야 그날을 카운트.
-- 실행: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run
-- ============================================================

-- ── workout_exercises에 부위 저장 (지금까지 이름·유형만 저장) ──

alter table public.workout_exercises
  add column body_part text
  check (body_part is null or body_part in ('가슴', '등', '하체', '어깨', '팔', '코어', '유산소'));

-- 과거 데이터 백필: 카탈로그 이름 매칭 (시드·커스텀 무관, 동명이면 임의 1건)
update public.workout_exercises we
set body_part = ec.body_part
from public.exercise_catalog ec
where we.body_part is null
  and ec.name = we.exercise_name;

-- ── user_goals에 달성 조건 (frequency: 하루 최소 웨이트 부위 수) ──

alter table public.user_goals
  add column qualifier int
  check (qualifier is null or qualifier between 1 and 7);
