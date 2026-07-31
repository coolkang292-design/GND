-- 0052: 버그 신고 파이프라인 — 신고 저장 + 관리자 즉시 알림
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0051은 수정 금지.
--
-- 설계: docs/superpowers/specs/2026-07-31-bug-report-pipeline-design.md
--
-- 왜: 지금 신고 경로는 "사용자가 말로 알려주면 에이전트가 코드 주석에 날짜를 박는 것"
-- 뿐이다. 신고 시점의 맥락(어느 화면·어떤 기기·어떤 번들)은 그때 이미 사라져 있어
-- 재현할 수 없다. 실제로 2026-07-31 초대 링크 건, 0044 챌린지 3중복 건,
-- 7/29~30 배포 누락 건이 모두 그래서 오래 걸렸다.
--
-- ⚠ 이 마이그레이션은 기존 행을 하나도 건드리지 않는다. 새 테이블 2개와 새 함수뿐이고,
--   notifications의 type 허용목록만 **넓힌다**(좁히지 않는다).

begin;

-- ── 1. 신고 테이블 ──────────────────────────────────────────
--
-- user_id가 auth.users를 가리키는 이유: **프로필이 없는 사용자도 신고할 수 있어야
-- 한다.** 온보딩에서 막힌 사람이야말로 신고가 필요한데, profiles를 가리키면 그
-- 사람은 영영 신고할 수 없다. (notifications.user_id는 profiles를 가리키므로
-- 아래 트리거에서 actor_id를 따로 처리한다.)
create table if not exists public.bug_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  message       text not null,
  -- 신고 버튼을 누른 시점의 경로. 사람에게 묻지 않고 브라우저가 채운다.
  route         text,
  -- build(빌드 시각) · ua · viewport · tz · online. 값이 아니라 환경만 담는다.
  context       jsonb not null default '{}'::jsonb,
  -- 최근 동작·실패 흔적. **최신이 앞(index 0)**. 서버가 30개로 자른다.
  trail         jsonb not null default '[]'::jsonb,
  status        text not null default 'new',
  -- 에이전트가 남기는 원인·판단
  triage_note   text,
  -- release-notes.data.json의 id. 어느 배포로 닫혔는지.
  fixed_release text,
  resolved_at   timestamptz,
  -- 신고자에게 "고쳤어요"를 보낸 시각. 두 번 보내지 않기 위한 표식.
  notified_at   timestamptz,
  constraint bug_reports_status_check
    check (status in ('new', 'triaged', 'fixed', 'wontfix')),
  -- RPC에서도 검사하지만 제약을 함께 둔다 — service_role 스크립트가 직접 넣을 때도
  -- 형식이 지켜져야 한다.
  constraint bug_reports_message_len
    check (char_length(message) between 2 and 1000)
);

create index if not exists bug_reports_status_time_idx
  on public.bug_reports (status, created_at desc);
create index if not exists bug_reports_user_time_idx
  on public.bug_reports (user_id, created_at desc);

alter table public.bug_reports enable row level security;

-- 신고자는 자기 신고만 읽는다(상태가 fixed로 바뀐 걸 볼 수 있어야 한다).
drop policy if exists bug_reports_select_own on public.bug_reports;
create policy bug_reports_select_own on public.bug_reports
  for select to authenticated
  using (user_id = auth.uid());

-- ⚠ INSERT·UPDATE·DELETE 정책을 **일부러 두지 않는다.**
--   신고는 submit_bug_report RPC로만 들어온다 — 레이트 리밋·크기 제한·중복 흡수를
--   우회할 수 없게 하기 위해서다. 상태 변경은 service_role 스크립트만 한다.
revoke all on public.bug_reports from anon;

-- ── 2. 알림 받는 사람 ───────────────────────────────────────
--
-- 왜 테이블인가: DB 트리거는 Vercel 환경변수(ADMIN_USER_IDS)를 읽을 수 없다.
--
-- 왜 "관리자"가 아니라 별도 목록인가: GND는 익명 인증이라 **한 사람이 기기마다
-- 다른 계정을 갖는다.** 관리자 목록에는 PC·사파리 계정도 들어 있는데 그쪽엔
-- 푸시 구독이 없어 알림이 허공으로 간다. 여기 필요한 건 "관리자"가 아니라
-- **푸시가 실제로 닿는 폰 계정**이다.
create table if not exists public.bug_report_watchers (
  user_id  uuid primary key references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  note     text
);

alter table public.bug_report_watchers enable row level security;
-- 정책 없음 = 앱에서 아무도 못 읽는다. SECURITY DEFINER 트리거와 service_role만 본다.
-- 누가 신고를 받아보는지는 일반 사용자가 알 필요가 없다.
revoke all on public.bug_report_watchers from anon, authenticated;

-- 2026-07-31 사용자 본인 확인: 오뎅끼데스까 = 폰(아이폰) 계정.
-- push_subscriptions ⋈ profiles ⋈ ADMIN_USER_IDS의 교집합이 정확히 이 하나였다.
insert into public.bug_report_watchers (user_id, note)
values (
  '4fa751c8-8ee6-4e74-bcac-68f963ff032f',
  '오뎅끼데스까 — 폰(아이폰) 계정. 2026-07-31 사용자 본인 확인'
)
on conflict (user_id) do nothing;

-- ── 3. 알림 유형 2개 추가 ───────────────────────────────────
--   bug_reported — 관리자에게: 새 신고가 들어왔다
--   bug_fixed    — 신고자에게: 네가 신고한 게 고쳐졌다
--
-- ⚠️ 이 제약은 **허용목록 통째 재정의**다. drop + add라 빠뜨린 유형은 그 순간
--    사라지고, 그 유형의 알림은 이후 insert가 실패해 **조용히 죽는다.**
--
--    현행 정의는 0034가 아니라 **0042**다(16종). 0034 목록을 베끼면
--    `crew_request`·`crew_accepted`가 빠져 크루 요청·수락 알림이 죽는다.
--    실제로 이 파일을 처음 쓸 때 그렇게 틀렸다 — 베끼기 전에 마지막으로
--    덮어쓴 파일을 확인하라(CLAUDE.md의 규칙이 가리키는 지점이 정확히 여기다).
--
--    적용 후 확인 — **18종**이어야 하고 기존 16종이 전부 살아 있어야 한다:
--      select pg_get_constraintdef(oid) from pg_constraint
--      where conname = 'notifications_type_check';
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
    'bug_reported', 'bug_fixed'                          -- 0052
  ));

-- ── 4. 신고 접수 RPC ────────────────────────────────────────
--
-- 클라이언트가 보낸 것을 그대로 믿지 않는다. 길이·타입·크기를 전부 서버가 다시 본다.
create or replace function public.submit_bug_report(
  p_message text,
  p_route   text  default null,
  p_context jsonb default '{}'::jsonb,
  p_trail   jsonb default '[]'::jsonb
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me       uuid := auth.uid();
  v_msg      text;
  v_existing uuid;
  v_recent   int;
  v_context  jsonb;
  v_trail    jsonb;
  v_id       uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  v_msg := btrim(coalesce(p_message, ''));
  if char_length(v_msg) < 2    then raise exception 'message_too_short'; end if;
  if char_length(v_msg) > 1000 then raise exception 'message_too_long';  end if;

  -- 중복 흡수 — 2분 내 같은 사람·같은 문장이면 **기존 신고 id를 그대로 돌려준다.**
  -- 버튼 연타나 네트워크 재시도가 신고를 늘리면 안 되고, 사용자에게 에러를 보여줄
  -- 일도 아니다(그 사람 입장에선 접수된 게 맞다).
  select id into v_existing
  from bug_reports
  where user_id = v_me
    and message = v_msg
    and created_at > now() - interval '2 minutes'
  order by created_at desc
  limit 1;
  if found then return v_existing; end if;

  -- 레이트 리밋 — 스팸보다 오작동(무한 재시도 루프) 방어가 목적이다.
  select count(*) into v_recent
  from bug_reports
  where user_id = v_me and created_at > now() - interval '10 minutes';
  if v_recent >= 3 then raise exception 'rate_limited'; end if;

  -- context: 객체가 아니면 버린다. 8KB 넘으면 거부한다.
  v_context := coalesce(p_context, '{}'::jsonb);
  if jsonb_typeof(v_context) <> 'object' then v_context := '{}'::jsonb; end if;
  if pg_column_size(v_context) > 8192 then raise exception 'context_too_large'; end if;

  -- trail: 배열이 아니면 버린다. **앞에서부터 30개**만 남긴다(클라이언트가 최신순으로
  -- 보낸다 — bug-trail.ts의 readTrail()이 그 순서를 보장한다).
  v_trail := coalesce(p_trail, '[]'::jsonb);
  if jsonb_typeof(v_trail) <> 'array' then v_trail := '[]'::jsonb; end if;
  if jsonb_array_length(v_trail) > 30 then
    select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into v_trail
    from jsonb_array_elements(v_trail) with ordinality as t(e, ord)
    where ord <= 30;
  end if;
  if pg_column_size(v_trail) > 32768 then raise exception 'trail_too_large'; end if;

  insert into bug_reports (user_id, message, route, context, trail)
  values (
    v_me,
    v_msg,
    nullif(btrim(coalesce(p_route, '')), ''),
    v_context,
    v_trail
  )
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function public.submit_bug_report(text, text, jsonb, jsonb)
  from anon, public;
grant execute on function public.submit_bug_report(text, text, jsonb, jsonb)
  to authenticated;

-- ── 5. 접수 즉시 관리자 폰으로 ──────────────────────────────
--
-- notifications에 행을 넣기만 하면 된다. 0016의 dispatch_push_notification 트리거가
-- /api/push/notify를 호출해 실제 푸시까지 보낸다. **기존 배관을 한 줄도 안 고친다.**
--
-- 알림 설정(notification_settings)을 보지 않는다 — 끄면 신고를 영영 못 본다.
-- 관리자 1명 전용이라 남에게 새지도 않는다.
create or replace function public.notify_bug_report_watchers()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  w           record;
  v_nickname  text;
  v_actor     uuid;
  v_body      text;
begin
  -- 신고자에게 프로필이 없을 수 있다(온보딩에서 막힌 사람). notifications.actor_id는
  -- profiles를 가리키므로 그대로 넣으면 FK 위반으로 **신고 자체가 실패한다.**
  select nickname into v_nickname from profiles where id = new.user_id;
  v_actor := case when v_nickname is null then null else new.user_id end;

  v_body := left(new.message, 160)
         || coalesce(' — ' || new.route, '');

  for w in select user_id from bug_report_watchers loop
    -- 자기가 신고한 것을 자기가 알림받는 건 소음이다. 관리자도 크루의 한 명이다.
    continue when w.user_id = new.user_id;

    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    values (
      w.user_id,
      v_actor,
      'bug_reported',
      new.id,
      '🐞 새 신고 · ' || coalesce(v_nickname, '이름 없는 사용자'),
      v_body
    );
  end loop;

  return new;
end $$;

drop trigger if exists bug_reports_notify_watchers on public.bug_reports;
create trigger bug_reports_notify_watchers
  after insert on public.bug_reports
  for each row execute function public.notify_bug_report_watchers();

-- ── 6. 미처리 신고 수 (09시 브리핑이 부른다) ────────────────
--
-- 1층(즉시 푸시)은 **조용히** 실패할 수 있다 — /api/push/notify가 404·410을 받으면
-- 만료된 구독을 삭제하므로(route.ts), 그 뒤로는 아무 소리 없이 알림이 끊긴다.
-- 매일 09시에 한 번 다시 세어 그물을 친다.
--
-- auth.uid()를 쓰지 않으므로 service_role(크론)에서 호출된다.
create or replace function public.pending_bug_report_count()
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from bug_reports where status = 'new';
$$;

revoke execute on function public.pending_bug_report_count() from anon, public;
grant execute on function public.pending_bug_report_count() to service_role;

commit;
