-- 0060: 지난 타바타 기록의 횟수를 채운다 (설계 2026-08-05)
--
-- ⚠️ **앱 배포 뒤에 Run한다.** 기존 행을 바꾸는 UPDATE다 (CLAUDE.md §DB 마이그레이션).
--    0059와 파일을 나눈 이유다.
--
-- 타바타 세트는 지금까지 reps=0으로 저장돼서 달력 상세가 언제나 "0회"였다.
-- 앞으로 기록되는 것은 앱이 채우고(tabataRepsForMinutes), 이미 쌓인 것은 여기서
-- 같은 규칙으로 채운다: 4분 → 2회 · 8분 → 4회 · 16분 → 8회.
-- (4분 = 30초 × 8라운드를 구성 운동 4개가 나눠 가진다.)
--
-- 알고 받는 대가: 타바타 종목은 bodyweight이라 챌린지의 '맨몸 횟수' 실적이
-- 소급해서 오른다 (4분 타바타 1건당 8회). 사용자 승인 사항이다 (2026-08-05).
--
-- 멱등하다 — `coalesce(ws.reps, 0) = 0` 조건이 이미 채운 행을 건드리지 않는다.

update public.workout_sets ws
   set reps = s.tabata_minutes / 2
  from public.workout_exercises we
  join public.workout_sessions s on s.id = we.session_id
 where ws.workout_exercise_id = we.id
   and s.tabata_minutes in (4, 8, 16)
   and coalesce(ws.reps, 0) = 0;

-- 확인용 — 실행 후 타바타 세트에 0회가 남아 있으면 안 된다 (0이 나와야 정상).
select count(*) as remaining_zero_tabata_sets
  from public.workout_sets ws
  join public.workout_exercises we on we.id = ws.workout_exercise_id
  join public.workout_sessions s on s.id = we.session_id
 where s.tabata_minutes in (4, 8, 16)
   and coalesce(ws.reps, 0) = 0;
