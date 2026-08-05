-- 0059: 예정표에 타바타를 담는다 (설계 2026-08-05)
--
-- 지난 타바타 기록을 📋복사하면 지금은 "맨몸 운동 4종목"으로만 남아서, 그날
-- 예정표를 열어도 타바타가 아니라 일반 운동이 준비된다. 코스 분수를 계획에
-- 같이 저장해서 예정표에서 타바타 그대로 다시 시작할 수 있게 한다.
--
-- ✅ **지금 실행해도 안전하다.** 운영에 떠 있는 앱이 참조하지 않는 새 컬럼이라
--    앱 배포 전에 Run해도 화면이 달라지지 않는다. 개발 서버(운영 DB에 붙는다)에서
--    화면을 확인하려면 이 파일이 먼저 적용돼 있어야 한다.
--    (기존 행을 바꾸는 UPDATE는 0060으로 분리했다 — 그건 배포 뒤에 Run한다.)
--
-- move_workout_plan은 `RETURNS workout_plans` 행타입이라 컬럼이 늘면 반환값에
-- 자동으로 따라온다. 함수는 손대지 않는다.

alter table public.workout_plans
  add column if not exists tabata_minutes smallint
    check (tabata_minutes is null or tabata_minutes in (4, 8, 16));

comment on column public.workout_plans.tabata_minutes is
  '타바타 코스 분수(4|8|16). null이면 일반 운동 계획. 앱이 이 값을 보고 예정표를 타바타 시트로 연다.';

-- PostgREST가 새 컬럼을 즉시 인식하도록 스키마 캐시를 다시 읽게 한다.
notify pgrst, 'reload schema';
