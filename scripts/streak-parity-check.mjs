// 불꽃 일수: SQL current_streak_days ↔ TS currentStreak 대조
// 실행: node scripts/streak-parity-check.mjs
// 사전조건: 0032 적용.
//
// 두 구현이 갈라지면 홈 🔥와 배지가 서로 다른 숫자를 말한다. 단위 테스트로는
// 절대 안 잡히는 종류라 실계정 데이터로 전원을 대조한다(읽기 전용).
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error(".env.local에 Supabase 설정이 없습니다");

const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const get = async (p) => (await fetch(`${URL}${p}`, { headers: h })).json();

// src/lib/domain/streak.ts의 규칙을 그대로 옮긴 것 — 여기를 고치면 저기도 고쳐야 한다
const EXPIRY = 5;
function daysBetween(a, b) {
  const u = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((u(b) - u(a)) / 86400000);
}
function currentStreak(dayKeys, todayKey) {
  const keys = [...dayKeys].sort();
  const last = keys.at(-1);
  if (!last || daysBetween(last, todayKey) >= EXPIRY) return 0;
  let streak = 1;
  for (let i = keys.length - 2; i >= 0; i--) {
    if (daysBetween(keys[i], keys[i + 1]) >= EXPIRY) break;
    streak++;
  }
  return streak;
}
const kst = (iso) =>
  new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);

const profiles = await get("/rest/v1/profiles?select=id,nickname");
const sessions = await get(
  "/rest/v1/workout_sessions?select=user_id,completed_at&status=eq.completed&deleted_at=is.null&completed_at=not.is.null",
);

const today = kst(new Date().toISOString());
const byUser = new Map();
for (const s of sessions) {
  const set = byUser.get(s.user_id) ?? new Set();
  set.add(kst(s.completed_at));
  byUser.set(s.user_id, set);
}

let bad = 0;
for (const p of profiles) {
  const days = [...(byUser.get(p.id) ?? [])];
  const ts = currentStreak(days, today);
  const res = await fetch(`${URL}/rest/v1/rpc/current_streak_days`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ p_user_id: p.id }),
  });
  const sql = await res.json();
  const ok = sql === ts;
  if (!ok) bad++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${(p.nickname ?? "?").padEnd(14)} SQL ${sql} / TS ${ts}  (운동일 ${days.length})`,
  );
}

console.log(`\n불일치 ${bad}건`);
if (bad > 0) process.exit(1);
