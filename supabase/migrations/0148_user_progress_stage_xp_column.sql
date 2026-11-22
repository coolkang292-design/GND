-- 0148: user_progress.stage_xp — 단계별 경험치 방식의 캐시 칸 (비파괴 추가).
--
-- 의미: 현재 단계에 들어온 뒤 쌓은 경험치(`xp_transactions` 합, 단계 진입 시각 이후).
--       **null = 아직 옛 방식**(누적 경험치로 레벨 계산). 앱은 null이면 지금과 똑같이 그린다.
--
-- 이 파일은 칸만 만든다. 값 채우기와 함수 교체는 0149에서 **한 번에** 한다
-- (채우기만 먼저 하면 옛 `apply_xp_and_progress`가 값을 갱신하지 않아 낡은 값이 보인다).
-- 설계: docs/superpowers/plans/2026-11-22-evolution-mission-and-stage-xp.md §3
--
-- 읽기 권한: `authenticated`는 이 테이블에 테이블 단위 SELECT가 있고(RLS 본인 행) 새 칸도 포함된다.

alter table public.user_progress add column if not exists stage_xp integer;
comment on column public.user_progress.stage_xp is '현재 단계에 들어온 뒤 쌓은 경험치(단계별 경험치 방식). null = 아직 옛 방식(누적 경험치로 레벨 계산). 0148';
