# 응원 포인트 구현 계획

> **에이전트 작업자에게:** 필수 하위 스킬 — `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`로 태스크 단위 실행. 각 단계는 체크박스(`- [ ]`)로 추적한다.

**목표:** 크루가 운동 중일 때 응원을 보내면 보낸 사람에게 10P를 지급한다. 같은 상대에게는 KST 하루 1회만.

**설계:** `docs/superpowers/specs/2026-07-29-cheer-points-design.md`

**아키텍처:** 로직 대부분이 Postgres에 있다. 포인트 원장(`point_transactions`)의 유니크 인덱스 `(user_id, reason, source_type, source_id)`를 `source_id = 받는사람:KST날짜`로 잡으면 **멱등 키가 곧 하루 1회 상한**이 된다. 별도 카운팅이 없다. `send_cheer` RPC가 지급을 수행하고 결과를 반환하며, 지급 실패가 응원을 롤백하지 않도록 `award_points` 호출만 예외 격리한다.

**기술 스택:** Supabase(Postgres + PostgREST), Next.js 15 App Router, TypeScript, vitest(node 환경), 검증은 `scripts/*.mjs` 통합 스크립트.

---

## 시작 전에 읽을 것

### 이 저장소의 규칙

1. **마이그레이션 파일은 수정 금지.** `0001`~`0040`은 이미 DB에 적용됐다. 고쳐도 아무 일도 안 일어난다. 항상 새 번호 파일을 만든다.
2. **함수의 현행 정의는 "가장 나중에 덮어쓴 파일"에 있다.** `send_cheer`는 `0011`에 처음 생겼지만 **현행은 `0039:509`다.** 0011을 고치면 아무 일도 안 일어난다.
3. **마이그레이션 적용은 사용자가 한다.** Supabase Dashboard → SQL Editor에 붙여넣고 Run. 에이전트가 실행할 수 없다.
4. **검증 스크립트는 실계정을 절대 건드리지 않는다.** 삭제는 이 실행이 만든 계정에만 한다. 실계정 4개(오뎅끼데스까·스칼레또·낭만송곳니·repro-mry7tyx0)를 지우면 복구 불가다.

### 커밋과 실기기 확인 순서

사용자 기준은 "기능 완성 → 검증 → 실기기 확인 → 커밋"이다. 앱 코드는 배포해야 폰에서 볼 수 있고 배포하려면 push가 필요하므로, 이 계획은 다음으로 해석한다.

- 태스크마다 **작업 브랜치에** 커밋한다 (작업 유실 방지·리뷰 가능)
- **`main` 머지와 "완료" 선언은 실기기 확인 뒤** (Task 8)

이 해석이 사용자 의도와 다르면 Task 1 시작 전에 확인하고 조정한다.

### 브랜치

작업 브랜치는 이미 있다: `feat/challenge-rooms`. 응원 포인트는 챌린지 개편과 독립이므로 **`main`에서 새 브랜치를 뗀다.**

```bash
git checkout main
git checkout -b feat/cheer-points
```

---

## 파일 구조

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `src/lib/domain/cheer-points.ts` | 지급액 → 토스트 문구. 순수 함수 | 신규 |
| `src/lib/domain/cheer-points.test.ts` | 위 함수 테스트 | 신규 |
| `supabase/migrations/0041_cheer_points.sql` | reason CHECK 확장 + `send_cheer` 재정의 | 신규 |
| `scripts/cheer-points-check.mjs` | 통합 검증 22건 | 신규 |
| `src/lib/social.ts:483-495` | `sendCheer`가 지급 결과를 반환 | 수정 |
| `src/components/feed/active-workout-cards.tsx:80-97` | 토스트에 `+10P` 표시 | 수정 |
| `scripts/rls-test.mjs:413,429` | 반환 모양 변경에 맞춰 단언 수정 | 수정 |

**순수 로직을 `domain/`으로 빼는 이유:** 이 저장소는 계산 가능한 것을 `src/lib/domain/*.ts`에 두고 vitest로 테스트한다(`goal-score.ts`, `xp.ts`, `level.ts` 등). 토스트 문구는 작지만 "0P인데 +10P라고 표시"가 이 기능의 대표적 버그라 테스트로 고정할 값이 있다.

---

## Task 1: 토스트 문구 순수 함수

**파일:**
- 생성: `src/lib/domain/cheer-points.ts`
- 테스트: `src/lib/domain/cheer-points.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/domain/cheer-points.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cheerToastMessage, CHEER_POINT_AMOUNT } from "./cheer-points";

describe("cheerToastMessage", () => {
  it("지급됐으면 포인트를 함께 보여준다", () => {
    expect(cheerToastMessage(10)).toBe("응원을 보냈어요! 📣 +10P");
  });

  it("지급이 0이면 포인트 문구를 붙이지 않는다", () => {
    expect(cheerToastMessage(0)).toBe("응원을 보냈어요! 📣");
  });

  it("지급액이 바뀌어도 문구가 그 값을 따라간다", () => {
    expect(cheerToastMessage(25)).toBe("응원을 보냈어요! 📣 +25P");
  });

  it("음수는 지급 없음으로 다룬다 (서버가 보내면 안 되는 값이지만 표시가 깨지면 안 된다)", () => {
    expect(cheerToastMessage(-5)).toBe("응원을 보냈어요! 📣");
  });

  it("지급액 상수는 10이다 — SQL의 award_points 호출과 같아야 한다", () => {
    expect(CHEER_POINT_AMOUNT).toBe(10);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run src/lib/domain/cheer-points.test.ts
```

기대: FAIL — `Failed to resolve import "./cheer-points"`

- [ ] **Step 3: 최소 구현**

`src/lib/domain/cheer-points.ts`:

```ts
/**
 * 응원 포인트 표시 로직 (설계 2026-07-29).
 *
 * 지급 여부는 반드시 서버가 돌려준 값을 쓴다. 클라이언트가 "오늘 이 사람에게
 * 응원했었나"를 로컬로 추측하면 다른 기기·다른 탭에서 실제 0P인데 +10P로
 * 표시된다.
 */

/** 응원 1회 지급액. SQL 0041의 award_points 호출과 같아야 한다. */
export const CHEER_POINT_AMOUNT = 10;

const BASE = "응원을 보냈어요! 📣";

/** 지급액 → 토스트 문구. 0 이하면 포인트 문구를 붙이지 않는다. */
export function cheerToastMessage(pointsAwarded: number): string {
  return pointsAwarded > 0 ? `${BASE} +${pointsAwarded}P` : BASE;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/lib/domain/cheer-points.test.ts
```

기대: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/cheer-points.ts src/lib/domain/cheer-points.test.ts
git commit -m "feat: 응원 포인트 토스트 문구 순수 함수"
```

---

## Task 2: 마이그레이션 0041 작성

**파일:**
- 생성: `supabase/migrations/0041_cheer_points.sql`

이 태스크는 파일만 만든다. **적용(Run)은 Task 4에서 사용자가 한다.**

### 반드시 알아야 할 함정 두 가지

**① `create or replace function`으로는 반환 타입을 바꿀 수 없다.**
`send_cheer`는 지금 `returns public.cheers`인데 `returns jsonb`로 바꾼다. Postgres는 이 경우 `42P13 cannot change return type of existing function`으로 거부한다. **먼저 `drop function`을 해야 한다.** 드롭하면 권한도 같이 사라지므로 `grant`를 반드시 다시 준다.

**② 드롭과 재생성 사이에는 앱에서 응원이 실패한다.**
같은 트랜잭션 안에서 하면 창이 사실상 0이다. SQL Editor는 붙여넣은 스크립트를 한 트랜잭션으로 실행하므로 파일을 통째로 Run하면 안전하다. **부분 선택 실행을 하지 말 것.**

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/0041_cheer_points.sql`:

```sql
-- 0041: 응원 포인트 — 보낸 사람에게 10P, 같은 상대에게 KST 하루 1회
-- 설계: docs/superpowers/specs/2026-07-29-cheer-points-design.md
-- 계획: docs/superpowers/plans/2026-07-29-cheer-points.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0040은 수정 금지.
--
-- ⚠ 부분 선택 실행 금지. send_cheer를 드롭했다가 다시 만들기 때문에,
--    중간에 끊기면 응원 기능이 없는 상태로 남는다. 파일 전체를 한 번에 Run하면
--    한 트랜잭션으로 처리되어 그 창이 생기지 않는다.

-- ── 1. 포인트 사유에 cheer_sent 추가 ─────────────────────────
-- ⚠ 기존 5개 값을 하나도 빠뜨리면 안 된다. 빠뜨리면 그 값을 쓰는 기존 지급이
--    조용히 죽는다 (workout_completed·badge_earned는 매일 쓰인다).
alter table public.point_transactions
  drop constraint if exists point_transactions_reason_check;
alter table public.point_transactions
  add constraint point_transactions_reason_check check (reason in (
    'workout_completed', 'badge_earned', 'item_purchase',
    'refund', 'admin_adjustment',
    'cheer_sent'                                     -- 0041
  ));

-- ── 2. send_cheer 재정의 ─────────────────────────────────────
-- 현행 정의는 0039:509다(0011:319가 아니다). 아래는 그 본문에
--   (a) 포인트 지급 블록 (예외 격리)
--   (b) 반환 타입 변경 public.cheers → jsonb
-- 두 가지만 얹은 것이다. 바뀐 줄에 -- 0041 주석을 달았다.
--
-- 반환 타입이 바뀌므로 create or replace로는 안 되고 drop이 먼저다.
drop function if exists public.send_cheer(uuid, text, text);

create function public.send_cheer(
  p_session_id uuid, p_cheer_type text, p_message text default null
) returns jsonb                                      -- 0041: cheers → jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
  c cheers;
  v_count int;
  v_last timestamptz;
  v_nick text;
  v_wants boolean;
  v_points int := 0;                                 -- 0041
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into s from workout_sessions where id = p_session_id;

  -- 판정을 세 토막으로 나눈 이유(0039): is_crew_with는 자기 자신에게 항상
  -- false라, 한 덩어리로 두면 본인 응원 시도가 own_session이 아니라
  -- session_not_found로 새고 own_session이 죽은 코드가 된다.
  if not found or s.visibility <> 'group' then
    raise exception 'session_not_found';
  end if;
  if s.user_id = auth.uid() then
    raise exception 'own_session';
  end if;
  if not public.is_crew_with(s.user_id) then
    raise exception 'session_not_found';
  end if;
  if s.status <> 'active' then
    raise exception 'not_active';
  end if;

  select count(*), max(created_at) into v_count, v_last
  from cheers where session_id = p_session_id and sender_id = auth.uid();

  if v_count >= 3 then
    raise exception 'cheer_limit';
  end if;
  if v_last is not null and v_last > now() - interval '10 seconds' then
    raise exception 'cheer_cooldown';
  end if;

  insert into cheers (session_id, sender_id, receiver_id, cheer_type, message)
  values (p_session_id, auth.uid(), s.user_id, p_cheer_type, p_message)
  returning * into c;

  -- ⬇ 0041: 포인트 지급. 실패해도 응원을 취소하지 않는다.
  --
  -- 감싸는 이유: award_points가 예상 못 한 오류를 내면 전체 트랜잭션이
  -- 롤백되어 위의 cheers insert까지 사라진다. 설계 D5는 "포인트가 안 나가도
  -- 응원은 성공"이다.
  --
  -- 하루 1회 상한은 여기 코드가 아니라 원장의 유니크 인덱스가 만든다
  -- (0031:77 — user_id, reason, source_type, source_id). source_id를
  -- "받는사람:KST날짜"로 잡았으므로 그날 두 번째 호출은 유니크 충돌이 되고
  -- award_points가 그걸 잡아 0을 반환한다(0032:96). 즉 아래 exception 블록에
  -- 걸리는 것은 그 밖의 예외뿐이다.
  --
  -- ⚠ 격리 범위는 이 호출 하나뿐이다. 넓히면 위의 권한·상태 검사 실패까지
  --    삼켜서 비크루가 응원에 성공하게 된다.
  begin
    v_points := public.award_points(
      auth.uid(), 10, 'cheer_sent',
      'cheer',
      s.user_id::text || ':' || (now() at time zone 'Asia/Seoul')::date::text,
      null::numeric,
      jsonb_build_object('session_id', p_session_id, 'cheer_type', p_cheer_type));
  exception when others then
    v_points := 0;
    -- warning은 트랜잭션을 중단시키지 않으면서 Postgres 로그에 남는다.
    -- 조용히 삼키면 지급이 언제부터 멈췄는지 아무도 모른다.
    raise warning 'cheer_points_failed: sender=% receiver=% sqlstate=% msg=%',
      auth.uid(), s.user_id, sqlstate, sqlerrm;
  end;

  -- 수신자가 응원 알림을 꺼둔 경우: 응원 행은 남기고 알림만 생략
  select coalesce(ns.cheers, true) into v_wants
  from (select true) one
  left join notification_settings ns on ns.user_id = s.user_id;

  if v_wants then
    select nickname into v_nick from profiles where id = auth.uid();
    perform notify(
      s.user_id, auth.uid(), 'cheer_received', c.id,
      coalesce(v_nick, '크루원') || '님의 응원 📣',
      coalesce(p_message, p_cheer_type)
    );
  end if;

  -- 0041: 클라이언트가 지급 여부를 추측하지 않도록 실제 결과를 함께 돌려준다.
  return jsonb_build_object('cheer', to_jsonb(c), 'points_awarded', v_points);
end $$;

-- ⚠ drop이 권한도 함께 지웠으므로 반드시 다시 준다.
revoke execute on function public.send_cheer(uuid, text, text) from anon, public;
grant execute on function public.send_cheer(uuid, text, text) to authenticated;
```

- [ ] **Step 2: 파일이 이전 정의를 정확히 옮겼는지 대조**

0039의 원본과 눈으로 비교한다. `-- 0041` 주석이 붙은 줄과 새 `begin/exception` 블록 외에는 **한 글자도 달라선 안 된다.**

```bash
sed -n '509,580p' supabase/migrations/0039_crew_link_switchover.sql
```

확인할 것: 판정 4개(`session_not_found`·`own_session`·`session_not_found`·`not_active`)의 순서, `v_count >= 3`, `interval '10 seconds'`, `notify(...)` 인자 6개.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0041_cheer_points.sql
git commit -m "feat(0041): 응원 포인트 — 지급 예외 격리 + 반환값에 points_awarded"
```

---

## Task 3: 검증 스크립트 작성

**파일:**
- 생성: `scripts/cheer-points-check.mjs`

이 스크립트가 이 기능의 실질적 테스트다. 로직이 SQL 안에 있어 vitest로는 닿지 않는다.

### 스크립트를 쓰기 전에 알아야 할 제약

**① 유저당 동시 `active` 세션은 1개다.** `workout_sessions_one_active` 유니크 인덱스(`0004:88`)가 강제한다. 같은 사람의 세션을 두 개 열려고 하면 `start_workout`이 실패한다. **다음 세션을 열기 전에 반드시 이전 세션을 완료한다.**

**② 실제로 10초를 기다리지 않는다.** service_role로 `cheers.created_at`을 과거로 당겨 쿨다운을 통과시킨다. `rls-test.mjs`는 `await sleep(10500)`을 두 번 써서 그 구간에만 21초를 쓴다 — 따라 하지 않는다.

**③ RPC 인자 이름을 짐작하지 않는다.** 실제 이름은 다음과 같다.

- `send_crew_request(p_target_id)` — `p_addressee_id`가 **아니다**
- `accept_crew_request(p_request_id)`
- `get_incoming_crew_requests()` → `request_id` 컬럼

**④ 포인트를 주는 완료 RPC는 `complete_workout_v2`다.** 앱도 이걸 쓴다(`workout.ts:319`). 구버전 `complete_workout`(`0011:246`)은 포인트를 주지 않아 `[11]` 검증이 헛돈다. 그리고 XP가 0이면 포인트도 0이므로 **운동·완료 세트를 넣어야** 원장 행이 생긴다.

**⑤ 세션 insert에 넣을 수 있는 컬럼은 정해져 있다.** `grant insert (id, user_id, group_id, workout_type, title, intensity, memo, visibility, timezone)`(`0004:276`). `status`·`started_at`은 못 넣는다 — RPC로만 바뀐다.

- [ ] **Step 1: 스크립트 작성**

`scripts/cheer-points-check.mjs`:

```js
// 0041 검증: 응원 포인트 — 하루 1회 상한·예외 격리·반환값·회귀.
// 실행: node scripts/cheer-points-check.mjs
// 사전조건: 0041이 적용되어 있어야 한다.
//
// 쿨다운(10초)은 기다리지 않고 service_role로 cheers.created_at을 과거로
// 당겨 통과시킨다. 기다리면 실행이 1분을 넘고, 그건 검증이 아니라 대기다.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error(".env.local에 Supabase 설정이 없습니다");
}

const RUN = Date.now().toString(36).slice(-5);
let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (ok) passed++;
  else failed++;
}

async function api(token, method, path, body, prefer = "return=representation") {
  const service = token === SERVICE_KEY;
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: {
      apikey: service ? SERVICE_KEY : ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // 본문 없는 응답
  }
  return { status: res.status, json };
}

const rpc = (token, name, args) =>
  api(token, "POST", `/rest/v1/rpc/${name}`, args ?? {});

const hasCode = (r, code) =>
  r.status >= 400 && JSON.stringify(r.json ?? {}).includes(code);

async function anonUser(tag) {
  const res = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`익명 가입 실패(${tag}): ${JSON.stringify(json)}`);
  }
  const user = {
    id: json.user.id,
    token: json.access_token,
    nickname: `치어${RUN}${tag}`,
  };
  const created = await api(user.token, "POST", "/rest/v1/profiles", {
    id: user.id,
    nickname: user.nickname,
    avatar_url: "📣",
    weekly_goal: 3,
  });
  if (created.status >= 400) {
    throw new Error(`프로필 생성 실패(${tag}): ${JSON.stringify(created.json)}`);
  }
  return user;
}

const deleteAuthUser = (id) =>
  fetch(`${URL}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });

/** 두 사람을 상호 크루로 만든다 (0038 RPC). */
async function linkCrew(from, to) {
  await rpc(from.token, "send_crew_request", { p_target_id: to.id });
  const inbox = await rpc(to.token, "get_incoming_crew_requests", {});
  const req = (inbox.json ?? [])[0];
  if (!req) throw new Error(`크루 요청이 받은함에 없음: ${JSON.stringify(inbox.json)}`);
  await rpc(to.token, "accept_crew_request", { p_request_id: req.request_id });
}

/**
 * 진행 중(active) 세션을 만들고 id를 돌려준다.
 *
 * ⚠ 유저당 동시 active 세션은 1개다(workout_sessions_one_active). 이 함수를
 *   같은 사람에게 연속으로 부르기 전에 반드시 finish()로 이전 세션을 닫는다.
 */
async function activeSession(owner) {
  const created = await api(owner.token, "POST", "/rest/v1/workout_sessions", {
    user_id: owner.id,
    visibility: "group",
    timezone: "Asia/Seoul",
  });
  const id = created.json?.[0]?.id;
  if (!id) throw new Error(`세션 생성 실패: ${JSON.stringify(created.json)}`);
  const started = await rpc(owner.token, "start_workout", { p_session_id: id });
  if (started.status >= 400) {
    throw new Error(`start_workout 실패(이전 세션이 열려 있나?): ${JSON.stringify(started.json)}`);
  }
  return id;
}

/**
 * 세션을 완료한다. withWork=true면 운동·완료 세트를 먼저 넣어 XP가 나오게 한다
 * (XP 0이면 포인트도 0이라 workout_completed 원장이 안 생긴다).
 */
async function finish(owner, sessionId, withWork = false) {
  if (withWork) {
    const ex = await api(owner.token, "POST", "/rest/v1/workout_exercises", {
      session_id: sessionId,
      exercise_name: "벤치프레스",
      exercise_type: "weight",
      sort_order: 0,
    });
    const exerciseId = ex.json?.[0]?.id;
    await api(owner.token, "POST", "/rest/v1/workout_sets", {
      workout_exercise_id: exerciseId,
      set_number: 1,
      weight_kg: 50,
      reps: 10,
      is_completed: true,
    });
  }
  // 포인트를 주는 것은 v2다. 구버전 complete_workout은 원장을 남기지 않는다.
  return rpc(owner.token, "complete_workout_v2", { p_session_id: sessionId });
}

/**
 * 쿨다운 회피 — 이 발신자의 응원 행을 전부 1분 전으로 당긴다.
 *
 * 쿨다운과 세션당 3회 상한은 둘 다 (session_id, sender_id)로 세므로, 세션이
 * 바뀌면 원래 초기화된다. 즉 같은 세션에 다시 응원할 때만 이게 필요하다.
 * 새 세션 앞에서 불러도 무해하니 방어적으로 둔다.
 */
async function rewindCheers(senderId) {
  const past = new Date(Date.now() - 60_000).toISOString();
  await api(
    SERVICE_KEY,
    "PATCH",
    `/rest/v1/cheers?sender_id=eq.${senderId}`,
    { created_at: past },
    "return=minimal",
  );
}

/** 지갑 잔액 (행이 없으면 0). */
async function balanceOf(user) {
  const r = await api(user.token, "GET", "/rest/v1/user_wallet?select=balance");
  return r.json?.[0]?.balance ?? 0;
}

let users = [];

try {
  const a = await anonUser("a"); // 세션 주인 (응원 받는 사람)
  const b = await anonUser("b"); // 응원 보내는 사람
  const c = await anonUser("c"); // 두 번째 대상
  const d = await anonUser("d"); // 비크루
  users = [a, b, c, d];

  await linkCrew(b, a);
  await linkCrew(b, c);

  // ── 1회차 세션: 지급·쿨다운·재응원 ──
  const sA = await activeSession(a);

  const before = await balanceOf(b);
  let r = await rpc(b.token, "send_cheer", {
    p_session_id: sA,
    p_cheer_type: "fire",
  });
  check("[1] 크루 세션 응원 성공", r.status === 200, JSON.stringify(r.json));
  check(
    "[13] 첫 응원 반환값 points_awarded=10",
    r.json?.points_awarded === 10,
    JSON.stringify(r.json),
  );
  check(
    "[1b] 지갑 +10P",
    (await balanceOf(b)) === before + 10,
    `${before} → ${await balanceOf(b)}`,
  );
  check(
    "[21a] 반환값에 cheer 객체가 들어 있다",
    r.json?.cheer?.cheer_type === "fire",
    JSON.stringify(r.json?.cheer),
  );

  // ── 쿨다운 (회귀) ──
  r = await rpc(b.token, "send_cheer", { p_session_id: sA, p_cheer_type: "clap" });
  check("[6] 10초 이내 재응원은 cheer_cooldown", hasCode(r, "cheer_cooldown"));

  // ── 같은 날 같은 상대 재응원 → 응원은 성공, 지급 0 ──
  await rewindCheers(b.id);
  const mid = await balanceOf(b);
  r = await rpc(b.token, "send_cheer", { p_session_id: sA, p_cheer_type: "clap" });
  check("[2] 쿨다운 후 같은 날 재응원 성공", r.status === 200, JSON.stringify(r.json));
  check("[14] 재응원 points_awarded=0", r.json?.points_awarded === 0, JSON.stringify(r.json));
  check("[2b] 지갑 변화 없음", (await balanceOf(b)) === mid, `${mid} → ${await balanceOf(b)}`);
  check("[3] 두 번째 응원도 cheers 행 생성", Boolean(r.json?.cheer?.id));

  const notif = await api(
    a.token,
    "GET",
    "/rest/v1/notifications?type=eq.cheer_received&select=id",
  );
  check("[15] 지급 0이어도 알림은 생성", (notif.json ?? []).length === 2, `${notif.json?.length}건`);

  // ⚠ 다음 세션을 열기 전에 반드시 닫는다 (active 1개 제약).
  //    withWork=true — [11]에서 볼 workout_completed 원장을 여기서 만든다.
  await finish(a, sA, true);

  // ── 2회차 세션: 같은 상대의 다른 세션도 당일 1회만 ──
  const sA2 = await activeSession(a);
  await rewindCheers(b.id);
  const beforeS2 = await balanceOf(b);
  r = await rpc(b.token, "send_cheer", { p_session_id: sA2, p_cheer_type: "fire" });
  check(
    "[19] 같은 상대의 다른 세션도 당일 1회만 지급",
    r.status === 200 && r.json?.points_awarded === 0 && (await balanceOf(b)) === beforeS2,
    JSON.stringify(r.json),
  );
  await finish(a, sA2);

  // ── 다른 상대에게는 지급 ──
  const sC = await activeSession(c);
  await rewindCheers(b.id);
  const beforeC = await balanceOf(b);
  r = await rpc(b.token, "send_cheer", { p_session_id: sC, p_cheer_type: "fire" });
  check(
    "[4][20] 다른 상대에게는 각각 10P",
    r.json?.points_awarded === 10 && (await balanceOf(b)) === beforeC + 10,
    JSON.stringify(r.json),
  );
  await finish(c, sC);

  // ── 원장 확인 ──
  const ledger = await api(
    b.token,
    "GET",
    "/rest/v1/point_transactions?reason=eq.cheer_sent&select=amount,source_type,source_id",
  );
  check("[10] cheer_sent 원장 2건", (ledger.json ?? []).length === 2, JSON.stringify(ledger.json));
  check(
    "[10b] source_id는 받는사람:KST날짜",
    (ledger.json ?? []).every((t) => /^[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$/.test(t.source_id)),
    JSON.stringify(ledger.json),
  );

  // ── 동시 호출해도 당일 중복 지급 없음 ──
  // 같은 사용자의 두 기기를 흉내 내려면 토큰이 둘이어야 하지만, 검증 대상은
  // 토큰이 아니라 원장의 유니크 인덱스다. 같은 토큰으로 병렬 호출해도 두 요청은
  // 서로 다른 트랜잭션이라 경쟁 조건은 동일하게 재현된다.
  const sC2 = await activeSession(c);
  await rewindCheers(b.id);
  const beforeRace = await balanceOf(b);
  const [r1, r2] = await Promise.all([
    rpc(b.token, "send_cheer", { p_session_id: sC2, p_cheer_type: "fire" }),
    rpc(b.token, "send_cheer", { p_session_id: sC2, p_cheer_type: "clap" }),
  ]);
  const awarded = [r1, r2].filter((x) => x.json?.points_awarded === 10).length;
  check(
    "[17] 동시 호출해도 당일 중복 지급 없음 (c에게는 이미 지급됨)",
    awarded === 0 && (await balanceOf(b)) === beforeRace,
    `awarded=${awarded} ${JSON.stringify([r1.json, r2.json])}`,
  );
  await finish(c, sC2);

  // ── 회귀: 세션당 3회 상한 ──
  const sA3 = await activeSession(a);
  for (let i = 0; i < 3; i++) {
    await rewindCheers(b.id);
    await rpc(b.token, "send_cheer", { p_session_id: sA3, p_cheer_type: "fire" });
  }
  await rewindCheers(b.id);
  r = await rpc(b.token, "send_cheer", { p_session_id: sA3, p_cheer_type: "fire" });
  check("[5] 세션당 3회 상한 (cheer_limit)", hasCode(r, "cheer_limit"));

  // ── 회귀: 권한·상태 (예외 격리가 이것들을 삼키면 안 된다) ──
  r = await rpc(a.token, "send_cheer", { p_session_id: sA3, p_cheer_type: "fire" });
  check("[7] 본인 세션은 own_session", hasCode(r, "own_session"));

  r = await rpc(d.token, "send_cheer", { p_session_id: sA3, p_cheer_type: "fire" });
  check("[8] 비크루는 session_not_found", hasCode(r, "session_not_found"));

  await finish(a, sA3);
  await rewindCheers(c.id);
  r = await rpc(c.token, "send_cheer", { p_session_id: sA3, p_cheer_type: "fire" });
  check("[9] 완료된 세션은 not_active", hasCode(r, "not_active"));

  // ── 회귀: 기존 workout_completed 지급이 CHECK 변경 후에도 동작 ──
  // 위 finish(a, sA, true)가 운동·완료 세트를 넣고 complete_workout_v2를 불렀다.
  const wc = await api(
    a.token,
    "GET",
    "/rest/v1/point_transactions?reason=eq.workout_completed&select=amount",
  );
  check(
    "[11] workout_completed 지급 정상 (CHECK 변경 무해)",
    wc.status === 200 && (wc.json ?? []).length >= 1,
    JSON.stringify(wc.json),
  );

  // ── KST 날짜 경계 ──
  // 어제 날짜로 원장을 옮겨 두면 오늘 다시 지급돼야 한다.
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await api(
    SERVICE_KEY,
    "PATCH",
    `/rest/v1/point_transactions?user_id=eq.${b.id}&reason=eq.cheer_sent`,
    { source_id: `${a.id}:${yesterday}` },
    "return=minimal",
  );
  const sA4 = await activeSession(a);
  await rewindCheers(b.id);
  const beforeDay = await balanceOf(b);
  r = await rpc(b.token, "send_cheer", { p_session_id: sA4, p_cheer_type: "fire" });
  check(
    "[12][18] 날짜가 바뀌면 같은 상대에게 다시 10P",
    r.json?.points_awarded === 10 && (await balanceOf(b)) === beforeDay + 10,
    JSON.stringify(r.json),
  );
  await finish(a, sA4);

  // ── [16] 지급 강제 실패는 자동화하지 않는다 ──
  // 공용 테이블에 제약을 넣었다 빼는 것은 다른 세션이 동시에 돌 때 실서비스를
  // 망가뜨린다. Task 4 Step 4의 수동 절차로 확인한다.
  console.log("\n  ⚠ [16] 예외 격리(지급 실패해도 응원 유지)는 이 스크립트가 검증하지 않는다.");
  console.log("     계획서 Task 4 Step 4의 수동 절차를 반드시 수행할 것.");
} finally {
  for (const u of users) await deleteAuthUser(u.id);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
```

- [ ] **Step 2: 0041 적용 전이므로 실패하는지 확인**

```bash
node scripts/cheer-points-check.mjs
```

기대: `[13] 첫 응원 반환값 points_awarded=10` FAIL (아직 `send_cheer`가 `cheers` 행을 반환하므로 `points_awarded`가 `undefined`)

이 실패가 확인되면 스크립트가 실제로 새 동작을 보고 있다는 뜻이다.

- [ ] **Step 3: 커밋**

```bash
git add scripts/cheer-points-check.mjs
git commit -m "test: 응원 포인트 검증 스크립트 (0041 적용 전이라 실패 상태)"
```

---

## Task 4: 0041 적용 및 검증 통과

**이 태스크는 사용자가 수행한다.** 에이전트는 SQL을 실행할 수 없다.

- [ ] **Step 1: 사용자에게 적용 요청**

> Supabase Dashboard → SQL Editor → `supabase/migrations/0041_cheer_points.sql` **전체**를 붙여넣고 Run.
> 부분 선택 실행 금지 — `send_cheer`를 드롭했다 다시 만들기 때문에 중간에 끊기면 응원 기능이 사라진다.

- [ ] **Step 2: 적용 확인**

SQL Editor에서:

```sql
select pg_get_function_result(oid) from pg_proc where proname = 'send_cheer';
```

기대: `jsonb`

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint where conname = 'point_transactions_reason_check';
```

기대: `cheer_sent`를 포함한 6개 값

- [ ] **Step 3: 검증 스크립트 실행**

```bash
node scripts/cheer-points-check.mjs
```

기대: `0 failed`. `[16]`은 스크립트가 검증하지 않고 경고만 출력한다 — 다음 스텝에서 수동으로 확인한다.

- [ ] **Step 4: [16] 예외 격리 수동 확인**

SQL Editor에서 지급을 강제로 실패시킨다.

```sql
alter table point_transactions
  add constraint tmp_fail check (reason <> 'cheer_sent');
```

앱 또는 스크립트로 응원을 한 번 보낸 뒤 확인한다.

```sql
select count(*) from cheers where created_at > now() - interval '2 minutes';
select count(*) from point_transactions
  where reason = 'cheer_sent' and created_at > now() - interval '2 minutes';
```

기대: **cheers는 1 이상, point_transactions는 0.** 응원은 남고 지급만 실패해야 한다. 둘 다 0이면 예외 격리가 동작하지 않는 것이므로 Task 2로 돌아간다.

되돌린다:

```sql
alter table point_transactions drop constraint tmp_fail;
```

- [ ] **Step 5: 기존 회귀 스크립트 확인**

`rls-test.mjs`는 아직 옛 반환 모양을 기대하므로 **2건이 실패하는 것이 정상**이다. Task 6에서 고친다.

```bash
node scripts/rls-test.mjs
```

기대: `B가 응원 1회 성공`과 `커스텀 메시지 응원 3회 성공`만 FAIL. 다른 항목이 추가로 깨지면 0041이 뭔가를 망가뜨린 것이므로 멈추고 원인을 찾는다.

---

## Task 5: 앱이 지급 결과를 받아 쓰게 한다

**파일:**
- 수정: `src/lib/social.ts:483-495`
- 수정: `src/components/feed/active-workout-cards.tsx:80-97`

- [ ] **Step 1: `sendCheer` 반환 타입 변경**

`src/lib/social.ts`의 현재 코드:

```ts
export async function sendCheer(
  sessionId: string,
  type: CheerType,
  message?: string,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("send_cheer", {
    p_session_id: sessionId,
    p_cheer_type: type,
    p_message: message ?? null,
  });
  if (error) throw toSocialError(error);
}
```

이것으로 교체한다:

```ts
/**
 * 응원 보내기. 반환값의 pointsAwarded는 **서버가 실제로 지급한 액수**다(0041).
 * 클라이언트가 "오늘 이 사람에게 응원했었나"를 로컬로 추측하면 다른 기기·다른
 * 탭에서 0P인데 +10P로 표시된다.
 */
export async function sendCheer(
  sessionId: string,
  type: CheerType,
  message?: string,
): Promise<{ pointsAwarded: number }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("send_cheer", {
    p_session_id: sessionId,
    p_cheer_type: type,
    p_message: message ?? null,
  });
  if (error) throw toSocialError(error);
  const row = data as { points_awarded?: number } | null;
  return { pointsAwarded: row?.points_awarded ?? 0 };
}
```

`?? 0`을 두는 이유: 0041 적용 전 배포본이 잠깐 돌더라도 화면이 깨지지 않고 "포인트 문구 없음"으로만 나온다.

- [ ] **Step 2: 토스트에 지급액 반영**

`src/components/feed/active-workout-cards.tsx`의 import에 추가한다:

```ts
import { cheerToastMessage } from "@/lib/domain/cheer-points";
```

`cheer` 함수의 현재 코드:

```ts
      await sendCheer(session.sessionId, type, message);
      setSent(true);
      setCustomOpen(false);
      setNotice("응원을 보냈어요! 📣");
```

이것으로 교체한다:

```ts
      const { pointsAwarded } = await sendCheer(session.sessionId, type, message);
      setSent(true);
      setCustomOpen(false);
      setNotice(cheerToastMessage(pointsAwarded));
```

- [ ] **Step 3: 타입·린트·테스트 확인**

```bash
npx tsc --noEmit
```

기대: 오류 없음

```bash
npm run lint
```

기대: 오류 없음

```bash
npm test
```

기대: 전체 PASS

- [ ] **Step 4: 커밋**

```bash
git add src/lib/social.ts src/components/feed/active-workout-cards.tsx
git commit -m "feat: 응원 토스트에 지급 포인트 표시 (서버 반환값 기준)"
```

---

## Task 6: `rls-test.mjs` 회귀 단언 수정

**파일:**
- 수정: `scripts/rls-test.mjs:413`, `scripts/rls-test.mjs:429`

반환 모양이 `cheers` 행에서 `{cheer, points_awarded}`로 바뀌었으므로 두 단언이 한 겹 더 들어가야 한다. **나머지 5회 호출은 status와 에러 문자열만 보므로 건드리지 않는다.**

- [ ] **Step 1: 413행 수정**

현재:

```js
check("B가 응원 1회 성공", ch1.status === 200 && ch1.json?.cheer_type === "fire", JSON.stringify(ch1.json));
```

이것으로:

```js
check("B가 응원 1회 성공", ch1.status === 200 && ch1.json?.cheer?.cheer_type === "fire", JSON.stringify(ch1.json));
```

- [ ] **Step 2: 429행 수정**

현재:

```js
check("커스텀 메시지 응원 3회 성공", ch3.status === 200 && ch3.json?.message === "화이팅!");
```

이것으로:

```js
check("커스텀 메시지 응원 3회 성공", ch3.status === 200 && ch3.json?.cheer?.message === "화이팅!");
```

- [ ] **Step 3: 전체 회귀 실행**

```bash
node scripts/rls-test.mjs
```

기대: `0 failed`

- [ ] **Step 4: 크루 연결 회귀도 확인**

`crew-link-check.mjs`는 status와 에러코드만 보므로 수정 없이 통과해야 한다. 통과하지 않으면 0041이 판정 로직을 건드린 것이다.

```bash
node scripts/crew-link-check.mjs
```

기대: `0 failed`

- [ ] **Step 5: 커밋**

```bash
git add scripts/rls-test.mjs
git commit -m "test: send_cheer 반환 모양 변경에 맞춰 rls-test 단언 수정"
```

---

## Task 7: 배포

- [ ] **Step 1: 빌드 확인**

```bash
npm run build
```

기대: 성공

- [ ] **Step 2: push**

```bash
git push -u origin feat/cheer-points
```

Vercel 프리뷰 배포가 자동으로 생성된다.

---

## Task 8: 실기기 확인 게이트 🚦

**사용자가 폰에서 직접 확인한다. 이 확인 전에는 `main`에 머지하지 않는다.**

- [ ] **Step 1: 확인 항목을 사용자에게 전달**

크루 두 명이 필요하다. 한 명이 운동을 시작하고, 다른 한 명이 응원한다.

1. 크루가 운동을 시작하면 홈 피드에 "운동 중" 카드가 뜬다
2. 응원 버튼을 누르면 토스트가 **`응원을 보냈어요! 📣 +10P`**
3. 프로필 → 성장 허브의 **GND 포인트 잔액이 10 늘었다**
4. **같은 사람에게 다시 응원**하면 토스트가 `응원을 보냈어요! 📣` (**+10P 없음**)
5. 그때 잔액이 **늘지 않았다**
6. **다른 크루에게 응원**하면 다시 `+10P`
7. 응원 알림이 받는 사람에게 도착한다

- [ ] **Step 2: 사용자 확인 대기**

7개 항목이 모두 확인될 때까지 진행하지 않는다. 하나라도 어긋나면 원인을 찾아 해당 태스크로 돌아간다.

- [ ] **Step 3: main 머지**

```bash
git checkout main
git merge --no-ff feat/cheer-points
git push
```

---

## 자체 점검 결과

**스펙 커버리지**

| 스펙 | 태스크 |
|---|---|
| §3 D1 하루 1회 상한 | Task 2 (source_id 설계) · Task 3 [2][14][19] |
| §3 D2 10P 고정, 배수 미적용 | Task 2 (`award_points(..., 10, ...)`, multiplier `null`) |
| §3 D3 보내는 사람만 | Task 2 (`auth.uid()`에만 지급) |
| §3 D4 리액션 제외 | 해당 없음 — 리액션 경로를 건드리지 않음 |
| §3 D5 상한 초과해도 응원 성공 | Task 3 [2][3] · Task 4 Step 4 |
| §3 D6 하루 총 상한 없음 | 해당 없음 — 구현하지 않는 것이 요구사항 |
| §3.1 운영 지표 6종 | **범위 밖** — 관측 대시보드는 이번 스펙이 만들지 않는다 (아래 참조) |
| §4.1 멱등 키 | Task 2 · Task 3 [10b] |
| §4.2 (1) reason CHECK | Task 2 Step 1 · Task 3 [11] |
| §4.2 (2) 예외 격리 | Task 2 Step 1 · Task 4 Step 4 [16] |
| §4.3 반환값 변경 | Task 2 · Task 5 · Task 6 |
| §4.4 토스트 | Task 1 · Task 5 Step 2 · Task 8 |
| §5 검증 22건 | Task 3 · Task 4 · Task 6 |

**§3.1 운영 지표에 대해** — 스펙은 "지표를 관측한다"고만 적었고 대시보드를 요구하지 않았다. 지표 6종은 전부 `point_transactions`·`cheers`·`crew_links`에서 사후 쿼리로 뽑을 수 있으므로 이번에 화면을 만들지 않는다. 관리자 대시보드에 붙이는 것은 별도 작업이다.

**[16]에 대해** — 유일하게 자동화하지 못한 항목이다. 지급 실패를 만들려면 스키마에 일시적 제약을 걸어야 하는데, 스크립트가 공용 테이블의 제약을 넣었다 빼는 것은 다른 세션이 동시에 돌 때 실서비스를 망가뜨린다. Task 4 Step 4의 수동 절차로 뺐고, 이 한계는 스크립트 출력에도 남긴다.

**타입 일관성**

- `cheerToastMessage(pointsAwarded: number): string` — Task 1 정의, Task 5 Step 2 사용
- `CHEER_POINT_AMOUNT = 10` — Task 1 정의. SQL의 `10`과 이름으로 연결되지 않으므로 Task 2 주석에 대응 관계를 남겼다
- `sendCheer(): Promise<{ pointsAwarded: number }>` — Task 5 Step 1 정의, Step 2 사용. snake_case(`points_awarded`)는 RPC 경계에서만 쓰고 앱 안에서는 camelCase로 바꾼다
