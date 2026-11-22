-- 0147: 운동 습관 규칙 숫자를 "누적"에서 "이 단계에서 새로"로 바꾼다. 0146과 함께 적용한다.
--
-- ⚠️ 기존 행을 바꾸는 UPDATE — 사용자 승인 후 적용 (CLAUDE.md §DB 마이그레이션).
--
-- 근거: 0146 이후 days/weeks/recent는 단계 진입 후만 센다. 옛 숫자(36·60일, 40·60주)는 누적
--       기준이라 그대로 두면 한 단계에 40~60주가 필요해진다. 반대로 옛 규칙이 실제로 요구한
--       "이 단계 몫"은 작았다(오뎅끼데스까 4→5: 누적 60일 − 진입 시 47일 = 13일).
--       실제 기록: 4단계 구간 31일 / 6.4주(주 4.8일). 새 숫자는 그보다 높다.
--
--   목표단계  운동일(days)       경과 주(weeks)   대체 경로
--   4         36 → 20  (alt 54 → 30)
--   5                            경과 10주 (운동일 방식 → 주 방식, alt 90 → 36일)  ← 사용자 지정
--   6                            40 → 12
--   7                            60 → 20
--
-- ⚠️ 이 숫자는 초안이다([미검증]). 6·7단계는 도달한 사람이 없어 근거가 없다.
--    성장 조건(average_pct·growth_ratio)과 recent_days는 건드리지 않는다.
--    rule_version은 올리지 않는다(기준 기록 무효화 방지).

update public.stage_evolution_rules set workout_days=20, alt_days=30
  where rule_version='stage_growth_v1' and target_stage=4;
-- 5단계: 사용자 지시(2026-11-22) "24일이 아니라 10주". 운동일 합계(days) 방식에서
-- 이 단계 진입 후 경과 주(weeks) 방식으로 바꾼다. 대체 경로(운동일 36일, 꾸준함 면제)는 유지.
update public.stage_evolution_rules set habit_kind='weeks', elapsed_weeks=10, workout_days=0, alt_days=36
  where rule_version='stage_growth_v1' and target_stage=5;
update public.stage_evolution_rules set elapsed_weeks=12
  where rule_version='stage_growth_v1' and target_stage=6;
update public.stage_evolution_rules set elapsed_weeks=20
  where rule_version='stage_growth_v1' and target_stage=7;
