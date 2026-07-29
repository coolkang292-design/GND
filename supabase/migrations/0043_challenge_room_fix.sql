-- 0043: 0042 핫픽스 — create_challenge_room의 잘못된 컬럼명
-- 계획: docs/superpowers/plans/2026-07-30-challenge-rooms-0042.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0042는 수정 금지.
--
-- 0042의 create_challenge_room이 `order by gm.created_at`을 썼는데
-- group_members에는 그 컬럼이 없다. 실제 컬럼은 joined_at이다 (0001:32).
--   group_members: id · group_id · user_id · role · joined_at
-- 그래서 챌린지 생성이 42703 "column gm.created_at does not exist"로 실패했다.
--
-- 0042 적용 직후 검증 스크립트가 [1]에서 잡았다. 앱은 이 함수를 아직 부르지
-- 않으므로(0042는 추가만 하는 단계) 사용자 영향은 없었다.
--
-- ⚠ 이 파일은 "챌린지 방 전환" 단계가 아니다. 설계서 §7이 말하는 전환·정리는
--    번호가 하나씩 밀려 0044(전환)·0045(정리)가 된다.

begin;

create or replace function public.create_challenge_room(
  p_name text, p_start_date date, p_end_date date,
  p_photo_required boolean default true
) returns public.challenges
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_group uuid;
  c challenges;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_start_date > p_end_date then raise exception 'invalid_period'; end if;

  -- 0042는 challenges.group_id를 아직 못 지운다(not null). 0045에서 드롭할
  -- 때까지는 방장의 그룹을 그대로 채워 둔다 — 혼자모드 유저는 그룹이 없으므로
  -- 그때는 생성이 막힌다. 그 제약이 풀리는 건 0044·0045다.
  --
  -- ⚠ joined_at이다. created_at이 아니다 (0001:32). 0042가 여기서 틀렸다.
  select gm.group_id into v_group
  from group_members gm where gm.user_id = v_me
  order by gm.joined_at limit 1;                        -- 0043: created_at → joined_at
  if v_group is null then raise exception 'no_group_yet'; end if;

  insert into challenges (group_id, name, start_date, end_date, photo_required, created_by)
  values (v_group, p_name, p_start_date, p_end_date, p_photo_required, v_me)
  returning * into c;

  insert into challenge_participants (challenge_id, user_id, role, status, joined_at)
  values (c.id, v_me, 'host', 'joined', now());

  return c;
end $$;
revoke all on function public.create_challenge_room(text, date, date, boolean) from public, anon;
grant execute on function public.create_challenge_room(text, date, date, boolean) to authenticated;

commit;

-- PostgREST 스키마 캐시 리로드. 함수 본문만 바뀌었으므로 꼭 필요하진 않지만,
-- 0041에서 같은 자리에서 PGRST202를 겪었으니 습관으로 붙인다.
notify pgrst, 'reload schema';

-- 적용 확인 (SQL Editor에서 따로 실행):
--   select pg_get_functiondef(oid) from pg_proc where proname = 'create_challenge_room';
--   → 본문에 gm.joined_at이 있고 gm.created_at이 없어야 한다.
