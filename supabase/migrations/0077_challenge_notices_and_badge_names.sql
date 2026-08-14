-- 0077: 자동 시작 알림 채우기 + 배지 이름 알림
-- 적용: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run (1회만).
--       0001~0076은 수정하지 않는다.
--
-- 왜 이 넷을 한 파일에 묶었나: ①이 notifications_type_check를 다시 쓰는데,
-- 그 제약은 허용목록 방식이라 **목록 전체를 한 번에** 써야 한다. 파일을 나누면
-- 두 번째 파일이 첫 번째의 목록을 그대로 베껴 써야 하고, 그때 하나만 빠져도
-- 그 유형의 알림이 조용히 죽는다.
--
-- ⚠ 배포보다 **먼저** Run 한다. 반대로 하면 새 유형을 쓰는 코드가 옛 제약에
--   부딪혀 autostart가 통째로 실패한다.

begin;

-- ── ① notifications.type 허용목록에 2종 추가 ─────────────────
-- 0054의 목록 + challenge_starting_soon · challenge_dropped
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
    'challenge_starting_soon', 'challenge_dropped'       -- 0077
  ));

-- ── ② autostart_due_challenges — 빠진 사람에게 통보한다 ──────
--
-- ⚠⚠ 옛 판은 `dropped`로 바꾼 **뒤** `status='joined'`에게만 알림을 보냈다.
--     그래서 **목표를 안 세워 빠진 사람은 시작 알림도 못 받았다** — 참가했는데
--     어느 날 보니 자기만 없고, 왜인지 알려주는 곳이 아무 데도 없었다.
--
-- ⚠ `get diagnostics ROW_COUNT` → `returning` + 배열로 바꾼다. 누구를 뺐는지
--   알아야 통보할 수 있다. 개수는 **이번 update가 돌려준 행만** 세므로 옛 주석이
--   경고하던 과다 집계(이미 dropped였던 행까지 매 루프 다시 더하는 것)는
--   그대로 일어나지 않는다.
--
-- ⚠ 루프에서 `ch.name`을 함께 읽는다. 옛 판은 `ch.id`만 읽어서 알림 본문에
--   챌린지 이름을 쓸 수 없었다.
create or replace function public.autostart_due_challenges()
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_started int := 0;
  v_dropped int := 0;
  v_dropped_ids uuid[];
  c record;
begin
  for c in
    select ch.id, ch.name from challenges ch
    where ch.status = 'setup' and ch.start_date <= v_today
    order by ch.start_date
    for update
  loop
    -- 목표 0개인 joined는 명단에서 뺀다 (설계 §4.2). 행은 남긴다 — 지우면
    -- 수락 때 맺어진 crew_links의 근거가 사라진다.
    with dropped as (
      update challenge_participants cp
         set status = 'dropped'
       where cp.challenge_id = c.id
         and cp.status = 'joined'
         and not exists (
           select 1 from user_goals ug
           where ug.challenge_id = c.id and ug.user_id = cp.user_id
         )
      returning cp.user_id
    )
    select coalesce(array_agg(user_id), '{}'::uuid[]) into v_dropped_ids from dropped;
    v_dropped := v_dropped + coalesce(array_length(v_dropped_ids, 1), 0);

    -- 미응답 초대는 만료시킨다
    delete from challenge_participants
    where challenge_id = c.id and status = 'invited';

    update challenges set status = 'active' where id = c.id;
    v_started := v_started + 1;

    -- 남은 참가자에게 시작 알림
    begin
      perform notify(
        cp.user_id, null, 'challenge_started', c.id,
        '🏁 챌린지가 시작됐어요', '오늘부터 기록이 반영돼요'
      ) from challenge_participants cp
      where cp.challenge_id = c.id and cp.status = 'joined';
    exception when others then null;
    end;

    -- 0077: **빠진 사람에게도 말해 준다.** 조용히 사라지지 않게.
    -- ⚠ `unnest(arr) u`로 쓰면 별칭 `u`가 테이블이자 컬럼이라 모호하다.
    --   `as t(uid)`로 컬럼 이름을 못 박는다.
    begin
      perform notify(
        t.uid, null, 'challenge_dropped', c.id,
        '이번 챌린지에선 빠졌어요',
        c.name || ' · 목표를 세우지 않아 이번 회차 집계에서 빠졌어요. 다음엔 함께해요'
      ) from unnest(v_dropped_ids) as t(uid);
    exception when others then null;
    end;
  end loop;

  return jsonb_build_object('started', v_started, 'dropped', v_dropped);
end $function$;

-- ── ③ remind_upcoming_challenges — 시작 전날 예고 (신설) ─────
--
-- 왜: 옛 흐름은 시작일 **당일**에야 알림이 갔다. 목표를 안 세운 사람은
--     준비할 기회 없이 그날 빠졌다. 하루 전에 말해 주면 스스로 고칠 수 있다.
--
-- ⚠ `notify()`를 쓰지 않고 **직접 insert** 한다. 그 함수는 `dedupe_key`를
--   못 받는데, 크론이 하루 여러 번 돌 수 있어(0075에서 30분 간격이 됐다)
--   중복 방지가 꼭 필요하다. 0054의 열람 알림이 같은 이유로 같은 방식이다.
--
-- ⚠ `dedupe_key`의 unique 인덱스는 **전역**이다. 챌린지 id만 넣으면 첫 사람만
--   받고 나머지는 조용히 사라진다 — **user_id까지** 넣는다.
--
-- ⚠ 알림 설정 토글을 두지 않는다. 챌린지 생명주기·배지 알림에는 토글이 없다는
--   것이 0029의 결정이다.
create or replace function public.remind_upcoming_challenges()
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_tomorrow date := ((now() at time zone 'Asia/Seoul')::date + 1);
  v_sent int := 0;
  v_n int;
  c record;
  p record;
begin
  for c in
    select ch.id, ch.name from challenges ch
    where ch.status = 'setup' and ch.start_date = v_tomorrow
  loop
    for p in
      select cp.user_id,
             exists (
               select 1 from user_goals ug
               where ug.challenge_id = c.id and ug.user_id = cp.user_id
             ) as has_goal
      from challenge_participants cp
      where cp.challenge_id = c.id and cp.status = 'joined'
    loop
      insert into notifications
        (user_id, actor_id, type, reference_id, title, body, dedupe_key)
      values (
        p.user_id, null, 'challenge_starting_soon', c.id,
        case when p.has_goal
             then '내일 챌린지가 시작돼요 🏁'
             else '내일 시작! 목표를 아직 안 세웠어요 🎯' end,
        case when p.has_goal
             then c.name || ' · 내일부터 기록이 반영돼요'
             else c.name || ' · 오늘 안에 목표를 세우지 않으면 이번 챌린지에선 빠져요' end,
        'challenge_starting_soon:' || c.id::text || ':' || p.user_id::text
      )
      on conflict (dedupe_key) do nothing;
      get diagnostics v_n = row_count;
      v_sent := v_sent + v_n;
    end loop;
  end loop;

  return jsonb_build_object('sent', v_sent);
end $function$;

-- ⚠⚠ **`grant … to service_role`을 빼면 크론이 죽는다.** 이 함수는 브리핑
--    라우트가 `getSupabaseAdminClient()`(service_role)로 부른다. `public`에서
--    revoke하는 순간 기본 EXECUTE가 사라지므로 명시적으로 줘야 한다.
--    `admin_schema_snapshot`(0048)·`pending_bug_report_count`(0052)가 같은 꼴이다.
-- ⚠ `authenticated`에는 주지 않는다 — 화면에서 부를 일이 없고, 열어 두면
--   아무나 전체 사용자의 예고 발송을 밀 수 있다. (`autostart`는 화면 진입에서
--   부르므로 authenticated가 필요해 규칙이 다르다.)
revoke all on function public.remind_upcoming_challenges() from public, anon, authenticated;
grant execute on function public.remind_upcoming_challenges() to service_role;

-- ── ④ evaluate_badges — 무슨 배지인지 말한다 ────────────────
--
-- ⚠ 옛 본문은 `'새 배지 ' || jsonb_array_length(v_new) || '개를 얻었어요'` —
--   **개수만** 말했다. 그런데 바로 위 루프가 `v_new`에 emoji·name·tier를
--   이미 담아 두고 있었다. 손에 쥔 것을 버리고 있었다.
--
-- ⚠ 조사(을/를)를 붙이지 않는다. 배지 이름이 받침으로 끝날 수도 아닐 수도 있어
--   한쪽으로 정하면 절반이 어색해진다. 이름 뒤를 끊는 문장으로 쓴다.
--
-- ⚠ `reference_id`는 여전히 null이다 — 그 컬럼은 uuid인데 배지는 text 키다.
--   목적지는 화면 쪽 `PUSH_URL_BY_TYPE`이 정한다(0077에서 /profile로 고친다).
--
-- 나머지 본문(지표 집계·지급·포인트)은 **한 글자도 바꾸지 않는다.**
create or replace function public.evaluate_badges(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_today text := to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD');
  v_metrics jsonb;
  v_new jsonb := '[]'::jsonb;
  v_value numeric;
  v_period text;
  v_inserted int;
  v_count int;
  d record;
begin
  v_metrics := public.badge_metrics(p_user_id);

  for d in
    select * from badge_definitions where status = 'active' order by sort_order
  loop
    v_value := (v_metrics ->> d.metric_key)::numeric;

    if d.repeatable then
      if v_value <= 0 or (v_value::bigint % d.repeat_step::bigint) <> 0 then
        continue;
      end if;
      v_period := v_today;
    else
      if v_value < d.threshold then
        continue;
      end if;
      v_period := 'lifetime';
    end if;

    insert into user_badges (user_id, badge_key, period_key)
    values (p_user_id, d.badge_key, v_period)
    on conflict (user_id, badge_key, period_key) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then continue; end if;

    perform public.award_points(
      p_user_id, d.point_reward, 'badge_earned',
      'badge', d.badge_key || ':' || v_period, null,
      jsonb_build_object('tier', d.tier, 'metric', d.metric_key));

    v_new := v_new || jsonb_build_object(
      'badgeKey', d.badge_key, 'emoji', d.emoji, 'name', d.name,
      'tier', d.tier, 'points', d.point_reward);
  end loop;

  v_count := jsonb_array_length(v_new);
  if v_count > 0 then
    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    values (p_user_id, p_user_id, 'badge_earned', null,
            '🏅 배지 획득!',
            (v_new -> 0 ->> 'emoji') || ' ' || (v_new -> 0 ->> 'name')
              || case when v_count > 1
                      then ' 외 ' || (v_count - 1) || '개'
                      else '' end);
  end if;

  return v_new;
end $function$;

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) 새 유형이 허용목록에 들어갔나 — 1이 나와야 한다
--   select count(*) from pg_constraint
--   where conname = 'notifications_type_check'
--     and pg_get_constraintdef(oid) like '%challenge_starting_soon%'
--     and pg_get_constraintdef(oid) like '%challenge_dropped%';
--
-- (2) 예고 함수가 돌고 멱등인가 — 두 번째 호출은 sent가 0이어야 한다
--   select public.remind_upcoming_challenges();
--   select public.remind_upcoming_challenges();
--
-- (3) autostart가 탈락자 통보를 갖고 있나 — 1이 나와야 한다
--   select count(*) from pg_proc
--   where proname = 'autostart_due_challenges'
--     and pg_get_functiondef(oid) like '%challenge_dropped%';
--
-- (4) 배지 알림이 이름을 쓰나 — 1이 나와야 한다
--   select count(*) from pg_proc
--   where proname = 'evaluate_badges'
--     and pg_get_functiondef(oid) like '%emoji%';
--
-- (5) 크론이 예고 함수를 부를 수 있나 — service_role에 EXECUTE가 있어야 한다
--   select has_function_privilege('service_role',
--     'public.remind_upcoming_challenges()', 'EXECUTE');
--
-- (6) 되돌리기 — **순서가 있다.**
--   ⓐ 함수 둘을 옛 정의로 되돌린다
--      (docs/db-current-schema.sql의 autostart_due_challenges·evaluate_badges)
--   ⓑ 새 유형으로 저장된 알림을 지운다
--      delete from notifications
--      where type in ('challenge_starting_soon','challenge_dropped');
--   ⓒ 그 다음에야 제약을 위 목록에서 마지막 두 줄만 빼고 다시 Run 한다.
--   ⚠ ⓒ를 먼저 하면 이미 저장된 행 때문에 제약 위반으로 실패한다.
