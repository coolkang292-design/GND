/**
 * 챌린지 종목별 랭킹 실데이터 확인 (2026-10-07, 사용자 지침: "실제 챌린지 2인 이상의 데이터로
 * 4개 랭킹 계산을 검증").
 *
 *   node scripts/challenge-metrics-check.mjs [A|B]          # 기본 A
 *   CHALLENGE_METRICS_DUMP=<저장소 밖 경로> node scripts/challenge-metrics-check.mjs
 *
 * - 픽스처 계정으로 **이메일 로그인**해 사용자 권한으로 RPC를 부른다. service role을 쓰지 않는다 —
 *   RLS·참가자 게이트를 그대로 지난 값이 화면이 받는 값이다.
 * - 4종 합계·순위를 **도메인 모듈을 쓰지 않는 단순 계산**으로 낸다. 화면 코드와 독립이어야
 *   교차 확인이 의미가 있다. `src/lib/domain/challenge-metrics.live.test.ts`가 덤프를 읽어
 *   도메인 함수 결과와 이 값을 비교한다.
 * - 쓰기 없음. 출력은 닉네임과 숫자뿐. 비밀값은 출력·저장하지 않는다.
 */
import { readFileSync, writeFileSync } from "node:fs";

const FIXTURE_EMAIL = {
  A: "dev-fixture-a@gnd.local",
  B: "dev-fixture-b@gnd.local",
};
const who = (process.argv[2] ?? "A").toUpperCase();
if (!FIXTURE_EMAIL[who]) throw new Error("A 또는 B");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = env.DEV_FIXTURE_PASSWORD;
if (!URL_ || !ANON || !PASSWORD) throw new Error(".env.local에 URL·anon key·DEV_FIXTURE_PASSWORD가 필요합니다");

async function call(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token ?? ANON}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const login = await call("/auth/v1/token?grant_type=password", {
  method: "POST",
  body: { email: FIXTURE_EMAIL[who], password: PASSWORD },
});
const token = login.access_token;
const me = login.user.id;
const rpc = (name, args) => call(`/rest/v1/rpc/${name}`, { method: "POST", token, body: args });

// 내 챌린지(참가 중) — RLS가 내 행만 준다
const mine = await call(
  `/rest/v1/challenge_participants?select=challenge_id,status&user_id=eq.${me}&status=eq.joined`,
  { token },
);
const ids = mine.map((r) => r.challenge_id);
if (ids.length === 0) {
  console.log(`픽스처 ${who}: 참가 중인 챌린지가 없습니다`);
  process.exit(0);
}
const challenges = await call(
  `/rest/v1/challenges?select=id,name,status,start_date,end_date&id=in.(${ids.join(",")})&status=in.(active,ended)`,
  { token },
);

// ── 독립 계산 (도메인 모듈과 일부러 따로 쓴다) ─────────────────────────
const tz = "Asia/Seoul";
const dayOf = (iso) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const todayKey = dayOf(new Date().toISOString());

function totals(rows, memberIds, start, end) {
  const out = {};
  for (const id of memberIds) out[id] = { sessions: 0, minutes: 0, cardioKm: 0, volumeKg: 0 };
  for (const r of rows) {
    if (!out[r.user_id]) continue;
    const d = dayOf(r.completed_at);
    if (d < start || d > end) continue;
    const t = out[r.user_id];
    t.sessions++;
    if (typeof r.duration_minutes === "number" && r.duration_minutes > 0) t.minutes += r.duration_minutes;
    for (const ex of r.workout_exercises ?? []) {
      for (const s of ex.workout_sets ?? []) {
        if (!s.is_completed) continue;
        if (ex.exercise_type === "weight") t.volumeKg += Number(s.weight_kg ?? 0) * Number(s.reps ?? 0);
        if (ex.exercise_type === "cardio") t.cardioKm += Number(s.distance_meters ?? 0) / 1000;
      }
    }
  }
  return out;
}

function ranks(tot, key) {
  const list = Object.entries(tot)
    .map(([userId, t]) => ({ userId, value: t[key] }))
    .sort((a, b) => b.value - a.value || a.userId.localeCompare(b.userId));
  let lastValue = null;
  let lastRank = null;
  return list.map((x, i) => {
    if (x.value <= 1e-9) return { ...x, rank: null };
    const rank = lastValue !== null && Math.abs(lastValue - x.value) <= 1e-9 ? lastRank : i + 1;
    lastValue = x.value;
    lastRank = rank;
    return { ...x, rank };
  });
}

const KEYS = ["sessions", "minutes", "cardioKm", "volumeKg"];
const dump = [];
for (const ch of challenges) {
  const profiles = await rpc("get_challenge_participant_profiles", { p_challenge_id: ch.id });
  const members = profiles.filter((p) => !p.status || p.status === "joined");
  if (members.length < 2) continue;
  const rows = await rpc("get_challenge_period_sessions", { p_challenge_id: ch.id });
  const end = ch.status === "ended" || ch.end_date < todayKey ? ch.end_date : todayKey;
  const memberIds = members.map((m) => m.id);
  const tot = totals(rows, memberIds, ch.start_date, end);
  const hasDuration = rows.length === 0 || rows.some((r) => "duration_minutes" in r);
  const name = (id) => (id === me ? "나" : (members.find((m) => m.id === id)?.nickname ?? "?"));

  console.log(`\n■ ${ch.name} (${ch.status}, ${ch.start_date}~${end}) — 참가자 ${members.length}명, 세션 ${rows.length}건${hasDuration ? "" : " · 운동 시간 키 없음(0117 미적용)"}`);
  const result = {};
  for (const k of KEYS) {
    const r = ranks(tot, k);
    result[k] = r;
    console.log(`  ${k.padEnd(9)} ` + r.map((x) => `${x.rank ?? "-"}위 ${name(x.userId)} ${Math.round(x.value * 10) / 10}`).join(" · "));
  }
  dump.push({ challenge: ch, memberIds, endKey: end, timeZone: tz, rows, expected: result });
}

if (dump.length === 0) console.log(`\n픽스처 ${who}: 참가자 2명 이상인 진행 중·종료 챌린지가 없습니다`);
if (process.env.CHALLENGE_METRICS_DUMP && dump.length > 0) {
  writeFileSync(process.env.CHALLENGE_METRICS_DUMP, JSON.stringify(dump));
  console.log(`\n덤프 저장: ${dump.length}개 챌린지 (교차 확인: CHALLENGE_METRICS_DUMP=… npx vitest run src/lib/domain/challenge-metrics.live.test.ts)`);
}
