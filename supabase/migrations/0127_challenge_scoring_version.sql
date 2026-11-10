-- 0127: 챌린지별 점수·동점 규칙 버전 (랭킹 v2, 2026-11-11 작업지시서)
--
--   1 = 기존 규칙 (종합점수 → 달성률 → 참여율 → 전목표 달성 시각 → 완료 목표 수)
--   2 = 기본 점수(소수 둘째 자리) 우선, 같을 때만 설정 목표 수 → 운동 시간 → 운동 횟수 (가산점 < 0.01점)
--
-- ⚠️ 이 파일은 **비파괴**다 — 칼럼 추가(기본값 1). 기존 행은 전부 1로 남는다.
--    "어떤 챌린지를 2로 올릴지"는 0128(기존 행 UPDATE, 배포 뒤 · 승인 후)이 한다.
-- ⚠️ 칼럼 권한을 따로 열지 않는다. 이 테이블은 칼럼 단위로 INSERT/UPDATE를 여는 규약이라
--    (0115 live_ranking 등) `authenticated`는 이 칼럼을 쓰거나 바꿀 수 없다 — 규칙은 서버만 정한다.
--    적용 후 has_column_privilege로 확인한다(아래).

alter table public.challenges
  add column if not exists scoring_version smallint not null default 1
  check (scoring_version in (1, 2));

comment on column public.challenges.scoring_version is
  '점수·동점 규칙 버전. 1=기존, 2=기본 점수 우선+동점자 가산점(0127). 서버만 정한다 — authenticated에 쓰기 권한 없음.';

-- 확인(적용 후):
-- select column_name, column_default, is_nullable from information_schema.columns
--  where table_name = 'challenges' and column_name = 'scoring_version';          -- default 1, NO
-- select has_column_privilege('authenticated', 'public.challenges', 'scoring_version', 'UPDATE'),
--        has_column_privilege('authenticated', 'public.challenges', 'scoring_version', 'INSERT'); -- f, f
-- select scoring_version, count(*) from public.challenges group by 1;             -- 전부 1
