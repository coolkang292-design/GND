-- ============================================================
-- Phase 5.3+: 맨몸 인터벌 루틴 종목 시드 (사용자 요청 2026-07-17)
-- 전신 맨몸 인터벌 루틴 + 15분 상체 맨몸 루틴 구성 종목 중
-- 기존 시드(0004·0009)에 없는 6종만 추가. 전부 bodyweight·reps.
-- 푸시업(0004)·사이드 레터럴 레이즈(0004)·덤벨 레터럴 레이즈(0009)는
-- 기존 종목을 그대로 사용하므로 중복 시드하지 않는다.
-- 실행: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run
-- ============================================================

insert into public.exercise_catalog (name, body_part, exercise_type, measure) values
  -- 전신 맨몸 인터벌 루틴 (점프 스쿼트→마운틴 클라이머→푸시업→슈퍼맨 로우)
  ('점프 스쿼트', '하체', 'bodyweight', 'reps'),
  ('마운틴 클라이머', '코어', 'bodyweight', 'reps'),
  ('슈퍼맨 로우', '등', 'bodyweight', 'reps'),
  -- 15분 상체 맨몸 루틴 (인치웜 푸시업→라잉 Y 레이즈→타이슨 푸시업→레터럴 레이즈)
  ('인치웜 푸시업', '가슴', 'bodyweight', 'reps'),
  ('라잉 Y 레이즈', '어깨', 'bodyweight', 'reps'),
  ('타이슨 푸시업', '가슴', 'bodyweight', 'reps')
on conflict (name) where created_by is null do nothing;
