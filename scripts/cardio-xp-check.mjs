// 유산소·시간 종목이 XP를 받는지 검증 (0024 적용 전후).
// 적용 전: 러닝 1세트 = 무효 → 0 XP.  적용 후: 유효 → 100+ XP.
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
async function api(t, m, p, b) {
  const r = await fetch(`${URL_}${p}`, { method: m, headers: { apikey: KEY, Authorization: `Bearer ${t}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: b === undefined ? undefined : JSON.stringify(b) });
  let j = null; try { j = await r.json(); } catch { /* */ } return { status: r.status, json: j };
}
async function anonUser() {
  const j = await (await fetch(`${URL_}/auth/v1/signup`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: "{}" })).json();
  return { token: j.access_token, id: j.user.id };
}
// 유산소 1세트(거리·시간 기록) 세션 완료
async function cardioWorkout(u) {
  const s = (await api(u.token, "POST", "/rest/v1/workout_sessions", { user_id: u.id, timezone: "Asia/Seoul", visibility: "private" })).json[0];
  const ex = (await api(u.token, "POST", "/rest/v1/workout_exercises", { session_id: s.id, exercise_name: "러닝", exercise_type: "cardio", sort_order: 0 })).json[0];
  await api(u.token, "POST", "/rest/v1/workout_sets", { workout_exercise_id: ex.id, set_number: 1, distance_meters: 5000, duration_seconds: 1800, is_completed: true });
  await api(u.token, "POST", "/rest/v1/rpc/start_workout", { p_session_id: s.id });
  return api(u.token, "POST", "/rest/v1/rpc/complete_workout_v2", { p_session_id: s.id });
}

const A = await anonUser();
await api(A.token, "POST", "/rest/v1/profiles", { id: A.id, nickname: `cardio-${Date.now().toString(36)}`, weekly_goal: 3 });
const r = await cardioWorkout(A);
const xp = r.json?.xpAwarded ?? 0;
console.log(`러닝 1세트(5km·30분) 완료 → xpAwarded=${xp} awarded=${r.json?.awarded}`);
console.log(xp >= 100 ? "  ✅ 0024 적용됨 — 유산소도 XP 받음" : "  ❌ 아직 0 XP — 0024 미적용 (러닝이 무효 처리됨)");
await fetch(`${URL_}/auth/v1/admin/users/${A.id}`, { method: "DELETE", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
