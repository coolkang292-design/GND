-- 0095: 영구 크루 vs 챌린지 임시 소셜 (제품 규칙 분리)
--
-- ⛔ 무엇이 바뀌나 — **"누가 데려왔나"와 "누구와 영구 친구인가"를 가른다.**
--
--   친구 데려오기 링크 (홈)    → 영구 크루 O   (accept_friend_invite, 그대로 둔다)
--   챌린지 초대 링크 (챌린지)  → 영구 크루 X   (이번에 바뀐다)
--                                챌린지 참가 O · invited_by 기록 O
--                                active 동안만 임시 소셜 O
--
-- 왜 — 2026-08-31 운영 DB 전수 조회에서 **버그성 불일치**를 확인했다:
--   join_challenge_as_newcomer (신규) → crew_links 만든다  ⚠️
--   join_challenge_with_code   (기존) → 안 만든다
--   같은 링크인데 신규만 영구 친구가 됐다.
--
-- ⚠️⚠️ **추천 계보를 깨지 않는다.** 계보의 원장은 crew_links가 아니라
--    `profiles.invited_by`다. crew_links를 안 만들어도 invited_by는 그대로 쓴다 —
--    인플루언서 → 철수 → 영희 → 민수 계보가 챌린지 초대 지점에서 끊기면 안 된다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 임시 소셜 판정 helper
--
-- ⚠️ 기존 `shares_challenge_with`의 의미를 **바꾸지 않았다.** 그 함수는
--    ended·dropped에도 true다(최종 결과를 보여주려고 일부러 그렇다).
--    임시 소셜에 그걸 쓰면 챌린지가 끝나도 응원이 되어 규칙이 무너진다.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.shares_active_challenge_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select p_other is not null
     and p_other <> (select auth.uid())                              -- 자기 자신 제외
     and not public.is_blocked_between((select auth.uid()), p_other) -- 차단 양방향
     and exists (
       select 1
       from public.challenge_participants mine
       join public.challenge_participants theirs
         on theirs.challenge_id = mine.challenge_id
       join public.challenges c
         on c.id = mine.challenge_id
       where mine.user_id  = (select auth.uid())
         and theirs.user_id = p_other
         and mine.status   = 'joined'   -- dropped는 권한 없음
         and theirs.status = 'joined'
         and c.status      = 'active'   -- setup·ended·cancelled는 권한 없음
     )
$function$;

comment on function public.shares_active_challenge_with(uuid) is
  'active 챌린지의 유효 참가자인가 — 임시 소셜 권한. ended/cancelled/dropped/차단/자기자신은 false. shares_challenge_with(최종 결과용)와 섞지 마라. 0095';

revoke all on function public.shares_active_challenge_with(uuid) from public;
-- ⚠️ `from public`만으로는 anon이 안 빠진다. Supabase가 anon에 **직접** 부여한다.
revoke execute on function public.shares_active_challenge_with(uuid) from anon;
grant execute on function public.shares_active_challenge_with(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 챌린지 활동 피드 — **좁은 RPC 하나에 가둔다**
--
-- ⚠️ 0051의 설계 취지를 지킨다: 일반 테이블 RLS에 `OR 같은 챌린지`를 붙여
--    가시성을 넓히지 않는다. 챌린지 안에서만 쓰이는 RPC로 범위를 가둔다.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_challenge_activity(p_challenge_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  c      public.challenges;
  v_me   uuid := (select auth.uid());
  v_rows jsonb;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into c from public.challenges where id = p_challenge_id;
  if not found then raise exception 'challenge_not_found'; end if;

  -- ⚠️ active일 때만 연다. 끝나면 **상태 판정만으로** 권한이 사라진다
  --    (행을 지워서 권한을 없애지 않는다).
  -- ⚠️ 요청자가 지금 그 방의 유효 참가자여야 한다. 방의 존재를 숨기려고
  --    같은 오류로 뭉갠다(기존 관례와 같다).
  if c.status <> 'active' then raise exception 'challenge_not_found'; end if;
  if not exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = v_me and status = 'joined'
  ) then
    raise exception 'challenge_not_found';
  end if;

  select coalesce(jsonb_agg(row order by ord desc), '[]'::jsonb) into v_rows
  from (
    select
      coalesce(s.completed_at, s.started_at) as ord,
      jsonb_build_object(
        'session_id',   s.id,
        'user_id',      s.user_id,
        -- ⚠️ 개인정보 최소 — 닉네임·아바타까지다. 이메일·유입·초대코드는 주지 않는다.
        'nickname',     p.nickname,
        'avatar_url',   p.avatar_url,
        'status',       s.status,
        'title',        s.title,
        'workout_type', s.workout_type,
        'started_at',   s.started_at,
        'completed_at', s.completed_at,
        'has_photo',    exists (select 1 from public.workout_images wi where wi.session_id = s.id),
        'cheer_count',  (select count(*) from public.cheers ch where ch.session_id = s.id),
        'my_cheers',    (select count(*) from public.cheers ch
                          where ch.session_id = s.id and ch.sender_id = v_me),
        'is_mine',      s.user_id = v_me
      ) as row
    from public.workout_sessions s
    join public.challenge_participants cp
      on cp.user_id = s.user_id
     and cp.challenge_id = p_challenge_id
     and cp.status = 'joined'
    join public.profiles p on p.id = s.user_id
    where s.deleted_at is null
      and s.visibility = 'group'          -- 비공개 운동은 참가자에게도 안 연다
      and s.status in ('active', 'completed')
      -- ⚠️ 챌린지 기간의 운동만. 같은 챌린지를 한다고 3개월 전 기록까지 열지 않는다.
      --    창(-1일 ~ +2일)은 집계 함수와 같다 — 시간대 경계가 잘리지 않게.
      and coalesce(s.completed_at, s.started_at) >= (c.start_date - 1)::timestamptz
      and coalesce(s.completed_at, s.started_at) <  (c.end_date + 2)::timestamptz
      and not public.is_blocked_between(v_me, s.user_id)
    limit 200
  ) t;

  return v_rows;
end $function$;

comment on function public.get_challenge_activity(uuid) is
  'active 챌린지의 임시 소셜 피드. 기간 내·공개·미삭제 운동만, 유효 참가자만, 차단 제외. ended면 challenge_not_found. 0095';

revoke all on function public.get_challenge_activity(uuid) from public;
revoke execute on function public.get_challenge_activity(uuid) from anon;
grant execute on function public.get_challenge_activity(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 챌린지 초대의 영구 크루 자동 생성 제거
--
-- 남기는 것: 챌린지 참가 · 신입 가드 · 초대자 검증(by=<uuid>) · invited_by ·
--            알림 · 반환값(hostId·hostNickname·linkedVia)
-- 빼는 것  : crew_links insert · "친구가 됐어요" 문구
--
-- ⚠️ 이건 **구조를 바꾸는 변경**이라 본문 전체를 다시 쓴다.
--    (긴 함수에 한 줄만 끼우는 send_cheer와 다르다 — 아래 §4 참조)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.join_challenge_as_newcomer(p_code text, p_inviter uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  --    조건이 뒤집힌다.
  --
  -- ⚠️ 0095부터 이 함수는 crew_links를 **만들지 않는다.** 그래도 이 가드는
  --    남긴다 — 이미 관계가 있는 사람은 기존 경로(join_challenge_with_code)로
  --    가야 하고, invited_by는 첫 접촉만 기록하기 때문이다.
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
  --    upsert가 한 벌만 존재해야 한다.
  v_result := public.join_challenge_with_code(p_code);
  v_challenge := (v_result ->> 'challengeId')::uuid;

  -- ── 누가 데려왔는가 ──────────────────────────────────────
  select cp.user_id into v_host
  from public.challenge_participants cp
  where cp.challenge_id = v_challenge and cp.role = 'host'
  order by cp.joined_at nulls last
  limit 1;

  -- 0091: 링크를 준 사람이 **그 방의 참가자로 확인되면** 그 사람이다.
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

  if v_link_to is null or v_link_to = v_me then
    return v_result || jsonb_build_object('crewLinked', 0);
  end if;

  -- ⚠️⚠️ 0095: **여기서 crew_links를 만들지 않는다.**
  --    "누가 데려왔나"(invited_by)와 "누구와 영구 친구인가"(crew_links)는
  --    다른 사실이다. 영구 크루가 되려면 참가자 프로필에서 크루 신청 → 수락을 거친다.
  --
  -- ⚠️ `invited_by`는 **그대로 기록한다.** 추천 계보의 원장이 이것이다.
  update public.profiles
     set invited_by = v_link_to
   where id = v_me and invited_by is null;

  select nickname into v_link_nick from public.profiles where id = v_link_to;
  select nickname into v_my_nick   from public.profiles where id = v_me;

  -- 알림 실패가 참가까지 되돌리면 안 된다.
  --
  -- ⚠️ 0095: 타입과 문구를 바꿨다. 예전에는 'crew_accepted'로 "친구가 됐어요"라고
  --    알렸는데, 이제 친구가 되지 않으므로 **거짓말이 된다.**
  begin
    perform public.notify(
      v_link_to, v_me, 'challenge_joined', v_challenge,
      coalesce(v_my_nick, '누군가') || '님이 내 초대 링크로 챌린지에 들어왔어요 🎯',
      '챌린지 참가자 목록에서 크루로 신청할 수 있어요'
    );
  exception when others then null;
  end;

  return v_result || jsonb_build_object(
    -- 0095: 영구 크루를 만들지 않으므로 항상 0이다. 화면이 "친구가 됐어요"라고
    --       말하지 않게 하는 것이 이 값의 역할이다.
    'crewLinked', 0,
    'hostId', v_link_to,
    'hostNickname', v_link_nick,
    'linkedVia', v_via
  );
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 응원 — 영구 크루 **또는** 지금 같은 active 챌린지 참가자
--
-- ⚠️ 현행 정의를 읽어 판정 한 줄만 바꾼다. send_cheer는 포인트·쿨다운·상한·
--    알림 설정까지 얽힌 긴 함수라, 손으로 베끼면 그중 하나가 조용히 바뀐다.
--    멱등하다 — 이미 적용됐으면 건너뛴다. 앵커가 없으면 조용히 넘어가지 않고 예외.
-- ─────────────────────────────────────────────────────────────────────────────
do $do$
declare
  def text;
  anchor constant text := 'if not public.is_crew_with(s.user_id) then' || E'\r\n' ||
                          '    raise exception ''session_not_found'';' || E'\r\n' ||
                          '  end if;';
  repl constant text :=
    '-- 0095: 영구 크루 **또는** 지금 같은 active 챌린지의 유효 참가자.' || E'\r\n' ||
    '  --       shares_active_challenge_with()가 ended/cancelled/dropped/차단/자기자신을' || E'\r\n' ||
    '  --       전부 걸러 낸다. ended에도 true인 shares_challenge_with를 여기 쓰면' || E'\r\n' ||
    '  --       챌린지가 끝난 뒤에도 응원이 되어 규칙이 무너진다.' || E'\r\n' ||
    '  if not (public.is_crew_with(s.user_id)' || E'\r\n' ||
    '          or public.shares_active_challenge_with(s.user_id)) then' || E'\r\n' ||
    '    raise exception ''session_not_found'';' || E'\r\n' ||
    '  end if;';
  pos int;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'send_cheer';

  if position('shares_active_challenge_with' in def) > 0 then
    raise notice '이미 적용됨: send_cheer';
    return;
  end if;

  pos := position(anchor in def);
  if pos = 0 then raise exception '앵커를 찾을 수 없다 (send_cheer)'; end if;

  def := overlay(def placing repl from pos for length(anchor));
  execute def;
  raise notice 'send_cheer 확장 완료';
end $do$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 적용 확인 (2026-08-31 실행 결과)
--   shares_active_challenge_with  DEFINER · anon EXECUTE 없음 · authenticated O
--   get_challenge_activity        DEFINER · anon EXECUTE 없음 · authenticated O
--   join_challenge_as_newcomer    crew_links insert 없음
--   send_cheer                    shares_active_challenge_with 호출 있음
-- ─────────────────────────────────────────────────────────────────────────────
