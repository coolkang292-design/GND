// 챌린지 집계 정합성 — 운영이 실제로 쓰는 경로가 참가자 기준으로 맞는지 실 DB로 확인.
// 실행: node scripts/challenge-aggregation-parity.mjs
// 읽기 전용이다. 계정을 만들지 않으므로 rate limit(§6.5) 영향이 없다.
//
// ── 2026-08-31 개편: 무엇을 대조하는지가 바뀌었다 ──────────────────────────
//
// 원래 이 스크립트는 0044 전환(집계 기준을 group_id → 참가자로) **직전**에
// "두 방식이 같은 점수를 내는가"를 확인하려고 만들었다. 전환은 끝났고, 지금
// 운영은 `get_challenge_period_sessions` RPC 하나만 쓴다(challenge.ts의
// getPeriodStatsByUser → getChallengePeriodSessions). group_id 기준은 **아무도
// 부르지 않는 죽은 경로**다.
//
// 그런데 옛 단언은 "참가자 집합 == 그룹원 집합"을 전제하고 있었다. 이 전제는
// 원래도 반쪽만 맞았고(크루원이 챌린지를 건너뛰면 깨진다 — 2026-08-19부터
// Test11에서 실패), **공개 모집(0085~0087)이 열리면서 반대 방향으로도 깨졌다**:
// 이제 그룹원이 아닌 사람이 참가할 수 있다. "참가해도 크루가 되지 않는다"가
// 사용자가 정한 규칙이므로, 두 집합은 앞으로도 계속 다를 것이다.
//
// 즉 옛 단언은 **정상 동작을 실패로 신고하면서, 죽은 경로를 지키고 있었다.**
// 지키는 대상을 살아 있는 경로로 옮긴다:
//
//   ① RPC가 돌려주는 세션 집합 == 참가자(joined|dropped) 기준 기대 집합
//   ② 참가하지 않은 그룹원의 세션이 섞이지 않는다   ← 옛 group_id 회귀 방지
//   ③ 그룹원이 아닌 참가자(공개 모집)의 세션이 빠지지 않는다 ← 새 경로 방지
//
// ── 단언 개수를 챌린지 수와 분리했다 ─────────────────────────────────────
// 옛 버전은 챌린지마다 단언을 찍어서, 진행 중 챌린지가 하나 늘거나 끝나기만 해도
// 기준선이 REGRESS/GREW로 흔들렸다(실제로 10 → 7로 줄어 있었다). 챌린지별 결과는
// 로그로 보여 주되 **판정은 실행 단위로 접어서** 개수를 고정한다.
//
// service_role로 읽는 이유: 집합 동일성은 교집합에 보존된다. A_full = B_full 이면
// 임의의 RLS 가시집합 V에 대해 A∩V = B∩V다. 상위집합에서 같으면 전부 같다.
// RPC도 service_role을 명시적으로 통과시킨다(auth.role() = 'service_role' 분기).
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

const HEADERS = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

async function rest(path) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: HEADERS });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} → ${r.status} ${text}`);
  // §6.6: 오류 시 PostgREST는 배열이 아니라 에러 객체를 준다.
  const json = JSON.parse(text);
  return Array.isArray(json) ? json : [];
}

/** 운영이 부르는 바로 그 RPC. 반환은 jsonb 배열이다. */
async function rpcPeriodSessions(challengeId) {
  const r = await fetch(`${URL_}/rest/v1/rpc/get_challenge_period_sessions`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ p_challenge_id: challengeId }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`rpc get_challenge_period_sessions → ${r.status} ${text}`);
  const json = JSON.parse(text);
  if (!Array.isArray(json)) throw new Error(`RPC가 배열이 아닌 것을 줬다: ${text.slice(0, 200)}`);
  return json;
}

/**
 * getPeriodStatsByUser의 기간창을 그대로 옮긴 것.
 * RPC의 `(start_date - 1)::timestamptz` · `(end_date + 2)::timestamptz`와 같은 창이다
 * (DB TimeZone이 UTC라 date→timestamptz 캐스팅이 UTC 자정이 된다).
 */
function windowIso(startDate, endDate) {
  const from = new Date(`${startDate}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${endDate}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 2);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** RPC는 세션 id를 안 준다 — (user_id, completed_at)으로 센다. 중복도 살리려고 다중집합. */
const keyOf = (userId, completedAt) => `${userId}|${new Date(completedAt).toISOString()}`;
const sortedKeys = (arr) => [...arr].sort();

// ── 실행 단위 누적기 ────────────────────────────────────────────────
let comparedSessions = 0; // 실제로 대조한 세션 수 (공허한 통과 방지)
const setMismatches = []; // ① RPC ↔ 기대 집합 불일치
const intruders = []; // ② 비참가자인데 RPC에 들어온 사람
const dropouts = []; // ③ 비그룹원 참가자인데 RPC에서 빠진 세션
let publicJoinCases = 0; // ③의 검사 대상이 실제로 존재했는가

const actives = await rest(
  "challenges?select=id,group_id,name,start_date,end_date,photo_required,discoverable&status=eq.active",
);
console.log(`진행 중 챌린지 ${actives.length}건\n`);

for (const ch of actives) {
  console.log(`── ${ch.name} (${ch.start_date} ~ ${ch.end_date}${ch.discoverable ? " · 공개모집" : ""}) ──`);

  const parts = await rest(
    `challenge_participants?select=user_id,status&challenge_id=eq.${ch.id}`,
  );
  // RPC가 세는 집합과 같아야 한다 — joined **와 dropped 둘 다**다.
  // (중도 포기자의 기록도 기간 실적에는 남는다. joined만 세면 RPC와 어긋난다.)
  const counted = parts
    .filter((p) => p.status === "joined" || p.status === "dropped")
    .map((p) => p.user_id);
  const members = (
    await rest(`group_members?select=user_id&group_id=eq.${ch.group_id}`)
  ).map((m) => m.user_id);

  const memberSet = new Set(members);
  const countedSet = new Set(counted);
  const nonMemberParticipants = counted.filter((u) => !memberSet.has(u));
  const nonParticipantMembers = members.filter((u) => !countedSet.has(u));
  console.log(
    `  참가(joined|dropped) ${counted.length} · 그룹원 ${members.length}` +
      ` · 비그룹원 참가자 ${nonMemberParticipants.length} · 비참가 그룹원 ${nonParticipantMembers.length}`,
  );

  const rpcRows = await rpcPeriodSessions(ch.id);
  const rpcKeys = rpcRows.map((r) => keyOf(r.user_id, r.completed_at));

  if (counted.length === 0) {
    console.log(`  (참가자 0명 — RPC ${rpcRows.length}행)`);
    // 참가자가 없으면 RPC도 비어야 한다. 이건 ①에서 함께 잡힌다.
  }

  // ── 기대 집합: 참가자 기준으로 독립 계산 ──────────────────────────
  const { from, to } = windowIso(ch.start_date, ch.end_date);
  let expected = [];
  if (counted.length > 0) {
    const q =
      `workout_sessions?user_id=in.(${counted.join(",")})` +
      `&status=eq.completed&deleted_at=is.null` +
      `&completed_at=gte.${encodeURIComponent(from)}&completed_at=lt.${encodeURIComponent(to)}` +
      (ch.photo_required
        ? `&select=id,user_id,completed_at,workout_images!inner(image_path)`
        : `&select=id,user_id,completed_at`);
    expected = await rest(q);
  }
  const expectedKeys = expected.map((s) => keyOf(s.user_id, s.completed_at));

  // ① 집합 동일성
  const same =
    JSON.stringify(sortedKeys(rpcKeys)) === JSON.stringify(sortedKeys(expectedKeys));
  if (!same) {
    const rpcSet = new Set(rpcKeys);
    const expSet = new Set(expectedKeys);
    setMismatches.push({
      name: ch.name,
      onlyRpc: [...rpcSet].filter((k) => !expSet.has(k)).slice(0, 5),
      onlyExpected: [...expSet].filter((k) => !rpcSet.has(k)).slice(0, 5),
    });
  }
  console.log(`  RPC ${rpcKeys.length}건 ↔ 기대 ${expectedKeys.length}건 ${same ? "일치" : "❌불일치"}`);
  comparedSessions += expectedKeys.length;

  // ② 참가하지 않은 사람이 섞였는가 (옛 group_id 집계로 되돌아가면 여기서 잡힌다)
  for (const uid of new Set(rpcRows.map((r) => r.user_id))) {
    if (!countedSet.has(uid)) intruders.push({ name: ch.name, uid });
  }

  // ③ 비그룹원 참가자(공개 모집으로 들어온 사람)의 기록이 빠지지 않았는가.
  //    group_id 기준으로 되돌아가면 **이 사람들이 통째로 사라진다.**
  if (nonMemberParticipants.length > 0) {
    publicJoinCases += nonMemberParticipants.length;
    const rpcUsers = new Set(rpcRows.map((r) => r.user_id));
    for (const uid of nonMemberParticipants) {
      const mine = expected.filter((s) => s.user_id === uid);
      if (mine.length > 0 && !rpcUsers.has(uid)) {
        dropouts.push({ name: ch.name, uid, missing: mine.length });
      }
    }
  }

  const goals = await rest(
    `user_goals?select=user_id,goal_type,target_value,qualifier&challenge_id=eq.${ch.id}`,
  );
  console.log(`  (목표 ${goals.length}개 — 실적 대조는 Task 4의 vitest가 실제 함수로 한다)`);
}

// ── 판정: 챌린지 수와 무관하게 항상 4건 ─────────────────────────────
console.log("");

check(
  "진행 중 챌린지를 하나 이상 읽었다",
  actives.length > 0,
  "진행 중 챌린지가 0건 — 이 실행은 아무것도 검증하지 못했다",
);

check(
  `RPC 세션 집합 == 참가자(joined|dropped) 기준 기대 집합 [챌린지 ${actives.length}건]`,
  setMismatches.length === 0,
  setMismatches
    .map(
      (m) =>
        `${m.name}: RPC만 ${m.onlyRpc.length}건 ${JSON.stringify(m.onlyRpc)}` +
        ` · 기대만 ${m.onlyExpected.length}건 ${JSON.stringify(m.onlyExpected)}`,
    )
    .join(" / "),
);

check(
  "참가하지 않은 그룹원의 세션이 RPC에 섞이지 않았다",
  intruders.length === 0,
  intruders.map((i) => `${i.name}: ${i.uid}`).join(", "),
);

check(
  "그룹원이 아닌 참가자(공개 모집)의 세션이 RPC에서 빠지지 않았다" +
    (publicJoinCases === 0 ? " [해당 사례 0건 — 아직 공허]" : ` [대상 ${publicJoinCases}명]`),
  dropouts.length === 0,
  dropouts.map((d) => `${d.name}: ${d.uid} 세션 ${d.missing}건 누락`).join(", "),
);

// 공허한 통과를 막기 위한 기록. 두 집합이 모두 비어 있으면 차집합도 0이 되어
// 위 단언들이 **아무것도 대조하지 않고** PASS로 찍힌다. 필터 문법이 틀려
// PostgREST가 200 + []를 주는 경우가 정확히 그렇다 — 에러가 아니라 정상
// 응답이므로 rest()의 throw에 걸리지 않는다.
//
// 판정은 챌린지마다가 아니라 **실행 끝에서 한 번** 한다. 처음엔 챌린지마다
// "0건이면 FAIL"로 뒀는데 과했다 — 갓 만든 챌린지는 기간 내 운동이 당연히
// 0건이라, 그걸 실패로 치면 새 챌린지가 생길 때마다 영원히 빨간불이 된다
// (2026-07-31에 실제로 그랬다). 막으려던 것은 "아무것도 대조하지 않았는데
// 통과로 읽히는 것"이므로 실행 단위로 보면 충분하다.
check(
  `이번 실행이 무언가는 대조했다 (기간 내 세션 ${comparedSessions}건)`,
  comparedSessions > 0,
  "진행 중 챌린지가 없거나 전부 기간 내 세션 0건이다 — 집합 비교가 전부 공허해서" +
    " 이 실행은 집계 정합성의 근거가 되지 못한다.",
);

if (publicJoinCases === 0) {
  console.log(
    "\nℹ️ 그룹원이 아닌 참가자가 아직 0명이다 — 세 번째 단언은 지금 공허하다." +
      " 공개 모집으로 첫 참가가 들어오면 그때부터 실질 검증이 된다.",
  );
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.log(
    "\n⚠ 집계 경로가 참가자 기준에서 벗어났다. group_id 기준으로 되돌아갔는지 먼저 의심하라 —" +
      " 공개 모집 참가자는 그룹원이 아니라서 group_id로 집계하면 통째로 사라진다.",
  );
  // 강제 exit 대신 exitCode만 세팅한다: Node 24 + Windows에서 fetch(undici)의
  // 내부 핸들이 정리되기 전에 process.exit()을 부르면 libuv가 죽는다
  // ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)") — 재현 확인함.
  process.exitCode = 1;
}
