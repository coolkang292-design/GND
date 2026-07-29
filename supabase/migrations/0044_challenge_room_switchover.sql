-- 0044: 챌린지 방 전환 — 개수 제한 해제 + 읽기 경계를 참가자에게 확대
-- 계획: docs/superpowers/plans/2026-07-30-challenge-rooms-0044.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0043은 수정 금지.
--
-- 이 파일은 **점수를 바꾸지 않는다.** 완료 보너스(+3→+9)와 랭킹 RPC 이관은
-- 진행 중 챌린지가 끝난 뒤 0045에서 한다. 여기서 하는 것은 두 가지다.
--
--   1. challenges_one_live 드롭 — 여러 챌린지 동시 진행이 풀리는 지점
--   2. challenges·user_goals의 SELECT를 참가자에게도 연다 (덧붙이기만)
--
-- 왜 2가 필요한가: 0042의 invite_to_challenge는 대상에게 프로필만 있으면
-- 초대한다(그룹 검사 없음). 서버는 이미 타 그룹 초대를 허용하는데 읽기 정책이
-- 그룹 기준 한 줄뿐이라, 초대받은 사람이 챌린지 행도 목표도 못 읽는다.
-- "한 사람이 여러 크루·여러 챌린지"라는 목적이 그 한 줄에 막혀 있었다.
--
-- 기존 같은 그룹 사용자에게는 판정 결과가 그대로다(OR로 덧붙이기만 하므로
-- 참이던 것이 거짓이 되지 않는다) — 가시성·점수 회귀가 없다.

begin;

-- ── 1. 챌린지 개수 제한 해제 ─────────────────────────────────
-- 0006:23이 만든 "크루당 살아있는 챌린지 1개" 유니크 인덱스.
-- 이걸 지우는 것이 이 마이그레이션의 본체다.
drop index if exists public.challenges_one_live;

-- ── 2. 읽기 경계를 참가자에게 확대 ───────────────────────────
-- is_challenge_participant(cid, uid)는 0042:64가 만들어 뒀다.
-- ⚠ 정책 이름을 정확히 써야 한다. 틀리면 drop이 조용히 no-op 하고 옛 정책이
--    그대로 살아남아 확대가 무효가 된다 (0039에서 실제로 겪은 계열의 사고).
drop policy if exists "challenges_select_member" on public.challenges;
create policy "challenges_select_member" on public.challenges
  for select using (
    public.is_challenge_participant(id, auth.uid())   -- 0044: 초대·참가자
    or public.is_group_member(group_id, auth.uid())   -- 0045에서 제거
  );

drop policy if exists "goals_select_member" on public.user_goals;
create policy "goals_select_member" on public.user_goals
  for select using (
    public.is_challenge_participant(challenge_id, auth.uid())  -- 0044
    or public.is_group_member(group_id, auth.uid())            -- 0045에서 제거
  );

commit;

-- PostgREST 스키마 캐시 리로드. 0041에서 같은 자리에서 PGRST202를 겪었다.
notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) 인덱스가 사라졌는가 — 0행이어야 한다
--   select indexname from pg_indexes
--   where schemaname='public' and indexname='challenges_one_live';
--
-- (2) 정책이 확대됐는가 — qual에 is_challenge_participant가 있어야 한다
--   select tablename, policyname, qual from pg_policies
--   where schemaname='public' and policyname in
--     ('challenges_select_member','goals_select_member');
--
-- (3) 진행 중 챌린지의 점수 원천이 그대로인가 — 목표 9개가 그대로 보여야 한다
--   select count(*) from user_goals ug
--   join challenges c on c.id = ug.challenge_id where c.status='active';
