-- 0064: 챌린지를 만들 때 초대 코드도 같이 발급한다
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0063은 수정 금지.
--
-- ── 왜 필요한가 ─────────────────────────────────────────────
--
-- 초대 코드는 방장이 **`setup` 단계에서 `링크 만들기`를 눌러야만** 생겼다
-- (`issue_challenge_invite_code`가 `status <> 'setup'`이면 거절한다).
-- 그런데 그 버튼을 누르기 전에 챌린지를 시작하면 **코드를 영영 만들 수 없다.**
-- 참가도 `setup`에서만 되므로, 그 챌린지는 아무도 부를 수 없는 방이 된다.
--
-- 2026-08-08 실측 — 이게 이론이 아니라 실제로 벌어져 있었다:
--
--   active    invite_code=null   test
--   active    invite_code=null   개발 확인용 챌린지
--   active    invite_code=null   7월 GND 챌린지
--   cancelled GND-WMXHK 외 3개  (코드가 있는 건 전부 취소된 것뿐)
--
-- 즉 **참가 가능한 링크가 DB에 하나도 없었다.** 사용자가 챌린지 링크로 가입을
-- 시도했더니 `invalid_invite_code`가 났고, 화면은 "초대 링크를 다시 확인해
-- 주세요"라고만 해서 링크를 의심하며 시간을 썼다.
--
-- 방을 만드는 순간 코드를 넣어 두면 그 함정이 사라진다. **공정성 정책은 그대로다** —
-- 시작하면 `join_challenge_with_code`가 여전히 `invalid_status`로 막는다.
-- 바뀌는 것은 "링크 만들기를 깜빡해서 영영 못 부르는" 경우뿐이다.
--
-- ⚠️ `issue_challenge_invite_code`는 **그대로 둔다.** 이미 멱등이라
--    (`if c.invite_code is not null then return c.invite_code; end if;`)
--    코드가 미리 있으면 그걸 그대로 돌려준다. 두 곳에서 발급 규칙이 갈리지 않는다.
--
-- ⚠️ 기존 active 챌린지에 코드를 소급해 넣지 않는다. 어차피 `setup`이 아니라
--    참가가 안 되므로 넣어 봐야 죽은 링크만 늘어난다.
--
-- ── Run 시점 ────────────────────────────────────────────────
-- **지금 돌려도 안전하다.** 새로 만드는 챌린지에 컬럼 값이 하나 더 채워질 뿐이고,
-- 운영에 떠 있는 앱은 그 값을 읽어도(초대 시트) 동작이 같다 — 멱등이라 그렇다.

begin;

-- ⚠️ 이 함수의 **현행 정의는 0062**다. 0042 → 0043 → 0044 → 0062로 네 번
--    덮어썼고 이 파일이 다섯 번째다. 파일에서 베끼지 말고
--    `docs/db-current-schema.sql`을 보라(`pnpm db:snapshot`으로 갱신).
--    아래 본문은 0062판에 **코드 발급 한 덩어리만** 더한 것이다.
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
  v_code  text;
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

  -- 0064: 방을 만들 때 초대 코드를 같이 넣는다.
  --
  -- ⚠️ 유니크 충돌은 32^5분의 1이지만 조용히 넘기면 안 된다. 몇 번 다시 뽑고
  --    그래도 안 되면 예외를 낸다 — `issue_challenge_invite_code`와 같은 규칙이다.
  --    ⚠️ **코드를 못 뽑았다고 챌린지 생성을 통째로 실패시키지는 않는다.**
  --    코드는 나중에 초대 시트에서 다시 발급할 수 있지만(setup이면), 방이
  --    안 만들어지면 사용자는 아무것도 못 한다. 우선순위가 다르다.
  for i in 1..10 loop
    begin
      v_code := public.generate_invite_code();
      insert into challenges (
        group_id, name, start_date, end_date, photo_required, created_by, invite_code
      )
      values (v_group, p_name, p_start_date, p_end_date, p_photo_required, v_me, v_code)
      returning * into c;
      exit;
    exception when unique_violation then
      if i >= 10 then
        -- 코드 없이라도 방은 만든다. 초대 시트가 나중에 다시 시도한다.
        insert into challenges (
          group_id, name, start_date, end_date, photo_required, created_by
        )
        values (v_group, p_name, p_start_date, p_end_date, p_photo_required, v_me)
        returning * into c;
        exit;
      end if;
    end;
  end loop;

  insert into challenge_participants (challenge_id, user_id, role, status, joined_at)
  values (c.id, v_me, 'host', 'joined', now());

  return c;
end $function$;

commit;
