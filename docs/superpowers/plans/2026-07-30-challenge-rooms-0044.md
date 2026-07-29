# 챌린지 방 0044 (전환) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 사람이 **여러 챌린지를 동시에** 진행할 수 있게 한다 — 개수 제한을 풀고, 참가자 명단·집계·화면을 `challenge_participants` 기준으로 옮기고, 초대·수락과 자동 시작·종료를 화면·크론에 연결한다.

**Architecture:** 0042가 테이블·RPC를 **추가만** 해 뒀다(아무도 안 부름). 0044는 그것을 **실제로 쓰게** 만든다. 점수를 바꾸는 변경(완료 보너스 +3→+9, 랭킹 RPC 이관)은 전부 0045로 미뤄, 진행 중인 `7월 GND 챌린지`의 점수가 이 단계에서 **한 자리도 변하지 않게** 한다.

**Tech Stack:** Next.js(App Router, 클라 컴포넌트) · Supabase(PostgREST + RLS + 정의자 RPC) · TypeScript · vitest · 실 DB 검증 스크립트(`scripts/*.mjs`)

**선행 문서:** 설계 `docs/superpowers/specs/2026-07-29-challenge-rooms-design.md` · 인수인계 `docs/superpowers/HANDOFF-2026-07-30-challenge-rooms.md`(**§6 함정 8개를 먼저 읽어라**) · 이전 단계 계획 `docs/superpowers/plans/2026-07-30-challenge-rooms-0042.md`

---

## 이 계획의 전제 (읽고 시작해라)

**마이그레이션 번호는 `0044`다.** 0043까지 운영 DB에 적용돼 있다. `0001`~`0043`은 **수정 금지** — 새 파일만 만든다.

**회귀 기준선은 전부 0 failed다** (인수인계서 §6.4). 하나라도 실패하면 회귀다.

| 스크립트 | 기준선 |
|---|---|
| `scripts/rls-test.mjs` | 113 통과 / 0 실패 |
| `scripts/poke-levelup-check.mjs` | 11 / 11 |
| `scripts/challenge-consent-test.mjs` | 20 / 0 |
| `scripts/challenge-room-check.mjs` | 32 / 0 (**Task 11에서 단언이 늘어난다**) |
| `pnpm test` | 650 / 650 |

**검증 스크립트를 연달아 돌리지 마라** — 익명 가입 rate limit(429)에 걸린다. 사이에 1~2분 둬라 (§6.5).

**정리는 그룹 먼저, 유저 나중** — `groups.owner_id`는 cascade가 아니다 (§6.3).

### 0044에서 하지 않는 것 (전부 0045)

점수가 흔들리므로 **진행 중 챌린지가 끝난 뒤**(2026-09-30 이후) 한다.

- 완료 목표 보너스 `+3 → +9` (`goal-score.ts`의 `COMPLETED_GOAL_BONUS_PER`) 및 `setup-sheet.tsx:337`의 "+3점" 문구
- 랭킹 계산을 `get_challenge_ranking` 정의자 RPC로 이관 (`0040:9`)
- `profiles` RLS에서 `or shares_group_with(id)` 제거 (`0039:33`)
- `sessions_insert_own_draft`에서 `group_id` 조건 제거 (`0004:226`)
- `challenge_goal_approvals` 드롭
- `workout_sessions.group_id` · `challenges.group_id` · `user_goals.group_id` 드롭, `groups` · `group_members` 드롭, `is_group_member` · `shares_group_with` 드롭
- 혼자모드 유저의 챌린지 생성 (지금은 `create_challenge_room`이 `challenges.group_id`(not null)를 채워야 해서 `no_group_yet`으로 막힌다)

**0045에 반드시 들고 갈 것 — DB 리뷰(opus)가 짚은 것들**

- **정책을 좁힐 때는 `drop policy` + `create policy`가 아니라 `alter policy`를 써라.** 0044는 순수 확대(OR로 덧붙이기)라 정책 이름을 틀려도 옛 정책이 OR 합집합에 흡수되어 **결과 predicate가 같다** — 즉 무해하다. 0045는 그룹 arm을 **제거**하므로 정반대다: 이름을 틀리면 `drop`이 조용히 no-op 하고 0006의 옛 정책이 살아남아 **그룹 arm이 되살아난다.** `alter policy`는 이름이 틀리면 `42704`로 죽어 실패가 드러나고, `cmd`·`roles`도 보존한다. `0014:19`가 이미 이 관용구를 쓴 선례다.
- **`0039_crew_link_switchover.sql:143-150`의 `select c.id into v_challenge_id ... status='active' ... limit 1`.** 살아있는 챌린지가 여러 개면 **임의의 한 건**이 `record_views.challenge_id`에 박힌다. 0044 시점에는 잘못되지 않지만(챌린지가 1개), 두 번째 active가 생기는 순간부터 열람 기록이 엉뚱한 챌린지에 붙을 수 있다. 0040의 `challenge_peek_picks`가 이 값을 쓰므로 **0045에서 결정적 선택으로 바꿔라** — 대표 챌린지 규칙(`pickPrimaryChallenge`)과 같은 기준이어야 화면과 서버가 안 갈라진다.
- **`user_goals`의 대체 인덱스를 만들지 마라.** `challenges_one_live`는 `challenges(group_id)`를 커버하던 유일한 인덱스였고, 드롭 후 `group_id` 조회는 seq scan이 된다. **`challenges`가 1행이라 무의미하고, 0045가 그 컬럼을 지울 예정이라 지금 인덱스를 만드는 것은 낭비다.**

**의도적으로 받아들인 것 (리뷰가 제기하고 판단해 남긴 것)**

- **`invited` 상태도 그 방의 목표를 읽는다.** `is_challenge_participant`가 `status`를 안 보기 때문이다. 수락 전에 KPI 타깃·`planned_days`가 보이는 것은 필요보다 넓다. 다만 **새로운 주체 부류가 생기는 것은 아니다** — `0042:77`이 이미 초대받은 사람에게 참가자 명단을 열어 줬고 프로덕션에 적용돼 있다. 방 안에서는 원래 전원 공개 데이터이며 민감정보가 아니다. 좁히려면 `status in ('joined','dropped')` 서브쿼리로 바꿀 수 있으나(다른 테이블이라 `42P17` 재귀 위험 없음) 이번 범위에서는 하지 않는다.
- **`dropped`는 영구 잔존이라 읽기 권한도 영구다.** `0042:288`이 `crew_links`의 근거를 보존하려고 행을 남긴다. 되돌릴 RPC가 없다. 리크는 아니지만(실제로 수락해 들어왔던 사람) **취소 불가한 영구 grant**라는 점은 기록해 둔다.
- **`notify pgrst, 'reload schema'`는 이 마이그레이션에 불필요하다.** 테이블·컬럼·함수·관계를 하나도 바꾸지 않고, PostgREST는 정책·인덱스를 캐시하지 않는다. 무해하고 `0043:55-57`도 같은 논리로 남겼으므로 습관으로 유지한다.

### 지시서에 없었지만 0044에 넣는 것 — 근거

**`challenges`·`user_goals`의 SELECT RLS를 참가자에게도 연다.** 현행은 그룹 기준 한 줄뿐이다.

```
challenges_select_member : using (public.is_group_member(group_id, auth.uid()))   -- 0006:63
goals_select_member      : using (public.is_group_member(group_id, auth.uid()))   -- 0006:79
```

0042의 `invite_to_challenge`는 대상에게 **프로필만 있으면** 초대한다(그룹 검사 없음). 즉 **서버는 이미 타 그룹 초대를 허용하는데 RLS 읽기가 막는다.** 이 상태로 Task 9의 초대 흐름을 붙이면, 초대받은 사람은 챌린지 행도 목표도 못 읽어 화면이 빈다 — "한 사람이 **여러 크루**·여러 챌린지"라는 이 프로젝트의 목적 그 자체가 깨진다.

정책을 **덧붙이기만** 한다(`참가자 OR 그룹멤버`). 기존 같은 그룹 사용자에게는 판정 결과가 그대로이므로 **점수·가시성 회귀가 없다.**

---

## 착수 전 재확인 결과 (2026-07-30 06:25, 실 DB 실측)

집계 기준을 `group_id`에서 참가자로 바꿔도 **진행 중 챌린지의 점수가 변하지 않는다**는 것을 실측으로 확인했다. Task 0에서 **다시 확인한다** — 그 사이 운동이 쌓이면 값이 달라질 수 있다.

```
챌린지: 7월 GND 챌린지 (2026-07-27 ~ 2026-09-30, photo_required=true)
참가자 3행(joined 3) · 그룹 멤버 3명 · 명단 동일
참가자 완료 세션 21건 중 group_id 불일치·null: 0건
기간 내 세션 — group_id 기준 9건 · 참가자 기준 9건 · 차집합 양방향 0
목표 9개 — 실적 전부 동일
```

**전환 전 목표 9개 실적 (Task 4에서 이 표와 대조한다):**

| 사용자 | 목표 | qualifier | 목표치 | 실적 |
|---|---|---|---|---|
| 낭만송곳니 | `cardio_distance` | — | 113.1 | **0** |
| 낭만송곳니 | `bodyweight_reps` | — | 565.7 | **0** |
| 낭만송곳니 | `bodyweight_time` | — | 56.6 | **0** |
| 오뎅끼데스까 | `tabata_count` | — | 28.3 | **2** |
| 오뎅끼데스까 | `cardio_time` | — | 509.1 | **0** |
| 오뎅끼데스까 | `weight_days` | 3 | 28 | **0** |
| 스칼레또 | `weight_days` | 4 | 19 | **1** |
| 스칼레또 | `bodyweight_reps` | — | 1885.7 | **0** |
| 스칼레또 | `cardio_distance` | — | 113.1 | **9.4** |

> 이 값은 `service_role`로 읽은 것이라 RLS 상위집합이다. 실제 화면은 사용자 토큰으로 돌아 private 세션이 본인에게만 잡힌다. **대조 목적에는 상위집합이 맞다** — 집합 동일성은 교집합에 보존되므로(A=B ⟹ A∩V=B∩V) 상위집합에서 같으면 모든 RLS 시야에서 같다.
>
> 스칼레또 `weight_days`(q=4) = **1일**은 인수인계서 §1.6이 폰으로 확인하려던 값(0일 → 1일)이다. 서버 계산은 이렇게 두 번 확인됐다.

---

## 파일 구조

| 파일 | 책임 | 변경 |
|---|---|---|
| `supabase/migrations/0044_challenge_room_switchover.sql` | 인덱스 드롭 + SELECT 정책 2개 확대 | **신규** |
| `src/lib/challenge.ts` | 챌린지 조회·집계·랭킹·RPC 래퍼 | 수정 (집계 시그니처가 바뀌는 핵심) |
| `src/lib/domain/challenge-room.ts` | 순수 계산 (`pickPrimaryChallenge` 등) | 수정 (DB행 ↔ `ChallengeLike` 매핑 추가) |
| `src/lib/domain/challenge-room.test.ts` | 위의 테스트 | 수정 |
| `src/lib/social.ts` | 알림 유형 유니온 · 랭킹 호출부 | 수정 |
| `src/lib/domain/push.ts` | 알림 → URL 라우팅 | 수정 |
| `src/components/notification-bell.tsx` | 알림 아이콘 (exhaustive Record) | 수정 |
| `src/app/(tabs)/challenge/page.tsx` | 챌린지 탭 — 목록·선택기·초대 UI | 수정 (947줄, 최대 변경) |
| `src/components/challenge/challenge-picker.tsx` | 챌린지 선택기 chip 행 | **신규** |
| `src/components/challenge/challenge-picker.test.tsx` | 위의 테스트 | **신규** |
| `src/components/challenge/invite-sheet.tsx` | 초대 바텀시트 (닉네임 검색 → 초대) | **신규** |
| `src/components/challenge/invite-sheet.test.tsx` | 위의 테스트 | **신규** |
| `src/components/home/challenge-performance-card.tsx` | 홈 대표 챌린지 | 수정 |
| `src/lib/admin/queries.ts` | 관리자 챌린지 달성률 | 수정 (랭킹 시그니처 추종) |
| `src/app/api/briefing/route.ts` | 09:00 크론 — 자동 시작·종료 얹기 | 수정 |
| `scripts/challenge-room-check.mjs` | 실 DB 검증 | 수정 (`[21]` 뒤집기 + 다중 챌린지) |

**`getPeriodStatsByUser`의 첫 인자가 `groupId: string` → `userIds: string[]`로 바뀐다.** 이게 이 계획에서 가장 넓게 번지는 변경이다. 호출부는 3곳뿐이다: `challenge.ts:517`(`getActiveChallengeRanking` 안), `challenge/page.tsx:165`, 그리고 그 둘을 타는 `admin/queries.ts:137`·`social.ts:625`.

---

## Task 0: 착수 전 재확인 (실 DB)

**Files:**
- Create: `scripts/challenge-aggregation-parity.mjs`

집계 전환이 안전하다는 근거를 **직접** 확인한다. 남의 실측을 믿고 진행하지 마라 — 이 스크립트는 0044 적용 **전후** 모두 돌린다(Task 4).

- [ ] **Step 1: 검증 스크립트를 만든다**

`scripts/challenge-aggregation-parity.mjs`:

```js
// 0044 집계 전환 안전성 — group_id 기준과 참가자 기준이 같은 점수를 내는지 실 DB로 확인.
// 실행: node scripts/challenge-aggregation-parity.mjs
// 읽기 전용이다. 계정을 만들지 않으므로 rate limit(§6.5) 영향이 없다.
//
// 왜 이 스크립트가 필요한가: fold·실적 계산을 여기서 재구현하면 그 재구현의 버그가
// "같다/다르다" 판정을 오염시킨다. 그래서 세션 **집합**을 비교한다 —
// 집합이 같으면 foldPeriodStats의 입력이 같고, 따라서 출력이 같은 것은 증명이다.
//
// service_role로 읽는 이유: 집합 동일성은 교집합에 보존된다. A_full = B_full 이면
// 임의의 RLS 가시집합 V에 대해 A∩V = B∩V다. 상위집합에서 같으면 전부 같다.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) throw new Error(".env.local에 Supabase 설정이 없습니다");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` — ${detail}`}`);
  if (ok) passed++;
  else failed++;
}

async function rest(path) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} → ${r.status} ${text}`);
  // §6.6: 오류 시 PostgREST는 배열이 아니라 에러 객체를 준다.
  const json = JSON.parse(text);
  return Array.isArray(json) ? json : [];
}

/** getPeriodStatsByUser의 기간창을 그대로 옮긴 것 (challenge.ts:427-430) */
function windowIso(startDate, endDate) {
  const from = new Date(`${startDate}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${endDate}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 2);
  return { from: from.toISOString(), to: to.toISOString() };
}

const actives = await rest(
  "challenges?select=id,group_id,name,start_date,end_date,photo_required&status=eq.active",
);
console.log(`진행 중 챌린지 ${actives.length}건\n`);

for (const ch of actives) {
  console.log(`── ${ch.name} (${ch.start_date} ~ ${ch.end_date}) ──`);

  const parts = await rest(
    `challenge_participants?select=user_id,status&challenge_id=eq.${ch.id}`,
  );
  const joined = parts.filter((p) => p.status === "joined").map((p) => p.user_id);
  const members = (
    await rest(`group_members?select=user_id&group_id=eq.${ch.group_id}`)
  ).map((m) => m.user_id);
  check(
    "참가자(joined) 명단 == 그룹 멤버 명단",
    JSON.stringify([...joined].sort()) === JSON.stringify([...members].sort()),
    `참가자 ${JSON.stringify(joined)} vs 멤버 ${JSON.stringify(members)}`,
  );
  if (joined.length === 0) {
    check("joined 참가자가 1명 이상", false, "0명 — 백필이 안 됐다");
    continue;
  }

  // 재확인 ① 참가자 세션 중 group_id가 챌린지와 다르거나 null인 것
  const all = await rest(
    `workout_sessions?select=id,group_id&user_id=in.(${joined.join(",")})&status=eq.completed&deleted_at=is.null`,
  );
  const odd = all.filter((s) => s.group_id !== ch.group_id);
  check(
    `참가자 완료 세션 ${all.length}건의 group_id가 전부 챌린지와 같다`,
    odd.length === 0,
    `불일치 ${odd.length}건 ${JSON.stringify(odd.slice(0, 5))}`,
  );

  // 재확인 ② 기간 내 세션 집합이 두 방식에서 같다
  const { from, to } = windowIso(ch.start_date, ch.end_date);
  const common =
    `&status=eq.completed&deleted_at=is.null` +
    `&completed_at=gte.${encodeURIComponent(from)}&completed_at=lt.${encodeURIComponent(to)}` +
    (ch.photo_required ? `&select=id,workout_images!inner(image_path)` : `&select=id`);

  const a = await rest(`workout_sessions?group_id=eq.${ch.group_id}${common}`);
  const b = await rest(`workout_sessions?user_id=in.(${joined.join(",")})${common}`);
  const idsA = new Set(a.map((r) => r.id));
  const idsB = new Set(b.map((r) => r.id));
  const onlyA = [...idsA].filter((i) => !idsB.has(i));
  const onlyB = [...idsB].filter((i) => !idsA.has(i));
  check(
    `기간 내 세션 집합 동일 (group_id ${idsA.size}건 · 참가자 ${idsB.size}건)`,
    onlyA.length === 0 && onlyB.length === 0,
    `A만 ${onlyA.length}건 ${JSON.stringify(onlyA)} · B만 ${onlyB.length}건 ${JSON.stringify(onlyB)}`,
  );

  // 공허한 통과를 막는다. 두 집합이 모두 비어 있으면 차집합도 0이 되어 위
  // 두 단언이 **아무것도 대조하지 않고** PASS로 찍힌다. 필터 문법이 틀려
  // PostgREST가 200 + []를 주는 경우가 정확히 그렇다 — 에러가 아니라 정상
  // 응답이므로 rest()의 throw에 걸리지 않는다.
  //
  // 갓 시작해 아직 운동이 없는 챌린지는 실제로 0건일 수 있다. 그때도 FAIL이
  // 맞다 — 이 스크립트는 "전환해도 안전하다"를 증명하는 게이트이고, 0건이면
  // 증명한 것이 없기 때문이다. 통과 여부가 아니라 근거 유무를 보는 단언이다.
  check(
    "대조가 공허하지 않다 (기간 내 세션 1건 이상)",
    idsB.size > 0,
    "기간 내 세션이 0건이라 위 집합 비교가 아무것도 검증하지 않았다. " +
      "갓 시작한 챌린지라면 정상이지만, 그 경우 이 실행은 전환 안전성의 근거가 되지 못한다.",
  );

  const goals = await rest(
    `user_goals?select=user_id,goal_type,target_value,qualifier&challenge_id=eq.${ch.id}`,
  );
  console.log(`  (목표 ${goals.length}개 — 실적 대조는 Task 4의 vitest가 실제 함수로 한다)`);
}

console.log(`\n${passed}/${passed + failed} passed`);

// 단언이 0건이면 실패다. actives가 비면 루프 본문이 한 번도 돌지 않아
// passed=failed=0이 되고, failed > 0이 거짓이라 exit 0으로 끝난다 — 아무것도
// 검증하지 않았는데 게이트 통과로 읽힌다. 위 네 번째 단언과 같은 계열의
// 구멍이 한 단계 위에 있는 것이다.
//
// rest()가 §6.6 방어로 배열 아닌 응답을 []로 바꾸므로, 최초 challenges 조회가
// 필터 오류로 200 + []를 받으면 정확히 이 경로를 탄다.
if (passed + failed === 0) {
  console.log(
    "\n⚠ 검증한 단언이 0건이다 — 활성 챌린지가 없거나 최초 조회가 비어 있다." +
      " 이 실행은 전환 안전성의 근거가 되지 못한다.",
  );
  // ⚠ process.exit(1)이 아니라 exitCode만 세팅한다. 이 분기는 최초 fetch 한 건만
  //   await한 직후라 이벤트 루프가 거의 비어 있는데, 그 시점에 강제 exit를 부르면
  //   Node 24 + Windows에서 undici의 내부 핸들이 정리되기 전에 libuv가 죽는다
  //   ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"). 그러면 종료
  //   코드가 1이 아니라 **127**이 된다 — 관례상 "command not found"라서 게이트
  //   실패를 디버깅하는 사람을 엉뚱한 곳으로 보낸다.
  //   2026-07-30에 실제 스크립트로 3/3 재현했다. 단발 fetch로는 재현되지 않고
  //   Supabase 연결에서만 난다.
  process.exitCode = 1;
}
if (failed > 0) {
  console.log(
    "\n⚠ 하나라도 실패했으면 집계 전환을 0045로 미루고, 0044를 인덱스 드롭과 화면 변경만으로 좁혀라.",
  );
  // 위와 같은 이유로 강제 exit 대신 exitCode만 세팅한다.
  process.exitCode = 1;
}
```

> **이 저장소의 다른 스크립트도 같은 잠재 결함을 갖고 있다.** 대부분 성공 경로에서는 `process.exit`을 아예 부르지 않아 드러나지 않지만, **실패 경로에서 종료 코드가 127로 뒤바뀔 수 있다** — 정확히 신뢰할 수 있는 종료 코드가 필요한 순간이다. 이번 계획의 범위 밖이라 고치지 않는다. 나중에 스크립트를 손볼 때 `process.exit(n)` → `process.exitCode = n`으로 함께 옮기면 좋다.

- [ ] **Step 2: 돌려서 전부 통과하는지 본다**

Run: `node scripts/challenge-aggregation-parity.mjs`

Expected: `4/4 passed` (진행 중 챌린지 1건 × 단언 4개). 출력에 `기간 내 세션 집합 동일 (group_id 9건 · 참가자 9건)`처럼 양쪽 건수가 같게 찍힌다.

**요약만 보지 마라.** `3/3`·`4/4` 같은 합계는 대조 대상이 0건이어도 찍힐 수 있었다 — 그래서 네 번째 단언("대조가 공허하지 않다")을 넣었다. 그래도 **건수가 0이 아닌지 눈으로 확인**하는 습관을 유지하라.

**하나라도 FAIL이면 여기서 멈추고 사용자에게 보고하라.** 집계 전환을 0045로 미루고 Task 4·5를 이 계획에서 빼야 한다 — 그 경우 0044는 인덱스 드롭(Task 1·2) + 화면(Task 7·8·9) + 크론(Task 10)으로 좁아진다.

- [ ] **Step 3: 커밋**

```bash
git add scripts/challenge-aggregation-parity.mjs
git commit -m "test: 0044 집계 전환 안전성 검증 스크립트 (전후 대조용)"
```

---

## Task 1: 마이그레이션 0044 SQL

**Files:**
- Create: `supabase/migrations/0044_challenge_room_switchover.sql`

- [ ] **Step 1: 컬럼명을 스키마에서 먼저 확인한다 (§6.1)**

SQL Editor에서 실행하고 결과를 눈으로 확인한다. **0042에서 이걸 안 해서 후속 단언 24개가 연쇄 실패했다.**

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('group_members','challenges','user_goals','challenge_participants')
order by table_name, ordinal_position;
```

기대: `group_members`에 **`joined_at`**(`created_at` 아님) · `challenges`에 `group_id·name·start_date·end_date·status·created_by·created_at·photo_required`(**`timezone` 없음**) · `challenge_participants`에 `challenge_id·user_id·role·status·invited_by·joined_at·created_at` · `user_goals`에 `qualifier`.

- [ ] **Step 2: 현행 정책·인덱스를 DB에서 뽑는다 (§6.2)**

파일에서 베끼지 마라. 이 두 쿼리 결과를 마이그레이션 작성의 근거로 쓴다.

```sql
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename in ('challenges','user_goals')
order by tablename, policyname;

select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'challenges';
```

기대: `challenges_select_member` = `is_group_member(group_id, auth.uid())` · `goals_select_member` = 같은 모양 · `challenges_one_live`가 `(group_id) where status in ('setup','active')`로 존재.

- [ ] **Step 3: 마이그레이션 파일을 쓴다**

`supabase/migrations/0044_challenge_room_switchover.sql`:

```sql
-- 0044: 챌린지 방 전환 — 개수 제한 해제 + 읽기 경계를 참가자에게 확대
-- 계획: docs/superpowers/plans/2026-07-30-challenge-rooms-0044.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0043은 수정 금지.
--
-- 이 파일은 **점수를 바꾸지 않는다.** 완료 보너스(+3→+9)와 랭킹 RPC 이관은
-- 진행 중 챌린지가 끝난 뒤 0045에서 한다. 여기서 하는 것은 두 가지다.
--
--   1. challenges_one_live 드롭 — 여러 챌린지 동시 진행이 풀리는 지점
--   2. challenges·user_goals의 SELECT를 참가자에게도 연다 (덧붙이기만)
--
-- 왜 2가 필요한가: 0042의 invite_to_challenge는 대상에게 프로필만 있으면
-- 초대한다(그룹 검사 없음). 서버는 이미 타 그룹 초대를 허용하는데 읽기 정책이
-- 그룹 기준 한 줄뿐이라, 초대받은 사람이 챌린지 행도 목표도 못 읽는다.
-- "한 사람이 여러 크루·여러 챌린지"라는 목적이 그 한 줄에 막혀 있었다.
--
-- 기존 같은 그룹 사용자에게는 판정 결과가 그대로다(OR로 덧붙이기만 하므로
-- 참이던 것이 거짓이 되지 않는다) — 가시성·점수 회귀가 없다.

begin;

-- ── 1. 챌린지 개수 제한 해제 ─────────────────────────────────
-- 0006:23이 만든 "크루당 살아있는 챌린지 1개" 유니크 인덱스.
-- 이걸 지우는 것이 이 마이그레이션의 본체다.
drop index if exists public.challenges_one_live;

-- ── 2. 읽기 경계를 참가자에게 확대 ───────────────────────────
-- is_challenge_participant(cid, uid)는 0042:64가 만들어 뒀다.
-- ⚠ 정책 이름을 정확히 써야 한다. 틀리면 drop이 조용히 no-op 하고 옛 정책이
--    그대로 살아남아 확대가 무효가 된다 (0039에서 실제로 겪은 계열의 사고).
drop policy if exists "challenges_select_member" on public.challenges;
create policy "challenges_select_member" on public.challenges
  for select using (
    public.is_challenge_participant(id, auth.uid())   -- 0044: 초대·참가자
    or public.is_group_member(group_id, auth.uid())   -- 0045에서 제거
  );

drop policy if exists "goals_select_member" on public.user_goals;
create policy "goals_select_member" on public.user_goals
  for select using (
    public.is_challenge_participant(challenge_id, auth.uid())  -- 0044
    or public.is_group_member(group_id, auth.uid())            -- 0045에서 제거
  );

commit;

-- PostgREST 스키마 캐시 리로드. 0041에서 같은 자리에서 PGRST202를 겪었다.
notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) 인덱스가 사라졌는가 — 0행이어야 한다
--   select indexname from pg_indexes
--   where schemaname='public' and indexname='challenges_one_live';
--
-- (2) 정책이 확대됐는가 — qual에 is_challenge_participant가 있어야 한다
--   select tablename, policyname, qual from pg_policies
--   where schemaname='public' and policyname in
--     ('challenges_select_member','goals_select_member');
--
-- (3) 진행 중 챌린지의 점수 원천이 그대로인가 — 목표 9개가 그대로 보여야 한다
--   select count(*) from user_goals ug
--   join challenges c on c.id = ug.challenge_id where c.status='active';
```

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/0044_challenge_room_switchover.sql
git commit -m "feat(0044): 챌린지 개수 제한 해제 + 읽기 경계를 참가자에게 확대"
```

---

## Task 2: 0044 적용 (사용자 Run)

**Files:** 없음 (DB 작업)

- [ ] **Step 1: 사용자에게 적용을 요청한다**

마이그레이션·발송은 사용자가 직접 Run한다. 다음을 그대로 전달한다.

> `supabase/migrations/0044_challenge_room_switchover.sql` 전체를 Supabase SQL Editor에 붙여넣고 **Run 1회**. 그 다음 파일 맨 아래 "적용 확인" 쿼리 3개를 따로 실행해 결과를 알려주세요.

- [ ] **Step 2: 적용 결과를 확인한다**

기대: (1) 0행 · (2) 두 정책의 `qual`에 `is_challenge_participant` 포함 · (3) 9.

**(2)에서 `is_challenge_participant`가 안 보이면 멈춰라.** 정책 이름이 틀려 `drop`이 no-op 한 것이다 — Step 2의 `pg_policies` 결과와 대조해 실제 이름을 확인하고 마이그레이션을 고쳐 다시 Run해야 한다.

- [ ] **Step 3: 기존 회귀 기준선이 유지되는지 본다**

Run: `node scripts/challenge-room-check.mjs`

Expected: **`[21]`만 실패하고 나머지는 통과** (`31/32`). `[21]`은 "두 번째 챌린지가 막힌다"를 단언하는데 인덱스를 지웠으니 이제 안 막힌다 — **이 실패가 0044가 실제로 적용됐다는 증거다.** Task 11에서 뒤집는다.

다른 단언이 함께 깨지면 정책 확대가 뭔가를 부순 것이다. 멈추고 원인을 찾아라.

- [ ] **Step 4: 1~2분 쉬고 RLS 경계가 안 넓어졌는지 본다 (§6.5)**

Run: `node scripts/rls-test.mjs`

Expected: **112 통과 / 1 실패**. 실패는 정확히 **`살아있는 챌린지 중복 생성 차단 (unique)`**(`rls-test.mjs:343-346`) 하나여야 한다. 이 단언은 `challenges_one_live`에 의존하는 직접 insert 테스트라, 인덱스를 지우면 201이 돌아와 실패한다 — `[21]`과 같이 **0044가 적용됐다는 증거**다. Task 11에서 뒤집는다.

**다른 단언이 함께 깨지면 멈춰라.** 특히 `비크루 C는 챌린지 조회 불가`가 계속 통과해야 한다 — C는 참가자도 그룹멤버도 아니므로 확대된 정책에서도 막힌다. 이게 깨지면 정책을 잘못 쓴 것이다.

- [ ] **Step 5: 고아 챌린지 감시 (0044만 적용된 상태의 유일한 실질 노출)**

인덱스를 지우면 "그룹당 살아있는 챌린지 1개"를 강제하는 서버측 가드가 **0개**가 된다. Task 7의 목록 UI가 나가기 전까지는 화면이 `getCurrentChallenge()`로 한 건만 집으므로, 두 기기·두 탭에서 동시에 생성하면 **화면에 안 보여 취소도 못 하는 고아 챌린지**가 생길 수 있다.

즉시 잘못되는 곳은 없다(현재 생성 버튼은 `!challenge` 또는 `ended`에서만 렌더된다). 그래도 적용 직후 한 번 확인하고, **0044만 적용된 상태를 오래 두지 마라.**

```sql
select group_id, count(*), array_agg(id)
from public.challenges
where status in ('setup','active')
group by group_id having count(*) > 1;
```

기대: **0행.** 행이 나오면 여분을 `cancelled`로 정리한다(`update public.challenges set status='cancelled' where id = '<여분 id>';` — `status`는 클라이언트가 못 쓰지만 SQL Editor에서는 된다).

---

## Task 3: 내 챌린지 목록 조회 + 대표 챌린지 선택

**Files:**
- Modify: `src/lib/domain/challenge-room.ts`
- Modify: `src/lib/domain/challenge-room.test.ts`
- Modify: `src/lib/challenge.ts`

`pickPrimaryChallenge`는 camelCase `ChallengeLike`를 받는데 DB 행은 snake_case다. 매핑을 한 곳에 두지 않으면 호출부마다 제각기 매핑해 갈라진다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/domain/challenge-room.test.ts` 맨 아래에 추가:

```ts
import { pickPrimaryRow, type ChallengeRowLike } from "./challenge-room";

describe("pickPrimaryRow — DB 행(snake_case)에서 대표 챌린지 고르기", () => {
  const row = (
    id: string,
    status: ChallengeRowLike["status"],
    start: string,
    end: string,
    created: string,
  ): ChallengeRowLike => ({
    id,
    status,
    start_date: start,
    end_date: end,
    created_at: created,
  });

  it("종료일이 임박한 active를 고른다", () => {
    const picked = pickPrimaryRow([
      row("late", "active", "2026-08-01", "2026-12-31", "2026-07-01T00:00:00Z"),
      row("soon", "active", "2026-08-01", "2026-09-30", "2026-07-02T00:00:00Z"),
    ]);
    expect(picked?.id).toBe("soon");
  });

  it("active가 없으면 시작일이 가까운 setup을 고른다", () => {
    const picked = pickPrimaryRow([
      row("far", "setup", "2026-12-01", "2026-12-31", "2026-07-01T00:00:00Z"),
      row("near", "setup", "2026-08-01", "2026-08-31", "2026-07-02T00:00:00Z"),
    ]);
    expect(picked?.id).toBe("near");
  });

  it("원본 행을 그대로 돌려준다 (매핑용 필드가 새지 않는다)", () => {
    const r = row("a", "active", "2026-08-01", "2026-09-30", "2026-07-01T00:00:00Z");
    const picked = pickPrimaryRow([r]);
    expect(picked).toBe(r);
  });

  it("빈 목록이면 null", () => {
    expect(pickPrimaryRow([])).toBeNull();
  });

  it("ended·cancelled만 있으면 null (대표가 없다)", () => {
    const picked = pickPrimaryRow([
      row("x", "ended", "2026-06-01", "2026-06-30", "2026-05-01T00:00:00Z"),
      row("y", "cancelled", "2026-06-01", "2026-06-30", "2026-05-01T00:00:00Z"),
    ]);
    expect(picked).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/domain/challenge-room.test.ts`
Expected: FAIL — `pickPrimaryRow`가 없다는 import 오류.

- [ ] **Step 3: 최소 구현을 넣는다**

`src/lib/domain/challenge-room.ts` 맨 아래에 추가:

```ts
/** DB 행 모양 (snake_case). challenges 테이블의 부분집합. */
export type ChallengeRowLike = {
  id: string;
  status: ChallengeStatus;
  start_date: string;
  end_date: string;
  created_at: string;
};

/**
 * DB 행 목록에서 대표 챌린지 하나 — pickPrimaryChallenge의 snake_case 어댑터.
 *
 * 매핑을 여기 한 곳에 둔다. 호출부마다 camelCase로 바꾸면 필드 하나를 빠뜨린
 * 곳에서 대표가 조용히 달라지고, 그러면 열람권(challenge_peek_picks) 대상이
 * 화면마다 어긋난다.
 */
export function pickPrimaryRow<T extends ChallengeRowLike>(rows: T[]): T | null {
  const picked = pickPrimaryChallenge(
    rows.map((r) => ({
      id: r.id,
      status: r.status,
      startDate: r.start_date,
      endDate: r.end_date,
      createdAt: r.created_at,
      row: r,
    })),
  );
  return picked ? picked.row : null;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/domain/challenge-room.test.ts`
Expected: PASS (기존 8건 + 신규 5건 = 13건)

- [ ] **Step 5: 목록 조회 함수를 넣는다**

`src/lib/challenge.ts`의 `getCurrentChallenge` **바로 아래**에 추가:

```ts
/** 내가 참가자로 들어가 있는 챌린지 + 내 역할·참가 상태 */
export type MyChallenge = Challenge & {
  myRole: "host" | "member";
  myStatus: "invited" | "joined" | "dropped";
};

/**
 * 내 챌린지 전부 (cancelled 제외).
 *
 * 0044부터 명단의 원천은 group_members가 아니라 challenge_participants다.
 * 그룹이 아니라 참가 사실로 묶이므로, 여러 크루에 걸친 챌린지도 한 목록에 온다.
 *
 * invited(아직 수락 안 함)도 포함한다 — 화면이 "초대받았어요"를 보여줘야 한다.
 * dropped는 목표 0개로 명단에서 빠진 사람이다. 결과를 볼 수는 있어야 하므로
 * 역시 포함하고, 구분은 myStatus로 화면이 한다.
 */
export async function getMyChallenges(client?: SupabaseClient): Promise<MyChallenge[]> {
  const supabase = client ?? getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("challenge_participants")
    .select("role, status, challenges!inner(*)")
    .neq("challenges.status", "cancelled");
  if (error) throw error;

  type Row = {
    role: "host" | "member";
    status: "invited" | "joined" | "dropped";
    challenges: Challenge;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r.challenges,
    myRole: r.role,
    myStatus: r.status,
  }));
}

/** 챌린지의 참가자 명단 (0044부터 랭킹·집계의 원천) */
export async function getChallengeParticipants(
  challengeId: string,
  client?: SupabaseClient,
): Promise<{ user_id: string; role: "host" | "member"; status: string }[]> {
  const supabase = client ?? getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("challenge_participants")
    .select("user_id, role, status")
    .eq("challenge_id", challengeId);
  if (error) throw error;
  return data ?? [];
}
```

`challenge_participants`에는 RLS SELECT가 이미 있다(`0042:77` — 판정은 `is_challenge_participant`). 내가 낀 챌린지의 행만 온다.

> **`is_challenge_participant`는 `status`를 보지 않는다** (`0042:64` — `where challenge_id = cid and user_id = uid`뿐이다). 그래서 `invited` 상태에서도 본인 참가 행과, Task 1이 확대한 정책을 통해 **챌린지 행까지 읽을 수 있다.** 초대가 화면에 보이는 근거가 이것이다. 만약 이 함수에 `status = 'joined'`를 더하면 초대장이 통째로 안 보이게 된다 — 0045에서 이 함수를 손볼 때 조심할 지점이다.

- [ ] **Step 6: 타입체크·전체 테스트**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck 통과 · **655/655** (650 + 신규 5)

- [ ] **Step 7: 커밋**

```bash
git add src/lib/domain/challenge-room.ts src/lib/domain/challenge-room.test.ts src/lib/challenge.ts
git commit -m "feat(0044): 내 챌린지 목록 조회 + 대표 챌린지 snake_case 어댑터"
```

---

## Task 4: 집계를 참가자 기준으로

**Files:**
- Modify: `src/lib/challenge.ts:418-487` (`getPeriodStatsByUser`)

**이 태스크가 점수를 건드릴 수 있는 유일한 곳이다.** Task 0에서 두 방식이 같은 집합을 낸다는 것을 확인했으므로 결과는 같아야 한다. 전후로 실제 값을 대조해 **기록으로 남긴다.**

- [ ] **Step 1: 전환 전 점수를 기록한다**

Run: `node scripts/challenge-aggregation-parity.mjs`

출력의 `기간 내 세션 집합 동일 (group_id N건 · 참가자 N건)` 줄과 계획서 상단 "전환 전 목표 9개 실적" 표를 **터미널 출력째로** 작업 로그에 붙여 둔다. Step 5에서 대조한다.

- [ ] **Step 2: 시그니처를 바꾼다**

`src/lib/challenge.ts:418-444`를 다음으로 교체한다. **`.eq("group_id", groupId)` → `.in("user_id", userIds)` 한 줄이 본체다.**

```ts
export async function getPeriodStatsByUser(
  userIds: string[],
  startDate: string,
  endDate: string,
  timeZone: string,
  photoRequired = false,
  client?: SupabaseClient,
): Promise<Map<string, PeriodStats>> {
  const supabase = client ?? getSupabaseBrowserClient();
  // 참가자가 0명이면 조회할 것이 없다. .in("user_id", [])는 PostgREST에서
  // 빈 IN 절이 되어 문법 오류를 낼 수 있으므로 여기서 끊는다.
  if (userIds.length === 0) return new Map();

  const fromIso = new Date(`${startDate}T00:00:00Z`);
  fromIso.setUTCDate(fromIso.getUTCDate() - 1);
  const toIso = new Date(`${endDate}T00:00:00Z`);
  toIso.setUTCDate(toIso.getUTCDate() + 2);

  // 세션당 사진은 1장이므로 inner join으로 집계 행이 중복되지 않는다.
  const select =
    "user_id, completed_at, tabata_minutes, workout_exercises(exercise_type, exercise_name, body_part, workout_sets(weight_kg, reps, distance_meters, duration_seconds, is_completed))" +
    (photoRequired ? ", workout_images!inner(image_path)" : "");

  const { data, error } = await supabase
    .from("workout_sessions")
    .select(select)
    // 0044: group_id 필터 → 참가자 user_id 필터.
    // 두 방식이 같은 집합을 낸다는 것을 전환 전에 실측했다
    // (scripts/challenge-aggregation-parity.mjs). 그래야 진행 중 챌린지의
    // 점수가 안 흔들린다.
    .in("user_id", userIds)
    .eq("status", "completed")
    .is("deleted_at", null)
    .gte("completed_at", fromIso.toISOString())
    .lt("completed_at", toIso.toISOString());
  if (error) throw error;
```

이 아래(`type DbRow` 부터 `return foldPeriodStats(...)`까지)는 **한 줄도 바꾸지 않는다.**

- [ ] **Step 3: 주석의 RLS 설명을 갱신한다**

`challenge.ts:413-417`의 doc 주석을 다음으로 바꾼다:

```ts
/**
 * 참가자별 기간 실적 집계.
 *
 * RLS가 읽게 해주는 세션(내 전부 + 크루 공개 완료분)만 반영된다 —
 * private 세션은 본인 점수에만 잡힌다(진행 중엔 내 것만 쓰므로 문제 없음).
 *
 * 0044부터 명단이 group_members가 아니라 challenge_participants다. 참가자
 * 전원과 crew_links가 맺어지는 것은 0042의 accept_challenge_invite가 보장한다
 * (설계 D5의 완전 연결) — 그래서 크루 공개 세션을 서로 읽을 수 있다.
 */
```

- [ ] **Step 4: 호출부 2곳을 고친다**

`src/lib/challenge.ts:517`(`getActiveChallengeRanking` 안)은 Task 5에서 함께 고친다. 지금은 `challenge/page.tsx:165`만:

```ts
        if (ch.status === "active" || ch.status === "ended") {
          const parts = await getChallengeParticipants(ch.id);
          setStats(
            await getPeriodStatsByUser(
              parts.filter((p) => p.status !== "invited").map((p) => p.user_id),
              ch.start_date,
              ch.end_date,
              tz,
              ch.photo_required,
            ),
          );
        }
```

`invited`를 뺀다 — 아직 수락하지 않은 사람은 참가자가 아니다. `dropped`는 남긴다(목표 0개로 명단에서 빠졌지만 이미 한 운동은 결과 화면에 보여야 한다).

`getChallengeParticipants`를 import에 추가한다(`challenge/page.tsx:25-44`의 `from "@/lib/challenge"` 블록).

- [ ] **Step 5: 전환 후 점수를 대조한다**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck 통과 · 655/655

Run: `node scripts/challenge-aggregation-parity.mjs`
Expected: `4/4 passed` — Step 1과 **같은 건수**(0건이 아닌 것까지 확인)

그리고 실제 실적값을 대조한다. 임시 vitest로 실제 함수를 부른다 (재구현하면 재구현의 버그가 판정을 오염시킨다). `src/lib/__parity.tmp.test.ts`를 만들고:

```ts
/** 임시 — 0044 전후 점수 대조. 확인 뒤 반드시 삭제한다(프로덕션 DB에 붙는다). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { actualForGoal, foldPeriodStats, type GoalType, type PeriodSessionRow } from "./challenge";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
};
const rest = async (p: string) => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: H });
  if (!r.ok) throw new Error(`${p} → ${r.status} ${await r.text()}`);
  return r.json();
};

describe("0044 전후 점수 대조", () => {
  it("목표별 실적을 찍는다", async () => {
    const [ch] = await rest(
      "challenges?select=id,group_id,name,start_date,end_date,photo_required&status=eq.active",
    );
    const parts = await rest(
      `challenge_participants?select=user_id,status&challenge_id=eq.${ch.id}`,
    );
    const ids = parts.filter((p: { status: string }) => p.status !== "invited").map((p: { user_id: string }) => p.user_id);

    const sel = encodeURIComponent(
      "user_id, completed_at, tabata_minutes, workout_exercises(exercise_type, exercise_name, body_part, workout_sets(weight_kg, reps, distance_meters, duration_seconds, is_completed))" +
        (ch.photo_required ? ", workout_images!inner(image_path)" : ""),
    );
    const from = new Date(`${ch.start_date}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - 1);
    const to = new Date(`${ch.end_date}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 2);
    const win = `&status=eq.completed&deleted_at=is.null&completed_at=gte.${encodeURIComponent(from.toISOString())}&completed_at=lt.${encodeURIComponent(to.toISOString())}`;

    const map = (d: Record<string, unknown>[]): PeriodSessionRow[] =>
      d.map((r) => ({
        userId: r.user_id as string,
        completedAt: r.completed_at as string,
        tabataMinutes: r.tabata_minutes as number | null,
        exercises: ((r.workout_exercises ?? []) as Record<string, unknown>[]).map((ex) => ({
          exerciseType: ex.exercise_type as "weight" | "bodyweight" | "cardio",
          exerciseName: ex.exercise_name as string,
          bodyPart: ex.body_part as string | null,
          sets: ((ex.workout_sets ?? []) as Record<string, unknown>[]).map((s) => ({
            weightKg: s.weight_kg as number | null,
            reps: s.reps as number | null,
            distanceMeters: s.distance_meters as number | null,
            durationSeconds: s.duration_seconds as number | null,
            isCompleted: s.is_completed as boolean,
          })),
        })),
      }));

    const old = foldPeriodStats(
      map(await rest(`workout_sessions?select=${sel}&group_id=eq.${ch.group_id}${win}`)),
      ch.start_date, ch.end_date, "Asia/Seoul",
    );
    const neu = foldPeriodStats(
      map(await rest(`workout_sessions?select=${sel}&user_id=in.(${ids.join(",")})${win}`)),
      ch.start_date, ch.end_date, "Asia/Seoul",
    );
    const goals = await rest(
      `user_goals?select=user_id,goal_type,qualifier,target_value&challenge_id=eq.${ch.id}`,
    );
    const nicks = new Map(
      (await rest("profiles?select=id,nickname")).map((p: { id: string; nickname: string }) => [p.id, p.nickname]),
    );
    const diffs: string[] = [];
    for (const g of goals as { user_id: string; goal_type: GoalType; qualifier: number | null; target_value: number }[]) {
      const a = old.get(g.user_id) ? actualForGoal(old.get(g.user_id)!, g.goal_type, g.qualifier) : 0;
      const b = neu.get(g.user_id) ? actualForGoal(neu.get(g.user_id)!, g.goal_type, g.qualifier) : 0;
      console.log(`${a === b ? "=" : "≠"} ${nicks.get(g.user_id)} ${g.goal_type} 목표 ${g.target_value} — 전 ${a} / 후 ${b}`);
      if (a !== b) diffs.push(`${nicks.get(g.user_id)} ${g.goal_type}: ${a} → ${b}`);
    }
    expect(diffs).toEqual([]);
  }, 60_000);
});
```

Run: `npx vitest run src/lib/__parity.tmp.test.ts --reporter=verbose --disable-console-intercept`

Expected: 목표 9개 전부 `=`. 출력을 **작업 로그에 붙여** 계획서 상단 표와 대조한다. 값 하나라도 `≠`면 멈추고 사용자에게 보고하라.

- [ ] **Step 6: 임시 테스트를 지우고 스위트를 원복한다**

```bash
rm src/lib/__parity.tmp.test.ts
pnpm test
```

Expected: 655/655 (임시 테스트가 사라져 개수가 그대로)

**이 파일을 커밋하면 안 된다.** `git status`로 사라졌는지 확인해라.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/challenge.ts "src/app/(tabs)/challenge/page.tsx"
git commit -m "feat(0044): 기간 집계를 group_id에서 챌린지 참가자 기준으로"
```

---

## Task 5: 랭킹을 챌린지 단위로

**Files:**
- Modify: `src/lib/challenge.ts:508-547` (`getActiveChallengeRanking`)
- Modify: `src/lib/social.ts:625`
- Modify: `src/lib/admin/queries.ts:137`
- Modify: `src/components/home/challenge-performance-card.tsx:52,61`

지금은 `getActiveChallengeRanking(groupId)`가 그룹에서 챌린지를 **하나** 찾는다. 여러 개가 되면 어느 것인지 정해지지 않는다. 챌린지 id를 받게 바꾼다.

그리고 **명단의 원천을 목표에서 참가자로 바꾼다.** 지금은 `userIds = goals.map(g => g.user_id)`인데, `goals_insert_own_setup`은 같은 그룹 사람이면 참가자가 아니어도 목표를 넣을 수 있다 — 참가자가 아닌 사람이 랭킹에 뜬다.

- [ ] **Step 1: 랭킹 함수를 고친다**

`src/lib/challenge.ts:508-547`을 교체:

```ts
/**
 * 챌린지 하나의 랭킹 스냅샷.
 *
 * 0044부터 인자가 groupId가 아니라 challengeId다 — 크루당 챌린지가 여러 개일 수
 * 있으므로 "그 크루의 챌린지"로는 대상이 정해지지 않는다.
 *
 * 명단의 원천도 목표가 아니라 참가자다. user_goals INSERT는 같은 그룹이면
 * 참가자가 아니어도 통과하므로(0006:81), 목표에서 명단을 뽑으면 참가하지 않은
 * 사람이 랭킹에 올라온다.
 */
export async function getActiveChallengeRanking(
  challengeId: string,
  client?: SupabaseClient,
): Promise<ChallengeRanking | null> {
  const supabase = client ?? getSupabaseBrowserClient();
  const { data: ch, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("id", challengeId)
    .maybeSingle();
  if (error) throw error;
  if (!ch || ch.status !== "active") return null;

  const [goals, participants] = await Promise.all([
    getChallengeGoals(ch.id, client),
    getChallengeParticipants(ch.id, client),
  ]);
  // invited는 아직 참가자가 아니다. dropped는 목표 0개로 빠진 사람이라 어차피
  // 목표가 없어 점수가 0이지만, 명단에 남겨 결과 화면에서 사라지지 않게 한다.
  const userIds = participants
    .filter((p) => p.status !== "invited")
    .map((p) => p.user_id);

  const stats = await getPeriodStatsByUser(
    userIds,
    ch.start_date,
    ch.end_date,
    DEFAULT_TIMEZONE,
    ch.photo_required,
    client,
  );
  const days = periodDaysCount(ch.start_date, ch.end_date);

  const list = rankParticipants(
    userIds.map((uid) => {
      const userGoals = goals.filter((g) => g.user_id === uid);
      const s = stats.get(uid) ?? EMPTY_STATS;
      return {
        userId: uid,
        goals: userGoals.map((g) => ({
          type: g.goal_type,
          target: Number(g.target_value),
          actual: actualForGoal(s, g.goal_type, g.qualifier),
        })),
        workoutDays: s.workoutDays,
        plannedDays: plannedDaysForPeriod(userGoals[0]?.planned_days ?? 5, days),
        allGoalsCompletedAtMs: null,
      };
    }),
  );
  return { name: ch.name, list };
}
```

- [ ] **Step 2: 호출부 3곳을 고친다**

`src/lib/social.ts:625` 주변 — 함수가 groupId를 받고 있으면 챌린지를 먼저 고른다:

```ts
  const myChallenges = await getMyChallenges();
  const primary = pickPrimaryRow(myChallenges);
  if (!primary) return null;
  const ranking = await getActiveChallengeRanking(primary.id);
```

`getMyChallenges`·`pickPrimaryRow` import를 추가한다.

`src/lib/admin/queries.ts:137` — 이미 챌린지 행(`c`)을 순회하고 있으므로 id를 그대로 넘긴다:

```ts
      const ranking = await getActiveChallengeRanking(c.id as string, db);
```

`src/components/home/challenge-performance-card.tsx:47-61` — `getMyGroups()[0]` + `getCurrentChallenge(g.id)` 대신 참가 기준으로:

```ts
        const myChallenges = await getMyChallenges();
        const ch = pickPrimaryRow(myChallenges);
        if (!ch) return;
        const [profiles, ranking] = await Promise.all([
          getGroupMemberProfiles(ch.group_id),
          getActiveChallengeRanking(ch.id),
        ]);
```

import를 `getCurrentChallenge` → `getMyChallenges`로 바꾸고 `pickPrimaryRow`(`@/lib/domain/challenge-room`)를 추가한다. `getMyGroups`가 이 파일에서 더 안 쓰이면 import에서 뺀다 — 안 빼면 lint가 `no-unused-vars`로 잡는다.

- [ ] **Step 3: 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint 0 · typecheck 통과 · 655/655

- [ ] **Step 4: 커밋**

```bash
git add src/lib/challenge.ts src/lib/social.ts src/lib/admin/queries.ts src/components/home/challenge-performance-card.tsx
git commit -m "feat(0044): 랭킹을 챌린지 단위로 + 명단 원천을 목표에서 참가자로"
```

---

## Task 6: 목표 저장이 챌린지의 group_id를 쓰게

**Files:**
- Modify: `src/app/(tabs)/challenge/page.tsx` (`handleSaveGoals`, 254행 근처)

`goals_insert_own_setup`은 `challenges.group_id = user_goals.group_id`를 요구한다(0006:85). 타 그룹 참가자가 **자기 그룹 id**를 넣으면 이 조건에 걸려 목표를 못 넣는다. 챌린지의 group_id를 넣어야 한다.

- [ ] **Step 1: 저장 인자를 바꾼다**

`handleSaveGoals`에서 `saveMyGoals`에 넘기는 `groupId`를 `group.id`가 아니라 `challenge.group_id`로 바꾼다:

```ts
      await saveMyGoals({
        userId,
        challengeId: challenge.id,
        // 0044: 내 그룹이 아니라 **챌린지의** 그룹이다. goals_insert_own_setup이
        // challenges.group_id = user_goals.group_id를 요구하므로(0006:85), 타 그룹
        // 초대로 참가한 사람이 자기 그룹 id를 넣으면 정책에 막힌다.
        // 이 컬럼은 0045에서 드롭한다.
        groupId: challenge.group_id,
        goals: v.goals,
        plannedDays: v.plannedDays,
      });
```

시그니처는 `{ userId, challengeId, groupId, goals, plannedDays }`다(`challenge.ts:104`). 위 코드가 그대로 맞으므로 필드 이름을 바꿀 것은 없다 — `groupId`에 넣는 **값**만 바뀐다.

- [ ] **Step 2: 게이트**

Run: `pnpm typecheck && pnpm test`
Expected: 통과 · 655/655

- [ ] **Step 3: 커밋**

```bash
git add "src/app/(tabs)/challenge/page.tsx"
git commit -m "fix(0044): 목표 저장이 챌린지의 group_id를 쓴다 (타 그룹 참가자)"
```

---

## Task 7: 챌린지 탭 목록화

**Files:**
- Create: `src/components/challenge/challenge-picker.tsx`
- Create: `src/components/challenge/challenge-picker.test.tsx`
- Modify: `src/app/(tabs)/challenge/page.tsx`

지금은 `getCurrentChallenge()`가 한 건만 가져와 **둘째부터 화면에 아예 안 보인다.** 947줄 화면을 전면 재구성하지 않고, 목록 상태 + 선택기를 얹어 기존 `setup`/`active`/`ended` 분기를 그대로 쓴다. 폰 확인 조건("둘 다 화면에 보인다")을 가장 낮은 위험으로 만족한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/challenge/challenge-picker.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChallengePicker } from "./challenge-picker";
import type { MyChallenge } from "@/lib/challenge";

// 선택기는 id·name·status·myStatus만 읽는다. 나머지 Challenge 필드를 다 채우면
// 테스트가 무엇을 검증하는지 흐려지므로 필요한 것만 만들고 한 번 캐스트한다.
const ch = (
  id: string,
  name: string,
  status: "setup" | "active" | "ended",
  myStatus: MyChallenge["myStatus"] = "joined",
) => ({ id, name, status, myStatus, end_date: "2026-09-30" }) as unknown as MyChallenge;

describe("ChallengePicker", () => {
  it("챌린지가 2개면 둘 다 보인다", () => {
    render(
      <ChallengePicker
        challenges={[ch("a", "7월 GND", "active"), ch("b", "8월 벌크업", "setup")]}
        selectedId="a"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("7월 GND")).toBeTruthy();
    expect(screen.getByText("8월 벌크업")).toBeTruthy();
  });

  it("1개면 선택기를 렌더하지 않는다 (고를 것이 없다)", () => {
    const { container } = render(
      <ChallengePicker challenges={[ch("a", "7월 GND", "active")]} selectedId="a" onSelect={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("초대받은 챌린지는 초대 표시가 붙는다", () => {
    render(
      <ChallengePicker
        challenges={[ch("a", "7월 GND", "active"), ch("b", "초대된 방", "setup", "invited")]}
        selectedId="a"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/초대/)).toBeTruthy();
  });

  it("선택된 챌린지에 aria-current가 붙는다", () => {
    render(
      <ChallengePicker
        challenges={[ch("a", "7월 GND", "active"), ch("b", "8월 벌크업", "setup")]}
        selectedId="b"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /8월 벌크업/ }).getAttribute("aria-current")).toBe("true");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/components/challenge/challenge-picker.test.tsx`
Expected: FAIL — 모듈이 없다

- [ ] **Step 3: 컴포넌트를 만든다**

`src/components/challenge/challenge-picker.tsx`:

```tsx
"use client";

import type { MyChallenge } from "@/lib/challenge";

const STATUS_LABEL: Record<string, string> = {
  setup: "준비 중",
  active: "진행 중",
  ended: "종료",
};

/**
 * 챌린지 선택기 — 여러 챌린지를 chip 행으로 보여주고 하나를 고른다.
 *
 * 1개일 때는 렌더하지 않는다. 고를 것이 없는데 선택기를 띄우면 화면만 복잡해진다.
 */
export function ChallengePicker({
  challenges,
  selectedId,
  onSelect,
}: {
  challenges: MyChallenge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (challenges.length < 2) return null;
  return (
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
      {challenges.map((c) => {
        const selected = c.id === selectedId;
        return (
          <button
            key={c.id}
            type="button"
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(c.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
              selected
                ? "border-transparent bg-white text-black"
                : "border-white/15 bg-white/5 text-white/70"
            }`}
          >
            <span className="font-medium">{c.name}</span>
            <span className="ml-1.5 opacity-60">
              {c.myStatus === "invited" ? "초대받음" : STATUS_LABEL[c.status] ?? c.status}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/components/challenge/challenge-picker.test.tsx`
Expected: PASS (4건)

- [ ] **Step 5: 화면을 목록 기반으로 바꾼다**

`src/app/(tabs)/challenge/page.tsx`의 `ChallengeScreen`에서:

(a) 상태를 목록 + 선택으로 바꾼다. 기존 `const [challenge, setChallenge] = useState<Challenge | null>(null)` 자리에:

```ts
  const [challenges, setChallenges] = useState<MyChallenge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 선택된 것 하나. 아래 모든 분기(setup·active·ended)가 이 값을 그대로 쓴다.
  const challenge = challenges.find((c) => c.id === selectedId) ?? null;
```

(b) 로딩 부분(`getCurrentChallenge(g.id)`, 142행)을 목록 조회로 바꾼다:

```ts
        const list = await getMyChallenges();
        setChallenges(list);
        // 처음 진입엔 대표 챌린지를 고른다. 이미 고른 게 목록에 남아 있으면 유지한다
        // — 목표 저장·동의 후 다시 불러올 때 선택이 튀면 사용자가 화면을 잃는다.
        setSelectedId((prev) =>
          prev && list.some((c) => c.id === prev) ? prev : (pickPrimaryRow(list)?.id ?? null),
        );
        const ch = list.find((c) => c.id === selectedId) ?? pickPrimaryRow(list);
```

이후 기존 코드의 `ch`를 그대로 쓴다.

(c) 렌더에 선택기를 얹는다. `407행 return (` 직후, `{challenge && (`(413행) **앞**에:

```tsx
      <ChallengePicker
        challenges={challenges}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
```

(d) import를 정리한다. `getCurrentChallenge`를 빼고 `getMyChallenges`·`getChallengeParticipants`·`type MyChallenge`를 넣고, `ChallengePicker`와 `pickPrimaryRow`를 추가한다.

(e) `errorMessage`(55행)에서 `challenges_one_live` 분기를 지운다 — 인덱스가 없으니 이제 나올 수 없는 오류다. 남겨두면 다음 사람이 제한이 아직 있다고 오해한다.

- [ ] **Step 6: 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint 0 · typecheck 통과 · **659/659** (655 + 4)

- [ ] **Step 7: 커밋**

```bash
git add src/components/challenge/challenge-picker.tsx src/components/challenge/challenge-picker.test.tsx "src/app/(tabs)/challenge/page.tsx"
git commit -m "feat(0044): 챌린지 탭 목록화 — 선택기로 여러 챌린지를 오간다"
```

---

## Task 8: 홈 대표 챌린지

**Files:**
- Modify: `src/components/home/king-card.tsx:72`

Task 5에서 `challenge-performance-card.tsx`는 이미 `pickPrimaryRow`로 바꿨다. 남은 곳은 `king-card.tsx`다 — PROGRESS 기록상 렌더는 빠졌지만 파일이 살아 있어 타입·lint 대상이다.

- [ ] **Step 1: `getCurrentChallenge` 호출을 바꾼다**

`src/components/home/king-card.tsx:60-72`에서:

```ts
        const myChallenges = await getMyChallenges();
        const challenge = pickPrimaryRow(myChallenges);
```

`getCurrentChallenge` import를 `getMyChallenges`로 바꾸고 `pickPrimaryRow`를 추가한다. `getMyGroups`가 더 안 쓰이면 import에서 뺀다.

- [ ] **Step 2: `getCurrentChallenge`가 죽은 코드가 됐는지 본다**

Run: `grep -rn "getCurrentChallenge" src/`

호출부가 0건이면 `challenge.ts`에서 함수를 지운다 — 0044 이후 "그룹의 챌린지 하나"라는 개념 자체가 틀렸으므로, 남겨두면 다음 사람이 그걸 쓴다. 호출부가 남아 있으면 그 파일도 이 태스크에서 함께 고친다.

- [ ] **Step 3: 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint 0 · typecheck 통과 · 659/659

- [ ] **Step 4: 커밋**

```bash
git add src/components/home/king-card.tsx src/lib/challenge.ts
git commit -m "feat(0044): 홈 대표 챌린지를 pickPrimaryRow로 + getCurrentChallenge 정리"
```

---

## Task 9: 초대·수락 흐름 + `challenge_invite` 알림

**Files:**
- Modify: `src/lib/challenge.ts` (RPC 래퍼 4개)
- Modify: `src/lib/social.ts:25-40` (알림 유형 유니온)
- Modify: `src/lib/domain/push.ts:8` (라우팅)
- Modify: `src/components/notification-bell.tsx:16` (아이콘)
- Create: `src/components/challenge/invite-sheet.tsx`
- Create: `src/components/challenge/invite-sheet.test.tsx`
- Modify: `src/app/(tabs)/challenge/page.tsx`

- [ ] **Step 1: RPC 래퍼를 넣는다**

`src/lib/challenge.ts`의 `finalizeChallenge` 아래에 추가:

```ts
// ── 챌린지 방 RPC (0042) — 0044부터 화면이 실제로 부른다 ──────────

/** 챌린지 방 생성. 방장이 host로 자동 참가한다. */
export async function createChallengeRoom(input: {
  name: string;
  startDate: string;
  endDate: string;
  photoRequired?: boolean;
}): Promise<Challenge> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("create_challenge_room", {
    p_name: input.name.trim(),
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_photo_required: input.photoRequired ?? true,
  });
  if (error) throw error;
  return data as Challenge;
}

/** 초대 — host만 가능, setup 단계만 가능 */
export async function inviteToChallenge(challengeId: string, targetId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("invite_to_challenge", {
    p_challenge_id: challengeId,
    p_target_id: targetId,
  });
  if (error) throw error;
}

/** 수락 — joined 전환 + 기존 참가자 전원과 crew_links (설계 D5 완전 연결) */
export async function acceptChallengeInvite(challengeId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("accept_challenge_invite", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
}

export async function declineChallengeInvite(challengeId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("decline_challenge_invite", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
}
```

- [ ] **Step 2: 알림 유형을 늘린다 — 여기서 컴파일이 깨지는 것이 정상이다**

`src/lib/social.ts:39`의 `| "crew_accepted";` 앞에 추가:

```ts
    | "challenge_invite" // 0042 — 챌린지 방 초대 (0044부터 발송·라우팅)
```

Run: `pnpm typecheck`
Expected: **FAIL** — `notification-bell.tsx:16`의 `TYPE_ICON`이 `Record<NotificationRow["type"], string>`로 exhaustive라 항목 누락을 컴파일 타임에 잡는다. 이 실패가 게이트가 작동한다는 증거다.

- [ ] **Step 3: 아이콘과 라우팅을 넣는다**

`src/components/notification-bell.tsx:34`의 `crew_accepted: "🤝",` 뒤에:

```ts
  challenge_invite: "🏆", // 0044
```

`src/lib/domain/push.ts:8`의 `PUSH_URL_BY_TYPE`에:

```ts
  challenge_invite: "/challenge",
```

> ⚠ `PUSH_URL_BY_TYPE`은 `Record<string, string>`이라 **exhaustive가 아니다.** 빠뜨려도 컴파일이 통과하고 `DEFAULT_PUSH_URL`로 조용히 떨어진다. `TYPE_ICON`과 달리 컴파일러가 안 잡아주니 반드시 손으로 넣어라.

Run: `pnpm typecheck`
Expected: 통과

- [ ] **Step 4: 초대 시트 테스트를 쓴다**

`src/components/challenge/invite-sheet.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InviteSheet } from "./invite-sheet";

describe("InviteSheet", () => {
  it("host가 아니면 아무것도 렌더하지 않는다", () => {
    const { container } = render(
      <InviteSheet challengeId="a" myRole="member" status="setup" onInvited={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("setup이 아니면 렌더하지 않는다 (초대는 setup 단계만)", () => {
    const { container } = render(
      <InviteSheet challengeId="a" myRole="host" status="active" onInvited={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("host + setup이면 초대 입력이 보인다", () => {
    render(<InviteSheet challengeId="a" myRole="host" status="setup" onInvited={vi.fn()} />);
    expect(screen.getByPlaceholderText(/닉네임/)).toBeTruthy();
  });
});
```

- [ ] **Step 5: 실패를 확인한다**

Run: `npx vitest run src/components/challenge/invite-sheet.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 6: 초대 시트를 만든다**

`src/components/challenge/invite-sheet.tsx`:

```tsx
"use client";

import { useState } from "react";
import { inviteToChallenge } from "@/lib/challenge";
// 0038이 만든 닉네임 정확 일치 검색. 단일 결과 또는 null을 돌려준다(배열 아님).
// isSearchable 게이트가 있어 너무 짧은 입력은 조회 없이 null이 된다.
import { searchProfileByNickname } from "@/lib/crew-link";

/** invite_to_challenge의 오류 코드를 사람 말로 */
function inviteError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("already_invited")) return "이미 초대했거나 참가 중이에요";
  if (msg.includes("not_host")) return "방장만 초대할 수 있어요";
  if (msg.includes("self_invite")) return "본인은 초대할 수 없어요";
  if (msg.includes("target_not_found")) return "그 닉네임을 찾지 못했어요";
  if (msg.includes("invalid_status")) return "시작한 챌린지에는 초대할 수 없어요";
  return `초대 실패: ${msg}`;
}

/**
 * 챌린지 초대 — 닉네임으로 찾아 초대한다.
 *
 * host + setup에서만 렌더한다. 서버(invite_to_challenge)가 같은 두 조건을
 * 이미 강제하므로 이건 화면 편의지 경계가 아니다 — 경계는 RPC에 있다.
 */
export function InviteSheet({
  challengeId,
  myRole,
  status,
  onInvited,
}: {
  challengeId: string;
  myRole: "host" | "member";
  status: string;
  onInvited: () => void;
}) {
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (myRole !== "host" || status !== "setup") return null;

  async function handleInvite() {
    if (!nickname.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const found = await searchProfileByNickname(nickname.trim());
      if (!found) {
        setMessage("그 닉네임을 찾지 못했어요");
        return;
      }
      await inviteToChallenge(challengeId, found.id);
      setMessage(`${found.nickname}님을 초대했어요 🏆`);
      setNickname("");
      onInvited();
    } catch (e) {
      setMessage(inviteError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="mb-2 text-xs text-white/60">닉네임으로 크루를 초대해요</p>
      <div className="flex gap-2">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="닉네임"
          className="min-w-0 flex-1 rounded-lg bg-black/30 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleInvite}
          disabled={busy || !nickname.trim()}
          className="shrink-0 rounded-lg bg-white px-3 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          초대
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-white/70">{message}</p>}
    </div>
  );
}
```

`searchProfileByNickname`은 `src/lib/crew-link.ts:19`에 있다(`crew.ts`가 아니다). 이미 `search_profile_by_nickname` RPC를 감싸고 `CrewSearchResult | null`을 돌려주므로 새로 만들 것이 없다.

- [ ] **Step 7: 통과를 확인한다**

Run: `npx vitest run src/components/challenge/invite-sheet.test.tsx`
Expected: PASS (3건)

- [ ] **Step 8: 화면에 초대·수락을 붙인다**

`challenge/page.tsx`에서:

(a) `setup` 블록(456행) 안에 초대 시트를 넣는다:

```tsx
        <InviteSheet
          challengeId={challenge.id}
          myRole={challenge.myRole}
          status={challenge.status}
          onInvited={reload}
        />
```

`reload`와 `showToast`는 이미 있다 — `challenge/page.tsx:120`의 `const reload = useCallback(() => setRefreshKey((k) => k + 1), [])`와 `:114`의 `showToast`다. 새로 만들 것이 없다.

(b) 초대받은 챌린지에는 수락·거절 버튼을 띄운다. `{challenge && (`(413행) 블록 안, 상태 분기보다 **앞**에:

```tsx
        {challenge.myStatus === "invited" && (
          <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="mb-2 text-sm">이 챌린지에 초대받았어요 🏆</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await acceptChallengeInvite(challenge.id);
                    showToast("참가했어요! 목표를 세워 주세요");
                    reload();
                  } catch (e) {
                    showToast(errorMessage(e));
                  }
                }}
                className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-black"
              >
                참가하기
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await declineChallengeInvite(challenge.id);
                    showToast("초대를 거절했어요");
                    reload();
                  } catch (e) {
                    showToast(errorMessage(e));
                  }
                }}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm"
              >
                거절
              </button>
            </div>
          </div>
        )}
```

(c) 챌린지 **생성**을 `createChallenge`(직접 insert) 대신 `createChallengeRoom`(RPC)으로 바꾼다. `handleCreate`(227행)에서:

```ts
      await createChallengeRoom({
        name: v.name,
        startDate: v.startDate,
        endDate: v.endDate,
      });
```

RPC를 써야 방장이 `challenge_participants`에 host로 들어간다. 직접 insert로는 참가자 행이 안 생겨 **본인이 만든 챌린지가 `getMyChallenges()`에 안 나온다.**

(d) `errorMessage`에 `no_group_yet` 분기를 추가한다:

```ts
  if (msg.includes("no_group_yet"))
    return "아직 크루가 없어요. 홈에서 크루를 만들거나 참여해 주세요";
```

혼자모드 유저는 0045까지 이 오류를 만난다. 원인 없는 실패로 보이면 안 된다.

(e) import를 갱신한다 — `createChallenge` → `createChallengeRoom`, `acceptChallengeInvite`·`declineChallengeInvite`, `InviteSheet`.

- [ ] **Step 9: 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint 0 · typecheck 통과 · **662/662** (659 + 3)

- [ ] **Step 10: 커밋**

```bash
git add src/lib/challenge.ts src/lib/social.ts src/lib/domain/push.ts src/components/notification-bell.tsx src/components/challenge/invite-sheet.tsx src/components/challenge/invite-sheet.test.tsx "src/app/(tabs)/challenge/page.tsx"
git commit -m "feat(0044): 초대·수락 흐름을 화면에 + challenge_invite 알림 라우팅"
```

---

## Task 10: 자동 시작·종료를 크론과 화면에 연결

**Files:**
- Modify: `src/app/api/briefing/route.ts`
- Modify: `src/app/(tabs)/challenge/page.tsx`

`autostart_due_challenges`·`autofinalize_due_challenges`는 0042가 만들어 뒀고 **멱등**이다. 둘 다 `auth.uid()`를 쓰지 않으므로(확인함) service_role로 부를 수 있다.

- [ ] **Step 1: 크론에 얹는다**

`src/app/api/briefing/route.ts`의 `const admin = getSupabaseAdminClient();` **직후**에 추가:

```ts
  // 0044: 챌린지 자동 시작·종료. 브리핑과 같은 09:00 KST 슬롯에 얹는다 —
  // vercel.json의 크론이 하나뿐이고, 하루 한 번 도래분을 넘기면 충분하다.
  //
  // 두 RPC는 멱등이다(이미 active면 건너뛴다). 실패해도 브리핑은 계속 보낸다 —
  // 챌린지 전환이 안 됐다고 아침 알림을 통째로 죽이면 손해가 더 크다.
  // auth.uid()를 쓰지 않으므로 service_role로 호출된다.
  const challengeTransitions: Record<string, unknown> = {};
  for (const fn of ["autostart_due_challenges", "autofinalize_due_challenges"]) {
    const { data, error } = await admin.rpc(fn);
    challengeTransitions[fn] = error ? { error: error.message } : data;
  }
```

그리고 마지막 응답에 실어 크론 로그에서 보이게 한다:

```ts
  return NextResponse.json({ sent, alreadySent, skipped, errors, challengeTransitions });
```

- [ ] **Step 2: 화면 진입 시 지연 전환을 건다**

크론은 하루 한 번이다. 시작일 당일 09:00 전에 앱을 열면 아직 `setup`으로 보인다. 화면 진입 때도 한 번 밀어 준다.

`challenge/page.tsx`의 데이터 로딩 `useEffect`에서 `getMyChallenges()` **앞**에:

```ts
      // 0044: 크론(09:00 KST)을 기다리지 않고 화면 진입 시에도 도래분을 넘긴다.
      // 멱등이라 여러 번 불려도 안전하다. 실패는 무시한다 — 전환이 안 됐다고
      // 챌린지 화면을 못 열게 하면 안 된다. 다음 진입이나 크론이 처리한다.
      try {
        const supabase = getSupabaseBrowserClient();
        await Promise.all([
          supabase.rpc("autostart_due_challenges"),
          supabase.rpc("autofinalize_due_challenges"),
        ]);
      } catch {
        /* 전환 실패는 조용히 넘긴다 */
      }
```

`getSupabaseBrowserClient` import를 추가한다. 두 RPC는 `authenticated`에 grant돼 있어 사용자 토큰으로 부를 수 있다.

- [ ] **Step 3: 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: 전부 통과 · 662/662

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/briefing/route.ts "src/app/(tabs)/challenge/page.tsx"
git commit -m "feat(0044): 챌린지 자동 시작·종료를 09:00 크론과 화면 진입에 연결"
```

---

## Task 11: 검증 스크립트 — 단언 2개 뒤집기 + 다중 챌린지

**Files:**
- Modify: `scripts/challenge-room-check.mjs`
- Modify: `scripts/rls-test.mjs`

0044가 거짓으로 만드는 단언이 **두 개**다. 둘 다 "두 번째 챌린지가 막힌다"를 정상으로 단언하므로 **정반대로 뒤집어야 한다** — 안 고치면 통과할 수 없는 게이트가 된다.

| 스크립트 | 단언 | 왜 깨지는가 |
|---|---|---|
| `challenge-room-check.mjs:258-269` | `[21]` "두 번째 챌린지가 `challenges_one_live`로 막힌다" | RPC 경로 |
| `rls-test.mjs:343-346` | "살아있는 챌린지 중복 생성 차단 (unique)" | 직접 insert 경로 |

`rls-test.mjs` 쪽은 **DB 리뷰가 찾았고 이 계획서가 처음엔 빠뜨렸던 것**이다. `pnpm test`(vitest)에 안 들어가는 스크립트라 게이트는 초록으로 남고, 그래서 놓치기 쉽다.

- [ ] **Step 1: `[21]`을 뒤집고 단언을 더한다**

`scripts/challenge-room-check.mjs:259-270`을 교체:

```js
  // 0044가 challenges_one_live를 드롭했다. 이제 두 번째 챌린지가 만들어져야 한다 —
  // 이 단언이 이 마이그레이션의 본체다. 0042·0043 시절엔 정반대였다.
  r = await rpc(a.token, "create_challenge_room", {
    p_name: `두번째-${RUN}`,
    p_start_date: start,
    p_end_date: end,
  });
  check(
    "[21] 0044부터 두 번째 챌린지를 만들 수 있다 (challenges_one_live 드롭)",
    r.status === 200 && r.json?.id,
    `${r.status} ${JSON.stringify(r.json)}`,
  );
  const secondId = r.json?.id;

  // 목록에 둘 다 오는가 — 화면이 "둘 다 보인다"의 데이터 쪽 근거다.
  const mine = await api(
    a.token,
    "GET",
    "/rest/v1/challenge_participants?select=challenge_id,role,status",
  );
  const myIds = (Array.isArray(mine.json) ? mine.json : []).map((p) => p.challenge_id);
  check(
    "[21b] 내 참가 목록에 두 챌린지가 모두 있다",
    myIds.includes(chId) && myIds.includes(secondId),
    `chId=${chId} second=${secondId} 목록=${JSON.stringify(myIds)}`,
  );

  // 두 번째도 방장이 host로 들어갔는가
  const hostRow = (Array.isArray(mine.json) ? mine.json : []).find(
    (p) => p.challenge_id === secondId,
  );
  check(
    "[21c] 두 번째 챌린지에도 생성자가 host·joined로 들어간다",
    hostRow?.role === "host" && hostRow?.status === "joined",
    JSON.stringify(hostRow),
  );
```

`chId`는 이 스크립트가 앞서 만든 첫 챌린지의 id다(`challenge-room-check.mjs:148`의 `const chId = r.json?.id`) — 변수명이 그대로 맞다.

- [ ] **Step 1b: `rls-test.mjs`의 중복 생성 단언도 뒤집는다**

`scripts/rls-test.mjs:343-346`의 블록을 교체한다. 지금은 `challenges_one_live`에 의존해 "막힌다"를 단언한다.

```js
// 0044가 challenges_one_live를 드롭했다. 같은 그룹에 살아있는 챌린지가 여러 개
// 있을 수 있는 것이 이제 정상이다 — 여러 챌린지 동시 진행이 이 개편의 목적이다.
// (직접 insert 경로다. RPC 경로는 challenge-room-check.mjs [21]이 본다.)
const chDup = await api(B.token, "POST", "/rest/v1/challenges", {
  group_id: group.id, name: "중복", start_date: "2026-07-01", end_date: "2026-07-14",
});
check("살아있는 챌린지 중복 생성 허용 (0044에서 개수 제한 해제)", chDup.status === 201, `${chDup.status} ${JSON.stringify(chDup.json)}`);
```

이 챌린지는 픽스처 그룹에 딸려 있어 `finally`의 그룹 삭제로 함께 사라진다 — 별도 정리가 필요 없다.

- [ ] **Step 2: 돌린다**

Run: `node scripts/challenge-room-check.mjs`
Expected: **34 / 0 실패** — 기존 32건에서 `[21]` 1건을 뒤집고(개수 그대로) `[21b]`·`[21c]` 2건을 더했다. 판정 기준은 **실패 0건**이다. 총계가 34가 아니면 단언을 하나 빠뜨렸거나 더 넣은 것이니 세어 보고 이 계획서의 숫자를 고쳐라.

`[21]`이 여전히 실패하면 0044가 적용되지 않았거나 인덱스가 남아 있다. `select indexname from pg_indexes where indexname='challenges_one_live'`로 확인하라.

- [ ] **Step 3: 잔여물을 확인한다 (§5·§6.3)**

스크립트가 끝난 뒤 계정 수를 확인한다. **4개여야 한다.**

Run: `node scripts/challenge-room-check.mjs` 실행 후 삭제 가드 출력에서 `기존 계정 4개`를 확인하고, 다음으로 잔여물이 없는지 본다:

```bash
node -e "const fs=require('fs');const e=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));fetch(e.NEXT_PUBLIC_SUPABASE_URL+'/auth/v1/admin/users?per_page=200',{headers:{apikey:e.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+e.SUPABASE_SERVICE_ROLE_KEY}}).then(r=>r.json()).then(b=>console.log('auth 계정',b.users.length,'개'))"
```

Expected: `auth 계정 4 개`. 더 많으면 떠돌이 테스트 계정이 남은 것이다 — 그룹 먼저·유저 나중으로 손으로 치운다.

- [ ] **Step 4: 1~2분 쉬고 나머지 회귀 기준선 3종을 돌린다 (§6.5)**

```bash
node scripts/rls-test.mjs          # 113 통과 / 0 실패 (Step 1b로 되돌아온다)
# 1~2분 대기
node scripts/challenge-consent-test.mjs   # 20 통과 / 0 실패
# 1~2분 대기
node scripts/poke-levelup-check.mjs       # 11/11
```

`rls-test.mjs`는 Task 2 Step 4에서 112/1이었다가 Step 1b의 수정으로 **113/0으로 복귀**한다. 단언 개수는 그대로다(뒤집기만 했으므로).

하나라도 실패하면 회귀다. 멈추고 원인을 찾아라.

- [ ] **Step 5: 커밋**

```bash
git add scripts/challenge-room-check.mjs
git commit -m "test(0044): [21]을 뒤집고 다중 챌린지·host 참가 단언 추가"
```

---

## Task 12: 실기기 확인 · 배포 · 문서

**Files:**
- Modify: `PROGRESS.md`
- Modify: `docs/superpowers/HANDOFF-2026-07-30-challenge-rooms.md`
- Modify: `src/lib/domain/release-notes.data.json`

- [ ] **Step 1: 전체 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: 전부 통과. 실제 숫자를 기록한다.

- [ ] **Step 2: 배포**

`.git` 없는 복사본에서 배포한다. Vercel이 커밋 이메일을 GitHub 계정에 매칭하지 못해 `Deployment Blocked`가 된다.

```bash
rm -rf /tmp/gnd-deploy && mkdir -p /tmp/gnd-deploy
git archive HEAD | tar -x -C /tmp/gnd-deploy
cd /tmp/gnd-deploy && vercel --prod
```

배포 후 `gnd-one.vercel.app` 별칭을 새 배포로 옮긴다.

- [ ] **Step 3: 실기기 확인 — 이번 게이트는 "둘 다 보인다"다**

사용자에게 폰으로 확인을 요청한다. 통과 조건:

1. **챌린지를 두 개 만들 수 있고 둘 다 화면에 보인다** ← 0044의 통과 조건
2. 선택기에서 두 챌린지를 오갈 수 있다
3. **진행 중 `7월 GND 챌린지`의 점수가 변하지 않았다** — 목표 9개 실적이 계획서 상단 표(낭만송곳니 0·0·0 / 오뎅끼데스까 2·0·0 / 스칼레또 1·0·9.4)와 같다. 값이 그 사이 운동으로 올라갔을 수는 있지만 **내려가면 안 된다**
4. 초대 → 상대 폰에 `🏆 …님이 챌린지에 초대했어요` 알림 → 탭하면 `/challenge`
5. **인수인계서 §1.6 미확인 항목** — 스칼레또님 웨이트 운동일이 `웨이트 운동일(하루 4종목+)` 라벨로 보이고 진행률이 **0% → 5%**인지. 서버 계산은 `weight_days`(q=4)=1일로 두 번 확인됐으므로, 남은 위험은 화면이 그 값을 안 읽는 경우뿐이다

- [ ] **Step 4: 릴리스 알림을 보낸다**

여러 챌린지 동시 진행은 사용자에게 보이는 새 기능이다. `src/lib/domain/release-notes.data.json` **맨 앞**에 항목을 추가하고:

```bash
pnpm release:notify            # 미리보기
pnpm release:notify -- --send  # 사용자가 실행
```

발송은 사용자가 직접 Run한다.

- [ ] **Step 5: 문서를 갱신한다**

`PROGRESS.md` 최상단에 0044 항목을 추가한다. 반드시 담을 것:

- 마이그레이션 **0044 적용 ✅**, 무엇이 풀렸는지(`challenges_one_live` 드롭)
- 지시서에 없었지만 넣은 것 — `challenges`·`user_goals` SELECT 정책 확대와 그 이유(0042의 초대 RPC가 그룹을 안 보는데 읽기가 그룹 기준이라 초대받은 사람 화면이 비었다)
- **집계 전환이 점수를 안 바꿨다는 실측 기록** — 전후 목표 9개 대조 결과
- 0045로 미룬 것 전부와 그 이유(점수가 흔들리므로 챌린지 종료 후)
- 검증 실측 숫자 전부

`docs/superpowers/HANDOFF-2026-07-30-challenge-rooms.md`는 §2.1·§2.3을 0044 완료 상태로 고치고, §6.4의 회귀 기준선 표를 새 숫자로 갱신한다. `challenge-room-check.mjs`의 단언 수가 늘었다.

- [ ] **Step 6: 커밋·머지**

```bash
git add PROGRESS.md docs/superpowers/HANDOFF-2026-07-30-challenge-rooms.md src/lib/domain/release-notes.data.json
git commit -m "docs(0044): 진행 기록·인수인계서 갱신 + 릴리스 노트"
```

브랜치에서 작업했다면 `main`에 `--no-ff`로 머지한다.

---

## 자기 검토 (계획 작성자가 이미 수행함)

**지시서 항목 대조:**

| 지시서 §2.1 항목 | 태스크 |
|---|---|
| `challenges_one_live` 드롭 | Task 1·2 |
| 참가자 명단을 `challenge_participants`로 | Task 3·5 |
| 세션 집계를 참가자 + 기간으로 | Task 4 |
| 챌린지 탭 목록형 | Task 7 |
| 홈 대표 챌린지 (`pickPrimaryChallenge`) | Task 3·5·8 |
| 초대·수락 흐름 화면 연결 | Task 9 |
| 자동 시작·종료 크론 + 지연 전환 | Task 10 |
| 알림 라우팅 `challenge_invite` | Task 9 |
| 재확인 3단계 | Task 0 |
| `[21]` 뒤집기 | Task 11 |
| 실기기 게이트 "둘 다 보인다" | Task 12 |
| 점수 불변 기록 | Task 0·4·12 |

**계획에서 추가한 것:** `challenges`·`user_goals` SELECT 정책 확대(Task 1 — 근거는 위 "지시서에 없었지만" 절) · 랭킹 명단 원천을 목표에서 참가자로(Task 5 — 목표 INSERT가 참가 여부를 안 보므로 비참가자가 랭킹에 뜬다) · `saveMyGoals`의 group_id(Task 6 — 타 그룹 참가자가 목표를 못 넣는다) · `getCurrentChallenge` 정리(Task 8).

**미해결로 남기는 판단:** `challenge_peek_picks`(0040의 열람 대상 지정)는 챌린지가 여러 개일 때 어느 챌린지의 열람권인지 모호해진다. 0040 스키마가 `challenge_id`를 갖고 있어 데이터는 갈라지지 않으므로 0044에서는 건드리지 않고 대표 챌린지 기준으로 둔다. 챌린지별 열람권 분리는 설계서 §9의 범위 밖 항목이다.
