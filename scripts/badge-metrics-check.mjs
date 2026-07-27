// get_my_badge_metrics(RPC) ↔ 원장/집계 직접계산 대조. 실계정 읽기 전용.
// 실행: node scripts/badge-metrics-check.mjs   (사전: 0036 적용)
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };
const rpc = async (fn, body) =>
  (await fetch(`${U}/rest/v1/rpc/${fn}`, { method: "POST", headers: h, body: JSON.stringify(body) })).json();
const get = async (p) => (await fetch(`${U}${p}`, { headers: h })).json();

const profs = await get("/rest/v1/profiles?select=id,nickname");
let pass = 0, fail = 0;
for (const p of profs) {
  // badge_metrics는 service_role로 직접 호출(정의자). p_user_id 지정.
  const m = await rpc("badge_metrics", { p_user_id: p.id });
  const sessions = await get(`/rest/v1/workout_sessions?user_id=eq.${p.id}&status=eq.completed&deleted_at=is.null&select=duration_minutes,record_note`);
  const wc = sessions.length;
  const mins = sessions.reduce((a, s) => a + (s.duration_minutes || 0), 0);
  const rec = sessions.filter((s) => s.record_note !== null).length;
  const ok = Number(m.workout_count) === wc && Number(m.total_minutes) === mins && Number(m.record_beaten) === rec;
  console.log(`${ok ? "PASS" : "FAIL"} ${p.nickname}  RPC(운동 ${m.workout_count}·분 ${m.total_minutes}·기록 ${m.record_beaten}) vs 직접(${wc}·${mins}·${rec})`);
  if (ok) pass++;
  else fail++;
}
console.log(`\n${pass}/${pass + fail} passed`);
