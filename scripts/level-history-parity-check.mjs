// 레벨 진입 이력: user_level_history ↔ user_progress ↔ xp_transactions 전원 대조 (읽기 전용)
// 실행: node scripts/level-history-parity-check.mjs
// 사전조건: 0131·0132 적용.
//
// 이력 트리거(record_level_entry)는 실패해도 운동 완료를 막지 않는다. 그래서 빠진 이력은
// 아무 화면에도 에러로 안 뜨고 '내 성장' 카드만 "측정 준비 중"에 머문다 — 여기서만 잡힌다.
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

const h = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const get = async (p) => {
  const res = await fetch(`${URL}${p}`, { headers: h });
  if (!res.ok) throw new Error(`${p} → ${res.status} ${await res.text()}`);
  return res.json();
};

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) passed++;
  else {
    failed++;
    console.log(`  FAIL ${name} — ${detail}`);
  }
}

const progress = await get("/rest/v1/user_progress?select=user_id,total_xp,current_level,last_level_up_at");
const history = await get("/rest/v1/user_level_history?select=user_id,level,entered_at,entry_xp&limit=10000");
const cuts = await get("/rest/v1/level_definitions?select=level,required_total_xp&order=level.asc");
const cutOf = new Map(cuts.map((c) => [c.level, c.required_total_xp]));

// 단언 0건으로 통과하는 일을 막는다 — 레벨업한 사용자가 한 명도 없으면 검사할 것이 없다
const leveled = progress.filter((p) => p.current_level > 1);
check("레벨업한 사용자가 있다", leveled.length > 0, `user_progress ${progress.length}행 중 Lv.2 이상 0명`);

const byUser = new Map();
for (const r of history) {
  const list = byUser.get(r.user_id) ?? [];
  list.push(r);
  byUser.set(r.user_id, list);
}

for (const p of leveled) {
  const rows = (byUser.get(p.user_id) ?? []).sort((a, b) => a.level - b.level);
  const id = p.user_id.slice(0, 8);
  check(
    `${id} 이력 행 수 = 레벨 - 1`,
    rows.length === p.current_level - 1,
    `이력 ${rows.length}행 / Lv.${p.current_level}`,
  );
  check(
    `${id} 레벨이 2부터 빠짐없이 이어진다`,
    rows.every((r, i) => r.level === i + 2),
    rows.map((r) => r.level).join(","),
  );
  check(
    `${id} 진입 시각이 뒤로 가지 않는다`,
    rows.every((r, i) => i === 0 || Date.parse(r.entered_at) >= Date.parse(rows[i - 1].entered_at)),
    "entered_at 역전",
  );
  check(
    `${id} 진입 XP가 그 레벨 컷 이상이다`,
    rows.every((r) => r.entry_xp >= cutOf.get(r.level)),
    rows.filter((r) => r.entry_xp < cutOf.get(r.level)).map((r) => `Lv.${r.level}@${r.entry_xp}`).join(","),
  );
  const last = rows.at(-1);
  check(
    `${id} 현재 레벨 진입 시각 = last_level_up_at`,
    Boolean(last) && Date.parse(last.entered_at) === Date.parse(p.last_level_up_at),
    `${last?.entered_at} vs ${p.last_level_up_at}`,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
// finally 밖에서 종료한다 — 예외를 삼켜 0으로 끝나는 일을 막는다
process.exit(failed > 0 ? 1 : 0);
