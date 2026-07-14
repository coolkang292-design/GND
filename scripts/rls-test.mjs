// RLS 2인 픽스처 테스트 (§19) — 익명 유저 A·B를 만들어 경계를 검증한다.
// 실행: node scripts/rls-test.mjs  (사전조건: 0001 마이그레이션 적용됨)
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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

console.log("── 픽스처 생성: 익명 유저 A, B ──");
const A = await anonUser();
const B = await anonUser();
console.log(`  A=${A.id.slice(0, 8)}… B=${B.id.slice(0, 8)}…`);

// A: 프로필 + 크루 생성
const pA = await api(A.token, "POST", "/rest/v1/profiles", {
  id: A.id, nickname: "유저A", avatar_url: "🧔", weekly_goal: 3,
});
check("A가 본인 프로필 생성", pA.status === 201, JSON.stringify(pA.json));

const gA = await api(A.token, "POST", "/rest/v1/rpc/create_group", { p_name: "RLS테스트크루" });
const group = gA.json;
check("A가 크루 생성(RPC)", gA.status === 200 && group?.invite_code?.startsWith("GND-"), JSON.stringify(group));

// B: 프로필 생성
const pB = await api(B.token, "POST", "/rest/v1/profiles", {
  id: B.id, nickname: "유저B", avatar_url: "👩", weekly_goal: 5,
});
check("B가 본인 프로필 생성", pB.status === 201);

console.log("\n── 참여 전: 비멤버 차단 ──");
const g0 = await api(B.token, "GET", `/rest/v1/groups?id=eq.${group.id}`);
check("B는 그룹 조회 불가", g0.status === 200 && g0.json.length === 0, JSON.stringify(g0.json));

const prof0 = await api(B.token, "GET", `/rest/v1/profiles?id=eq.${A.id}`);
check("B는 A 프로필 조회 불가", prof0.status === 200 && prof0.json.length === 0);

const fake = await api(B.token, "POST", "/rest/v1/profiles", {
  id: A.id, nickname: "사칭", weekly_goal: 1,
});
check("B는 A 명의 프로필 생성 불가", fake.status === 401 || fake.status === 403 || fake.status === 409);

const sneak = await api(B.token, "POST", "/rest/v1/group_members", {
  group_id: group.id, user_id: B.id, role: "member",
});
check("B는 멤버십 직접 insert 불가(RPC만 허용)", sneak.status === 401 || sneak.status === 403);

const badCode = await api(B.token, "POST", "/rest/v1/rpc/join_group_with_code", { p_code: "GND-XXXXX" });
check("잘못된 초대코드는 거부", badCode.status >= 400);

console.log("\n── 초대코드 참여 후: 크루 내 공개 ──");
const join = await api(B.token, "POST", "/rest/v1/rpc/join_group_with_code", { p_code: group.invite_code });
check("B가 초대코드로 참여(RPC)", join.status === 200, JSON.stringify(join.json));

const g1 = await api(B.token, "GET", `/rest/v1/groups?id=eq.${group.id}`);
check("참여 후 B가 그룹 조회 가능", g1.status === 200 && g1.json.length === 1);

const prof1 = await api(B.token, "GET", `/rest/v1/profiles?id=eq.${A.id}`);
check("참여 후 B가 크루원 A 프로필 조회 가능", prof1.status === 200 && prof1.json.length === 1);

const mem = await api(B.token, "GET", `/rest/v1/group_members?group_id=eq.${group.id}`);
check("멤버 목록 2명", mem.status === 200 && mem.json.length === 2, JSON.stringify(mem.json));

console.log("\n── 쓰기 경계 ──");
const upd = await api(B.token, "PATCH", `/rest/v1/profiles?id=eq.${A.id}`, { nickname: "해킹됨" });
check("B는 A 프로필 수정 불가", upd.status < 300 && (upd.json ?? []).length === 0, JSON.stringify(upd.json));

const gupd = await api(B.token, "PATCH", `/rest/v1/groups?id=eq.${group.id}`, { name: "탈취크루" });
check("B(비owner)는 그룹 수정 불가", gupd.status < 300 && (gupd.json ?? []).length === 0);

const kick = await api(B.token, "DELETE", `/rest/v1/group_members?group_id=eq.${group.id}&user_id=eq.${A.id}`);
check("B는 A를 강퇴 불가", kick.status < 300 && (kick.json ?? []).length === 0);

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
process.exit(failed === 0 ? 0 : 1);
