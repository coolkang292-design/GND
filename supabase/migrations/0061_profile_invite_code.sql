-- 0061: 친구 초대 링크 — 코드의 주인을 그룹에서 **사람**으로 옮긴다
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0060은 수정 금지.
-- 설계: docs/superpowers/specs/2026-08-08-friend-invite-identity-onboarding-design.md §3
--
-- ── 왜 필요한가 (사용자 지적 2026-08-08) ──────────────────────
--
-- 홈의 "친구 초대하기" 버튼이 복사하는 링크는 `/invite/<코드>`이고, 거기 실린 코드는
-- `groups.invite_code` — **그룹의 것**이다. 그래서 링크를 연 사람은
-- `join_group_with_code`를 타고 `group_members`에만 들어간다(0001 → 현행 1600행).
-- `crew_links`는 **한 줄도 건드리지 않는다.**
--
-- 친구 목록의 원천은 `get_my_crew()` → `crew_links`다. 즉 링크로 들어온 사람은
--   ✅ 같은 그룹에 들어와 챌린지를 함께할 수 있고
--   ❌ 친구 목록에는 안 나타나며 서로 콕도 못 찌른다(poke_user가 not_crew로 막는다)
--
-- 이름은 "친구 초대"인데 동작은 그룹(=챌린지 크루) 초대였다. 문구를 고쳐서는
-- 풀리지 않는다 — **코드 주인이 그룹이라서 생긴 정확한 결과**이기 때문이다.
-- 그래서 사람에게 코드를 준다.
--
-- ── Run 시점 ────────────────────────────────────────────────
-- **지금 돌려도 안전하다.** 새 컬럼·새 함수뿐이고, 운영에 떠 있는 앱은
-- `profiles.invite_code`를 읽지 않는다. backfill도 옛 앱에 보이지 않는다.
-- 0062·0063과 함께 돌려도 된다.

begin;

-- ── 1. 컬럼 ─────────────────────────────────────────────────
--
-- ⚠️ 형식을 `groups.invite_code`와 **같게** 둔다(`GND-XXXXX`). 링크 모양을 바꾸면
--    카카오톡에 이미 뿌려진 옛 링크와 새 링크가 눈으로 구별돼 사용자가 헷갈린다.
--    대신 발급할 때 `groups.invite_code`와도 대조해 **전역 유일**을 보장한다 —
--    그래야 `/invite/[code]`가 "친구 코드인가 그룹 코드인가"를 헷갈리지 않는다.
alter table public.profiles
  add column if not exists invite_code text;

create unique index if not exists profiles_invite_code_unique
  on public.profiles (invite_code)
  where invite_code is not null;

-- ── 2. 발급 (멱등) ──────────────────────────────────────────
--
-- 화면이 카드를 그릴 때마다 부른다. 이미 있으면 그대로 돌려주므로 코드가 바뀌지
-- 않는다 — 바뀌면 사용자가 어제 보낸 링크가 죽는다.
create or replace function public.issue_my_invite_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me   uuid := (select auth.uid());
  v_code text;
  i      int;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select invite_code into v_code from public.profiles where id = v_me;
  if v_code is not null then return v_code; end if;

  -- 프로필이 없으면 코드를 붙일 곳이 없다. 온보딩을 먼저 마쳐야 한다.
  if not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'no_profile';
  end if;

  for i in 1..10 loop
    v_code := public.generate_invite_code();

    -- ⚠️ 그룹 코드와 겹치면 버린다. 겹친 채로 두면 `/invite/[code]`가 친구 코드를
    --    먼저 찾으므로 그 그룹의 초대 링크가 **조용히 친구 초대로 바뀐다.**
    if exists (select 1 from public.groups where invite_code = v_code) then
      continue;
    end if;

    begin
      update public.profiles set invite_code = v_code where id = v_me;
      return v_code;
    exception when unique_violation then
      -- 같은 코드를 다른 사람이 먼저 가져갔다(31^5 공간이라 드물다). 다시 뽑는다.
      null;
    end;
  end loop;

  raise exception 'code_generation_failed';
end $$;

revoke all on function public.issue_my_invite_code() from public, anon;
grant execute on function public.issue_my_invite_code() to authenticated;

-- ── 3. 수락 ─────────────────────────────────────────────────
--
-- ⚠️ **요청/수락을 다시 묻지 않는다.** 링크를 보낸 것이 초대 의사이고 링크를 연
--    것이 수락이다. `send_crew_request`를 거치게 하면 초대한 사람이 자기가 부른
--    사람의 요청을 또 수락해야 한다.
--
-- 골격은 `accept_crew_request`(0038, 현행 60행~)를 그대로 따른다. 특히 advisory
-- lock을 빼지 마라 — 서로의 링크를 동시에 열 때 락 순서가 엇갈려 40P01 데드락이 난다.
create or replace function public.accept_friend_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me         uuid := (select auth.uid());
  v_owner      uuid;
  v_owner_nick text;
  v_my_nick    text;
  v_existed    boolean;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select id, nickname into v_owner, v_owner_nick
  from public.profiles
  where invite_code = upper(trim(p_code));

  -- ⚠️ 이 예외 이름을 바꾸지 마라. `/invite/[code]`가 이 코드를 보고 **옛 그룹
  --    코드로 재시도**한다(하위 호환). 이름이 바뀌면 카카오톡에 뿌려진 옛 링크가
  --    전부 "잘못된 초대"가 된다.
  if not found then raise exception 'invalid_friend_code'; end if;
  if v_owner = v_me then raise exception 'self_invite'; end if;

  perform pg_advisory_xact_lock(
    hashtext(least(v_me, v_owner)::text || greatest(v_me, v_owner)::text)
  );

  -- 이미 친구였는지 **먼저** 본다. insert 뒤에 보면 항상 true다 —
  -- 알림을 두 번 보내지 않으려면 이 순서여야 한다.
  select exists (
    select 1 from public.crew_links
    where user_a = least(v_me, v_owner) and user_b = greatest(v_me, v_owner)
  ) into v_existed;

  insert into public.crew_links (user_a, user_b)
  values (least(v_me, v_owner), greatest(v_me, v_owner))
  on conflict do nothing;

  -- 반대 방향에 남아 있던 pending 요청도 닫는다. 안 닫으면 이미 친구가 된 뒤에도
  -- 받은함에 "수락" 버튼이 남는다 (accept_crew_request와 같은 규약).
  update public.crew_requests
     set status = 'accepted', responded_at = now()
   where status = 'pending'
     and ((requester_id = v_me and addressee_id = v_owner)
       or (requester_id = v_owner and addressee_id = v_me));

  if not v_existed then
    select nickname into v_my_nick from public.profiles where id = v_me;
    -- 알림 실패가 연결까지 되돌리면 안 된다. 연결이 본체고 알림은 곁가지다.
    -- (0029에서 알림 insert 하나가 운동 완료 트랜잭션을 통째로 롤백시킨 전례가 있다.)
    begin
      perform public.notify(
        v_owner, v_me, 'crew_accepted', null,
        coalesce(v_my_nick, '누군가') || '님과 크루가 됐어요 🤝',
        '초대 링크로 들어왔어요. 이제 서로의 운동 소식을 받아볼 수 있어요'
      );
    exception when others then null;
    end;
  end if;

  return jsonb_build_object(
    'ownerId', v_owner,
    'nickname', v_owner_nick,
    'alreadyFriends', v_existed
  );
end $$;

revoke all on function public.accept_friend_invite(text) from public, anon;
grant execute on function public.accept_friend_invite(text) to authenticated;

-- ── 4. 기존 프로필 backfill ─────────────────────────────────
--
-- 화면이 `issue_my_invite_code()`를 부르므로 없어도 동작하지만, 미리 채워 두면
-- 첫 방문에서 쓰기 없이 카드가 그려진다.
do $$
declare
  r      record;
  v_code text;
  i      int;
begin
  for r in select id from public.profiles where invite_code is null loop
    for i in 1..20 loop
      v_code := public.generate_invite_code();
      if exists (select 1 from public.groups   where invite_code = v_code)
      or exists (select 1 from public.profiles where invite_code = v_code) then
        continue;
      end if;
      update public.profiles set invite_code = v_code where id = r.id;
      exit;
    end loop;
  end loop;
end $$;

commit;

-- PostgREST 스키마 캐시 리로드. 새 함수라 이게 없으면 앱이 PGRST202로 받는다.
notify pgrst, 'reload schema';

-- 적용 확인 (SQL Editor에서 따로 실행):
--
--   -- ① 모든 프로필에 코드가 붙었는가 (0이어야 한다)
--   select count(*) from profiles where invite_code is null;
--
--   -- ② 그룹 코드와 겹치는 것이 없는가 (0이어야 한다)
--   select count(*) from profiles p join groups g on g.invite_code = p.invite_code;
--
--   -- ③ 함수 2개가 생겼는가
--   select proname from pg_proc
--   where proname in ('issue_my_invite_code', 'accept_friend_invite');
--
--   -- ④ 코드 목록 (화면에서 눈으로 대조할 값)
--   select nickname, invite_code from profiles order by nickname;
