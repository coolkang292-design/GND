// 0016 검증: push_subscriptions 본인 CRUD, 타인·비로그인 차단, endpoint upsert.
// 실행: node scripts/push-rls-test.mjs
// 사전조건: 0016_push_subscriptions.sql이 적용되어 있어야 한다.
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

let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (ok) passed++;
  else failed++;
}

async function api(token, method, path, body, prefer = "return=representation") {
  const service = token === SERVICE_KEY;
  const response = await fetch(`${URL}${path}`, {
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
    json = await response.json();
  } catch {
    // 본문 없는 응답
  }
  return { status: response.status, json };
}

async function anonUser() {
  const response = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const json = await response.json();
  if (!json.access_token) throw new Error(`익명 가입 실패: ${JSON.stringify(json)}`);
  return { id: json.user.id, token: json.access_token };
}

async function deleteAuthUser(userId) {
  return fetch(`${URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
}

let userA = null;
let userB = null;

try {
  console.log("-- 0016 push subscriptions verification --");
  userA = await anonUser();
  userB = await anonUser();

  for (const [user, nick] of [
    [userA, "푸시A"],
    [userB, "푸시B"],
  ]) {
    const profile = await api(user.token, "POST", "/rest/v1/profiles", {
      id: user.id,
      nickname: nick,
      avatar_url: "🧔",
      weekly_goal: 3,
    });
    if (profile.status !== 201) {
      throw new Error(`프로필 생성 실패: ${JSON.stringify(profile.json)}`);
    }
  }

  const endpointA = `https://push.example/${userA.id}`;
  const sub = { endpoint: endpointA, p256dh: "pk", auth: "ak" };

  const insertA = await api(userA.token, "POST", "/rest/v1/push_subscriptions", sub);
  check("본인 구독 insert 허용", insertA.status === 201, `status ${insertA.status}`);

  const selectA = await api(
    userA.token,
    "GET",
    "/rest/v1/push_subscriptions?select=id,endpoint",
  );
  check(
    "본인 구독 select 1건",
    selectA.status === 200 && selectA.json?.length === 1,
    JSON.stringify(selectA.json),
  );

  const selectB = await api(
    userB.token,
    "GET",
    "/rest/v1/push_subscriptions?select=id",
  );
  check(
    "타인 구독 select 0건",
    selectB.status === 200 && selectB.json?.length === 0,
    JSON.stringify(selectB.json),
  );

  await api(
    userB.token,
    "DELETE",
    `/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpointA)}`,
  );
  const afterDeleteByB = await api(
    userA.token,
    "GET",
    "/rest/v1/push_subscriptions?select=id",
  );
  check(
    "타인 구독 delete 무효",
    afterDeleteByB.json?.length === 1,
    JSON.stringify(afterDeleteByB.json),
  );

  const forge = await api(userB.token, "POST", "/rest/v1/push_subscriptions", {
    endpoint: `https://push.example/forged`,
    p256dh: "pk",
    auth: "ak",
    user_id: userA.id,
  });
  check(
    "user_id 위조 insert 차단",
    forge.status === 401 || forge.status === 403,
    `status ${forge.status}`,
  );

  const noAuth = await fetch(`${URL}/rest/v1/push_subscriptions`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(sub),
  });
  check("비로그인 insert 차단", noAuth.status === 401, `status ${noAuth.status}`);

  const upsert = await api(
    userA.token,
    "POST",
    "/rest/v1/push_subscriptions?on_conflict=endpoint",
    { ...sub, p256dh: "pk2" },
    "return=representation,resolution=merge-duplicates",
  );
  const afterUpsert = await api(
    userA.token,
    "GET",
    "/rest/v1/push_subscriptions?select=p256dh",
  );
  check(
    "endpoint upsert 후에도 1행 유지·갱신",
    upsert.status === 201 &&
      afterUpsert.json?.length === 1 &&
      afterUpsert.json[0].p256dh === "pk2",
    JSON.stringify(afterUpsert.json),
  );

  const del = await api(
    userA.token,
    "DELETE",
    `/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpointA)}`,
  );
  const afterDelete = await api(
    userA.token,
    "GET",
    "/rest/v1/push_subscriptions?select=id",
  );
  check(
    "본인 구독 delete 허용",
    (del.status === 200 || del.status === 204) && afterDelete.json?.length === 0,
    JSON.stringify(afterDelete.json),
  );
} finally {
  if (userA) await deleteAuthUser(userA.id);
  if (userB) await deleteAuthUser(userB.id);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
