-- 0091: 참가자도 초대 링크를 쓴다 + 신입은 **실제로 초대한 사람**과 크루가 된다
-- 지시: 사장님 2026-08-31
--   *"챌린지 모집에서 방장 말고 유저가 참여를 하고 참여한 유저가 다른 사람에게
--     초대를 할 수 있게 초대 링크를 복사할 수 있게"*
--   *"실제로 초대한 사람과 크루가 되는데…"*
-- 적용: Supabase Dashboard -> SQL Editor에 전체 붙여넣고 Run (1회만).
--       0001~0090은 수정하지 않는다.
--
-- ⚠️ **앱 배포보다 먼저 Run 해도 안전하다.** 옛 클라이언트는 `p_inviter`를 안
--    보내고, 그러면 지금까지처럼 방장과 연결된다(기본값 null → 방장 폴백).
--
-- ── 왜 두 가지를 한 파일에 담았나 ────────────────────────────
--
-- 따로 하면 **화면이 거짓말을 하는 구간**이 생긴다. 초대 링크 아래 문구가
-- *"GND가 처음인 사람은 **나와** 친구가 돼요"* 인데, 이 약속은 지금까지
-- **링크를 방장만 쓸 수 있었기 때문에** 참이었다.
--
-- 참가자에게 링크만 먼저 열면, 참가자가 뿌린 링크로 들어온 신입이
-- **모르는 방장과** 친구가 되고 **정작 부른 사람과는 안 된다.** 부른 사람 화면에는
-- "나와 친구가 돼요"라고 쓰여 있는 채로. 그래서 같이 간다.
--
-- ── ⚠️ 초대자를 URL로 받는데, 그게 안전한 이유 ──────────────
--
-- 링크가 `/challenge?join=CODE&by=<uuid>` 가 된다. `by`는 **사용자가 고칠 수 있는
-- 값**이므로 그대로 믿으면 안 된다. 그래서 서버가 세 가지를 확인한다:
--
--   1. `by`가 **그 챌린지의 joined 참가자**인가        ← 핵심
--   2. `by`가 자기 자신이 아닌가
--   3. 아니면 지금까지처럼 **방장**으로 떨어진다
--
-- 최악의 경우는 "같은 방의 다른 참가자를 초대자로 지목하는 것"인데, 그 사람은
-- 어차피 이 신입과 같은 방에 있게 된다. 방 밖의 아무나와 친구가 되는 길은 없다.
--
-- 되돌리기 (순서가 있다)
--   ⓐ join_challenge_as_newcomer 를 0079 시점 정의(인자 1개)로 다시 만들고
--      **revoke ... from public, anon** 를 잊지 마라 (아래 ⚠️ 참조)
--   ⓑ drop function if exists public.join_challenge_as_newcomer(text, uuid);
--   ⓒ issue_challenge_invite_code 에 not_host 검사를 되살린다

begin;

-- ============================================================
-- 1) issue_challenge_invite_code — 방장 전용을 푼다
-- ============================================================
--
-- ⚠️ 푸는 것은 **`not_host` 한 줄뿐**이다. 나머지 관문은 그대로 둔다:
--      · 로그인했는가
--      · **이 챌린지의 참가자인가** (`is_challenge_participant`)
--      · `status = 'setup'` 인가
--    참가자 검사를 같이 풀면 아무나 남의 방 코드를 발급받는다.
--
-- ⚠️ 코드는 **챌린지당 하나**다(이미 있으면 그대로 돌려준다). 참가자마다 다른
--    코드를 발급하지 않는다 — 그러면 `challenges.invite_code` 한 칸으로는 못
--    담고, 누가 만든 코드인지 추적하려고 테이블이 하나 더 생긴다. 초대자 귀속은
--    아래 2)의 `p_inviter`로 푼다(코드가 아니라 링크가 나른다).
create or replace function public.issue_challenge_invite_code(p_challenge_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
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

  -- 0091: 방장 전용 해제. 방에 들어온 사람은 누구나 링크를 나눌 수 있다
  -- (카카오 단톡방·디스코드와 같은 방식, 사장님 결정 2026-08-31).

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

-- ============================================================
-- 2) join_challenge_as_newcomer — 초대자 귀속
-- ============================================================
--
-- ⚠️⚠️ **인자가 늘어서 `create or replace`로는 안 된다.** 시그니처가 바뀌면
--    Postgres는 replace가 아니라 **오버로드**를 만든다 — 옛 1인자 함수가 남아
--    계속 방장과 연결한다. 그래서 drop이 필요하고,
--    **drop하면 PUBLIC EXECUTE가 되살아난다**(인수인계서 함정 ⑤ — 0085에서
--    걷어낸 anon 권한이 부활해 0087이 다시 revoke해야 했다).
--    그래서 아래에 revoke를 **반드시** 붙인다.
drop function if exists public.join_challenge_as_newcomer(text);

create or replace function public.join_challenge_as_newcomer(
  p_code text,
  -- 링크가 나른 초대자. 못 믿는 값이라 아래에서 검증한다. null이면 방장 폴백.
  p_inviter uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_me        uuid := (select auth.uid());
  v_result    jsonb;
  v_challenge uuid;
  v_host      uuid;
  v_link_to   uuid;
  v_link_nick text;
  v_my_nick   text;
  v_via       text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  -- ── 신입 가드 ────────────────────────────────────────────
  --
  -- ⚠️ **참가 전에 센다.** 참가 뒤에 세면 challenge_participants가 1행이 되어
  --    조건이 뒤집히고, 그러면 누구든 이 함수로 친구가 될 수 있다 = D5다.
  --
  -- ⚠️ 두 조건 중 하나라도 빼지 마라.
  --    crew_links 0건  : 이미 친구가 있는 사람 = 기존 사용자
  --    participants 0건: 다른 챌린지에 있는 사람 = 0051이 신고한 바로 그 경우
  if exists (
    select 1 from public.crew_links
    where user_a = v_me or user_b = v_me
  ) then
    raise exception 'not_newcomer';
  end if;

  if exists (
    select 1 from public.challenge_participants where user_id = v_me
  ) then
    raise exception 'not_newcomer';
  end if;

  -- ── 참가 ─────────────────────────────────────────────────
  --
  -- ⚠️ 참가 절차를 **베끼지 않는다.** advisory lock · status='setup' 검사 ·
  --    upsert가 한 벌만 존재해야 한다. 이 저장소는 start_challenge를 세 곳에
  --    복사해 두고 0045~0047로 세 번 고친 전례가 있다.
  v_result := public.join_challenge_with_code(p_code);
  v_challenge := (v_result ->> 'challengeId')::uuid;

  -- ── 누구와 연결할 것인가 ─────────────────────────────────
  select cp.user_id into v_host
  from public.challenge_participants cp
  where cp.challenge_id = v_challenge and cp.role = 'host'
  order by cp.joined_at nulls last
  limit 1;

  -- 0091: 링크를 준 사람이 **그 방의 참가자로 확인되면** 그 사람과 잇는다.
  -- 확인 안 되면(위조·오타·옛 링크) 지금까지처럼 방장이다.
  v_link_to := null;
  v_via := 'host';
  if p_inviter is not null and p_inviter <> v_me then
    if exists (
      select 1 from public.challenge_participants
      where challenge_id = v_challenge
        and user_id = p_inviter
        and status = 'joined'
    ) then
      v_link_to := p_inviter;
      v_via := 'inviter';
    end if;
  end if;
  if v_link_to is null then
    v_link_to := v_host;
  end if;

  -- 방장도 초대자도 없는 방은 있을 수 없지만(create_challenge_room이 같은
  -- 트랜잭션에서 넣는다), 없으면 챌린지 참가만 하고 조용히 끝낸다.
  if v_link_to is null or v_link_to = v_me then
    return v_result || jsonb_build_object('crewLinked', 0);
  end if;

  perform pg_advisory_xact_lock(
    hashtext(least(v_me, v_link_to)::text || greatest(v_me, v_link_to)::text)
  );

  -- 0079: 출처는 '챌린지', 먼저 연 쪽은 링크를 준 사람이다.
  insert into public.crew_links (user_a, user_b, origin, initiated_by)
  values (least(v_me, v_link_to), greatest(v_me, v_link_to), 'challenge', v_link_to)
  on conflict do nothing;

  -- 0079: 위 신입 가드가 **crew_links 0건**을 이미 보장한다 —
  -- 이 경로로 온 사람은 정의상 신규라 여기서 다시 재지 않는다.
  update public.profiles
     set invited_by = v_link_to
   where id = v_me and invited_by is null;

  select nickname into v_link_nick from public.profiles where id = v_link_to;
  select nickname into v_my_nick   from public.profiles where id = v_me;

  -- 알림 실패가 연결·참가까지 되돌리면 안 된다.
  begin
    perform public.notify(
      v_link_to, v_me, 'crew_accepted', v_challenge,
      coalesce(v_my_nick, '누군가') || '님이 챌린지에 들어오고 친구가 됐어요 🤝',
      '초대 링크로 GND를 처음 시작했어요'
    );
  exception when others then null;
  end;

  return v_result || jsonb_build_object(
    'crewLinked', 1,
    'hostId', v_link_to,
    'hostNickname', v_link_nick,
    -- 화면이 "누구와" 친구가 됐는지 정확히 말할 수 있게 남긴다
    'linkedVia', v_via
  );
end $$;

-- ⚠️⚠️ **이 두 줄을 지우지 마라.** 위에서 drop을 했기 때문에 Postgres가
--    PUBLIC EXECUTE를 기본으로 다시 준다. 0085가 걷어낸 anon 권한이 그대로
--    부활하는 자리다(0087이 같은 이유로 다시 revoke했다).
revoke execute on function public.join_challenge_as_newcomer(text, uuid) from public, anon;
grant  execute on function public.join_challenge_as_newcomer(text, uuid) to authenticated;

commit;

-- ── 적용 확인 (Run 뒤에 따로 실행해서 눈으로 본다) ─────────────
--
-- 인자 2개짜리 하나만 남아야 한다 (옛 1인자가 남으면 방장 폴백이 계속된다):
-- select p.oid::regprocedure
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname='public' and p.proname='join_challenge_as_newcomer';
--
-- anon·public에 EXECUTE가 없어야 한다 (0행):
-- select a.rolname
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   cross join lateral aclexplode(p.proacl) acl
--   join pg_roles a on a.oid = acl.grantee
--  where n.nspname='public' and p.proname='join_challenge_as_newcomer'
--    and a.rolname in ('anon','public');
--
-- not_host가 사라졌는지:
-- select pg_get_functiondef('public.issue_challenge_invite_code(uuid)'::regprocedure)
--        like '%not_host%' as still_has_not_host;   -- false 여야 한다
