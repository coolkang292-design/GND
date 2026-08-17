-- 0079: 초대 출처 · 유입 출처 귀속 — "누가 불렀고 어디서 왔나"를 실제로 남긴다
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0078은 수정 금지.
--
-- ── 왜 필요한가 (2026-08-17 실측) ────────────────────────────
--
-- `crew_links` 컬럼이 `(user_a, user_b, created_at)` 셋뿐이고, 제약이
-- `user_a < user_b`라서 **방향조차 남지 않는다.** 검색으로 맺은 것, 초대 링크를
-- 타고 온 것, 챌린지 신입 자동 연결이 전부 같은 모양이다. `profiles.invite_code`는
-- 발급만 기록하고 그 코드로 누가 왔는지는 안 남긴다.
--
-- 우회로로 `notifications`의 `crew_accepted`(user_id=부른 사람, actor_id=들어온
-- 사람, reference_id로 경로 구분)가 있지만 **실측 crew_links 7건 중 4건뿐**이다.
-- 0038 백필로 만들어진 링크에는 알림이 없고, `notify` 실패는 조용히 삼켜진다.
-- 지표로 쓰면 과소집계다 — 그래서 출처를 링크 자체에 적는다.
--
-- ── Run 시점 ────────────────────────────────────────────────
-- **지금 돌려도 안전하다.** 새 컬럼·새 트리거뿐이고 기존 행의 기존 값은 바꾸지
-- 않는다(백필도 이번에 생긴 새 컬럼만 채운다). 운영에 떠 있는 앱은 이 컬럼들을
-- 읽지 않으므로 화면이 먼저 바뀌는 일이 없다.
--
-- ⚠️ 이 파일을 Run한 뒤 `pnpm db:snapshot`으로 docs/db-current-schema.sql을
--    다시 뽑아라. 안 뽑으면 다음 사람이 옛 함수 정의를 베낀다.

begin;

-- ════════════════════════════════════════════════════════════
-- 1. 컬럼
-- ════════════════════════════════════════════════════════════

-- ── 1-1. 크루 연결의 출처와 방향 ────────────────────────────
--
-- `origin`  = 어떤 경로로 맺어졌나
-- `initiated_by` = 그 경로를 **먼저 연 쪽**(요청 보낸 사람 · 링크 주인 · 방장).
--   `user_a < user_b` 정렬 때문에 쌍만 봐서는 방향을 알 수 없어 따로 적는다.
--
-- ⚠️ null을 허용한다. 0038 백필로 생긴 옛 링크는 출처를 **알 수 없고**, 모르는
--    것을 'search'로 채우면 통계가 조용히 거짓말을 한다. 아래 백필에서 알 수
--    있는 것만 채우고 나머지는 'unknown'으로 명시한다.
alter table public.crew_links
  add column if not exists origin text,
  add column if not exists initiated_by uuid
    references public.profiles (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crew_links_origin_check'
  ) then
    alter table public.crew_links
      add constraint crew_links_origin_check
      check (origin is null or origin in
        ('search', 'invite_link', 'challenge', 'unknown'));
  end if;
end $$;

create index if not exists crew_links_origin_idx
  on public.crew_links (origin);
create index if not exists crew_links_initiated_by_idx
  on public.crew_links (initiated_by);

-- ── 1-2. 이 사람을 데려온 사람 ──────────────────────────────
--
-- **첫 연결을 만들어 준 사람**이다. 이미 크루가 있는 사람이 나중에 남의 초대
-- 링크를 눌러도 덮어쓰지 않는다(아래 RPC의 v_had_links 가드 + 고정 트리거).
alter table public.profiles
  add column if not exists invited_by uuid
    references public.profiles (id) on delete set null;

create index if not exists profiles_invited_by_idx
  on public.profiles (invited_by);

-- ── 1-3. 유입 출처(첫 접촉) ─────────────────────────────────
--
-- 앱이 utm 파라미터도 referrer도 어디서도 읽지 않아 카카오톡·인스타·검색을
-- 구분할 수 없었다. 온보딩에서 프로필을 만들 때 한 번만 심는다.
--
-- ⚠️ **referrer는 호스트만 담는다.** 전체 URL에는 검색어·토큰이 붙는다.
--    클라이언트가 자르지만 컬럼 주석에도 남긴다 — 다음 사람이 전체 URL을 넣지
--    않도록.
alter table public.profiles
  add column if not exists acquisition_source text,
  add column if not exists acquisition_medium text,
  add column if not exists acquisition_campaign text,
  add column if not exists acquisition_referrer text,
  add column if not exists acquisition_landing text,
  add column if not exists acquisition_captured_at timestamptz;

comment on column public.profiles.acquisition_referrer is
  '유입 referrer의 **호스트만**. 전체 URL을 넣지 마라 — 검색어·토큰이 샌다.';
comment on column public.profiles.acquisition_landing is
  '첫 진입 경로. 값이 아니라 모양만 남긴다(예: /invite/:code).';

-- ════════════════════════════════════════════════════════════
-- 2. 최초값 고정 트리거
-- ════════════════════════════════════════════════════════════
--
-- **왜 필요한가.** 프로필 저장은 클라이언트의 `upsert`다(`crew.ts`
-- `upsertMyProfile`). 사용자가 나중에 닉네임을 바꾸면 같은 upsert가 다시 도는데,
-- 그때 localStorage가 비어 있으면 유입 출처가 **null로 덮인다.** 첫 접촉 귀속은
-- 덮이는 순간 의미가 없다.
--
-- 규칙은 하나다: **이미 값이 있으면 그 값을 지킨다.** 비어 있을 때만 새 값을
-- 받는다(나중에 백필할 여지를 남긴다).
--
-- ⚠️ 이 트리거는 프로필의 **모든** update에서 돈다. 여기에 무거운 것을 넣지 마라.
create or replace function public.freeze_profile_attribution()
returns trigger
language plpgsql
as $$
begin
  new.invited_by              := coalesce(old.invited_by, new.invited_by);
  new.acquisition_source      := coalesce(old.acquisition_source, new.acquisition_source);
  new.acquisition_medium      := coalesce(old.acquisition_medium, new.acquisition_medium);
  new.acquisition_campaign    := coalesce(old.acquisition_campaign, new.acquisition_campaign);
  new.acquisition_referrer    := coalesce(old.acquisition_referrer, new.acquisition_referrer);
  new.acquisition_landing     := coalesce(old.acquisition_landing, new.acquisition_landing);
  new.acquisition_captured_at := coalesce(old.acquisition_captured_at, new.acquisition_captured_at);
  return new;
end $$;

drop trigger if exists profiles_freeze_attribution on public.profiles;
create trigger profiles_freeze_attribution
  before update on public.profiles
  for each row execute function public.freeze_profile_attribution();

-- 프로필을 **만들 때** 초대자를 스스로 적을 수는 없게 한다. 초대 수락은
-- 온보딩보다 뒤에 일어나므로(`/invite/[code]` → 온보딩 → redeem), 이 값이
-- insert에 실려 오는 정상 경로가 없다. 아래 RPC들만 채운다.
create or replace function public.clear_profile_invited_by_on_insert()
returns trigger
language plpgsql
as $$
begin
  new.invited_by := null;
  return new;
end $$;

drop trigger if exists profiles_clear_invited_by on public.profiles;
create trigger profiles_clear_invited_by
  before insert on public.profiles
  for each row execute function public.clear_profile_invited_by_on_insert();

-- ════════════════════════════════════════════════════════════
-- 3. RPC 3곳이 출처를 채운다
-- ════════════════════════════════════════════════════════════
--
-- ⚠️ **세 곳을 한 파일에서 같이 고친다.** 2026-07-31에 `start_challenge`만 고치고
--    같은 전제를 공유하는 `approve_challenge_goals`를 놓쳐 0045→0046→0047로 세 번
--    고친 전례가 있다. crew_links에 insert하는 함수는 **정확히 이 셋뿐이다**
--    (스냅샷 실측: db-current-schema.sql의 93·161·2105행).
--
-- ⚠️ `on conflict do nothing`을 유지한다. 이미 있는 링크의 출처를 덮어쓰면
--    "처음 어떻게 맺어졌나"가 마지막 경로로 바뀐다.

-- ── 3-1. 닉네임 검색 → 요청 → 수락 ─────────────────────────
create or replace function public.accept_crew_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_me uuid := auth.uid();
  v_req crew_requests%rowtype;
  v_nick text;
  v_other uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  -- 잠금 키를 얻기 위한 사전 읽기(락 없음). 상대가 requester인지 addressee인지
  -- 아직 모르므로 행을 한 번 읽어서만 판단하고, 실제 검증은 아래에서 다시 한다.
  select * into v_req from crew_requests where id = p_request_id;
  if not found then raise exception 'not_addressee'; end if;
  v_other := case when v_req.requester_id = v_me then v_req.addressee_id else v_req.requester_id end;

  -- 쌍 단위 직렬화. 이게 없으면 (a) 서로 동시에 수락할 때 락 순서가 엇갈려
  -- 40P01 데드락, (b) 서로 동시에 요청할 때 역방향을 못 봐서 자동수락이 불발,
  -- (c) 빠른 두 번 탭이 request_exists 대신 23505를 그대로 뱉는다.
  perform pg_advisory_xact_lock(
    hashtext(least(v_me, v_other)::text || greatest(v_me, v_other)::text)
  );

  select * into v_req from crew_requests where id = p_request_id for update;
  if not found or v_req.addressee_id <> v_me then
    raise exception 'not_addressee';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'not_pending';
  end if;

  -- 0079: 출처는 '검색', 먼저 연 쪽은 요청을 보낸 사람이다.
  insert into crew_links (user_a, user_b, origin, initiated_by)
  values (least(v_req.requester_id, v_req.addressee_id),
          greatest(v_req.requester_id, v_req.addressee_id),
          'search', v_req.requester_id)
  on conflict do nothing;

  update crew_requests
     set status = 'accepted', responded_at = now()
   where id = p_request_id;

  -- 반대 방향에 남아 있던 pending도 함께 닫는다. 안 닫으면 이미 크루가 된
  -- 뒤에도 상대 받은함에 요청이 남아 "수락" 버튼이 계속 보인다.
  update crew_requests
     set status = 'accepted', responded_at = now()
   where requester_id = v_req.addressee_id
     and addressee_id = v_req.requester_id
     and status = 'pending';

  -- ⚠️ 여기서는 profiles.invited_by를 채우지 않는다. 검색으로 맺는 쪽은 **둘 다
  --    이미 가입한 사람**이라 "데려왔다"가 성립하지 않는다. 유입 귀속은 신규가
  --    링크를 타고 들어온 경우에만 의미가 있다(3-2 · 3-3).

  select nickname into v_nick from profiles where id = v_me;
  -- 알림 실패가 연결까지 되돌리면 안 된다. 연결이 본체고 알림은 곁가지다.
  -- (0029에서 알림 insert 하나가 운동 완료 트랜잭션을 통째로 롤백시킨 전례가 있다.)
  begin
    perform notify(
      v_req.requester_id, v_me, 'crew_accepted', p_request_id,
      coalesce(v_nick, '누군가') || '님과 크루가 됐어요 🤝',
      '이제 서로의 운동 소식을 받아볼 수 있어요'
    );
  exception when others then null;
  end;
  return jsonb_build_object('status', 'accepted');
end $function$;

-- ── 3-2. 친구 초대 링크 ─────────────────────────────────────
create or replace function public.accept_friend_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_me         uuid := (select auth.uid());
  v_owner      uuid;
  v_owner_nick text;
  v_my_nick    text;
  v_existed    boolean;
  v_had_links  boolean;
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

  -- 0079: **insert 전에** 재야 한다. 뒤에서 재면 방금 만든 링크가 잡혀 항상
  -- true가 되고, invited_by가 영영 안 채워진다.
  select exists (
    select 1 from public.crew_links where user_a = v_me or user_b = v_me
  ) into v_had_links;

  insert into public.crew_links (user_a, user_b, origin, initiated_by)
  values (least(v_me, v_owner), greatest(v_me, v_owner), 'invite_link', v_owner)
  on conflict do nothing;

  -- 반대 방향에 남아 있던 pending 요청도 닫는다. 안 닫으면 이미 친구가 된 뒤에도
  -- 받은함에 "수락" 버튼이 남는다 (accept_crew_request와 같은 규약).
  update public.crew_requests
     set status = 'accepted', responded_at = now()
   where status = 'pending'
     and ((requester_id = v_me and addressee_id = v_owner)
       or (requester_id = v_owner and addressee_id = v_me));

  -- 0079: **이 링크가 내 첫 연결일 때만** 초대자로 적는다. 이미 크루가 있는
  -- 사람이 남의 링크를 눌렀다고 그 사람이 나를 데려온 것은 아니다.
  if not v_had_links then
    update public.profiles
       set invited_by = v_owner
     where id = v_me and invited_by is null;
  end if;

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
end $function$;

-- ── 3-3. 챌린지 링크로 처음 온 신입 ─────────────────────────
create or replace function public.join_challenge_as_newcomer(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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

  -- 0079: 출처는 '챌린지', 먼저 연 쪽은 방장이다.
  insert into public.crew_links (user_a, user_b, origin, initiated_by)
  values (least(v_me, v_host), greatest(v_me, v_host), 'challenge', v_host)
  on conflict do nothing;

  -- 0079: 위 신입 가드가 **crew_links 0건**을 이미 보장한다 —
  -- 이 경로로 온 사람은 정의상 신규라 여기서 다시 재지 않는다.
  update public.profiles
     set invited_by = v_host
   where id = v_me and invited_by is null;

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
end $function$;

-- ════════════════════════════════════════════════════════════
-- 4. 과거분 백필 — 알 수 있는 것만
-- ════════════════════════════════════════════════════════════
--
-- `notifications`의 `crew_accepted`가 유일한 흔적이다.
--   user_id  = 부른 쪽(요청자 · 링크 주인 · 방장)
--   actor_id = 들어온 쪽
--   reference_id → crew_requests 있음  = 검색
--                  null                = 친구 초대 링크 (0061)
--                  challenges 있음     = 챌린지 신입 (0063)
--
-- ⚠️ **전부는 못 채운다.** 2026-08-17 실측으로 crew_links 7건 중 알림은 4건뿐이다.
--    0038이 group_members에서 만든 링크에는 알림이 없다. 나머지는 'unknown'으로
--    **명시**한다 — null로 두면 "아직 안 채워진 것"과 "영영 알 수 없는 것"이
--    구별되지 않아 다음 사람이 백필이 덜 됐다고 오해한다.
with acc as (
  select
    n.user_id  as inviter,
    n.actor_id as joiner,
    n.reference_id,
    n.created_at,
    row_number() over (
      partition by least(n.user_id, n.actor_id), greatest(n.user_id, n.actor_id)
      order by n.created_at
    ) as rn
  from public.notifications n
  where n.type = 'crew_accepted' and n.actor_id is not null
),
first_acc as (
  select
    least(inviter, joiner)    as ua,
    greatest(inviter, joiner) as ub,
    inviter,
    joiner,
    case
      when reference_id is null then 'invite_link'
      when exists (select 1 from public.crew_requests r where r.id = reference_id)
        then 'search'
      when exists (select 1 from public.challenges c where c.id = reference_id)
        then 'challenge'
      else 'unknown'
    end as origin
  from acc
  where rn = 1
)
update public.crew_links l
   set origin = f.origin,
       initiated_by = f.inviter
  from first_acc f
 where l.user_a = f.ua and l.user_b = f.ub
   and l.origin is null;

-- 흔적이 없는 나머지 — 영영 알 수 없다는 뜻을 값으로 남긴다
update public.crew_links
   set origin = 'unknown'
 where origin is null;

-- 초대 링크·챌린지로 들어온 사람의 초대자. **검색은 제외한다**(3-1 주석과 같은
-- 이유 — 둘 다 이미 가입한 사람이라 "데려왔다"가 아니다).
update public.profiles p
   set invited_by = l.initiated_by
  from public.crew_links l
 where p.invited_by is null
   and l.initiated_by is not null
   and l.origin in ('invite_link', 'challenge')
   and p.id = case when l.user_a = l.initiated_by then l.user_b else l.user_a end;

commit;

-- PostgREST 스키마 캐시 리로드. 새 컬럼·새 함수라 이게 없으면 앱이 PGRST204로 받는다.
notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════
-- 적용 확인 (SQL Editor에서 따로 실행)
-- ════════════════════════════════════════════════════════════
--
--   -- ① 컬럼이 생겼는가 (9개 나와야 한다)
--   select table_name, column_name from information_schema.columns
--   where (table_name = 'crew_links'  and column_name in ('origin','initiated_by'))
--      or (table_name = 'profiles' and column_name in
--          ('invited_by','acquisition_source','acquisition_medium',
--           'acquisition_campaign','acquisition_referrer','acquisition_landing',
--           'acquisition_captured_at'))
--   order by table_name, column_name;
--
--   -- ② 출처 분해 — origin이 null인 행은 0이어야 한다
--   select coalesce(origin,'(null)') as origin, count(*)
--   from crew_links group by 1 order by 2 desc;
--
--   -- ③ 백필 결과 (실측 기준: 7건 중 invite_link 2 · search 2 · unknown 3)
--   select origin, initiated_by is not null as has_initiator, count(*)
--   from crew_links group by 1,2 order by 1;
--
--   -- ④ 초대자가 붙은 사람
--   select p.nickname as 들어온사람, i.nickname as 초대한사람
--   from profiles p join profiles i on i.id = p.invited_by;
--
--   -- ⑤ 트리거 2개가 붙었는가
--   select tgname from pg_trigger
--   where tgrelid = 'public.profiles'::regclass and not tgisinternal;
