-- 0019: 타바타 코스 (설계 docs/superpowers/specs/2026-07-19-tabata-courses-design.md)
-- ① 세션 타바타 표식 ② 챌린지 목표 유형 tabata_count
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만)

-- ── ① 세션 타바타 표식 (null = 일반 운동) ─────────────────

alter table public.workout_sessions
  add column if not exists tabata_minutes int
  check (tabata_minutes in (4, 8, 16));

-- 0004는 컬럼 목록 grant 방식 — 새 컬럼은 별도 grant 필요 (insert 시 1회만 기록)
grant insert (tabata_minutes) on public.workout_sessions to authenticated;

-- ── ② 챌린지 목표 유형 tabata_count ────────────────────────

alter table public.user_goals drop constraint user_goals_goal_type_check;
alter table public.user_goals add constraint user_goals_goal_type_check
  check (goal_type in (
    'weight_reps', 'weight_days',
    'cardio_distance', 'cardio_time',
    'bodyweight_reps', 'bodyweight_time', 'bodyweight_days',
    'tabata_count',
    'volume'
  ));
