-- 0128 — "11월 챌린지 5만원빵" 낭만송곳니에게 **사이클 시간 목표를 추가**
--        (사용자 지시 2026-11-11: "사이클 목표를 추가시키는 거야" — 교체가 아니다)
--
-- 하는 일 (1행 추가, 기존 4개 목표는 하나도 안 건드린다):
--   + cycle_time 257분  (하루 20분 × 주 3회 × 30일÷7 = 257.1 → 257,
--                        앱이 "하루 20분 · 주 3회"로 만드는 값과 같다 — `buildGoalDrafts` 테스트가 묶는다)
--
-- ⚠️ 새 행을 넣는 **INSERT다 — 사용자 승인 후에만 적용한다.** 돈이 걸린 경기이므로 영향을 확인한다:
--   · 이 사람의 목표가 4개 → 5개가 된다. 사이클 달성률은 지금 42.5분 ÷ 257분 = 16.5%라서
--     목표 평균(달성 80점 몫)은 **내려간다**. 100%를 채우면 보너스 +3점이 붙을 수 있다.
--   · 사이클 운동 기록(11/9·11/10, 42.5분)이 소급해서 들어간다(챌린지 시작일부터 센다).
--   · ⚠️ 이 챌린지는 옛 규칙(시작일 < 2026-11-12)이라 **사이클 거리 16km가 기존 `cardio_distance`
--     45km 목표에도 계속 들어간다.** 같은 사이클이 두 목표에 모두 잡힌다(새 규칙 챌린지는 안 그렇다).
--     이중 반영을 없애려면 별도 결정이 필요하다(기존 거리 목표 교체 등) — 이 파일은 그걸 하지 않는다.
-- ⚠️ 0127(제약 확장)을 **먼저** 적용해야 한다 — 아니면 23514로 실패한다.
-- ⚠️ `user_goals`의 INSERT 트리거는 없다(UPDATE 트리거만 있다) — 알림이 나가지 않는다.
--    RLS는 마이그레이션 실행 권한이 우회한다(앱에서는 시작 후 목표 추가가 막혀 있다 — 그 규칙은 그대로).
-- ⚠️ 같은 (사용자, 챌린지, 종류)는 유니크라서 두 번 실행해도 두 번 들어가지 않는다 (`not exists` 가드).

insert into public.user_goals
  (user_id, challenge_id, group_id, goal_type, target_value, unit, planned_days, qualifier)
select g.user_id, g.challenge_id, g.group_id, 'cycle_time', 257, '분', g.planned_days, null
  from public.user_goals g
 where g.id = 'd8988309-7b8d-4c13-8412-ff63fb0c2d23'          -- 낭만송곳니의 workout_days 행 (소속·주 N회를 그대로 따른다)
   and g.challenge_id = '5a54034e-fbb0-4a4f-ace7-fad7e065c374'
   and g.goal_type = 'workout_days'
   and not exists (
     select 1 from public.user_goals x
      where x.user_id = g.user_id
        and x.challenge_id = g.challenge_id
        and x.goal_type = 'cycle_time'
   );
