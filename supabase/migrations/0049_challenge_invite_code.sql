-- 0049: 챌린지 초대 링크 — 코드 발급 + 코드로 참가
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0048은 수정 금지.
--
-- 왜: 닉네임 초대(0042 invite_to_challenge)는 상대의 닉네임을 **정확히** 알아야
-- 한다. 크루 밖 사람을 부르려면 어차피 밖에서 연락해야 하는데, 그 김에 링크를
-- 보내는 편이 자연스럽다. 크루 초대코드(0001 GND-XXXXX)와 같은 방식이다.
--
-- 확정된 설계 (사용자 결정 2026-07-31)
--   · 링크로 열면 **바로 joined** — 방장 승인 없음. 크루 초대코드와 같다
--   · **setup일 때만** 유효 — active가 되면 막힌다. 0042의 accept_challenge_invite가
--     이미 중도 합류를 막고 있어 규칙이 일치한다
--   · **인원 상한 없음** — 챌린지 개수에 상한이 없는 것과 같은 결
--
-- ⚠ 링크로 들어온 사람은 기존 참가자 전원과 crew_links가 맺어진다(설계 D5).
--    그래야 랭킹판에서 서로 닉네임이 보인다(profiles SELECT가 크루 기준).
--    부작용으로 **챌린지가 끝나도 피드·프로필·운동 알림이 서로 열린 채 남는다.**
--    crew_links에는 challenge_id가 없어 챌린지별로 끊을 수 없고, 해제는
--    remove_crew로 수동이다. 설계서 §9가 "공개 챌린지를 도입하면 D5를 재검토하라"고
--    적어 둔 지점이 여기다. 화면에도 이 사실을 한 줄로 띄운다.
--
-- ⚠ 진행 중인 7월 GND 챌린지에는 영향이 없다. 컬럼 추가는 기존 행을 건드리지
--    않고, 코드가 null이면 링크가 없는 것뿐이다(닉네임 초대는 그대로 된다).

begin;

-- ── 1. 초대 코드 컬럼 ────────────────────────────────────────
-- nullable이다. 기존 챌린지에는 코드가 없고, 필요할 때 발급한다.
-- 그룹 코드와 한 네임스페이스를 쓰지 않으므로 groups.invite_code와 값이 겹쳐도
-- 무해하다 — 조회하는 테이블이 다르다.
alter table public.challenges add column if not exists invite_code text;

-- 부분 유니크: 코드가 있는 행끼리만 중복을 막는다.
create unique index if not exists challenges_invite_code_key
  on public.challenges (invite_code) where invite_code is not null;

-- ── 2. 코드 발급 (host · setup 단계만) ───────────────────────
-- 멱등이다. 이미 있으면 그대로 돌려준다 — 다시 누를 때마다 코드가 바뀌면
-- 먼저 보낸 링크가 죽는다.
create or replace function public.issue_challenge_invite_code(p_challenge_id uuid)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  c challenges;
  v_code text;
  i int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into c from challenges where id = p_challenge_id for update;
  if not found or not public.is_challenge_participant(p_challenge_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;
  if not exists (
    select 1 from challenge_participants
    where challenge_id = p_challenge_id and user_id = auth.uid() and role = 'host'
  ) then
    raise exception 'not_host';
  end if;

  if c.invite_code is not null then return c.invite_code; end if;

  -- 유니크 충돌은 32^5 = 3355만 분의 1이지만, 났을 때 조용히 실패하면 안 되므로
  -- 몇 번 다시 뽑고 그래도 안 되면 예외를 낸다.
  for i in 1..10 loop
    v_code := public.generate_invite_code();
    begin
      update challenges set invite_code = v_code where id = p_challenge_id;
      return v_code;
    exception when unique_violation then
      -- 다음 루프에서 다시 뽑는다
    end;
  end loop;
  raise exception 'code_generation_failed';
end $$;
revoke all on function public.issue_challenge_invite_code(uuid) from public, anon;
grant execute on function public.issue_challenge_invite_code(uuid) to authenticated;

-- ── 3. 코드로 참가 ───────────────────────────────────────────
-- accept_challenge_invite(0042)와 같은 D5 완전 연결을 한다. 다른 점은 초대장이
-- 미리 있어야 하는지 여부뿐이다 — 링크는 초대장 없이 바로 들어온다.
create or replace function public.join_challenge_with_code(p_code text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  c challenges;
  v_row challenge_participants;
  v_other uuid;
  v_linked int := 0;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into c from challenges where invite_code = upper(trim(p_code));
  if not found then raise exception 'invalid_invite_code'; end if;

  -- 참가자 목록을 읽고 쓰는 동안 다른 사람이 같은 링크로 들어오면 crew_links가
  -- 한쪽만 생기거나 락 순서가 엇갈려 데드락이 난다. 0042 accept와 같은 방식으로
  -- 챌린지 단위 락을 잡는다.
  perform pg_advisory_xact_lock(hashtext(c.id::text));

  -- 락을 잡은 뒤 상태를 다시 읽는다. 그 사이 시작됐을 수 있다.
  select * into c from challenges where id = c.id;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  select * into v_row from challenge_participants
  where challenge_id = c.id and user_id = v_me for update;
  if found and v_row.status = 'joined' then
    raise exception 'already_joined';
  end if;

  -- 크루 연결을 먼저 만든다. 내 행을 joined로 바꾼 뒤에 돌면 자기 자신이
  -- 목록에 들어와 crew_links_not_self 위반이 된다 (0042와 같은 이유).
  for v_other in
    select user_id from challenge_participants
    where challenge_id = c.id and status = 'joined' and user_id <> v_me
  loop
    insert into crew_links (user_a, user_b)
    values (least(v_me, v_other), greatest(v_me, v_other))
    on conflict do nothing;
    v_linked := v_linked + 1;
  end loop;

  -- 초대장이 이미 있으면(닉네임으로 초대해 뒀는데 링크로 들어온 경우) 그 행을
  -- 살려 쓴다. 없으면 새로 만든다. 어느 쪽이든 결과는 joined다.
  insert into challenge_participants (challenge_id, user_id, role, status, joined_at)
  values (c.id, v_me, 'member', 'joined', now())
  on conflict (challenge_id, user_id)
  do update set status = 'joined', joined_at = now();

  return jsonb_build_object(
    'status', 'joined', 'challengeId', c.id, 'challengeName', c.name,
    'crewLinked', v_linked
  );
end $$;
revoke all on function public.join_challenge_with_code(text) from public, anon;
grant execute on function public.join_challenge_with_code(text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) 컬럼·인덱스가 생겼는가
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='challenges' and column_name='invite_code';
--   select indexname from pg_indexes
--   where schemaname='public' and indexname='challenges_invite_code_key';
--
-- (2) 함수 두 개가 있는가
--   select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public'
--     and proname in ('issue_challenge_invite_code','join_challenge_with_code');
--
-- (3) 진행 중 챌린지는 그대로인가 — active 1건, 코드는 null
--   select name, status, invite_code from public.challenges where status='active';
