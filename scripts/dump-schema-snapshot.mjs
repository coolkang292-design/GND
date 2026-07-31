// 운영 DB의 **현행** 함수·정책·인덱스를 docs/db-current-schema.sql로 뽑는다.
// 실행: node scripts/dump-schema-snapshot.mjs   (사전조건: 0048 적용)
//
// 왜 필요한가 (§6.2): 이 저장소는 마이그레이션마다 create or replace로 같은
// 함수를 덮어쓴다. start_challenge는 0006 → 0025 → 0045 세 곳에 흩어져 있고
// mark_record_beaten은 다섯 번 덮어썼다. "지금 정의가 무엇인가"를 파일에서
// 찾으면 틀린다 — 2026-07-31에 실제로 형제 함수를 놓쳐 사고가 났다.
//
// 이 파일이 만드는 docs/db-current-schema.sql이 그 질문의 단일 답이다.
// 마이그레이션을 적용한 뒤에는 이걸 다시 돌려 갱신한다.
//
// 읽기 전용이다. 계정을 만들지 않으므로 rate limit(§6.5) 영향이 없다.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "docs/db-current-schema.sql";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) throw new Error(".env.local에 Supabase 설정이 없습니다");

const res = await fetch(`${URL_}/rest/v1/rpc/admin_schema_snapshot`, {
  method: "POST",
  headers: {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    "Content-Type": "application/json",
  },
  body: "{}",
});
const text = await res.text();
if (!res.ok) {
  console.error(`admin_schema_snapshot 호출 실패 (${res.status}): ${text}`);
  console.error("0048_schema_snapshot_rpc.sql이 적용됐는지 확인하세요.");
  process.exitCode = 1;
} else {
  const snap = JSON.parse(text);
  const fns = snap.functions ?? [];
  const pols = snap.policies ?? [];
  const idxs = snap.indexes ?? [];

  const lines = [];
  lines.push("-- 운영 DB 현행 스키마 스냅샷 — 자동 생성물. 손으로 고치지 마라.");
  lines.push("-- 생성: node scripts/dump-schema-snapshot.mjs");
  lines.push("--");
  lines.push("-- 이 파일은 **읽기용 참조**다. 여기를 고쳐도 DB는 안 바뀐다 —");
  lines.push("-- 변경은 supabase/migrations/에 새 번호 파일을 만들어 사용자가 Run한다.");
  lines.push("--");
  lines.push("-- 쓰는 법: 함수·정책의 '현행' 정의가 필요할 때 마이그레이션 47개를");
  lines.push("-- 뒤지지 말고 이 파일을 검색하라. 마이그레이션을 적용한 뒤에는 다시 뽑아라.");
  lines.push(`--`);
  lines.push(`-- 함수 ${fns.length}개 · 정책 ${pols.length}개 · 인덱스 ${idxs.length}개`);
  lines.push("");

  lines.push("-- ════════════════════════════════════════════════════════════");
  lines.push("-- 함수");
  lines.push("-- ════════════════════════════════════════════════════════════");
  lines.push("");
  for (const f of fns) {
    lines.push(`-- ── ${f.name} ──`);
    lines.push(f.definition.trimEnd() + ";");
    lines.push("");
  }

  lines.push("-- ════════════════════════════════════════════════════════════");
  lines.push("-- RLS 정책");
  lines.push("-- ════════════════════════════════════════════════════════════");
  lines.push("");
  let lastTable = null;
  for (const p of pols) {
    if (p.table !== lastTable) {
      lines.push(`-- ── ${p.table} ──`);
      lastTable = p.table;
    }
    lines.push(`-- ${p.name}  [${p.cmd}]  roles=${p.roles}`);
    if (p.using) lines.push(`--   using  : ${p.using}`);
    if (p.check) lines.push(`--   check  : ${p.check}`);
  }
  lines.push("");

  lines.push("-- ════════════════════════════════════════════════════════════");
  lines.push("-- 인덱스");
  lines.push("-- ════════════════════════════════════════════════════════════");
  lines.push("");
  for (const i of idxs) lines.push(`-- ${i.def};`);
  lines.push("");

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, lines.join("\n"), "utf8");
  console.log(`✅ ${OUT}`);
  console.log(`   함수 ${fns.length}개 · 정책 ${pols.length}개 · 인덱스 ${idxs.length}개`);
}
