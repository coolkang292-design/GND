-- 0057: 루틴 저장 슬롯 레벨 보상을 '준비 중' → 실사용으로 전환
-- 적용: SQL Editor에 전체 붙여넣고 Run (1회만). 0001~0056은 수정 금지.
-- 설계: docs/superpowers/specs/2026-08-02-routines-frequent-exercises-calendar-planning-design.md
--
-- ⚠️ **Run 시점이 중요하다. 루틴 기능(0056 + 앱 코드)이 운영에 배포된 뒤에
--    Run한다.** 0056과 함께 미리 돌리면, 아직 루틴을 쓸 수 없는 운영 앱의
--    '레벨 혜택'에 "운동 루틴 저장 슬롯 +1 — 해금됨"이 즉시 뜬다.
--
-- 0022가 이 두 줄을 'coming_soon'으로 심어 둔 이유가 바로 그거다:
--   "미구현 보상은 'coming_soon' (UI에서 "준비 중" 표시, 실사용 기능처럼
--    노출 금지)" — 0022_xp_level_system.sql:130
--
-- 그래서 테이블 생성(0056, 언제 돌려도 안전)과 이 전환을 파일로 나눴다.
-- 개발 서버 확인은 0056만으로 된다.
--
-- 백필은 필요 없다. components/profile/level-rewards.tsx:58이
--   reached = unlocks.has(key) || currentLevel >= r.level
-- 이므로, user_unlocks 행이 없는(= 이 보상이 걸린 레벨을 이미 지나온)
-- 사용자도 "해금됨"으로 바르게 뜬다.

update public.level_definitions
   set reward_status = 'active',
       reward_label = '운동 루틴 저장 슬롯 +1 (총 4개)'
 where reward_key = 'routine_slot_1';

update public.level_definitions
   set reward_status = 'active',
       reward_label = '운동 루틴 저장 슬롯 +1 (총 5개)'
 where reward_key = 'routine_slot_2';

-- ── 적용 확인 (Run 후 결과를 눈으로 볼 것) ───────────────────
-- 기대: routine_slot_1 = (12, active), routine_slot_2 = (27, active)
select reward_key, level, reward_status, reward_label
  from public.level_definitions
 where reward_key in ('routine_slot_1', 'routine_slot_2')
 order by level;
