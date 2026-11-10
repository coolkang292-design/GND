-- 0127 — 사이클 시간 목표 `cycle_time` 허용 (사용자 지시 2026-11-11
--        "사이클은 목표를 키로수가 아니라 시간기준으로", 누적 분)
--
-- ⓘ 제약을 **넓히기만** 한다. 0111이 만든 11종은 하나도 빼지 않고, 기존 행은 건드리지 않는다
--   (UPDATE 0줄). 다만 `drop constraint`가 들어가므로 CLAUDE.md §DB 마이그레이션에 따라
--   **사용자 승인 후** 적용한다 (0111과 같은 처리).
--
-- ⛔ 적용 전에는 `cycle_time` 목표 저장이 `23514`로 막힌다. 앱 배포와 **같은 때** 적용한다.
--
-- ⚠️ 서버 SQL은 goal_type 종류를 보지 않는다(목표 존재 여부만 본다). 트리거
--    `enforce_goal_raise_only`도 "종류를 바꾸지 마라"만 본다. 그래서 0111과 똑같이
--    **이 제약 하나만 넓히면 된다.**
--
-- 적용 후 확인 (⚠️ `pnpm db:snapshot`은 CHECK 제약을 안 담는다 — 이걸로 본다):
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'user_goals_goal_type_check';
--   select count(*) from public.user_goals;   -- 기존 행이 그대로인지

begin;

alter table public.user_goals
  drop constraint user_goals_goal_type_check;

alter table public.user_goals
  add constraint user_goals_goal_type_check check (
    goal_type = any (array[
      'weight_reps',
      'weight_days',
      'cardio_distance',
      'cardio_time',
      'bodyweight_reps',
      'bodyweight_time',
      'bodyweight_days',
      'tabata_count',
      'volume',
      'workout_days',  -- 0108: 종목 무관 운동한 날
      'cardio_days',   -- 0111: 유산소 운동일 (하루 N종목+)
      'cycle_time'     -- 0127: 사이클 누적 시간(분)
    ]::text[])
  );

commit;
