// user_progress 원장 기준 재계산 (계획 Task 8B)
// 원장(xp_transactions)이 공식 원천. 캐시(user_progress.total_xp)와 어긋나면 정정.
// 기본은 dry-run. --apply 일 때만 수정.
//   node scripts/recalculate-user-progress.mjs --all
//   node scripts/recalculate-user-progress.mjs --user-id <uuid>
//   node scripts/recalculate-user-progress.mjs --all --apply
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) throw new Error(".env.local에 URL/SERVICE_ROLE 키가 필요합니다");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ALL = args.includes("--all");
const userIdIdx = args.indexOf("--user-id");
const ONE = userIdIdx >= 0 ? args[userIdIdx + 1] : null;
if (!ALL && !ONE) {
  console.error("사용법: --all 또는 --user-id <uuid> (선택 --apply)");
  process.exit(1);
}

const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
async function get(path) {
  const res = await fetch(`${URL_}${path}`, { headers: H });
  return res.json();
}
async function patch(path, body) {
  const res = await fetch(`${URL_}${path}`, { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// 레벨 컷 (level_definitions와 동일해야 함 — DB에서 읽어 사용)
const defs = await get("/rest/v1/level_definitions?select=level,required_total_xp,stage_index&order=required_total_xp.asc");
function levelStageFor(totalXp) {
  let m = defs[0];
  for (const d of defs) { if (totalXp >= d.required_total_xp) m = d; else break; }
  return { level: m.level, stage: m.stage_index };
}

const targets = ONE
  ? await get(`/rest/v1/user_progress?user_id=eq.${ONE}&select=user_id,total_xp,current_level,current_stage`)
  : await get("/rest/v1/user_progress?select=user_id,total_xp,current_level,current_stage");

let checked = 0, mismatched = 0, skipped = 0, applied = 0;
for (const p of targets) {
  checked++;
  // 원장 SUM
  const rows = await get(`/rest/v1/xp_transactions?user_id=eq.${p.user_id}&select=amount`);
  const ledgerXp = rows.reduce((s, r) => s + r.amount, 0);

  if (ledgerXp < 0) {
    skipped++;
    console.log(`⚠ ${p.user_id.slice(0, 8)}… 원장 합계 음수(${ledgerXp}) — 자동 수정 안 함`);
    continue;
  }
  const { level, stage } = levelStageFor(ledgerXp);
  const drift = p.total_xp !== ledgerXp || p.current_level !== level || p.current_stage !== stage;
  if (!drift) continue;

  mismatched++;
  console.log(`불일치 ${p.user_id.slice(0, 8)}…`);
  console.log(`   캐시 XP ${p.total_xp} → 원장 XP ${ledgerXp}`);
  console.log(`   레벨 ${p.current_level}→${level} · 단계 ${p.current_stage}→${stage}`);
  if (APPLY) {
    const r = await patch(`/rest/v1/user_progress?user_id=eq.${p.user_id}`, {
      total_xp: ledgerXp, current_level: level, current_stage: stage, updated_at: new Date().toISOString(),
    });
    if (r.status < 300) { applied++; console.log("   ✅ 적용됨"); }
    else console.log(`   ❌ 적용 실패 status=${r.status}`);
  }
}

console.log(`\n검사 ${checked}명 · 불일치 ${mismatched}명 · 건너뜀(음수) ${skipped}명 · 적용 ${applied}명`);
console.log(APPLY ? "(--apply: 실제 수정 수행)" : "(dry-run: 아무것도 수정하지 않음 — 적용하려면 --apply)");
