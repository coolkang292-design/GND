-- 0088: 챌린지 시작·취소·참가 알림
-- 설계: docs/superpowers/plans/2026-08-31-follow-profile-discoverable.md
-- 적용: Supabase Dashboard -> SQL Editor에 전체 붙여넣고 Run (1회만).
--       0001~0087은 수정하지 않는다.
--
-- 배포보다 먼저 Run 해도 안전하다. 알림 유형 2개를 허용목록에 더하고 기존 RPC
-- 안에서 notify를 부를 뿐이다. 옛 클라이언트는 모르는 유형을 아이콘 없이
-- 그리지만 목록 자체는 뜬다.
--
-- ── 무엇이 비어 있었나 (운영 DB 실측) ──────────────────────
--
--   자동 시작(예정일)        challenge_started        있음  autostart_due_challenges
--   시작 전날 예고           challenge_starting_soon  있음  remind_upcoming_challenges
--   목표 없어 탈락           challenge_dropped        있음  autostart_due_challenges
--   기간 종료                challenge_ended          있음  autofinalize_due_challenges
--   **방장이 직접 시작**     -                        **없음**
--   **챌린지 취소**          -                        **없음** (유형조차 없었다)
--   **공개 모집 새 참가자**  -                        **없음**
--
-- 지금까지는 티가 덜 났다. 방은 초대받은 아는 사람들만 있었고 밖에서 말로
-- 전했을 테니까. 그런데 0085~0087로 **공개 모집**을 열었다 — 모르는 사람이
-- 들어온다. 그 사람에게 취소는 "아무 말 없이 방이 사라진 것"이고, 직접 시작은
-- "시작한 줄 모르는 것"이다.
--
-- 무엇을 하나
--   1) 알림 유형 2개 추가: challenge_cancelled · challenge_joined
--   2) start_challenge  - 참가자 전원에게 시작 알림 (본인 제외)
--   3) cancel_challenge - 참가자 전원에게 취소 알림 (본인 제외)
--   4) join_discoverable_challenge - 방장에게 새 참가자 알림
--
-- 되돌리기 (순서가 있다)
--   ⓐ delete from notifications where type in ('challenge_cancelled','challenge_joined');
--   ⓑ 그 다음에 허용목록을 옛 목록으로 다시 Run
--   ⓒ 세 함수는 docs/db-current-schema.sql 이력의 0087 시점 정의를 다시 Run
--   ⚠ ⓑ를 먼저 하면 이미 저장된 행 때문에 제약 위반으로 실패한다.

begin;

-- ============================================================
-- 1) 알림 유형 2개
-- ============================================================
--
-- ⚠️ 허용목록 방식이라 **목록 전체를 다시 써야 한다** (0078·0082와 같은 수법).
--    아래 24개는 0082가 확정한 현행 목록이고, 마지막 두 줄만 새것이다.

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in (
    'workout_started', 'cheer_received', 'poke', 'reaction_received',
    'rank_change', 'record_viewed', 'morning_briefing',
    'challenge_started', 'challenge_ended', 'record_beaten', 'badge_earned',
    'level_up', 'app_update',
    'crew_request', 'crew_accepted',                     -- 0038
    'challenge_invite',                                  -- 0042
    'bug_reported', 'bug_fixed',                         -- 0052
    'challenge_peek_unlocked',                           -- 0054
    'challenge_starting_soon', 'challenge_dropped',      -- 0077
    'workout_suggestion',                                -- 0078
    'comment_received',                                  -- 0082
    'challenge_cancelled',                               -- 0088 <- 새것
    'challenge_joined'                                   -- 0088 <- 새것
  ));

-- ============================================================
-- 2) start_challenge - 시작 알림
-- ============================================================
--
-- 아래 본문은 운영 스냅샷에서 **그대로 추출**해 두 곳만 기계로 끼운 것이다
-- (declare 두 줄, update 뒤 알림 루프). 손으로 옮겨 적지 않았다 —
-- 시작은 되돌릴 수 없는 상태 전이라 전사 오류의 대가가 크다.

CREATE OR REPLACE FUNCTION public.start_challenge(p_challenge_id uuid)
 RETURNS challenges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r      record;
  v_nick text; c challenges; total int; missing int; approvals int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from challenges where id = p_challenge_id for update;
  -- 0045: is_group_member → is_challenge_participant
  if not found or not public.is_challenge_participant(p_challenge_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  -- 0045: group_members → challenge_participants (joined만)
  select count(*) into total from challenge_participants cp
  where cp.challenge_id = p_challenge_id and cp.status = 'joined';

  -- 참가자가 0명인 상태로 시작되면 랭킹도 집계도 빈 껍데기가 된다.
  -- create_challenge_room이 방장을 host·joined로 넣으므로 정상 경로에선 1 이상이다.
  if total = 0 then raise exception 'no_participants'; end if;

  select count(*) into missing from challenge_participants cp
  where cp.challenge_id = p_challenge_id
    and cp.status = 'joined'
    and not exists (select 1 from user_goals ug
                    where ug.challenge_id = p_challenge_id and ug.user_id = cp.user_id);
  if missing > 0 then raise exception 'kpi_incomplete:%/%', total - missing, total; end if;

  -- 전원 동의 게이트 (0025). 대상만 참가자로 바뀐다.
  select count(*) into approvals from challenge_goal_approvals a
  where a.challenge_id = p_challenge_id
    and exists (select 1 from challenge_participants cp
                where cp.challenge_id = p_challenge_id
                  and cp.user_id = a.approver_id
                  and cp.status = 'joined');
  if approvals < total then raise exception 'consent_incomplete:%/%', approvals, total; end if;

  update challenges set status = 'active' where id = p_challenge_id returning * into c;

  -- ── 0088: 시작 알림 ────────────────────────────────────────
  --
  -- 여기가 비어 있었다. `autostart_due_challenges`(예정일 도래)에만 알림이 붙어
  -- 있어서, **방장이 `지금 바로 시작하기`로 직접 시작하면 아무도 몰랐다.**
  -- 공개 모집으로 모르는 사람이 들어오면서 이게 진짜 문제가 된다 — 밖에서 말로
  -- 전할 사이가 아니다.
  --
  -- ⚠️ 중복 알림은 안 난다. `autostart_due_challenges`는 `setup`인 방만 올리는데,
  --    여기까지 왔으면 이미 `active`라 그 cron이 이 방을 건드리지 않는다.
  select nickname into v_nick from profiles where id = auth.uid();

  for r in
    select cp.user_id
    from challenge_participants cp
    where cp.challenge_id = p_challenge_id
      and cp.status = 'joined'
  loop
    continue when r.user_id = auth.uid();   -- 시작한 본인에게는 안 보낸다
    perform notify(
      r.user_id,
      auth.uid(),
      'challenge_started',
      p_challenge_id,                        -- ⚠ 챌린지 id다. 딥링크가 이걸 쓴다
      '🚀 ' || c.name || ' 시작!',
      coalesce(v_nick, '방장') || '님이 챌린지를 시작했어요'
    );
  end loop;

  return c;
end $function$;

-- ============================================================
-- 3) cancel_challenge - 취소 알림
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_challenge(p_challenge_id uuid)
 RETURNS challenges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c      challenges;
  r      record;
  v_nick text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into c from challenges
  where id = p_challenge_id and created_by = auth.uid()
  for update;

  if not found then
    raise exception 'challenge_not_found';
  end if;
  if c.status not in ('setup', 'active') then
    raise exception 'invalid_status:%', c.status;
  end if;

  -- ⚠️ 알림 대상을 **상태를 바꾸기 전에** 모은다. 참가자 행은 그대로 남지만,
  --    순서를 뒤집으면 나중에 정리 로직이 붙었을 때 조용히 0명이 된다.
  select nickname into v_nick from profiles where id = auth.uid();

  update challenges set status = 'cancelled'
  where id = p_challenge_id
  returning * into c;

  -- ── 0088: 취소 알림 ────────────────────────────────────────
  --
  -- 여기가 비어 있었다. 취소하면 **아무 말 없이 방이 사라졌다.** 아는 사람끼리는
  -- 밖에서 전했겠지만, 공개 모집으로 들어온 사람은 목표까지 세워 두고도 이유를
  -- 알 길이 없다.
  for r in
    select cp.user_id
    from challenge_participants cp
    where cp.challenge_id = p_challenge_id
      and cp.status = 'joined'
  loop
    continue when r.user_id = auth.uid();   -- 취소한 본인에게는 안 보낸다
    perform notify(
      r.user_id,
      auth.uid(),
      'challenge_cancelled',
      p_challenge_id,
      '💤 ' || c.name || ' 취소됨',
      coalesce(v_nick, '방장') || '님이 챌린지를 취소했어요'
    );
  end loop;

  return c;
end $function$;

-- ============================================================
-- 4) join_discoverable_challenge - 방장에게 새 참가자 알림
-- ============================================================
--
-- ⚠️ **초대 코드 참가(`join_challenge_with_code`)에는 안 붙인다.** 그건 방장이
--    직접 링크를 보내서 부른 사람이라 이미 알고 있다. 공개 모집만 "모르는
--    사람이 스스로 들어온" 경우다 — 방장이 알아야 시작 시점을 정할 수 있다.
--
-- ⚠️ 알림 실패가 참가를 되돌리면 안 된다. `notify`는 단순 insert라 실패할 일이
--    거의 없지만, 그래도 참가 성공 뒤에 부른다.

create or replace function public.join_discoverable_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me   uuid := auth.uid();
  c      public.challenges;
  v_row  public.challenge_participants;
  v_nick text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  -- 1차 조회: 공개된 방인가
  if not exists (
    select 1 from public.challenges
    where id = p_challenge_id and discoverable
  ) then
    raise exception 'not_discoverable';
  end if;

  -- 2차: 행을 잠그고 다시 읽는다. start_challenge와 같은 자원이다.
  --
  -- ⚠️⚠️ advisory lock으로 바꾸지 마라. `start_challenge`는 advisory lock을
  --    쓰지 않고 challenges 행에 FOR UPDATE를 건다 — 다른 자원을 잡으면 둘이
  --    서로를 전혀 막지 않아 **시작된 챌린지에 중도 합류**가 생긴다.
  select * into c
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then raise exception 'not_discoverable'; end if;
  if not c.discoverable then raise exception 'not_discoverable'; end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  select * into v_row
  from public.challenge_participants
  where challenge_id = c.id
    and user_id = v_me
  for update;

  if found and v_row.status = 'joined' then
    raise exception 'already_joined';
  end if;

  insert into public.challenge_participants (
    challenge_id, user_id, role, status, joined_at
  ) values (
    c.id, v_me, 'member', 'joined', now()
  )
  on conflict (challenge_id, user_id)
  do update set status = 'joined', joined_at = now();

  -- 0088: 방장에게 알린다
  if c.created_by <> v_me then
    select nickname into v_nick from profiles where id = v_me;
    perform notify(
      c.created_by,
      v_me,
      'challenge_joined',
      c.id,
      coalesce(v_nick, '크루원') || '님이 참가했어요 🙌',
      c.name
    );
  end if;

  return jsonb_build_object(
    'status', 'joined',
    'challengeId', c.id,
    'challengeName', c.name,
    'crewLinked', 0
  );
end $$;

-- ⚠️ `create or replace`는 권한을 유지하지만, 0085에서 걷어낸 PUBLIC이 확실히
--    빠져 있는지 한 번 더 못 박는다.
revoke execute on function public.join_discoverable_challenge(uuid) from public, anon;
grant  execute on function public.join_discoverable_challenge(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) 알림 유형 2개 — 2
--   select count(*) from pg_constraint
--   where conname='notifications_type_check'
--     and pg_get_constraintdef(oid) like '%challenge_cancelled%'
--   union all
--   select count(*) from pg_constraint
--   where conname='notifications_type_check'
--     and pg_get_constraintdef(oid) like '%challenge_joined%';
--
-- (2) 세 함수가 알림을 보내는가 — 셋 다 true
--   select proname, pg_get_functiondef(oid) ilike '%perform notify(%'
--   from pg_proc where proname in
--     ('start_challenge','cancel_challenge','join_discoverable_challenge');
--
-- (3) ⚠️ 참가 RPC의 행 잠금이 살아 있나 — true
--     (알림을 넣으면서 함수를 다시 썼다. 이게 false면 중도 합류가 뚫린다.)
--   select pg_get_functiondef(oid) ilike '%for update%'
--   from pg_proc where proname='join_discoverable_challenge';
--
-- (4) ⚠️ anon EXECUTE — 0
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='join_discoverable_challenge'
--     and array_to_string(p.proacl,',') like '%anon=X%';
