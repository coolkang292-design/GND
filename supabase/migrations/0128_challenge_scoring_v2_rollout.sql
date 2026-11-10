-- 0128: 랭킹 v2 적용 (2026-11-11 사용자 결정: 진행 중·설정 단계 챌린지 + 앞으로 만들 챌린지)
--
-- ⛔ 이 파일은 **기존 행을 바꾼다** — CLAUDE.md §DB 마이그레이션 '멈춘다' 목록(기존 행 UPDATE).
--    **앱(랭킹 v2 코드)이 배포된 뒤에, 사용자 승인을 받고** 적용한다. 먼저 돌리면 옛 앱이
--    v2 챌린지를 v1 규칙으로 줄 세운다(점수는 같고 동점 처리만 다르다).
--
-- 적용 범위:
--   · 새로 만들어지는 챌린지 → 기본값 2 (아래 alter ... set default)
--   · status in ('setup','active') 인 기존 챌린지 → 2
--   · status = 'ended' · 'cancelled' → **건드리지 않는다**(1 유지). 확정된 순위가 바뀌면 안 된다.
--
-- 되돌리기: update public.challenges set scoring_version = 1 where status in ('setup','active');
--           alter table public.challenges alter column scoring_version set default 1;

alter table public.challenges alter column scoring_version set default 2;

update public.challenges
   set scoring_version = 2
 where status in ('setup', 'active')
   and scoring_version = 1;

-- 확인(적용 후):
-- select status, scoring_version, count(*) from public.challenges group by 1, 2 order by 1, 2;
--   기대: ended·cancelled 는 전부 1, setup·active 는 전부 2
-- select column_default from information_schema.columns
--  where table_name = 'challenges' and column_name = 'scoring_version';  -- 2
