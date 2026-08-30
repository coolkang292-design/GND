-- 0089: 공개 모집 안전장치 — 차단 · 신고 · 모집글 제한
-- 설계: docs/superpowers/HANDOFF-2026-08-31-feed-social-and-recruit.md §3 B
-- 적용: Supabase Dashboard -> SQL Editor에 전체 붙여넣고 Run (1회만).
--       0001~0088은 수정하지 않는다.
--
-- ⚠️ 배포보다 **먼저** Run 해도 안전하다. 옛 클라이언트는 새 RPC를 부르지 않고,
--    새로 생기는 제약(모집글 1인 1건)은 지금 DB에 위반 행이 0건임을 확인했다
--    (setup + discoverable 조합이 현재 0건).
--
-- ── 왜 지금인가 ──────────────────────────────────────────────
--
-- 0085~0087로 공개 모집을 열면서 **모르는 사람**이 들어올 수 있게 됐는데,
-- GND에는 차단도 신고도 없었다. send_crew_request의 주석이 그걸 그대로 적고
-- 있다 — "거절은 조용히 처리되고(D7) 차단도 없어서(D11)".
--
-- 지금까지는 노출 표면이 좁아서 버텼다. 모집글에 댓글도 DM도 없고, 연락 경로가
-- 7일 쿨다운 걸린 크루 신청 하나뿐이다. 그래도 이건 "아직 안 터졌다"이지
-- "안전하다"가 아니다. 사람이 늘면 이게 가장 먼저 문제가 된다.
--
-- ── 무엇을 하나 ──────────────────────────────────────────────
--
--   1) user_blocks   — 차단. 소셜 전반에 적용된다(아래 ⚠️ 참조)
--   2) user_reports  — 신고. 기록만 하고 조치는 사람이 /admin에서 한다
--   3) 모집글 제한   — 방장 1인당 동시 1건 + 7일 만료
--
-- ── ⚠️ 차단을 is_crew_with 한 곳에 넣은 이유 ─────────────────
--
-- 차단이 "소셜 전반"이려면 피드·댓글·응원·프로필·콕찌르기·기록보기가 전부
-- 막혀야 한다. 그 여섯이 **전부 is_crew_with를 통과한다**:
--
--   get_crew_member_profile · poke_user · send_cheer · view_record ·
--   search_profile_by_nickname · session_crew_shared ·
--   workout_session_crew_visible · profiles_select_own_or_crew(정책) ·
--   workout_sessions select 정책
--
-- 그래서 함수 하나에 조건을 더하면 아홉 곳이 한꺼번에 닫힌다. 아홉 곳을 각각
-- 고치면 언젠가 한 곳이 빠지고, 빠진 곳이 하필 새로 생긴 화면이 된다.
--
-- ⚠️ 대신 **crew_links 행은 지우지 않는다.** 차단은 되돌릴 수 있어야 하고,
--    행을 지우면 해제해도 관계가 안 돌아온다. 링크는 남기고 판정만 막는다.
--
-- ⚠️ is_crew_with가 false가 되면서 send_crew_request의 already_crew 검사가
--    통과해 버린다. 그래서 그 함수에는 **차단 검사를 별도로 앞에 세운다.**
--
-- ── ⚠️ 차단이 가리는 것과 안 가리는 것 (경계를 알고 써라) ────
--
--   가린다   피드 게시물 · 댓글 · 반응 · 응원 · 콕 찌르기 · 기록 열람 ·
--            크루 프로필 시트 · 크루 목록(get_my_crew) · 닉네임 검색의 관계 ·
--            모집글(list_discoverable_challenges) · 크루 신청(양방향)
--
--   안 가린다 **같은 그룹·같은 챌린지 안의 프로필 기본 정보**(닉네임·아바타).
--            `profiles_select_own_or_crew`가 `is_crew_with(id) OR
--            shares_group_with(id)`라서 그룹 쪽 문이 따로 열려 있다.
--
-- 이건 버그가 아니라 **결정의 결과다.** 사용자가 "이미 맺어진 크루 연결과 참가
-- 중인 챌린지는 건드리지 않는다"를 골랐다(2026-08-31). shares_group_with까지
-- 막으면 같은 챌린지에 있는 두 사람 중 하나가 차단하는 순간 **참가자 목록과
-- 랭킹이 상대에게 통째로 깨진다** — 차단은 두 사람 사이의 일인데 방 전체가
-- 부서지는 것이다.
--
-- 그래서 차단은 "그 사람의 **말과 기록**이 안 보인다"이지 "존재가 사라진다"가
-- 아니다. 화면 문구도 그렇게 적었다(blockConfirmCopy). 더 세게 만들고 싶으면
-- 챌린지에서 분리하는 설계를 따로 해야 하고, 그건 이 마이그레이션의 범위가 아니다.
--
-- 되돌리기 (순서가 있다)
--   ⓐ drop index if exists challenges_one_open_recruit_per_host;
--   ⓑ 세 함수(is_crew_with · get_my_crew · send_crew_request ·
--      list_discoverable_challenges)를 docs/db-current-schema.sql 이력의
--      0088 시점 정의로 다시 Run
--   ⓒ drop table if exists public.user_reports, public.user_blocks;
--   ⓓ drop function if exists public.is_blocked_between(uuid, uuid);
--   ⚠ ⓑ보다 ⓒ·ⓓ를 먼저 하면 함수가 없는 테이블을 참조해 깨진다.

begin;

-- ============================================================
-- 1) 차단 — user_blocks
-- ============================================================
--
-- 방향이 있는 관계다(내가 상대를 차단). 판정은 양방향으로 한다 — 상대가 나를
-- 차단해도 내 화면에서 상대가 사라져야 한다. 그래야 "차단당한 줄 모르게"가
-- 성립하고, 차단한 쪽이 상대 게시물을 계속 보는 이상한 상태도 안 생긴다.
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);
-- 역방향 조회용. is_blocked_between이 두 방향을 다 본다.
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;
-- 읽기는 **내가 건 차단만**. 누가 나를 차단했는지는 보여주지 않는다(D7과 같은 결).
grant select on public.user_blocks to authenticated;
drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own on public.user_blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));
-- 쓰기는 RPC로만. 직접 insert를 열면 남의 이름으로 차단을 만들 수 있다.

-- ============================================================
-- 2) 신고 — user_reports
-- ============================================================
--
-- 자동 조치는 하지 않는다. 8명 규모에서 "N건이면 자동 숨김"은 소수가 담합해
-- 정상 글을 내리는 쪽으로 먼저 악용된다. 사람이 /admin에서 보고 판단한다.
create table if not exists public.user_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  target_id    uuid not null references public.profiles (id) on delete cascade,
  -- 모집글을 보고 신고했으면 어느 챌린지였는지. 챌린지가 지워져도 신고는 남는다.
  challenge_id uuid references public.challenges (id) on delete set null,
  reason       text not null check (reason in ('spam', 'harassment', 'inappropriate', 'fake', 'other')),
  note         text check (note is null or length(note) <= 500),
  status       text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  constraint user_reports_not_self check (reporter_id <> target_id)
);
-- 같은 사람을 상대로 **처리 안 된 신고는 1건까지.** 신고 버튼 연타로 목록을
-- 채우는 것을 막는다. 처리(reviewed/dismissed)되면 다시 신고할 수 있다.
create unique index if not exists user_reports_one_open_per_pair
  on public.user_reports (reporter_id, target_id)
  where status = 'open';
create index if not exists user_reports_open_idx
  on public.user_reports (created_at desc) where status = 'open';

alter table public.user_reports enable row level security;
revoke all on public.user_reports from anon, authenticated;
-- 내가 낸 신고만 읽는다. 남이 나를 신고했는지는 절대 안 보인다.
grant select on public.user_reports to authenticated;
drop policy if exists user_reports_select_own on public.user_reports;
create policy user_reports_select_own on public.user_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));
-- 쓰기는 RPC로만. status 변경은 service_role(/admin)만.

-- ============================================================
-- 3) is_blocked_between — 양방향 판정 한 곳
-- ============================================================
create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = p_a and blocked_id = p_b)
       or (blocker_id = p_b and blocked_id = p_a)
  )
$$;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon;
grant  execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- ============================================================
-- 4) is_crew_with — 차단이면 크루가 아니다
-- ============================================================
--
-- ⚠️ 이 한 줄이 피드·댓글·응원·프로필·콕찌르기·기록보기를 동시에 닫는다.
--    여기를 되돌리면 아홉 곳이 동시에 열린다 — 되돌릴 때 그걸 알고 되돌려라.
create or replace function public.is_crew_with(uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.crew_links
    where user_a = least((select auth.uid()), uid)
      and user_b = greatest((select auth.uid()), uid)
  )
  and not public.is_blocked_between((select auth.uid()), uid)  -- 0089
$$;

-- ============================================================
-- 5) get_my_crew — 차단한 사람은 크루 목록에서도 뺀다
-- ============================================================
--
-- crew_links를 직접 읽어서 is_crew_with를 안 타는 유일한 곳이다. 여기만 빼먹으면
-- "피드에는 안 보이는데 크루 목록에는 있는" 상태가 된다.
create or replace function public.get_my_crew()
returns table(
  id uuid, nickname text, avatar_url text,
  total_xp integer, current_level smallint, current_stage smallint,
  linked_at timestamp with time zone
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.nickname, p.avatar_url,
         coalesce(up.total_xp, 0),
         coalesce(up.current_level, 1::smallint),
         coalesce(up.current_stage, 1::smallint),
         l.created_at
  from public.crew_links l
  join public.profiles p
    on p.id = case when l.user_a = (select auth.uid()) then l.user_b else l.user_a end
  left join public.user_progress up on up.user_id = p.id
  where (select auth.uid()) in (l.user_a, l.user_b)
    and not public.is_blocked_between((select auth.uid()), p.id)  -- 0089
  order by p.nickname
$$;

-- ============================================================
-- 6) block_user / unblock_user / list_blocked_users
-- ============================================================
--
-- 차단하면 **오가던 크루 요청도 같이 정리한다.** 안 그러면 차단한 뒤에도
-- 상대의 pending 요청이 내 수신함에 남고, 수락하면 차단인데 크루가 된다.
create or replace function public.block_user(p_target_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_target_id = v_me then raise exception 'self_block'; end if;
  if not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'target_not_found';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_me, p_target_id)
  on conflict (blocker_id, blocked_id) do nothing;

  -- 오가던 요청 정리. 양방향 모두.
  delete from public.crew_requests
  where status = 'pending'
    and ((requester_id = v_me and addressee_id = p_target_id)
      or (requester_id = p_target_id and addressee_id = v_me));

  return jsonb_build_object('status', 'blocked');
end $$;
revoke execute on function public.block_user(uuid) from public, anon;
grant  execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(p_target_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  delete from public.user_blocks
  where blocker_id = v_me and blocked_id = p_target_id;
  -- 크루 링크는 지운 적이 없으므로, 해제하면 관계가 그대로 돌아온다.
  return jsonb_build_object('status', 'unblocked');
end $$;
revoke execute on function public.unblock_user(uuid) from public, anon;
grant  execute on function public.unblock_user(uuid) to authenticated;

-- 설정 화면의 "차단한 사람" 목록. 닉네임·아바타만 준다.
-- ⚠️ profiles를 직접 select하면 차단 때문에 is_crew_with가 false가 되어
--    profiles_select_own_or_crew에 막힌다 — 차단한 사람의 이름조차 못 읽어서
--    해제 버튼에 "알 수 없음"만 뜬다. 그래서 RPC로 우회한다.
create or replace function public.list_blocked_users()
returns table(id uuid, nickname text, avatar_url text, blocked_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select p.id, p.nickname, p.avatar_url, b.created_at
  from public.user_blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc
$$;
revoke execute on function public.list_blocked_users() from public, anon;
grant  execute on function public.list_blocked_users() to authenticated;

-- ============================================================
-- 7) report_user
-- ============================================================
create or replace function public.report_user(
  p_target_id   uuid,
  p_reason      text,
  p_note        text default null,
  p_challenge_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_target_id = v_me then raise exception 'self_report'; end if;
  if not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'target_not_found';
  end if;
  if p_reason not in ('spam', 'harassment', 'inappropriate', 'fake', 'other') then
    raise exception 'invalid_reason';
  end if;
  if p_note is not null and length(p_note) > 500 then
    raise exception 'note_too_long';
  end if;

  -- 같은 상대에 대해 처리 안 된 신고가 이미 있으면 조용히 그것을 돌려준다.
  -- 오류로 만들면 "이미 신고함"이 화면에 뜨는데, 신고자는 대개 그걸 실패로
  -- 읽고 다시 누른다. 접수됐다고 말하는 편이 정확하고 덜 불안하다.
  select id into v_id from public.user_reports
  where reporter_id = v_me and target_id = p_target_id and status = 'open'
  limit 1;
  if found then
    return jsonb_build_object('status', 'already_open', 'reportId', v_id);
  end if;

  insert into public.user_reports (reporter_id, target_id, challenge_id, reason, note)
  values (v_me, p_target_id, p_challenge_id, p_reason, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;

  return jsonb_build_object('status', 'received', 'reportId', v_id);
end $$;
revoke execute on function public.report_user(uuid, text, text, uuid) from public, anon;
grant  execute on function public.report_user(uuid, text, text, uuid) to authenticated;

-- ============================================================
-- 8) send_crew_request — 차단 검사를 맨 앞에 세운다
-- ============================================================
--
-- ⚠️ is_crew_with가 차단이면 false를 주므로, already_crew 검사만으로는 차단한
--    상대에게 요청이 나간다. 그래서 여기에 별도 관문이 필요하다.
--
-- 내가 건 차단이면 그렇게 말해 준다(내가 한 일이니 알아야 해제할 수 있다).
-- 상대가 나를 차단한 경우는 **request_exists로 숨긴다** — 0038이 거절을
-- 숨기려고 쓴 것과 같은 코드다. 차단당했다는 사실이 드러나면 다른 계정으로
-- 우회하라는 신호가 된다.
create or replace function public.send_crew_request(p_target_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_nick text;
  v_reverse crew_requests%rowtype;
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_target_id = v_me then raise exception 'self_request'; end if;

  -- 0089: 차단 관문. 아래 어떤 검사보다 먼저다.
  if exists (select 1 from public.user_blocks
             where blocker_id = v_me and blocked_id = p_target_id) then
    raise exception 'blocked_by_me';
  end if;
  if exists (select 1 from public.user_blocks
             where blocker_id = p_target_id and blocked_id = v_me) then
    raise exception 'request_exists';  -- 일부러 숨긴다 (D7과 같은 결)
  end if;

  -- 쌍 단위 직렬화. 이게 없으면 (a) 서로 동시에 수락할 때 락 순서가 엇갈려
  -- 40P01 데드락, (b) 서로 동시에 요청할 때 역방향을 못 봐서 자동수락이 불발,
  -- (c) 빠른 두 번 탭이 request_exists 대신 23505를 그대로 뱉는다.
  perform pg_advisory_xact_lock(
    hashtext(least(v_me, p_target_id)::text || greatest(v_me, p_target_id)::text)
  );

  if not exists (select 1 from profiles where id = p_target_id) then
    raise exception 'target_not_found';
  end if;
  if public.is_crew_with(p_target_id) then raise exception 'already_crew'; end if;

  -- 거절당한 뒤 7일은 같은 사람에게 다시 못 보낸다. 거절은 조용히 처리되고(D7)
  -- 이 가드가 없으면 요청↔거절을 무한 반복하며 상대에게 알림을 계속 꽂을 수 있다.
  -- 콕 찌르기의 24h 쿨다운(0011)과 같은 결의 장치다.
  -- 에러 코드를 request_exists로 재사용하는 이유: 보내는 쪽에 "이미 요청을
  -- 보냈어요"로만 보여야 거절당했다는 사실이 드러나지 않는다(D7 유지).
  if exists (
    select 1 from crew_requests
    where requester_id = v_me
      and addressee_id = p_target_id
      and status = 'rejected'
      and responded_at > now() - interval '7 days'
  ) then
    raise exception 'request_exists';
  end if;

  -- 역방향 pending이 있으면 양쪽이 서로를 원한 것이다 → 즉시 맺는다.
  select * into v_reverse from crew_requests
  where requester_id = p_target_id and addressee_id = v_me
    and status = 'pending'
  limit 1;
  if found then
    perform public.accept_crew_request(v_reverse.id);
    return jsonb_build_object('status', 'accepted', 'requestId', v_reverse.id);
  end if;

  if exists (select 1 from crew_requests
             where requester_id = v_me and addressee_id = p_target_id
               and status = 'pending') then
    raise exception 'request_exists';
  end if;

  insert into crew_requests (requester_id, addressee_id)
  values (v_me, p_target_id)
  returning id into v_id;

  select nickname into v_nick from profiles where id = v_me;
  perform notify(
    p_target_id, v_me, 'crew_request', v_id,
    coalesce(v_nick, '누군가') || '님이 크루 요청을 보냈어요 🤝',
    '수락하면 서로의 운동 소식을 받아볼 수 있어요'
  );
  return jsonb_build_object('status', 'pending', 'requestId', v_id);
end $$;

-- ============================================================
-- 9) 모집글 제한 — 방장 1인 1건 + 7일 만료
-- ============================================================
--
-- created_at으로 만료를 재면 안 된다. 3주 전에 만든 챌린지를 오늘 공개로
-- 돌리면 그 즉시 만료된 글이 된다. **공개로 돌린 시점**을 따로 기록한다.
alter table public.challenges
  add column if not exists recruit_opened_at timestamptz;

create or replace function public.set_recruit_opened_at()
returns trigger
language plpgsql set search_path = public
as $$
begin
  -- ⚠️ INSERT일 때 OLD는 없다. TG_OP로 명시적으로 가른다 — old.discoverable을
  --    그냥 읽으면 구현에 기대는 코드가 된다.
  if not coalesce(new.discoverable, false) then
    new.recruit_opened_at := null;           -- 닫혀 있으면 항상 비운다
                                             -- (다시 열면 새로 7일을 준다)
  elsif tg_op = 'INSERT' then
    new.recruit_opened_at := now();          -- 처음부터 공개로 만든 경우
  elsif coalesce(old.discoverable, false) is distinct from true then
    new.recruit_opened_at := now();          -- 닫힘 → 열림
  end if;                                    -- 열림 → 열림은 그대로 둔다
  return new;
end $$;

drop trigger if exists challenges_set_recruit_opened_at on public.challenges;
create trigger challenges_set_recruit_opened_at
  before insert or update of discoverable on public.challenges
  for each row execute function public.set_recruit_opened_at();

-- 이미 공개인 모집글에 7일을 새로 준다. created_at으로 소급하면 오늘 올린
-- 글이 어제 만료된 것으로 보인다. (현재 setup+discoverable은 0건이라 무해하다.)
update public.challenges
   set recruit_opened_at = now()
 where discoverable and status = 'setup' and recruit_opened_at is null;

-- 방장 1인당 동시에 열 수 있는 공개 모집은 1건.
-- ⚠️ 위반 시 23505가 난다. setChallengeDiscoverable이 이걸 잡아 문구로 바꾼다.
create unique index if not exists challenges_one_open_recruit_per_host
  on public.challenges (created_by)
  where discoverable and status = 'setup';

-- ============================================================
-- 10) list_discoverable_challenges — 차단 + 만료 반영
-- ============================================================
--
-- ⚠️ 반환 칸을 **일부러 안 늘렸다.** RETURNS TABLE이 바뀌면 create or replace가
--    거부해서 drop이 필요한데, drop하면 Postgres가 PUBLIC EXECUTE를 되살린다
--    (0085에서 걷어낸 anon 권한이 부활한다 — 0087이 그래서 다시 revoke했다).
--    칸을 그대로 두면 replace로 끝나고 권한이 안 흔들린다.
create or replace function public.list_discoverable_challenges()
returns table(
  id uuid, name text, recruit_note text, recruit_image_url text,
  start_date date, end_date date, photo_required boolean,
  participant_count integer, host_id uuid, host_nickname text,
  host_avatar_url text, already_joined boolean
)
language sql stable security definer set search_path = public
as $$
  select c.id,
         c.name,
         c.recruit_note,
         c.recruit_image_url,
         c.start_date,
         c.end_date,
         c.photo_required,
         (select count(*)::int
            from challenge_participants cp
           where cp.challenge_id = c.id
             and cp.status = 'joined')                    as participant_count,
         c.created_by                                     as host_id,
         p.nickname                                       as host_nickname,
         p.avatar_url                                     as host_avatar_url,
         exists (select 1 from challenge_participants me
                  where me.challenge_id = c.id
                    and me.user_id = (select auth.uid())
                    and me.status = 'joined')             as already_joined
  from challenges c
  join profiles p on p.id = c.created_by
  where c.discoverable
    and c.status = 'setup'
    and (select auth.uid()) is not null
    -- 0089: 7일 만료. recruit_opened_at이 없는 옛 행은 created_at으로 눈감아 준다.
    and coalesce(c.recruit_opened_at, c.created_at) > now() - interval '7 days'
    -- 0089: 차단한/차단당한 방장의 글은 안 보인다
    and not public.is_blocked_between((select auth.uid()), c.created_by)
  order by c.start_date asc, c.created_at desc
  limit 12
$$;
revoke execute on function public.list_discoverable_challenges() from public, anon;
grant  execute on function public.list_discoverable_challenges() to authenticated;

commit;

-- ── 적용 확인 (Run 뒤에 따로 실행해서 눈으로 본다) ─────────────
--
-- select count(*) from public.user_blocks;                     -- 0
-- select count(*) from public.user_reports;                    -- 0
-- select public.is_blocked_between(gen_random_uuid(), gen_random_uuid());  -- false
-- select indexname from pg_indexes
--  where tablename = 'challenges' and indexname = 'challenges_one_open_recruit_per_host';
-- select column_name from information_schema.columns
--  where table_name = 'challenges' and column_name = 'recruit_opened_at';
-- select tgname from pg_trigger where tgname = 'challenges_set_recruit_opened_at';
--
-- 권한이 PUBLIC으로 새지 않았는지 (전부 0행이어야 한다):
-- select p.proname, a.rolname
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   cross join lateral aclexplode(p.proacl) acl
--   join pg_roles a on a.oid = acl.grantee
--  where n.nspname = 'public'
--    and p.proname in ('block_user','unblock_user','report_user',
--                      'list_blocked_users','is_blocked_between',
--                      'list_discoverable_challenges')
--    and a.rolname in ('anon','public');
