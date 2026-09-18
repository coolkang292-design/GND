-- 0111 — 유산소 일수형 목표 `cardio_days` 허용 (사용자 지시 2026-09-18
--        "유산소 주간 횟수도 선택할 수 있게 해줘")
--
-- ⓘ 제약을 **넓히기만** 한다. 0108이 만든 10종은 하나도 빼지 않고, 기존 행은
--   건드리지 않는다(UPDATE 0줄). 다만 `drop constraint`가 들어가므로
--   CLAUDE.md §DB 마이그레이션에 따라 **사용자 승인 후** 적용한다.
--
-- ⛔ 적용 전에는 `cardio_days` 목표 저장이 `23514`로 막힌다. 화면에는 이미
--    `주간 횟수` 칸이 있으므로, **이 마이그레이션을 먼저 적용하고 배포한다.**
--
-- **왜 필요한가.** 일수형 목표(`*_days` = "그 분류 종목을 하루 N개 이상 한 날")가
--   웨이트·맨몸에만 있었다. 유산소는 거리·시간뿐이라 "유산소를 주 몇 번 하겠다"를
--   세울 수가 없었다 — 러닝을 주 3회 하겠다는 사람이 거리로 환산해야 했다.
--
-- **실적은 어떻게 세나.** `foldPeriodStats`가 날짜별 유산소 완료 **종목 수**를
--   `cardioKindsByDay`로 접고, `actualForGoal`이 웨이트·맨몸과 **같은 규칙**으로
--   (qualifier = 하루 최소 종목 수, 기본 1) 날 수를 센다. 사진 인증 필터는
--   `get_challenge_period_sessions`가 이미 건다.
--
-- ⚠️ 서버 SQL은 goal_type 종류를 보지 않는다(목표 존재 여부만 본다). 트리거
--    `enforce_goal_raise_only`도 "종류를 바꾸지 마라"만 본다. 그래서 0108과 똑같이
--    **이 제약 하나만 넓히면 된다.**
--
-- 적용 전 운영 실측이 필요하면:
--   select goal_type, count(*) from public.user_goals group by 1 order by 2 desc;

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
      'cardio_days'    -- 0111: 유산소 운동일 (하루 N종목+)
    ]::text[])
  );

commit;

-- 적용 후 확인 (⚠️ `pnpm db:snapshot`은 CHECK 제약을 안 담는다 — 이걸로 본다):
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'user_goals_goal_type_check';
-- 기존 행이 그대로인지:
--   select count(*) from public.user_goals;
