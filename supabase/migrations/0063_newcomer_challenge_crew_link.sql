-- 0063: 챌린지 링크로 들어온 **신규 가입자**를 방장과 친구로 잇는다
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0062는 수정 금지.
-- 설계: docs/superpowers/specs/2026-08-08-friend-invite-identity-onboarding-design.md §3.6
--
-- ── 사용자 질문 (2026-08-08) ────────────────────────────────
-- "GND 처음 조인하는 사람이라면 챌린지 초대한 사람과 친구도 되고 챌린지도 추가
--  되게 설계해야 하는 거 아닌가."
--
-- 실측: 지금은 챌린지 링크(/challenge?join=CODE)로 처음 온 사람이 닉네임을 정하고
-- 챌린지에 들어간 뒤 거기서 멈춘다. `crew_links` 0행이라
--   · 방장의 홈 친구 목록에 안 나타난다 (3명을 불러도 홈은 "친구 0명")
--   · 서로 콕을 못 찌른다 (poke_user가 not_crew로 막는다)
--   · 보이는 것은 그 챌린지 안의 닉네임과 랭킹뿐 (shares_challenge_with)
-- `join_challenge_with_code`의 반환값에 'crewLinked', 0이 **상수로 박혀 있는** 것이
-- 그 흔적이다.
--
-- ══════════════════════════════════════════════════════════════
-- ⚠️⚠️ 이 기능은 있었고, 사용자가 신고해서 0051이 지웠다. 무엇이 달라졌는지
--      읽지 않고 손대면 같은 사고를 다시 낸다.
-- ══════════════════════════════════════════════════════════════
--
-- 0051 헤더 인용:
--   사용자 신고 (2026-07-31): "리얼GND에 형이라는 아이디가 포함됨. 저 아이디는
--   다른 챌린지 멤버인데." → "각각의 챌린지별로 크루원을 따로 묶어야지, 기존
--   챌린지에 다른 챌린지 팀원을 묶으면 안 되지."
--
-- `D5`는 챌린지 링크 참가자 **전원**을 crew_links로 묶었고, crew_links에는
-- challenge_id가 없어 챌린지가 끝나도 남아 크루 목록에 낯선 사람이 쌓였다.
--
-- 이번 규칙은 두 군데가 다르다:
--
--   | | D5 (폐기) | 0063 |
--   |---|---|---|
--   | 대상 | 링크로 참가하는 **모든 사람** | **신규 가입자만** (참가 0 · 크루 0) |
--   | 연결 상대 | 참가자 **전원** | **방장 한 사람** |
--
-- 신규 가입자는 정의상 다른 챌린지에 있을 수 없다. **그래서 2026-07-31에 신고된
-- 실패(다른 챌린지 멤버가 내 크루에 섞임)가 구조적으로 발생하지 않는다.**
--
-- ⚠️ **가드가 이 설계의 본체다.** 가드를 지우면 그 순간 D5가 된다.
--    회귀 단언: "이미 다른 챌린지에 있는 계정이 같은 링크로 참가하면 방장의
--    크루 수가 그대로다." 이게 깨지면 D5가 되살아난 것이다.
--
-- ── Run 시점 ────────────────────────────────────────────────
-- **지금 돌려도 안전하다.** 새 함수 하나뿐이고, 운영에 떠 있는 앱은 이 함수를
-- 부르지 않는다(온보딩이 여전히 join_challenge_with_code를 쓴다).

begin;

create or replace function public.join_challenge_as_newcomer(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me        uuid := (select auth.uid());
  v_result    jsonb;
  v_challenge uuid;
  v_host      uuid;
  v_host_nick text;
  v_my_nick   text;
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
  --
  -- 여기서 예외가 나면(invalid_invite_code · invalid_status · already_joined)
  -- 트랜잭션 전체가 롤백된다 — **챌린지에 못 들어갔는데 친구만 된 상태가 없다.**
  v_result := public.join_challenge_with_code(p_code);
  v_challenge := (v_result ->> 'challengeId')::uuid;

  -- ── 방장과 연결 ──────────────────────────────────────────
  select cp.user_id into v_host
  from public.challenge_participants cp
  where cp.challenge_id = v_challenge and cp.role = 'host'
  order by cp.joined_at nulls last
  limit 1;

  -- 방장이 없는 방은 있을 수 없지만(create_challenge_room이 같은 트랜잭션에서
  -- 넣는다), 없으면 챌린지 참가만 하고 조용히 끝낸다. 친구 연결이 없다고 참가를
  -- 되돌릴 이유는 없다.
  if v_host is null or v_host = v_me then
    return v_result || jsonb_build_object('crewLinked', 0);
  end if;

  perform pg_advisory_xact_lock(
    hashtext(least(v_me, v_host)::text || greatest(v_me, v_host)::text)
  );

  insert into public.crew_links (user_a, user_b)
  values (least(v_me, v_host), greatest(v_me, v_host))
  on conflict do nothing;

  select nickname into v_host_nick from public.profiles where id = v_host;
  select nickname into v_my_nick   from public.profiles where id = v_me;

  -- 알림 실패가 연결·참가까지 되돌리면 안 된다.
  begin
    perform public.notify(
      v_host, v_me, 'crew_accepted', v_challenge,
      coalesce(v_my_nick, '누군가') || '님이 챌린지에 들어오고 친구가 됐어요 🤝',
      '초대 링크로 GND를 처음 시작했어요'
    );
  exception when others then null;
  end;

  return v_result || jsonb_build_object(
    'crewLinked', 1,
    'hostId', v_host,
    'hostNickname', v_host_nick
  );
end $$;

revoke all on function public.join_challenge_as_newcomer(text) from public, anon;
grant execute on function public.join_challenge_as_newcomer(text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- 적용 확인 (SQL Editor에서 따로 실행):
--
--   -- ① 함수가 생겼는가
--   select proname, pg_get_function_result(oid) from pg_proc
--   where proname = 'join_challenge_as_newcomer';
--   → jsonb
--
--   -- ② 가드가 본문에 있는가 (2여야 한다 — crew_links · challenge_participants)
--   select (length(pg_get_functiondef(oid))
--         - length(replace(pg_get_functiondef(oid), 'not_newcomer', ''))) / length('not_newcomer')
--   from pg_proc where proname = 'join_challenge_as_newcomer';
--
--   -- ③ 참가 절차를 베끼지 않았는가 — 본문이 join_challenge_with_code를 부른다
--   select pg_get_functiondef(oid) like '%join_challenge_with_code%'
--   from pg_proc where proname = 'join_challenge_as_newcomer';
--   → true
