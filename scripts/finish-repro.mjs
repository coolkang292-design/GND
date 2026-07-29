// 운동 종료 버그 재현 — 실 클라이언트 흐름을 그대로 모사한다.
// complete_workout_v2 를 다양한 상태에서 호출해 무엇이 던지는지 본다.
import { readFileSync } from "node:fs";
import { createDeleteGuard } from "./_safe-delete.mjs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

// 삭제 가드 — 실행 시작 시점에 있던 계정은 절대 지우지 않는다.
const _guard = await createDeleteGuard({ url: URL_, serviceKey: SERVICE });

async function api(token, method, path, body) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: KEY, Authorization: `Bearer ${token}`,
      "Content-Type": "application/json", Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* */ }
  return { status: res.status, json };
}
async function anonUser() {
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: "{}",
  });
  const json = await res.json();
  return { token: json.access_token, id: json.user.id };
}

// sets 개수로 유효/무효를 만든다 (비타바타는 완료세트 3 이상이어야 유효)
async function makeWorkout(u, { sets = 3 } = {}) {
  const draft = await api(u.token, "POST", "/rest/v1/workout_sessions", { user_id: u.id, timezone: "Asia/Seoul", visibility: "private" });
  const session = draft.json?.[0];
  const ex = await api(u.token, "POST", "/rest/v1/workout_exercises", { session_id: session.id, exercise_name: "벤치프레스", exercise_type: "weight", sort_order: 0 });
  const exercise = ex.json?.[0];
  for (let i = 1; i <= sets; i++) {
    await api(u.token, "POST", "/rest/v1/workout_sets", { workout_exercise_id: exercise.id, set_number: i, weight_kg: 50, reps: 10, is_completed: true });
  }
  await api(u.token, "POST", "/rest/v1/rpc/start_workout", { p_session_id: session.id });
  return session;
}
async function finish(u, sessionId) {
  return api(u.token, "POST", "/rest/v1/rpc/complete_workout_v2", { p_session_id: sessionId });
}
async function getSession(u, sessionId) {
  return api(u.token, "GET", `/rest/v1/workout_sessions?id=eq.${sessionId}&select=*`);
}
async function events(u, sessionId) {
  const r = await api(u.token, "GET", `/rest/v1/workout_events?session_id=eq.${sessionId}&select=event_type`);
  return (r.json ?? []).map((e) => e.event_type);
}

const A = await anonUser();
await api(A.token, "POST", "/rest/v1/profiles", { id: A.id, nickname: `repro-${Date.now().toString(36)}`, weekly_goal: 3 });

console.log("=== 시나리오 1: 첫 유효 운동(3세트) 완료 후 재종료(replay) ===");
const s1 = await makeWorkout(A, { sets: 3 });
const f1a = await finish(A, s1.id);
console.log(`  1차 종료: status=${f1a.status} awarded=${f1a.json?.awarded} xp=${f1a.json?.xpAwarded}`);
const g1 = await getSession(A, s1.id);
console.log(`  getSessionById: status=${g1.status} completed_at=${g1.json?.[0]?.completed_at ? "있음" : "없음"}`);
// 결함 A: 완료 시 workout_completed 이벤트가 있어야 '운동 중'이 사라진다.
const ev1 = await events(A, s1.id);
console.log(`  workout_events=[${ev1.join(",")}] → 완료이벤트 ${ev1.includes("workout_completed") ? "✅ 있음(0023 적용됨)" : "❌ 없음(0023 미적용 → 최대 6h '운동 중')"}`);
const f1b = await finish(A, s1.id);
console.log(`  2차 종료(replay): status=${f1b.status} replay=${f1b.json?.idempotentReplay} msg=${f1b.json?.message ?? f1b.json?.code ?? ""}`);

console.log("\n=== 시나리오 2: 같은 날 2번째 운동(0 XP) 완료 후 재종료(replay) ===");
const s2 = await makeWorkout(A, { sets: 3 });
const f2a = await finish(A, s2.id);
console.log(`  1차 종료: status=${f2a.status} awarded=${f2a.json?.awarded} xp=${f2a.json?.xpAwarded}`);
const f2b = await finish(A, s2.id);
console.log(`  2차 종료(replay): status=${f2b.status} replay=${f2b.json?.idempotentReplay} ⚠️msg=${JSON.stringify(f2b.json)}`);

console.log("\n=== 시나리오 2b: 0 XP 세션 재종료가 오류 없이 처리되나 ===");
// 0023 적용 후: RPC가 400 대신 200 멱등 응답을 준다(원인 해결).
// 0023 적용 전: 400(incomplete_xp_processing) → 클라 finishWorkout이 세션
//   상태를 확인해 completed면 조용한 성공으로 회복(방어).
const f2c = await finish(A, s2.id);
let ok = false;
if (f2c.status === 200 && f2c.json?.idempotentReplay === true) {
  ok = true; // 0023 적용됨 — RPC 자체가 정상 응답
} else if (f2c.status === 400 && String(f2c.json?.message).includes("incomplete_xp_processing")) {
  const g = await getSession(A, s2.id); // 0023 미적용 — 클라 방어로 회복 가능
  ok = g.json?.[0]?.status === "completed";
}
console.log(`  재종료 처리: ${ok ? "✅ 정상(오류로 안 막힘)" : "❌ 막힘"}  [status=${f2c.status}]`);

console.log("\n=== 시나리오 3: 무효 운동(1세트<3) 완료 후 재종료(replay) ===");
const B = await anonUser();
await api(B.token, "POST", "/rest/v1/profiles", { id: B.id, nickname: `repro2-${Date.now().toString(36)}`, weekly_goal: 3 });
const s3 = await makeWorkout(B, { sets: 1 });
const f3a = await finish(B, s3.id);
console.log(`  1차 종료: status=${f3a.status} awarded=${f3a.json?.awarded} xp=${f3a.json?.xpAwarded}`);
const f3b = await finish(B, s3.id);
console.log(`  2차 종료(replay): status=${f3b.status} ⚠️msg=${JSON.stringify(f3b.json)}`);

// 정리 — 삭제는 가드가 헤더까지 들고 있으므로 admin 헤더를 따로 만들지 않는다.
for (const u of [A, B]) {
  await _guard.deleteIfCreatedThisRun(u.id);
}
console.log("\n픽스처 정리 완료");
