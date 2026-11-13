-- 0133의 평균 목표(average_pct)가 소수(.03·.05·.08·.10)로 들어갔다. 서버가 계산한 평균(averagePct)은 퍼센트 단위(예: 15.9)라서
-- "15.9 >= 0.05"로 비교되어 목표가 +3%가 아니라 +0.03%로 판정되고, 화면에도 "0.03%"로 표시됐다(2026-11-13 개발 화면 검증 중 발견).
-- 퍼센트 단위(3·5·8·10)로 바로잡고, 다시 소수로 들어가지 못하게 제약을 둔다.
-- 대상은 0133에서 만든 새 규칙표뿐이며 settings.enabled=false 동안 어떤 판정에도 쓰이지 않았다(기존 사용자 데이터 변경 없음).
update public.stage_evolution_rules
  set average_pct=average_pct*100
  where rule_version='stage_growth_v1' and mode='gated' and average_pct<1;
alter table public.stage_evolution_rules
  add constraint stage_evolution_rules_average_pct_percent check(average_pct is null or average_pct>=1);
