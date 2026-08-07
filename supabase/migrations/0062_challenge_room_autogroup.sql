-- 0062: 그룹이 없는 사람도 챌린지를 만들 수 있게 — 개인 그룹 자동 생성
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0061은 수정 금지.
-- 설계: docs/superpowers/specs/2026-08-08-friend-invite-identity-onboarding-design.md §3.4
--
-- ── 왜 필요한가 ─────────────────────────────────────────────
--
-- 0061이 초대 링크를 **친구 연결**로 바꾸면서, 링크로 들어온 사람은 이제 그룹에
-- 들어가지 않는다. 그런데 `create_challenge_room`(현행 0044판)은 방장이 어떤
-- 그룹에도 없으면 `no_group_yet`으로 거절한다:
--
--   select gm.group_id into v_group from group_members gm
--   where gm.user_id = v_me order by gm.joined_at limit 1;
--   if v_group is null then raise exception 'no_group_yet'; end if;
--
-- 그러면 **링크로 GND에 들어온 사람은 챌린지를 영영 만들 수 없다.** 화면 문구는
-- "홈에서 크루를 만들거나 참여해 주세요"인데, 0061 이후 홈에는 그 자리가 없다
-- (`NoCrewCard`를 지웠다 — 설계 §3.5).
--
-- ⚠️ **`challenges.group_id`를 지우는 것으로 풀지 마라.** 그 컬럼은 not null이고
--    `challenges` RLS 정책 두 개가 쓴다(현행 스냅샷 2657·2659행):
--      check : created_by = auth.uid() AND is_group_member(group_id, auth.uid()) ...
--      using : is_challenge_participant(id, auth.uid()) OR is_group_member(group_id, ...)
--    그리고 `record_views` 집계도 `c.group_id`로 두 사람의 공통 챌린지를 찾는다(2578).
--    컬럼을 드롭하면 이 셋을 전부 다시 설계해야 한다 — 이 지시의 범위를 훨씬 넘는다.
--    **채워 두는 쪽이 안전하다.**
--
-- 참가자 쪽은 손댈 것이 없다. `join_challenge_with_code`·`invite_to_challenge`는
-- 그룹을 **보지 않는다**(본문 확인). 그룹이 필요한 것은 방을 만드는 한 사람뿐이다.
--
-- ── Run 시점 ────────────────────────────────────────────────
-- **지금 돌려도 안전하다.** 그룹이 있는 사용자에게는 동작이 **완전히 동일**하고,
-- 그룹이 없는 사용자에게만 예외 대신 그룹이 생긴다. 옛 앱은 그 차이를 볼 수 없다.

begin;

-- ⚠️ 이 함수의 **현행 정의는 0044**였다. 0042 → 0043 → 0044로 세 번 덮어썼고
--    이 파일이 네 번째다. 파일에서 베끼지 말고 `docs/db-current-schema.sql`을 보라
--    (`pnpm db:snapshot`으로 갱신). 아래 본문은 0044판에 그룹 자동 생성만 더한 것이다.
create or replace function public.create_challenge_room(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_photo_required boolean default true
)
returns challenges
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_me    uuid := auth.uid();
  v_group uuid;
  c       challenges;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_start_date > p_end_date then raise exception 'invalid_period'; end if;

  -- ⚠ joined_at이다. created_at이 아니다 (0001:32). 0042가 여기서 틀렸다.
  select gm.group_id into v_group
  from group_members gm where gm.user_id = v_me
  order by gm.joined_at limit 1;

  -- 0062: 옛 동작은 여기서 `raise exception 'no_group_yet'`이었다.
  -- 이제는 본인용 그룹을 만들어 준다.
  --
  -- ⚠️ `create_group()`을 호출하지 않는다. 그 함수는 security definer가 아니고
  --    자체 재시도 루프를 갖고 있어, 정의자 함수 안에서 부르면 권한 맥락이
  --    섞인다. 여기서 직접 insert하고 코드 충돌만 재시도한다.
  --
  -- ⚠️ 이름을 사용자에게 묻지 않는다. 홈 카드가 그룹 이름을 **쓰지 않기로**
  --    이미 정했으므로(2026-08-07) 화면에 드러나지 않는다. 물으면 챌린지를
  --    만들려던 사람에게 무관한 질문을 강요하게 된다.
  if v_group is null then
    for i in 1..10 loop
      begin
        insert into groups (name, invite_code, owner_id)
        values ('내 크루', generate_invite_code(), v_me)
        returning id into v_group;
        exit;
      exception when unique_violation then
        if i >= 10 then raise; end if;
      end;
    end loop;

    insert into group_members (group_id, user_id, role)
    values (v_group, v_me, 'owner')
    on conflict (group_id, user_id) do nothing;
  end if;

  insert into challenges (group_id, name, start_date, end_date, photo_required, created_by)
  values (v_group, p_name, p_start_date, p_end_date, p_photo_required, v_me)
  returning * into c;

  insert into challenge_participants (challenge_id, user_id, role, status, joined_at)
  values (c.id, v_me, 'host', 'joined', now());

  return c;
end $function$;

commit;

notify pgrst, 'reload schema';

-- 적용 확인 (SQL Editor에서 따로 실행):
--
--   -- ① 함수 본문에 no_group_yet이 사라졌는가 (0이어야 한다)
--   select count(*) from pg_proc
--   where proname = 'create_challenge_room'
--     and pg_get_functiondef(oid) like '%no_group_yet%';
--
--   -- ② '내 크루'가 들어갔는가 (1이어야 한다)
--   select count(*) from pg_proc
--   where proname = 'create_challenge_room'
--     and pg_get_functiondef(oid) like '%내 크루%';
--
--   -- ③ 지금 그룹이 없는 프로필 수 — 이 사람들이 그동안 막혀 있었다
--   select count(*) from profiles p
--   where not exists (select 1 from group_members gm where gm.user_id = p.id);
