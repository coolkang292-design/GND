-- 0113: 인터벌 계획의 형식을 열 설명에 적는다 (설계 2026-09-29 §7)
-- 적용: 사용자가 Supabase SQL Editor에서 이 파일 전체를 한 번 Run한다.
--
-- ✅ 앱 배포 전후 아무 때나 Run해도 된다. 설명(comment)만 바꾼다 —
--    데이터·제약·권한·함수는 그대로다.
--
-- 왜: 계획은 앱 밖에서도 들어온다. ChatGPT가 플러그인으로 workout_plans에 직접
--     넣는다(2026-09-27, 16행). 그쪽은 앱 코드를 못 보고 **스키마만** 본다.
--     그래서 규칙을 스키마에 적는다. 전문은 docs/chatgpt-plan-rules.md.
--
-- ⚠️ "인터벌 계획은 종목 4개 이상" CHECK는 **넣지 않았다**:
--    ① 앱의 "지난 인터벌 기록 → 계획 복사"는 지워진 커스텀 종목이 있으면
--       1~3개로 저장한다(handleScheduleFromPast). 제약이 그 경로를 저장 실패로 바꾼다
--    ② scripts/workout-plan-test.mjs가 1종목짜리 인터벌 계획을 저장한다
--    ③ 얻는 것이 없다. 1~3개짜리는 시트가 빈칸(3/4)으로 열어 채우게 한다
--    "앞 4개가 인터벌인가"는 DB가 판정할 수 없다.

comment on column public.workout_plans.tabata_minutes is
  '인터벌(음원) 코스 분수 4|8|16. null이면 일반 계획. 값이 있으면 exercises 앞 4개가 '
  '인터벌 종목(각 1세트, 맨몸, 20초 운동/10초 휴식으로 번갈아 돈다)이고, 5번째부터는 '
  '인터벌이 끝난 뒤 같은 세션에서 이어서 하는 일반 종목이다. 인터벌 전에 할 운동은 '
  '같은 날 별도 계획(더 이른 scheduled_at)으로 넣는다. 종목 이름은 exercise_catalog에 '
  '있는 이름을 쓴다(docs/chatgpt-plan-rules.md).';

notify pgrst, 'reload schema';
