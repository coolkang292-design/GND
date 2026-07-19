// scripts/briefing-integration-test.mjs
// 0013 검증: ① dedupe_key 멱등(2회 upsert → 1행)
//            ② finalize_challenge가 ranks=false 유저에게 알림 생략
// 실행: node scripts/briefing-integration-test.mjs  (.env.local 필요)
// 사전조건: 0013 마이그레이션이 Supabase에 적용되어 있어야 함
//          (notifications.dedupe_key 컬럼 + finalize_challenge ranks 필터).
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) throw new Error(".env.local에 Supabase 설정이 없습니다");

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` — ${detail}`}`);
  if (ok) pass++;
  else fail++;
}

async function api(token, method, path, body, headers = {}) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: token === SERVICE ? SERVICE : ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function anonUser() {
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("익명 가입 실패: " + JSON.stringify(j));
  return { id: j.user.id, token: j.access_token };
}

console.log("── 픽스처 생성: 익명 유저 A, B ──");

// ── ① dedupe_key 멱등 ────────────────────────────────────────
const A = await anonUser();
const B = await anonUser();
await api(A.token, "POST", "/rest/v1/profiles", {
  id: A.id, nickname: "브리핑테스트A", weekly_goal: 3,
});
await api(B.token, "POST", "/rest/v1/profiles", {
  id: B.id, nickname: "브리핑테스트B", weekly_goal: 3,
});

console.log("\n── dedupe_key 멱등 ──");
const key = `morning_briefing:${A.id}:2026-01-01`; // 과거 날짜 — 실브리핑과 충돌 없음
const row = {
  user_id: A.id, type: "morning_briefing",
  title: "테스트", body: null, dedupe_key: key,
};
const up1 = await api(SERVICE, "POST",
  "/rest/v1/notifications?on_conflict=dedupe_key", row,
  { Prefer: "resolution=ignore-duplicates,return=representation" });
check("dedupe: 1차 upsert는 insert", up1.status === 201 && up1.json?.length === 1,
  JSON.stringify(up1));
const up2 = await api(SERVICE, "POST",
  "/rest/v1/notifications?on_conflict=dedupe_key", row,
  { Prefer: "resolution=ignore-duplicates,return=representation" });
check("dedupe: 2차 upsert는 무시(0행 반환)", up2.json?.length === 0,
  JSON.stringify(up2));
const cnt = await api(SERVICE, "GET",
  `/rest/v1/notifications?dedupe_key=eq.${encodeURIComponent(key)}&select=id`);
check("dedupe: 최종 1행", cnt.json?.length === 1, JSON.stringify(cnt.json));

// ── ② finalize_challenge ranks 존중 ──────────────────────────
console.log("\n── finalize_challenge ranks 설정 존중 ──");
const g = await api(A.token, "POST", "/rest/v1/rpc/create_group",
  { p_name: "브리핑검증크루" });
await api(B.token, "POST", "/rest/v1/rpc/join_group_with_code",
  { p_code: g.json.invite_code });
// B: 순위 알림 끔
await api(B.token, "POST", "/rest/v1/notification_settings?on_conflict=user_id",
  { user_id: B.id, ranks: false },
  { Prefer: "resolution=merge-duplicates,return=representation" });

const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const ch = await api(A.token, "POST", "/rest/v1/challenges", {
  group_id: g.json.id, name: "검증챌린지",
  start_date: yesterday, end_date: yesterday,
});
const chId = ch.json?.[0]?.id;
check("픽스처: 챌린지 생성", !!chId, JSON.stringify(ch));
for (const u of [A, B]) {
  await api(u.token, "POST", "/rest/v1/user_goals", {
    challenge_id: chId, group_id: g.json.id,
    goal_type: "weight_days", target_value: 3, unit: "일", planned_days: 3,
  });
}
const st = await api(A.token, "POST", "/rest/v1/rpc/start_challenge",
  { p_challenge_id: chId });
check("픽스처: start_challenge", st.status === 200, JSON.stringify(st.json));
const fin = await api(A.token, "POST", "/rest/v1/rpc/finalize_challenge",
  { p_challenge_id: chId });
check("픽스처: finalize_challenge", fin.status === 200, JSON.stringify(fin.json));

const nA = await api(SERVICE, "GET",
  `/rest/v1/notifications?user_id=eq.${A.id}&type=eq.challenge_ended&reference_id=eq.${chId}&select=id`);
const nB = await api(SERVICE, "GET",
  `/rest/v1/notifications?user_id=eq.${B.id}&type=eq.challenge_ended&reference_id=eq.${chId}&select=id`);
check("ranks on(A): 종료 알림 수신", nA.json?.length === 1, JSON.stringify(nA.json));
check("ranks off(B): 종료 알림 미수신", nB.json?.length === 0, JSON.stringify(nB.json));

// ── 정리 (service — 테스트 데이터 삭제) ──────────────────────
await api(SERVICE, "DELETE",
  `/rest/v1/notifications?dedupe_key=eq.${encodeURIComponent(key)}`);
await api(SERVICE, "DELETE", `/rest/v1/notifications?reference_id=eq.${chId}`);
await api(SERVICE, "DELETE", `/rest/v1/challenges?id=eq.${chId}`); // user_goals cascade
await api(SERVICE, "DELETE", `/rest/v1/groups?id=eq.${g.json.id}`); // members cascade
await api(SERVICE, "DELETE", `/rest/v1/notification_settings?user_id=eq.${B.id}`);
await api(SERVICE, "DELETE", `/rest/v1/profiles?id=in.(${A.id},${B.id})`);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail > 0 ? 1 : 0);
