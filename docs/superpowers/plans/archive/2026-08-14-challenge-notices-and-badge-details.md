# 자동 시작 알림 채우기(A2) + 배지 이름·획득일 보여주기(F) Implementation Plan

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** 자동 시작 경로의 빈 메시지를 채우고(시작 전날 예고 · 탈락 통보), 배지 알림이 무슨 배지인지 말하게 하고 획득일을 화면에 그린다.

**Architecture:** 알림 문안 조립은 **DB 함수 안**에서 한다 — 기존 `autostart_due_challenges`·`evaluate_badges`가 이미 그 자리에서 알림을 넣고 있고, 재료(`challenges.name`·`v_new`의 `emoji`/`name`)도 거기 있다. 화면 쪽은 알림 유형 배선 3곳과 배지 시트 한 줄뿐이다. **점수·지급 규칙은 안 건드린다.**

**Tech Stack:** Supabase(plpgsql · SECURITY DEFINER) · Next.js 16 · TypeScript · Vitest

**범위 밖:** B(첫 열람권 무료) · C2·C3(계획 빈 날 제안) · D(사진 가중치) · E(계측).

---

## ⚠️ 이 배치는 **마이그레이션이 있다** — 오늘 오전 배치와 다르다

`0077` 한 건. **사용자가 Supabase SQL Editor에 붙여넣고 Run** 한다.
배포 롤백만으로 안 끝나므로 순서가 중요하다: **마이그레이션 먼저, 배포 나중.**

⚠️ 반대로 하면(배포 먼저) 새 알림 유형을 쓰는 코드가 옛 DB에 부딪혀
`notifications_type_check` 위반으로 **자동 시작이 통째로 실패**할 수 있다.

---

## 착수 전 실측 (2026-08-14 확인 완료)

| 전제 | 실측 |
|---|---|
| 다음 마이그레이션 번호 | **0077** (0076_briefing_cron_use_get이 최신) |
| `notifications.type` | **허용목록 CHECK**(`notifications_type_check`). 0054가 마지막으로 늘렸다 — 새 유형은 **목록 전체를 다시 써야** 한다 |
| `notify()` 시그니처 | `(user_id, actor_id, type, reference_id, title, body)` — **`dedupe_key`를 못 받는다.** 중복 방지가 필요하면 `insert … on conflict (dedupe_key)`로 직접 넣는다(0054가 그렇게 한다) |
| `dedupe_key` | `notifications.dedupe_key` + **전역 unique 인덱스**. 그래서 키에 **user_id까지** 넣어야 한다 |
| `autostart_due_challenges` | `dropped`로 바꾼 **뒤** `status='joined'`에게만 알림 → **빠진 사람은 통보 대상에서 제외됨**. 루프가 `ch.id`만 select해서 **이름을 모른다** |
| `evaluate_badges` | `v_new`에 `badgeKey·emoji·name·tier·points`를 모아 두고(1562줄) 알림 본문엔 **개수만** 쓴다(1571줄). `reference_id`도 `null` |
| 배지 화면 위치 | `GrowthHub` → **`/profile`(내 정보)** 탭 |
| `PUSH_URL_BY_TYPE.badge_earned` | **`"/record"`** — 주석은 *"배지 진열대가 기록 탭 달력에 있다(2026-07-21)"*. **진열대가 프로필로 옮겨졌는데 라우팅이 안 따라왔다.** 알림을 누르면 엉뚱한 탭으로 간다 |
| `Achievement` 타입 | **`earnedAt`이 없다.** `buildAchievements`는 `rows`(그 배지의 `EarnedBadge[]`)를 이미 손에 쥐고 있다(`achievements.ts:98`) |
| 날짜 포맷 | **오늘 만든 `formatMonthDay`를 재사용한다** — `formatMonthDay(dayKey(earnedAt, "Asia/Seoul"))`. 새 날짜 코드를 만들지 않는다 |
| 알림 설정 토글 | 챌린지 생명주기·배지 알림에는 **토글이 없다**(0029가 명시적으로 그렇게 정했다). 새 유형도 게이트를 두지 않는다 |

---

## File Structure

| 파일 | 무엇 | 신규/수정 |
|---|---|---|
| `supabase/migrations/0077_challenge_notices_and_badge_names.sql` | 유형 2개 추가 · `autostart` 탈락 통보 · `remind_upcoming_challenges` 신설 · `evaluate_badges` 본문 | **신규** |
| `src/lib/social.ts` | 알림 유형 유니온 +2 | 수정 |
| `src/components/notification-bell.tsx` | `TYPE_ICON` +2 (**exhaustive라 컴파일러가 잡는다**) | 수정 |
| `src/lib/domain/push.ts` | `PUSH_URL_BY_TYPE` +2, **`badge_earned` 목적지 정정** | 수정 |
| `src/lib/domain/push.test.ts` | 위 세 개의 회귀선 | 수정 |
| `src/lib/domain/achievements.ts` | `Achievement.earnedAt` 추가 | 수정 |
| `src/lib/domain/achievements.test.ts` | `earnedAt`이 채워지는가 | 수정 |
| `src/components/profile/badge-sheet.tsx` | 획득한 배지에 날짜 한 줄 | 수정 |
| `src/components/profile/badge-sheet.test.tsx` | 날짜가 그려지는가 | 수정 |
| `src/app/api/briefing/route.ts` | 일일 슬롯에 `remind_upcoming_challenges` 추가 | 수정 |

---

### Task 0: 작업 브랜치

- [ ] **Step 1**

```bash
cd /c/Users/SAMSUNG/workout-app
git checkout main && git checkout -b feat/challenge-notices-and-badge-details
git branch --show-current
```
Expected: `feat/challenge-notices-and-badge-details`

⚠️ 작업 트리에 이 작업과 **무관한 미커밋 변경**이 여럿 있다. 아래 커밋은 전부
**경로를 명시해서** `git add` 한다. `git add -A` 금지.

---

### Task 1: 마이그레이션 0077 작성

**Files:** Create `supabase/migrations/0077_challenge_notices_and_badge_names.sql`

- [ ] **Step 1: 파일을 쓴다**

````sql
-- 0077: 자동 시작 알림 채우기 + 배지 이름 알림
-- 적용: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run (1회만).
--       0001~0076은 수정하지 않는다.
--
-- 왜 이 셋을 한 파일에 묶었나: ①이 notifications_type_check를 다시 쓰는데,
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
--   알아야 통보할 수 있다. 개수는 배열 길이로 세므로 **과다 집계 위험은 그대로 없다**
--   (옛 주석이 경고하던 문제 — select count(*)로 세면 이미 dropped였던 행까지
--   매 루프 다시 더해진다).
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
-- (1) 새 유형이 허용목록에 들어갔나 — 2가 나와야 한다
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
-- (5) 되돌리기 — 0077 이전 본문은 docs/db-current-schema.sql의
--     autostart_due_challenges·evaluate_badges 정의를 그대로 다시 Run 하면 된다.
--     제약은 위 목록에서 마지막 두 줄만 빼고 다시 Run.
````

- [ ] **Step 2: SQL 문법만 미리 검사한다 (실행하지 않는다)**

Run: `cd /c/Users/SAMSUNG/workout-app && node -e "const s=require('fs').readFileSync('supabase/migrations/0077_challenge_notices_and_badge_names.sql','utf8'); const o=(s.match(/\\\$function\\\$/g)||[]).length; console.log('function 구분자',o,'개 (함수 3개 x 2 = 6이어야 한다)'); console.log('begin/commit', /^begin;/m.test(s), /^commit;/m.test(s)); console.log('service_role grant', /grant execute on function public.remind_upcoming_challenges\\(\\) to service_role/.test(s));"`
Expected: `function 구분자 6 개` · `begin/commit true true` · `service_role grant true`

⚠️ 함수는 셋이다 — `autostart_due_challenges` · `remind_upcoming_challenges` ·
`evaluate_badges`. 각각 여는·닫는 `$function$` 하나씩이라 **6**이다.

- [ ] **Step 3: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add supabase/migrations/0077_challenge_notices_and_badge_names.sql
git commit -m "feat(db): 0077 시작 예고·탈락 통보 알림 + 배지 이름 알림"
```

---

### Task 2: 알림 유형 배선 (유니온 · 아이콘 · 목적지)

⚠️⚠️ **`PUSH_URL_BY_TYPE`은 exhaustive가 아니다.** 빠뜨려도 컴파일은 통과하고
푸시만 조용히 `/home`으로 떨어진다. 코드 주석이 *"손으로 챙겨야 한다"*고 적어 뒀고,
`bug-trail.ts`가 *"그런 것은 결국 빠진다"*고 같은 함정을 회고하고 있다.
**그래서 이 배선은 테스트로 못 박는다.**

**Files:** `src/lib/social.ts` · `src/components/notification-bell.tsx` ·
`src/lib/domain/push.ts` · `src/lib/domain/push.test.ts`

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`src/lib/domain/push.test.ts` 파일 **끝에** 추가:

```ts
describe("0077 새 알림 유형의 목적지 (exhaustive가 아니라 손으로 챙겨야 한다)", () => {
  /**
   * ⚠️⚠️ `PUSH_URL_BY_TYPE`은 `Record<string, string>`이라 유형을 늘려도
   * 컴파일러가 안 잡아주고 `/home`으로 조용히 떨어진다. 이 단언이 그 자리다.
   */
  it("시작 예고는 챌린지 탭으로 간다", () => {
    expect(
      pushPayloadFor({ type: "challenge_starting_soon", title: null, body: null }).url,
    ).toBe("/challenge");
  });

  it("탈락 통보도 챌린지 탭으로 간다", () => {
    expect(
      pushPayloadFor({ type: "challenge_dropped", title: null, body: null }).url,
    ).toBe("/challenge");
  });

  /**
   * ⚠️ **이건 정정이다.** 옛 값은 `/record`였고 주석은 *"배지 진열대가 기록 탭
   * 달력에 있다(2026-07-21)"*였다. 그 뒤 진열대가 `GrowthHub`로 들어가면서
   * **`/profile`(내 정보) 탭으로 옮겨졌는데 라우팅이 안 따라왔다.**
   * 알림 본문도 "내 정보에서 확인해 보세요"라고 말하면서 기록 탭으로 보냈다.
   */
  it("배지 알림은 진열대가 있는 내 정보 탭으로 간다", () => {
    expect(
      pushPayloadFor({ type: "badge_earned", title: null, body: null }).url,
    ).toBe("/profile");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/push.test.ts`
Expected: **FAIL 3건** — 앞 둘은 `/home`을, 배지는 `/record`를 돌려준다

- [ ] **Step 3: `src/lib/social.ts`의 유니온에 두 줄을 더한다**

`| "challenge_peek_unlocked"; // 0054 …` 줄을 찾아 이렇게 바꾼다:

```ts
    | "challenge_peek_unlocked" // 0054 — 5일 연속으로 열린 2시간 열람창
    | "challenge_starting_soon" // 0077 — 시작 전날 예고
    | "challenge_dropped"; // 0077 — 목표 미설정으로 이번 회차에서 빠짐
```

⚠️ 세미콜론이 **마지막 줄로** 옮겨간다. 안 옮기면 유니온이 거기서 끊긴다.

- [ ] **Step 4: `TYPE_ICON`에 두 줄을 더한다**

`src/components/notification-bell.tsx`의 `challenge_peek_unlocked: "🎟️", // 0054 …`
아래에 더한다:

```ts
  challenge_starting_soon: "⏰", // 0077 — 내일 시작해요
  challenge_dropped: "💤", // 0077 — 목표가 없어 이번 회차에서 빠졌어요
```

⚠️ 이 `Record`는 **exhaustive다.** Step 3만 하고 여기를 빼면 **타입 오류로 막힌다** —
그게 의도한 게이트다.

- [ ] **Step 5: `PUSH_URL_BY_TYPE`을 고친다**

`src/lib/domain/push.ts`에서 **두 곳**을 바꾼다.

(가) 배지 목적지 정정 — 지금:

```ts
  // 배지 진열대가 기록 탭 달력에 있다 (설계 2026-07-21)
  badge_earned: "/record",
```

이렇게:

```ts
  // ⚠️ **2026-08-14 정정: `/record` → `/profile`.** 옛 주석은 "배지 진열대가
  //    기록 탭 달력에 있다(2026-07-21)"였는데, 그 뒤 진열대가 `GrowthHub`로
  //    들어가면서 **내 정보 탭으로 옮겨졌다.** 라우팅만 안 따라와서, 알림은
  //    "내 정보에서 확인해 보세요"라고 말하면서 기록 탭으로 보내고 있었다.
  badge_earned: "/profile",
```

(나) `challenge_peek_unlocked: "/home",` 아래에 더한다:

```ts
  // 0077 — 시작 예고·탈락 통보. 둘 다 챌린지 탭에서 할 일이 있다
  // (목표 세우기 / 다음 챌린지 찾기).
  challenge_starting_soon: "/challenge",
  challenge_dropped: "/challenge",
```

- [ ] **Step 6: 통과를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/push.test.ts && pnpm typecheck`
Expected: PASS · typecheck 0

- [ ] **Step 7: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add src/lib/social.ts src/components/notification-bell.tsx src/lib/domain/push.ts src/lib/domain/push.test.ts
git commit -m "feat(notify): 0077 알림 유형 2종 배선 + 배지 알림 목적지를 내 정보로 정정"
```

---

### Task 3: 크론이 예고 함수를 부르게 한다

**Files:** `src/app/api/briefing/route.ts`

- [ ] **Step 1: 일일 슬롯 배열에 한 줄 더한다**

`route.ts:121-124`가 이렇다:

```ts
    for (const fn of [
      "autostart_due_challenges",
      "autofinalize_due_challenges",
    ]) {
```

이렇게 바꾼다:

```ts
    for (const fn of [
      // 0077: 예고를 **먼저** 부른다. autostart가 오늘 도래분을 active로 바꾼
      // 뒤에 예고를 돌리면, 같은 실행 안에서 "내일 시작" 대상이 달라지지는
      // 않지만(예고는 start_date = 내일만 본다) 읽는 순서가 시간 순서와 같아야
      // 나중에 읽는 사람이 헷갈리지 않는다.
      "remind_upcoming_challenges",
      "autostart_due_challenges",
      "autofinalize_due_challenges",
    ]) {
```

⚠️ 이 배열은 `isDailySlot`일 때만 돈다(UTC 0시 슬롯). 크론이 30분마다 돌아도
**하루 한 번**만 불린다 — 그래도 `dedupe_key`가 있어 여러 번 불려도 안전하다.

- [ ] **Step 2: 타입·린트**

Run: `cd /c/Users/SAMSUNG/workout-app && pnpm typecheck && pnpm lint`
Expected: 오류 0

- [ ] **Step 3: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add src/app/api/briefing/route.ts
git commit -m "feat(cron): 09시 슬롯에서 시작 전날 예고를 보낸다"
```

---

### Task 4: `Achievement`에 획득일을 싣는다

**Files:** `src/lib/domain/achievements.ts` · `src/lib/domain/achievements.test.ts`

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`src/lib/domain/achievements.test.ts` 파일 **끝에** 추가.

⚠️ **기존 픽스처의 모양을 그대로 쓴다** (착수 전 실측):
`meta(over: Partial<BadgeMeta> = {})` — **객체를 받는다**(문자열 키가 아니다).
`metrics`는 함수가 아니라 각 `describe` 안의 **상수 객체**다. 그래서 여기서도
같은 모양의 상수를 하나 둔다.

```ts
describe("획득일 (2026-08-14)", () => {
  const metrics = {
    workout_count: 12, total_minutes: 0, streak_days: 10,
    weight_volume_kg: 0, cardio_distance_m: 0, record_beaten: 0,
  };

  /**
   * ⚠️⚠️ `user_badges.earned_at`은 DB에 있고 `badges.ts:37`이 앱까지 실어 오는데,
   * 화면이 한 번도 안 그렸다 — `badge-showcase.tsx`는 **정렬에만** 썼고
   * `badge-sheet.tsx`는 아예 안 썼다. **배지가 수집물인데 수집 기록이 없었다.**
   */
  it("획득한 배지는 earnedAt을 갖는다", () => {
    const [a] = buildAchievements(
      [meta()],
      [
        {
          badgeKey: "workout_10",
          periodKey: "lifetime",
          earnedAt: new Date("2026-07-20T01:00:00Z"),
        },
      ],
      metrics,
    );
    expect(a.earnedAt?.toISOString()).toBe("2026-07-20T01:00:00.000Z");
  });

  it("미획득 배지는 null이다", () => {
    const [a] = buildAchievements([meta()], [], { ...metrics, workout_count: 0 });
    expect(a.earnedAt).toBeNull();
  });

  /**
   * 반복 배지는 같은 key가 여러 행으로 온다(`EarnedBadge` 주석).
   * 화면에 적을 것은 **마지막으로 딴 날**이다 — "언제 땄나"의 답으로
   * 첫 회를 보여주면 최근에 또 딴 사실이 안 보인다.
   */
  it("반복 배지는 마지막으로 딴 날을 쓴다", () => {
    const [a] = buildAchievements(
      [
        meta({
          key: "streak_5",
          metricKey: "streak_days",
          threshold: 5,
          repeatable: true,
          repeatStep: 5,
        }),
      ],
      [
        { badgeKey: "streak_5", periodKey: "2026-07-20", earnedAt: new Date("2026-07-20T01:00:00Z") },
        { badgeKey: "streak_5", periodKey: "2026-07-25", earnedAt: new Date("2026-07-25T01:00:00Z") },
      ],
      metrics,
    );
    expect(a.earnedAt?.toISOString()).toBe("2026-07-25T01:00:00.000Z");
  });
});
```

⚠️ `meta()`의 기본 key는 `workout_10`이다 — 위 첫 테스트의 `badgeKey`가 그것과
같아야 `rows`가 매칭된다.

- [ ] **Step 2: 실패를 확인한다**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/achievements.test.ts -t "획득일"`
Expected: FAIL — `earnedAt`이 타입에 없어 `undefined`

- [ ] **Step 3: 타입과 조립에 한 줄씩 더한다**

`src/lib/domain/achievements.ts`의 `export type Achievement = {` 안, `count` 줄 아래:

```ts
  count: number; // 반복 획득 횟수
  /**
   * 마지막으로 딴 시각. 미획득이면 null.
   *
   * ⚠️ 반복 배지는 같은 key가 여러 행으로 온다 — **최신**을 쓴다. 첫 회를 쓰면
   *    최근에 또 딴 사실이 화면에서 사라진다.
   */
  earnedAt: Date | null;
```

같은 파일 `buildAchievements`의 `return {` 안, `count: rows.length,` 아래:

```ts
        count: rows.length,
        // `rows`는 이 배지의 EarnedBadge 전부다 — 이미 손에 있다.
        earnedAt: rows.reduce<Date | null>(
          (acc, r) => (acc === null || r.earnedAt > acc ? r.earnedAt : acc),
          null,
        ),
```

- [ ] **Step 4: 통과 확인**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/lib/domain/achievements.test.ts && pnpm typecheck`
Expected: PASS · typecheck 0

- [ ] **Step 5: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add src/lib/domain/achievements.ts src/lib/domain/achievements.test.ts
git commit -m "feat(badge): Achievement에 마지막 획득일을 싣는다"
```

---

### Task 5: 배지 시트에 획득일을 그린다

**Files:** `src/components/profile/badge-sheet.tsx` · `src/components/profile/badge-sheet.test.tsx`

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

⚠️ **이 파일에는 이미 `sheet(workoutCount)` 헬퍼가 있다** (착수 전 실측).
`CATALOG` 2종을 `buildAchievements`에 넣어 주고, `workoutCount >= 10`이면
`workout_10`을 `earnedAt: new Date("2026-07-20")`으로 획득 처리한다.
**새 픽스처를 만들지 말고 그대로 쓴다.**

`src/components/profile/badge-sheet.test.tsx` 파일 **끝에** 추가:

```tsx
describe("획득일 표시 (2026-08-14)", () => {
  /**
   * ⚠️⚠️ 회귀선이다. `earned_at`은 DB→앱까지 오는데 화면이 한 번도 안 그렸다 —
   * `badge-showcase.tsx`는 정렬에만 썼고 이 파일은 아예 안 썼다.
   * **배지가 수집물인데 언제 무엇을 땄는지 볼 자리가 앱에 없었다.**
   *
   * `sheet(12)`는 `workout_10`을 2026-07-20에 딴 상태다 → `7월 20일`.
   * `new Date("2026-07-20")`은 UTC 자정 = KST 09:00이라 KST 날짜도 7월 20일이다.
   */
  it("획득한 배지에는 딴 날짜가 보인다", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet achievements={sheet(12)} onClose={() => {}} />,
    );
    expect(html).toContain("7월 20일 획득");
  });

  /** 미획득 행은 `앞으로 N회 · +N P`를 그린다 — 날짜가 끼면 안 된다 */
  it("아무것도 못 딴 상태에서는 날짜가 안 보인다", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet achievements={sheet(5)} onClose={() => {}} />,
    );
    expect(html).not.toContain("획득");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/components/profile/badge-sheet.test.tsx -t "획득일"`
Expected: FAIL — `7월 20일 획득`이 없다

- [ ] **Step 3: 시트에 날짜를 그린다**

`src/components/profile/badge-sheet.tsx` 위쪽 import에 더한다:

```ts
import { formatMonthDay } from "@/lib/domain/challenge-time";
import { dayKey } from "@/lib/domain/time";
```

⚠️ **날짜 포맷을 새로 짜지 마라.** `formatMonthDay`는 2026-08-14에 만든 것이고
`"YYYY-MM-DD"` 문자열만 받는다 — `Date`를 `toLocaleDateString`에 그대로 넣으면
기기 타임존에 따라 하루가 밀린다. `dayKey(d, "Asia/Seoul")`로 KST 날짜를 먼저
정하고 넘긴다.

`AchievementRow`의 **획득 분기**를 찾는다 (현재):

```tsx
          {a.unlocked ? (
            <span className="text-[11px] font-extrabold text-accent">+{a.rewardPoint} P</span>
          ) : (
```

이렇게 바꾼다:

```tsx
          {a.unlocked ? (
            /* 0077: 딴 날짜를 포인트 왼쪽에 붙인다. **새 줄을 만들지 않는다** —
               이 행은 이미 4단(그림·이름·희귀도·진행)이라 줄을 더하면 시트가
               길어져 스크롤이 늘고, 미획득 행과 높이가 어긋난다. */
            <span className="inline-flex items-baseline gap-1.5 text-[11px]">
              {a.earnedAt && (
                <span className="font-bold text-faint">
                  {formatMonthDay(dayKey(a.earnedAt, "Asia/Seoul"))} 획득
                </span>
              )}
              <span className="font-extrabold text-accent">+{a.rewardPoint} P</span>
            </span>
          ) : (
```

⚠️ **반복 횟수(`×N`)를 여기 또 넣지 마라.** 같은 행 위쪽에 이미
`{a.count > 1 && <span …>×{a.count}</span>}`가 배지 이름 옆에 그려진다.
두 곳에 적으면 같은 정보가 한 행에 두 번 뜬다.

- [ ] **Step 4: 통과 확인**

Run: `cd /c/Users/SAMSUNG/workout-app && npx vitest run src/components/profile/badge-sheet.test.tsx`
Expected: PASS (기존 건수 + 2)

- [ ] **Step 5: 커밋**

```bash
cd /c/Users/SAMSUNG/workout-app
git add src/components/profile/badge-sheet.tsx src/components/profile/badge-sheet.test.tsx
git commit -m "feat(badge): 배지 시트에 획득일을 그린다"
```

---

### Task 6: 전체 게이트

- [ ] **Step 1**

```bash
cd /c/Users/SAMSUNG/workout-app
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: lint 오류 0 · typecheck 0 · **테스트 전건 통과** · build 성공

- [ ] **Step 2: 테스트를 지우지 않았는지 확인한다**

⚠️ **2026-08-14 오전에 실제로 당했다.** 이미 있는 테스트 파일을 `Write`로
덮어써서 회귀 테스트 17건이 사라졌는데 **전체가 초록이라 못 볼 뻔했다.**

Run: `cd /c/Users/SAMSUNG/workout-app && git diff --stat main...HEAD -- '*.test.ts' '*.test.tsx'`
Expected: **deletions가 0이어야 한다.** 0이 아니면 무엇을 지웠는지 찾는다.

---

### Task 7: 마이그레이션 Run — **사용자가 한다**

⚠️ **배포보다 먼저다.**

- [ ] **Step 1: 사용자에게 SQL을 넘긴다**

`supabase/migrations/0077_challenge_notices_and_badge_names.sql` 전문을 전달하고,
Supabase Dashboard → SQL Editor → 붙여넣기 → **Run (1회)** 를 요청한다.

- [ ] **Step 2: 적용 확인 쿼리 4개를 사용자가 실행하고 결과를 받는다**

파일 하단 `적용 확인` 주석의 (1)~(4). 기대값이 거기 적혀 있다.

- [ ] **Step 3: 결과가 기대와 다르면 배포하지 않는다**

---

### Task 8: 개발 서버 화면 실측

⚠️ **`~/.claude/CLAUDE.md`의 최우선 규칙.** 마이그레이션이 적용된 뒤에 본다.

- [ ] **Step 1: `pnpm dev` + Playwright(스크래치패드 설치본)로 375×812**

⚠️ Playwright는 **스크래치패드에 따로** 설치한다. 프로젝트 `package.json`을
건드리지 않는다(2026-08-14 오전과 같은 방식).

| # | 화면 | 조작 | 기대 |
|---|---|---|---|
| 1 | `/profile` | 성장 허브 → 배지 전체 보기 | 획득한 배지 오른쪽에 **`N월 N일 획득 · +N P`** 가 한 줄로 보인다 |
| 2 | 같은 시트 | 미획득 배지 행 | 날짜가 **안** 보이고 `앞으로 N…`이 그대로다 |
| 3 | 같은 시트 | 행 높이 | 획득/미획득 행 높이가 **어긋나지 않는다** (날짜를 같은 줄에 넣은 이유) |
| 4 | 알림 벨 | 목록을 연다 | 배지 알림이 **배지 이름**을 말한다(옛 `새 배지 N개를 얻었어요`가 아니다) |
| 5 | 그 알림을 **탭** | | **`/profile`로 간다** (옛 `/record`가 아니다) |

⚠️ 4번은 **새 배지를 따야** 생긴다. 픽스처 A로 운동을 하나 완료하면
`evaluate_badges`가 돈다. 이미 다 딴 계정이면 새 알림이 안 생기므로,
그때는 **DB에서 직접 확인**한다:
`select title, body from notifications where type='badge_earned' order by created_at desc limit 3;`

- [ ] **Step 2: 브라우저 조작 수단이 없으면 멈추고 사용자에게 표를 낸다**

- [ ] **Step 3: 예고·탈락 알림은 DB로 확인한다** (날짜가 와야 화면에 뜬다)

```sql
-- 예고: 내일 시작하는 setup 챌린지가 있어야 sent > 0
select public.remind_upcoming_challenges();
-- 두 번째 호출은 0 (dedupe)
select public.remind_upcoming_challenges();
select type, title, body from notifications
where type in ('challenge_starting_soon','challenge_dropped')
order by created_at desc limit 5;
```

---

### Task 9: 배포 — 사용자 승인 뒤에만

- [ ] **Step 1: 승인**
- [ ] **Step 2: `main` 병합 → `.git` 없는 복사본에서 배포**

```bash
cd /c/Users/SAMSUNG/workout-app
git checkout main && git merge --no-ff feat/challenge-notices-and-badge-details
git worktree add --detach /tmp/deploy-main main
cp .env.local /tmp/deploy-main/ && cp -r .vercel /tmp/deploy-main/
cd /tmp/deploy-main && npm install && npm run build
npx vercel@latest --prod --yes --scope gnd4
```

⚠️ `--scope gnd4`가 없으면 `Not authorized`.

- [ ] **Step 3: 프로덕션 번들 실측**

번들을 내려받아 `N월 N일 획득`·`획득` 문자열과 새 아이콘 배선을 확인한다.
⚠️ **제거 검증은 DB 쪽이다** — 옛 배지 문구(`새 배지 N개를 얻었어요`)는
번들이 아니라 DB 함수에 있었으므로, Task 7 (4)번 쿼리가 그 증거다.

- [ ] **Step 4: `PROGRESS.md` 최상단에 기록** · 릴리스 공지는 **발송하지 않는다**

---

## 되돌리는 법

| 언제 | 무엇 |
|---|---|
| 개발 중 한 태스크가 틀렸다 | `git reset --hard HEAD~1` |
| 배치 전체 접기 (병합 전) | `git checkout main && git branch -D feat/challenge-notices-and-badge-details` |
| **배포 후 화면 문제** | `npx vercel@latest rollback --scope gnd4` |
| **DB를 되돌려야 한다** | 0077 하단 `(5)` 주석 참조 — `docs/db-current-schema.sql`의 옛 정의를 다시 Run. ⚠️ **제약을 먼저 되돌리면 안 된다** — 이미 저장된 새 유형 행이 있으면 위반이 난다. 함수를 먼저 되돌리고, 새 유형 알림을 지운 뒤, 제약을 되돌린다 |

⚠️ **DB 롤백이 있다는 것이 오늘 오전 배치와의 결정적 차이다.** 오전 것은 배포
롤백 하나로 끝났다. 이번은 두 단계다.

---

## Self-Review

**1. Spec coverage**

| 요구 | 담당 |
|---|---|
| 시작 전날 예고 (목표 유무로 문구 분기) | Task 1 ③ · Task 3 |
| 탈락 통보 | Task 1 ② |
| 동의 없이 자동 시작 | **이미 동작 중** — 이번에 안 건드린다 |
| 배지 알림에 이름 | Task 1 ④ |
| 배지 획득일 표시 | Task 4 · Task 5 |
| 알림 유형 배선 3곳 | Task 2 |
| 배지 알림 목적지 정정 | Task 2 Step 5(가) |

**2. Placeholder scan** — Task 5 Step 1의 픽스처 방식만 Step 0에서 읽어 맞추게
했다. 그 파일의 기존 헬퍼 이름을 지어내면 틀린 코드를 심는다.

**3. Type consistency**
- `Achievement.earnedAt: Date | null` — Task 4 정의 → Task 5에서 `a.earnedAt` 사용 ✅
- `formatMonthDay(dayKey(Date, tz))` — 오늘 만든 함수 재사용, 새 날짜 코드 없음 ✅
- 알림 유형 문자열 `challenge_starting_soon`·`challenge_dropped` — SQL·유니온·아이콘·목적지 **네 곳 철자 일치** ✅

**4. TDD 순서** — Task 2·4·5 전부 실패 확인 → 구현 → 통과 확인. Task 1(SQL)은
단위 테스트가 불가능해 **적용 확인 쿼리 4개**로 대체했다.
