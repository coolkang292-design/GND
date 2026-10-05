-- 0115: 챌린지 실시간 랭킹 공개 옵션 (2026-10-05 사용자 지시)
--
-- "챌린지 만들 때 실시간 랭킹 공개 설정을 옵션으로 두고, 랭킹 공개하면 진행 중에도 TOP 3를
--  노출하자." 사용자 결정(같은 날):
--   · 순위 기준은 **종합점수** — 종료 시상대(`scoreParticipant`)와 같은 계산
--   · 만들 때 고르고, **시작 전(setup)까지만** 방장이 바꿀 수 있다. 시작 후엔 고정
--   · 정보줄 마지막 칸은 `내 순위 N위`
--
-- ⚠️ 기본값은 false — 지금까지의 모든 챌린지(진행 중 비공개, 종료 후 공개)는 그대로다.
-- ⚠️ 서버의 데이터 공개 범위는 바뀌지 않는다. `get_challenge_period_sessions`는 이미
--    참가자 전원의 기간 세션을 참가자에게 준다(진행 중 비공개는 화면 규칙이었다).
--    이 칼럼은 그 화면 규칙을 방마다 켜고 끄는 스위치다.
--
-- 비파괴 변경만 담는다: 칼럼 추가(기본값 있음) · 칼럼 수정 권한 추가 · 새 트리거.

alter table public.challenges
  add column if not exists live_ranking boolean not null default false;

comment on column public.challenges.live_ranking is
  '진행 중 실시간 랭킹(TOP 3) 공개 여부. 만들 때 정하고 setup 동안만 방장이 바꾼다 (0115).';

-- 방장 수정 경로 — 기존 `challenges_update_creator` 정책(created_by = auth.uid())을 그대로 탄다.
-- 이 테이블은 칼럼 단위로 UPDATE를 열어 두는 규약이라(discoverable·name 등) 같은 식으로 연다.
grant update (live_ranking) on public.challenges to authenticated;

-- 시작 뒤에는 못 바꾼다 — 참가자가 보고 들어온 규칙을 중간에 바꾸지 않는다.
create or replace function public.guard_challenge_live_ranking()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.live_ranking is distinct from old.live_ranking
     and old.status <> 'setup' then
    raise exception 'live_ranking_locked'
      using hint = '실시간 랭킹 공개는 챌린지가 시작되기 전에만 바꿀 수 있어요';
  end if;
  return new;
end;
$$;

create trigger challenges_guard_live_ranking
  before update of live_ranking on public.challenges
  for each row execute function public.guard_challenge_live_ranking();
