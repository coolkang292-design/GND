-- 0108 — 범용 목표 `workout_days`(운동한 날) 허용 (챌린지 목표 단순화 2026-09-18)
--
-- ⓘ 제약을 **넓히기만** 한다. 기존 9종은 하나도 빼지 않고, 기존 행은 건드리지 않는다
--   (UPDATE 0줄). 다만 `drop constraint`가 들어가서 CLAUDE.md §DB 마이그레이션의
--   "애매하면 멈춘다"에 따라 **사용자 승인 후** 적용했다.
--
-- **왜 필요한가.** 참가자는 목표가 1개 이상 있어야 챌린지에 남는다 —
--   `start_challenge`는 `kpi_incomplete`로 막고, `autostart_due_challenges`는
--   목표 0개인 사람을 `dropped`로 뺀다. 그래서 "주 3회"만 고른 사람도 **목표 행이
--   하나는** 있어야 한다. 그 행이 `workout_days`다.
--
-- ⛔ `주 3회`를 `weight_days`·`bodyweight_days`로 위장 저장하지 마라. 그 둘은
--    "그 분류의 종목을 하루 N개 이상 한 날"이라, 유산소만 한 날이 0일로 잡힌다.
--
-- **실적은 새로 세지 않는다.** `workout_days`의 실적은 참여율 분자와 같은
--   `foldPeriodStats().workoutDays`(종목 무관, 같은 날 여러 번은 1일)다.
--   사진 인증 필터는 `get_challenge_period_sessions`가 이미 건다. 서버 SQL은
--   goal_type 종류를 보지 않는다(목표 존재 여부만) — 트리거 `enforce_goal_raise_only`
--   도 "종류를 바꾸지 마라"만 본다. 그래서 이 제약 하나만 넓히면 된다.
--
-- 운영 실측(2026-09-18): user_goals 47행 — weight_days 31 · weight_reps 6 ·
--   cardio_distance 5 · bodyweight_reps 2 · cardio_time 1 · tabata_count 1 ·
--   bodyweight_time 1. `volume`은 0행이지만 **표시 전용 레거시로 남긴다.**

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
      'workout_days'   -- 0108: 종목 무관 운동한 날
    ]::text[])
  );

commit;

-- 적용 후 확인:
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'user_goals_goal_type_check';
