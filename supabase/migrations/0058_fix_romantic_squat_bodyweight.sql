-- ============================================================
-- 0058: 낭만송곳니의 '스쿼트' 기록을 맨몸으로 정정
-- 적용: Supabase Dashboard → SQL Editor에 전체 붙여넣고 Run (1회만)
-- 0001~0057은 수정 금지.
--
-- 배경 (2026-08-04 조사) — 버그 신고 0783ca35
--   "맨몸 운동 횟수가 결과에 챌린지 값에 반영되지 않아요. 스쿼드 %가 올라가지 않아요"
--
-- 이 사용자의 챌린지 KPI는 맨몸 565.7회 · 맨몸 56.6분 · 유산소 113.1km로,
-- **웨이트 목표가 하나도 없다.** 그런데 챌린지 기간(2026-07-27~09-30)에
-- 기록한 스쿼트 100회가 전부 카탈로그의 '스쿼트'(exercise_type='weight')로
-- 들어가 bodyweight_reps가 계속 0이었다. 맨몸 %는 영원히 0이다.
--
-- 이것은 2026-08-01 스칼레또 건(0054 §2)과 **같은 원인의 재발**이다. 0054는
-- 그 사람의 과거 행만 UPDATE했고 앱 로직·화면은 그대로 뒀다. 이번 배포에서
-- 피커에 유형 뱃지·혼동 안내를 넣어(exercise-picker.tsx) 재발을 막는다.
--
-- ⚠️ 0054와 달리 "완료 세트가 전부 0kg" 가드를 쓰지 않는다. 2026-08-03 12:54
--    세션은 1kg이 실려 있어 그 가드에 안 걸리는데, 4분 전 12:50 세션(0kg,
--    같은 10회×4세트)을 사진 때문에 다시 기록한 중복분이라 실제로는 맨몸이다.
--    사용자가 직접 "이전 기록을 맨몸으로 정정해 달라"고 확인해 줬다(2026-08-04).
--
-- ⚠️ workout_sets는 건드리지 않는다. 맨몸 종목은 화면이 kg 칸을 아예 그리지
--    않으므로(exercise-card.tsx:38 `isWeight`) 남은 weight_kg는 보이지 않고,
--    workout_sets에는 `before insert or update` 트리거(0004:145)가 걸려 있어
--    굳이 건드릴 이유가 없다. workout_exercises에는 트리거가 없다.
-- ============================================================

-- ── 적용 전 확인 — **4행**이어야 한다 ────────────────────────
--   select s.completed_at, we.exercise_name, we.exercise_type
--   from workout_exercises we join workout_sessions s on s.id = we.session_id
--   where s.user_id = 'ac6c5b78-0318-4437-b244-cf22f051278e'
--     and we.exercise_name = '스쿼트';
--   → 2026-07-26 · 08-02 · 08-03 12:50 · 08-03 12:54

update public.workout_exercises we
set exercise_type = 'bodyweight',
    exercise_name = '맨몸 스쿼트',
    measure = 'reps'
from public.workout_sessions s
where we.session_id = s.id
  and s.user_id = 'ac6c5b78-0318-4437-b244-cf22f051278e'  -- 낭만송곳니
  and we.exercise_name = '스쿼트'
  and we.exercise_type = 'weight';

-- ── 적용 후 확인 ─────────────────────────────────────────────
-- 1) 위 4행이 전부 bodyweight/'맨몸 스쿼트'/measure='reps'가 됐는가
--   select s.completed_at, we.exercise_name, we.exercise_type, we.measure
--   from workout_exercises we join workout_sessions s on s.id = we.session_id
--   where s.user_id = 'ac6c5b78-0318-4437-b244-cf22f051278e'
--   order by s.completed_at;
--
-- 2) 챌린지 맨몸 실적 — **60회**여야 한다
--   기간(07-27~09-30) 안이고 사진이 있는 세션만 집계된다
--   (challenges.photo_required = true → get_challenge_period_sessions가 거른다):
--     08-02 12:05  0kg × 10 × 2세트 = 20회  사진 O  → 집계
--     08-03 12:54  1kg × 10 × 4세트 = 40회  사진 O  → 집계
--     08-03 12:50  0kg × 10 × 4세트 = 40회  사진 X  → 제외(사진 없음)
--     07-26 09:40  완료 세트 0개            기간 밖 → 제외
--   목표가 565.7회이므로 맨몸 횟수 달성률은 0% → 약 10.6%가 된다.
--
--   select coalesce(sum(ws.reps), 0) as bodyweight_reps
--   from workout_sets ws
--   join workout_exercises we on we.id = ws.workout_exercise_id
--   join workout_sessions s on s.id = we.session_id
--   join workout_images wi on wi.session_id = s.id
--   where s.user_id = 'ac6c5b78-0318-4437-b244-cf22f051278e'
--     and we.exercise_type = 'bodyweight'
--     and ws.is_completed
--     and (s.completed_at at time zone 'Asia/Seoul')::date
--         between '2026-07-27' and '2026-09-30';
--
-- 3) 되돌리려면 (exercise_type='weight', exercise_name='스쿼트', measure=null)

-- ── 손대지 않은 것 ───────────────────────────────────────────
-- · 저장된 루틴 3개('데일리운동용'·'1'·'풀패키지')에 아직 스쿼트(weight)가
--   들어 있다. 이번 배포의 **루틴 종목 수정(덮어쓰기)** 기능으로 사용자가
--   직접 고칠 수 있다 — 슬롯이 3/3으로 꽉 차 있어도 UPDATE라 통과한다.
-- · 08-03 12:50 중복 세션은 지우지 않았다. 실제로 한 운동이고, 사진이 없어
--   챌린지 집계에는 어차피 안 들어간다. 삭제는 사용자 확인이 필요하다.
