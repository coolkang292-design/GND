-- 0042: 챌린지 방 (1/3 · 추가만) — 참가자 테이블 · 초대 RPC · 백필
-- 설계: docs/superpowers/specs/2026-07-29-challenge-rooms-design.md
-- 계획: docs/superpowers/plans/2026-07-30-challenge-rooms-0042.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0041은 수정 금지.
--
-- 이 파일은 테이블·RPC·백필을 "추가"만 한다. 기존 challenges·user_goals·
-- groups 경로는 한 줄도 건드리지 않으므로, 적용 직후에도 앱은 지금과 똑같이
-- 돈다. 실제 전환은 0043이다.
--
-- 순서를 나눈 이유: 0042만 적용된 상태로 실기기 확인을 한 뒤 0043으로 넘어가야
-- 문제가 생겨도 되돌릴 지점이 있다. 0038→0039에서 검증된 방식이다.
--
-- ⚠ 부분 선택 실행 금지. 이 파일은 begin;~commit;으로 명시적으로 감싼다.
--    begin;부터 잘린 조각은 커밋되지 않고, begin; 없이 뒷부분만 돌리면 남는
--    commit;에서 에러가 나 그 자리에 멈춘다. 어느 쪽이든 절반만 적용되는 일은
--    없다.
--
-- 되돌리기: challenge_participants를 drop하고 아래 RPC들을 drop하고, 알림유형
--    CHECK를 0038:77의 15종으로 되돌리면 된다. 앱이 이 테이블을 읽지 않으므로
--    위험이 없다.

begin;

-- ── 1. 참가자 테이블 ────────────────────────────────────────
-- groups/group_members가 하던 "명단" 역할을 챌린지가 직접 한다.
--
-- status 세 값의 뜻:
--   invited — 초대됐고 아직 응답 없음
--   joined  — 수락함. 목표까지 세우면 참가 확정
--   dropped — 시작 시점에 목표가 없어 명단에서 빠짐 (설계 §4.2)
--
-- dropped를 두는 이유: 행을 지우면 수락 때 맺어진 crew_links의 근거가 사라져
-- "왜 이 사람이 내 크루지"를 설명할 수 없다. 랭킹·집계에서는 빠지지만 이력은
-- 남긴다.
create table if not exists public.challenge_participants (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('host', 'member')),
  status text not null default 'invited'
    check (status in ('invited', 'joined', 'dropped')),
  invited_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- "내가 낀 챌린지" 조회용 (RLS 정책과 화면 목록이 둘 다 이 방향으로 탄다)
create index if not exists challenge_participants_user_idx
  on public.challenge_participants (user_id, status);

-- 챌린지당 host는 1명 — 취소 권한이 갈리면 안 된다
create unique index if not exists challenge_participants_one_host
  on public.challenge_participants (challenge_id) where role = 'host';

-- ── 2. RLS — 읽기만 열고 쓰기는 RPC로만 ─────────────────────
-- 0038과 같은 방식이다. 직접 insert를 허용하면 초대 없이 남의 챌린지에
-- 참가자로 끼어들 수 있다.
alter table public.challenge_participants enable row level security;
revoke all on public.challenge_participants from anon, authenticated;
grant select on public.challenge_participants to authenticated;

-- 판정 함수를 먼저 만든다. 정책 안에서 같은 테이블을 서브쿼리로 읽으면
-- 무한 재귀(42P17)가 된다 — security definer 함수로 우회한다.
create or replace function public.is_challenge_participant(cid uuid, uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.challenge_participants
    where challenge_id = cid and user_id = uid
  )
$$;
-- ⚠ revoke하지 않는다. RLS 정책이 부르는 판정 함수는 호출자 권한으로 평가되므로
--    revoke하면 anon 요청이 0행이 아니라 42501로 죽는다 (0038의 is_crew_with와
--    같은 이유 — 0038:64 주석 참조).

drop policy if exists "challenge_participants_select_member" on public.challenge_participants;
create policy "challenge_participants_select_member" on public.challenge_participants
  for select to authenticated
  using (public.is_challenge_participant(challenge_id, auth.uid()));

-- ── 3. 알림 유형 challenge_invite 추가 ──────────────────────
-- ⚠ 기존 15종을 하나도 빠뜨리면 안 된다. 빠뜨리면 그 유형을 쓰는 기존 알림이
--    조용히 죽는다. 아래 목록은 현행(0038:77)에 challenge_invite만 더한 것이다.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'workout_started', 'cheer_received', 'poke', 'reaction_received',
  'rank_change', 'record_viewed', 'morning_briefing',
  'challenge_started', 'challenge_ended', 'record_beaten', 'badge_earned',
  'level_up', 'app_update',
  'crew_request', 'crew_accepted',
  'challenge_invite'                                   -- 0042
));

-- ── 4. RPC — 생성·초대·수락·거절 ────────────────────────────
-- 전부 security definer다. 쓰기를 RPC로만 열었으므로(2절) 여기가 유일한 입구다.

-- 4.1 생성 — 방장을 host·joined로 함께 넣는다.
-- 두 단계로 나누면 "참가자 없는 챌린지"가 생길 수 있다. 취소할 사람이 없어진다.
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

  -- 0042는 challenges.group_id를 아직 못 지운다(not null). 0044에서 드롭할
  -- 때까지는 방장의 그룹을 그대로 채워 둔다 — 혼자모드 유저는 그룹이 없으므로
  -- 그때는 생성이 막힌다. 그 제약이 풀리는 건 0043·0044다.
  select gm.group_id into v_group
  from group_members gm where gm.user_id = v_me
  order by gm.created_at limit 1;
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

-- 4.2 초대 — setup 단계에서만, 방장만.
create or replace function public.invite_to_challenge(
  p_challenge_id uuid, p_target_id uuid
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  c challenges;
  v_nick text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_target_id = v_me then raise exception 'self_invite'; end if;

  select * into c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'challenge_not_found'; end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  if not exists (
    select 1 from challenge_participants
    where challenge_id = p_challenge_id and user_id = v_me and role = 'host'
  ) then
    raise exception 'not_host';
  end if;

  if not exists (select 1 from profiles where id = p_target_id) then
    raise exception 'target_not_found';
  end if;

  -- 이미 초대했거나 참가 중이면 알린다. 조용히 넘기면 화면이 "보냈어요"를
  -- 두 번 띄우고 사용자는 상대가 왜 안 들어오는지 모른다.
  if exists (
    select 1 from challenge_participants
    where challenge_id = p_challenge_id and user_id = p_target_id
  ) then
    raise exception 'already_invited';
  end if;

  insert into challenge_participants (challenge_id, user_id, role, status, invited_by)
  values (p_challenge_id, p_target_id, 'member', 'invited', v_me);

  select nickname into v_nick from profiles where id = v_me;
  -- 알림 실패가 초대를 되돌리면 안 된다. 초대가 본체고 알림은 곁가지다.
  -- (0029에서 알림 insert 하나가 운동 완료 트랜잭션을 롤백시킨 전례가 있다.)
  begin
    perform notify(
      p_target_id, v_me, 'challenge_invite', p_challenge_id,
      coalesce(v_nick, '크루원') || '님이 챌린지에 초대했어요 🏆',
      c.name || ' · ' || to_char(c.start_date, 'MM/DD') || '~' || to_char(c.end_date, 'MM/DD')
    );
  exception when others then null;
  end;

  return jsonb_build_object('status', 'invited');
end $$;
revoke all on function public.invite_to_challenge(uuid, uuid) from public, anon;
grant execute on function public.invite_to_challenge(uuid, uuid) to authenticated;

-- 4.3 수락 — joined 전환 + 기존 joined 참가자 전원과 crew_links (설계 D5)
--
-- 완전 연결이어야 하는 이유: A가 B와 C를 초대했을 때 A-B·A-C만 만들면 B는
-- 랭킹판에서 C의 닉네임을 못 읽는다(profiles SELECT가 크루 기준이다).
create or replace function public.accept_challenge_invite(p_challenge_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  c challenges;
  v_row challenge_participants;
  v_linked int := 0;
  v_peer uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  -- 챌린지 단위 직렬화. 두 사람이 동시에 수락하면 서로를 "기존 참가자"로
  -- 못 보고 crew_links가 한쪽만 생기거나, 락 순서가 엇갈려 데드락이 난다.
  perform pg_advisory_xact_lock(hashtext(p_challenge_id::text));

  select * into c from challenges where id = p_challenge_id;
  if not found then raise exception 'challenge_not_found'; end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  select * into v_row from challenge_participants
  where challenge_id = p_challenge_id and user_id = v_me for update;
  if not found then raise exception 'not_invited'; end if;
  if v_row.status = 'joined' then raise exception 'already_joined'; end if;
  if v_row.status = 'dropped' then raise exception 'dropped'; end if;

  -- 크루 연결을 먼저 만든다. 내 status를 joined로 바꾼 뒤에 돌면 자기 자신이
  -- 목록에 들어와 crew_links_not_self 위반이 된다.
  for v_peer in
    select user_id from challenge_participants
    where challenge_id = p_challenge_id and status = 'joined' and user_id <> v_me
  loop
    insert into crew_links (user_a, user_b)
    values (least(v_me, v_peer), greatest(v_me, v_peer))
    on conflict do nothing;
    v_linked := v_linked + 1;
  end loop;

  update challenge_participants
     set status = 'joined', joined_at = now()
   where challenge_id = p_challenge_id and user_id = v_me;

  return jsonb_build_object('status', 'joined', 'crewLinked', v_linked);
end $$;
revoke all on function public.accept_challenge_invite(uuid) from public, anon;
grant execute on function public.accept_challenge_invite(uuid) to authenticated;

-- 4.4 거절 — 행을 지운다. 나중에 다시 초대할 수 있어야 한다.
create or replace function public.decline_challenge_invite(p_challenge_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_row challenge_participants;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into v_row from challenge_participants
  where challenge_id = p_challenge_id and user_id = v_me for update;
  if not found then raise exception 'not_invited'; end if;
  if v_row.status <> 'invited' then raise exception 'not_invited'; end if;

  delete from challenge_participants
  where challenge_id = p_challenge_id and user_id = v_me;

  return jsonb_build_object('status', 'declined');
end $$;
revoke all on function public.decline_challenge_invite(uuid) from public, anon;
grant execute on function public.decline_challenge_invite(uuid) to authenticated;

-- ── 5. 자동 시작·종료 (설계 §4.1) ───────────────────────────
-- 크론(09:00 KST 브리핑에 얹음)과 화면 진입 시 지연 전환이 둘 다 부른다.
-- 그래서 멱등해야 한다 — 두 번 불러도 결과가 같아야 한다.
--
-- ⚠ 정각 전환이 아니다. "시작일 00:00 KST가 지난 뒤, 첫 화면 진입과 09:00
--   크론 중 먼저 실행되는 경로"에서 바뀐다. 자정 크론을 새로 만들지 않는다 —
--   집계는 start_date 기준이라 전환이 몇 시간 늦어도 운동이 누락되지 않는다.
create or replace function public.autostart_due_challenges()
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_started int := 0;
  v_dropped int := 0;
  v_dropped_now int := 0;
  c record;
begin
  for c in
    select ch.id from challenges ch
    where ch.status = 'setup' and ch.start_date <= v_today
    order by ch.start_date
    for update
  loop
    -- 목표 0개인 joined는 명단에서 뺀다 (설계 §4.2). 행은 남긴다 — 지우면
    -- 수락 때 맺어진 crew_links의 근거가 사라진다.
    update challenge_participants cp
       set status = 'dropped'
     where cp.challenge_id = c.id
       and cp.status = 'joined'
       and not exists (
         select 1 from user_goals ug
         where ug.challenge_id = c.id and ug.user_id = cp.user_id
       );
    -- ⚠ 이번 update가 바꾼 행 수만 더한다. select count(*)로 세면 이미
    --    dropped였던 행까지 매 루프마다 다시 더해져 과다 집계된다.
    --    ROW_COUNT는 직전 문장의 값이므로 update 바로 뒤에서 읽어야 한다.
    get diagnostics v_dropped_now = row_count;
    v_dropped := v_dropped + v_dropped_now;

    -- 미응답 초대는 만료시킨다
    delete from challenge_participants
    where challenge_id = c.id and status = 'invited';

    update challenges set status = 'active' where id = c.id;
    v_started := v_started + 1;

    -- 참가자 전원에게 시작 알림
    begin
      perform notify(
        cp.user_id, null, 'challenge_started', c.id,
        '🏁 챌린지가 시작됐어요', '오늘부터 기록이 반영돼요'
      ) from challenge_participants cp
      where cp.challenge_id = c.id and cp.status = 'joined';
    exception when others then null;
    end;
  end loop;

  return jsonb_build_object('started', v_started, 'dropped', v_dropped);
end $$;
revoke all on function public.autostart_due_challenges() from public, anon;
grant execute on function public.autostart_due_challenges() to authenticated;

-- 종료도 자동이다. 지금은 누군가 "결과 발표하기"를 눌러야 ended가 되는데,
-- 챌린지가 여러 개면 아무도 안 누른 채 방치되는 게 확실하다.
create or replace function public.autofinalize_due_challenges()
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_ended int := 0;
  c record;
begin
  for c in
    select ch.id from challenges ch
    where ch.status = 'active' and ch.end_date < v_today
    order by ch.end_date
    for update
  loop
    update challenges set status = 'ended' where id = c.id;
    v_ended := v_ended + 1;
    begin
      perform notify(
        cp.user_id, null, 'challenge_ended', c.id,
        '🏆 결과가 나왔어요', '챌린지 탭에서 최종 순위를 확인하세요'
      ) from challenge_participants cp
      where cp.challenge_id = c.id and cp.status = 'joined';
    exception when others then null;
    end;
  end loop;

  return jsonb_build_object('ended', v_ended);
end $$;
revoke all on function public.autofinalize_due_challenges() from public, anon;
grant execute on function public.autofinalize_due_challenges() to authenticated;

commit;

-- ── 적용 전/후 확인 (SQL Editor에서 따로 실행) ───────────────
--   select count(*) from public.challenge_participants;
--   select role, status, count(*) from public.challenge_participants group by 1, 2;
--   → 백필(6절)이 채운 행. 전부 joined이고 host는 챌린지 수와 같아야 한다.
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'notifications_type_check';
--   → 16종. challenge_invite가 있고 기존 15종이 전부 살아 있어야 한다.
--     하나라도 빠지면 그 유형의 알림이 조용히 죽는다.
