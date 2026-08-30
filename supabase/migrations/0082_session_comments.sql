-- 0082: 완료된 운동에 댓글 — `cheers` 테이블 재사용
-- 설계: docs/superpowers/plans/2026-08-30-feed-instagram-restructure.md (Phase A)
-- 적용: Supabase Dashboard → SQL Editor에 전체 붙여넣고 Run (1회만).
--       0001~0081은 수정하지 않는다.
--
-- ⚠ **배포보다 먼저 Run 해도 안전하다.** 전부 "넓히는" 변경이다 —
--   제약 완화 · 허용목록 확장 · 새 컬럼(default) · 새 RPC. 운영에 떠 있는
--   앱은 새 RPC를 부르지 않고, 넓어진 제약 때문에 깨지는 기존 경로가 없다.
--
-- 왜 새 테이블을 안 만드나
--   `cheers`가 이미 (session_id, sender_id, receiver_id, message, created_at)다.
--   읽기 정책 `cheers_select_related`가 이미 `session_crew_shared(session_id)`를
--   허용하고, `cheers_delete_own`이 본인 삭제를 연다. 즉 **구조는 이미 댓글이고**
--   막고 있던 것은 `send_cheer` RPC가 건 정책(active·3회·30자)뿐이었다.
--
-- 무엇을 하나
--   ① message 길이 30 → 200 (댓글은 한마디보다 길다)
--   ② sender_id <> receiver_id CHECK 제거 (본인 글에 답글을 달아야 왕복이 된다)
--   ③ cheer_type 허용목록에 'comment' (데이터가 스스로를 설명하게)
--   ④ notification_settings.comments (응원 스위치를 재사용하면 댓글이 조용히 죽는다)
--   ⑤ notifications 허용목록에 'comment_received'
--   ⑥ post_session_comment RPC — **세션 주인 + 앞선 댓글 작성자 전원**에게 알린다
--
-- ⚠⚠ ②를 해도 `send_cheer`의 본인 응원 금지는 **그대로 산다.** 그건 테이블
--    CHECK가 아니라 RPC 안의 `own_session` 가드다. 이 단언을 갖고 있는 곳:
--    scripts/rls-test.mjs:472 · crew-link-check.mjs:396 · cheer-points-check.mjs:333
--
-- ⚠⚠ **`send_cheer`는 이 파일에서 건드리지 않는다.** 다만 그 안의 3회 제한이
--    `select count(*) from cheers where session_id and sender_id`로 **행 종류를
--    안 가린다.** 지금은 안전하다 — 응원은 active, 댓글은 completed라 한 세션에서
--    시간순으로 겹치지 않는다. **진행 중 세션에도 댓글을 허용하려거든 그 count에
--    `and cheer_type <> 'comment'`를 먼저 넣어라.** 안 그러면 댓글 3개로 응원이 잠긴다.
--
-- 되돌리기 (순서가 있다)
--   ⓐ delete from notifications where type = 'comment_received';
--   ⓑ delete from cheers where cheer_type = 'comment';
--   ⓒ drop function public.post_session_comment(uuid, text);
--   ⓓ 아래 ①③⑤의 제약을 옛 목록으로 다시 Run
--   ⚠ ⓑ보다 ⓓ를 먼저 하면 이미 저장된 행 때문에 제약 위반으로 실패한다.

begin;

-- ════════════════════════════════════════════════════════════
-- ① message 길이 30 → 200
-- ════════════════════════════════════════════════════════════
--
-- ⚠ 제약 이름을 손으로 적지 않는다. 0011이 인라인 `check (...)`로 만든 것이라
--   이름이 Postgres 자동 생성(`cheers_message_check`)인데, 그건 **관례이지 보장이
--   아니다.** 정의를 보고 찾아 지운다 — 이름이 무엇이든 정확히 그 제약만 지운다.

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.cheers'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%char_length(message)%'
  loop
    execute format('alter table public.cheers drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.cheers
  add constraint cheers_message_length_check
  check (message is null or char_length(message) <= 200);

-- ════════════════════════════════════════════════════════════
-- ② 본인 글 답글 허용 — sender_id <> receiver_id CHECK 제거
-- ════════════════════════════════════════════════════════════
--
-- 댓글의 receiver_id는 **세션 주인**이다. 내 운동에 내가 답글을 달면
-- sender = receiver = 나가 되므로 이 CHECK에 걸린다. 대화가 왕복하려면
-- "고마워!"를 쓸 수 있어야 한다.

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.cheers'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%sender_id <> receiver_id%'
  loop
    execute format('alter table public.cheers drop constraint %I', r.conname);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════
-- ③ cheer_type 허용목록에 'comment'
-- ════════════════════════════════════════════════════════════
--
-- 섞어 두고 종류를 안 남기면 나중에 둘을 갈라야 할 때 **갈 수가 없다**
-- (message가 있는 응원과 댓글이 구분 불가). 한 줄로 데이터가 스스로를 말하게 한다.

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.cheers'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%cheer_type%'
  loop
    execute format('alter table public.cheers drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.cheers
  add constraint cheers_cheer_type_check
  check (cheer_type in ('fire', 'power', 'clap', 'finish', 'custom', 'comment'));

-- 스레드는 세션 단위로 시간순으로 읽는다. 기존 인덱스는 (session_id, sender_id,
-- created_at desc)라 선두 컬럼만 맞아서 정렬에 못 쓴다.
create index if not exists cheers_session_created_idx
  on public.cheers (session_id, created_at);

-- ════════════════════════════════════════════════════════════
-- ④ 댓글 알림 스위치 (응원 스위치와 분리)
-- ════════════════════════════════════════════════════════════
--
-- ⚠ `send_cheer`는 `coalesce(ns.cheers, true)`로 알림을 건다. 댓글이 그 스위치를
--   같이 쓰면 "응원 알림 끔"이 **댓글 알림까지** 끈다 — 이번 기능의 핵심이
--   사용자도 모르게 사라진다. 행이 없으면 true인 0011 관례를 따른다.

alter table public.notification_settings
  add column if not exists comments boolean not null default true;

-- ════════════════════════════════════════════════════════════
-- ⑤ notifications 허용목록에 'comment_received'
-- ════════════════════════════════════════════════════════════
--
-- ⚠ 허용목록 방식이라 **목록 전체를 다시 써야 한다** (0078과 같은 수법).
--   아래 23개는 0078이 확정한 현행 목록 그대로이고, 마지막 한 줄만 새것이다.

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
    'comment_received'                                   -- 0082 ← 새것
  ));

-- ════════════════════════════════════════════════════════════
-- ⑥ post_session_comment — 댓글 달기
-- ════════════════════════════════════════════════════════════
--
-- `send_cheer`와 **구조는 같고 정책만 다르다.**
--
--   | | send_cheer | post_session_comment |
--   | 세션 상태 | active만 | completed (workout_session_crew_visible) |
--   | 본인 세션 | 금지(own_session) | 허용 — 답글이 되어야 왕복 |
--   | 횟수 | 3회 | 무제한 (10초 쿨다운만) |
--   | 길이 | 30자 | 200자 |
--   | 포인트 | 지급 | **안 준다** — 댓글로 포인트를 벌면 도배가 이득이 된다 |
--
-- ⚠⚠ **알림은 팬아웃한다.** `cheers.receiver_id`는 세션 주인이라, 주인에게만
--    보내면 이런 일이 난다 — B가 A 글에 댓글 → A에게 알림 ✅ → A가 답글 →
--    receiver가 또 A라서 **A가 자기 알림을 받고 B는 영영 모른다.** 왕복이 안 닫힌다.
--    그래서 세션 주인 + **앞선 댓글 작성자 전원**에게 보낸다.
--    이모지만 누른 사람(message 없는 응원)은 제외한다 — 소음이다.

create or replace function public.post_session_comment(
  p_session_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s        workout_sessions;
  c        cheers;
  v_owner  uuid;
  v_last   timestamptz;
  v_nick   text;
  v_body   text;
  r        record;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then
    raise exception 'comment_empty';
  end if;
  if char_length(v_body) > 200 then
    raise exception 'comment_too_long';
  end if;

  select * into s from workout_sessions where id = p_session_id;
  if not found then
    raise exception 'session_not_found';
  end if;

  -- 완료 · visibility='group' · deleted_at is null · (본인 또는 크루).
  -- **피드가 보여주는 조건과 정확히 같다** — 보이는 것에만 댓글이 달린다.
  if not public.workout_session_crew_visible(p_session_id) then
    raise exception 'session_not_found';
  end if;

  v_owner := s.user_id;

  -- 도배 방어. 응원의 3회 제한과 달리 총량은 안 막는다(대화니까).
  select max(created_at) into v_last
  from cheers
  where session_id = p_session_id
    and sender_id = auth.uid()
    and cheer_type = 'comment';
  if v_last is not null and v_last > now() - interval '10 seconds' then
    raise exception 'comment_cooldown';
  end if;

  insert into cheers (session_id, sender_id, receiver_id, cheer_type, message)
  values (p_session_id, auth.uid(), v_owner, 'comment', v_body)
  returning * into c;

  select nickname into v_nick from profiles where id = auth.uid();

  -- 팬아웃. union이 중복을 접는다.
  for r in
    select v_owner as uid
    union
    select ch.sender_id
    from cheers ch
    where ch.session_id = p_session_id
      and ch.cheer_type = 'comment'
  loop
    continue when r.uid = auth.uid();          -- 내가 쓴 글을 나에게 알리지 않는다
    continue when r.uid is null;

    -- 행이 없으면 true (0011 관례)
    if coalesce(
         (select ns.comments from notification_settings ns where ns.user_id = r.uid),
         true
       ) then
      perform notify(
        r.uid,
        auth.uid(),
        'comment_received',
        p_session_id,                          -- ⚠ 세션 id다. 딥링크가 이걸 쓴다
        coalesce(v_nick, '크루원') ||
          case when r.uid = v_owner
               then '님이 내 운동에 댓글을 남겼어요 💬'
               else '님도 이 운동에 댓글을 남겼어요 💬'
          end,
        left(v_body, 120)
      );
    end if;
  end loop;

  return jsonb_build_object('id', c.id, 'created_at', c.created_at);
end $$;

grant execute on function public.post_session_comment(uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) 길이 제약이 200으로 넓어졌나 — 1
--   select count(*) from pg_constraint
--   where conrelid = 'public.cheers'::regclass
--     and pg_get_constraintdef(oid) like '%char_length(message) <= 200%';
--
-- (2) 본인 답글 CHECK가 사라졌나 — 0
--   select count(*) from pg_constraint
--   where conrelid = 'public.cheers'::regclass
--     and pg_get_constraintdef(oid) like '%sender_id <> receiver_id%';
--
-- (3) cheer_type에 comment가 들어갔나 — 1
--   select count(*) from pg_constraint
--   where conrelid = 'public.cheers'::regclass
--     and pg_get_constraintdef(oid) like '%comment%';
--
-- (4) 알림 유형 — 1
--   select count(*) from pg_constraint
--   where conname = 'notifications_type_check'
--     and pg_get_constraintdef(oid) like '%comment_received%';
--
-- (5) 알림 스위치 컬럼 — 1
--   select count(*) from information_schema.columns
--   where table_name = 'notification_settings' and column_name = 'comments';
