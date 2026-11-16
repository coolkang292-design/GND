-- 0141 — 종목 이름 '사이클' → '싸이클' (사용자 지시 2026-11-17)
--
-- ⚠️ 기존 행을 바꾸는 UPDATE다 — 적용 전 사용자 승인이 필요하다 (CLAUDE.md §DB 마이그레이션).
--
-- 범위 (2026-11-17 운영 DB 실측):
--   exercise_catalog   1행 (공용 시드, created_by is null) — 종목 ID는 그대로라 그림·추천 연결은 안 깨진다
--   workout_exercises  9행 — 과거 기록. 이름이 달라지면 "직전 기록 불러오기"·최근 기록이 갈라진다
--   workout_plans      3행 / workout_routines 2행 — jsonb 안의 이름
-- 건드리지 않는다: workout_events.exercise_names(9행) — 당시 로그라 그대로 둔다
--
-- 점수 분류(`cardio-kind.ts`의 CYCLE 정규식)는 '사이클'·'싸이클' 둘 다 읽으므로 순서와 상관없이 안전하다.

update public.exercise_catalog
   set name = '싸이클'
 where name = '사이클' and created_by is null;

update public.workout_exercises
   set exercise_name = '싸이클'
 where exercise_name = '사이클';

update public.workout_plans
   set exercises = replace(exercises::text, '"사이클"', '"싸이클"')::jsonb
 where exercises::text like '%"사이클"%';

update public.workout_routines
   set exercises = replace(exercises::text, '"사이클"', '"싸이클"')::jsonb
 where exercises::text like '%"사이클"%';
