// 챌린지 목표 상호 동의 게이트(0025) 실 DB 검증.
// 실행: node scripts/challenge-consent-test.mjs  (사전조건: 0025 적용됨)
// 익명 유저 A(owner)·B(member) 2인 크루 + 챌린지(setup)로 동의 게이트를 검증한다.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) throw new Error(".env.local에 Supabase 설정이 없습니다");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} ${detail}`);
  }
}

async function api(token, method, path, body) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

async function anonUser() {
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("익명 가입 실패: " + JSON.stringify(json));
  return { token: json.access_token, id: json.user.id };
}

const has = (r, code) => JSON.stringify(r.json).includes(code);

// ── 픽스처: A(owner)·B(member) 크루 + setup 챌린지 ──────────────
console.log("── 픽스처: 2인 크루 + 챌린지(setup) ──");
const A = await anonUser();
const B = await anonUser();
const C = await anonUser(); // 비크루 외부인
await api(A.token, "POST", "/rest/v1/profiles", {
  id: A.id, nickname: `동의A-${Date.now().toString(36)}`, avatar_url: "🧔", weekly_goal: 3,
});
await api(B.token, "POST", "/rest/v1/profiles", {
  id: B.id, nickname: `동의B-${Date.now().toString(36)}`, avatar_url: "👩", weekly_goal: 3,
});
const gA = await api(A.token, "POST", "/rest/v1/rpc/create_group", { p_name: "동의테스트크루" });
const group = gA.json;
check("A가 크루 생성", gA.status === 200 && group?.invite_code?.startsWith("GND-"), JSON.stringify(group));
const join = await api(B.token, "POST", "/rest/v1/rpc/join_group_with_code", { p_code: group.invite_code });
check("B가 크루 참여", join.status === 200, JSON.stringify(join.json));

const chIns = await api(A.token, "POST", "/rest/v1/challenges", {
  group_id: group.id, name: "동의 챌린지", start_date: "2026-08-01", end_date: "2026-09-30",
});
const ch = chIns.json?.[0];
check("A가 챌린지 생성(setup)", chIns.status === 201 && ch?.status === "setup", JSON.stringify(chIns.json));
const CID = ch.id;

// ── S7: 목표 미세팅 상태에서 approve → kpi_incomplete ──────────
console.log("\n── S7: 목표 세팅 전 동의 시도 ──");
const apprEarly = await api(A.token, "POST", "/rest/v1/rpc/approve_challenge_goals", { p_challenge_id: CID });
check("목표 미세팅 시 동의 불가 (kpi_incomplete)", apprEarly.status >= 400 && has(apprEarly, "kpi_incomplete"), JSON.stringify(apprEarly.json));

// ── 전원 목표 세팅 ──
console.log("\n── 전원 목표 세팅 ──");
const goalA = await api(A.token, "POST", "/rest/v1/user_goals", {
  user_id: A.id, challenge_id: CID, group_id: group.id, goal_type: "volume", target_value: 5000, unit: "kg", planned_days: 5,
});
check("A 목표 세팅", goalA.status === 201, JSON.stringify(goalA.json));
const goalB = await api(B.token, "POST", "/rest/v1/user_goals", {
  user_id: B.id, challenge_id: CID, group_id: group.id, goal_type: "weight_days", target_value: 12, planned_days: 4,
});
check("B 목표 세팅", goalB.status === 201, JSON.stringify(goalB.json));

// ── S2: 동의 0 → 시작 실패 ──
console.log("\n── S2: 동의 0에서 시작 ──");
const start0 = await api(A.token, "POST", "/rest/v1/rpc/start_challenge", { p_challenge_id: CID });
check("동의 0 → 시작 차단 (consent_incomplete)", start0.status >= 400 && has(start0, "consent_incomplete"), JSON.stringify(start0.json));

// ── 직접 insert 차단(위조 방지) ──
console.log("\n── 직접 쓰기 차단 ──");
const forge = await api(B.token, "POST", "/rest/v1/challenge_goal_approvals", { challenge_id: CID, approver_id: B.id });
check("challenge_goal_approvals 직접 insert 차단(RPC만)", forge.status === 401 || forge.status === 403, `status=${forge.status}`);

// ── S5: A 동의 → 재호출 멱등(1행) ──
console.log("\n── S5: 동의 멱등 ──");
const apprA1 = await api(A.token, "POST", "/rest/v1/rpc/approve_challenge_goals", { p_challenge_id: CID });
check("A 동의 1회", apprA1.status === 200 || apprA1.status === 204, JSON.stringify(apprA1.json));
const apprA2 = await api(A.token, "POST", "/rest/v1/rpc/approve_challenge_goals", { p_challenge_id: CID });
check("A 동의 재호출 → 에러 없음(멱등)", apprA2.status === 200 || apprA2.status === 204);
const rows1 = await api(A.token, "GET", `/rest/v1/challenge_goal_approvals?challenge_id=eq.${CID}`);
check("중복 행 없음 (1행)", rows1.status === 200 && rows1.json.length === 1, `${rows1.json?.length}행`);

// ── S3: 한 명만 동의 → 여전히 실패 ──
console.log("\n── S3: 1/2 동의에서 시작 ──");
const start1 = await api(A.token, "POST", "/rest/v1/rpc/start_challenge", { p_challenge_id: CID });
check("1/2 동의 → 시작 차단 (consent_incomplete:1/2)", start1.status >= 400 && has(start1, "consent_incomplete"), JSON.stringify(start1.json));

// ── S6: 철회 후 → 다시 실패 ──
console.log("\n── S6: 동의 철회 ──");
const unappr = await api(A.token, "POST", "/rest/v1/rpc/unapprove_challenge_goals", { p_challenge_id: CID });
check("A 동의 철회", unappr.status === 200 || unappr.status === 204);
const rows0 = await api(A.token, "GET", `/rest/v1/challenge_goal_approvals?challenge_id=eq.${CID}`);
check("철회 후 0행", rows0.status === 200 && rows0.json.length === 0, `${rows0.json?.length}행`);
const startAfterUnappr = await api(A.token, "POST", "/rest/v1/rpc/start_challenge", { p_challenge_id: CID });
check("철회 후 시작 다시 차단", startAfterUnappr.status >= 400 && has(startAfterUnappr, "consent_incomplete"));

// ── 비크루 C는 동의 현황 조회 불가 ──
const cView = await api(C.token, "GET", `/rest/v1/challenge_goal_approvals?challenge_id=eq.${CID}`);
check("비크루 C는 동의 현황 조회 불가", cView.status === 200 && (cView.json ?? []).length === 0, JSON.stringify(cView.json));

// ── S4: 전원 동의 → 시작 성공(active) ──
console.log("\n── S4: 전원 동의 → 시작 ──");
await api(A.token, "POST", "/rest/v1/rpc/approve_challenge_goals", { p_challenge_id: CID });
const apprB = await api(B.token, "POST", "/rest/v1/rpc/approve_challenge_goals", { p_challenge_id: CID });
check("B 동의", apprB.status === 200 || apprB.status === 204, JSON.stringify(apprB.json));
const rows2 = await api(A.token, "GET", `/rest/v1/challenge_goal_approvals?challenge_id=eq.${CID}`);
check("전원 동의 2행", rows2.status === 200 && rows2.json.length === 2, `${rows2.json?.length}행`);
const startOk = await api(B.token, "POST", "/rest/v1/rpc/start_challenge", { p_challenge_id: CID });
check("전원 동의 → 시작 성공(active)", startOk.status === 200 && startOk.json?.status === "active", JSON.stringify(startOk.json));

// ── 보너스: active 후 동의 시도 → invalid_status ──
const apprAfter = await api(A.token, "POST", "/rest/v1/rpc/approve_challenge_goals", { p_challenge_id: CID });
check("active 후 동의 불가 (invalid_status)", apprAfter.status >= 400 && has(apprAfter, "invalid_status"), JSON.stringify(apprAfter.json));

// ── 정리 ──
if (SERVICE) {
  const adminHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  await fetch(`${URL_}/rest/v1/groups?id=eq.${group.id}`, { method: "DELETE", headers: adminHeaders });
  for (const u of [A, B, C]) {
    const res = await fetch(`${URL_}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: adminHeaders });
    if (!res.ok) console.log(`정리 실패(${u.id.slice(0, 8)}): ${res.status}`);
  }
  console.log("\n픽스처 정리 완료");
} else {
  console.log("\nSUPABASE_SERVICE_ROLE_KEY 없음 — 픽스처 정리 생략");
}

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
process.exit(failed === 0 ? 0 : 1);
