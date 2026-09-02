// GND 회귀 러너 — 기준선(scripts/regression-baselines.json)과 대조한다.
//
// 사용법
//   pnpm verify:regression                 core 6종 (CLAUDE.md 배포 전 루틴)
//   pnpm verify:regression --tier readonly 계정을 안 만드는 것만 — 빠르고 안전
//   pnpm verify:regression --all           전량 (오래 걸린다. 아래 ⚠️ 참조)
//   pnpm verify:regression --only rls-test,xp-test
//   pnpm verify:regression --all --record  측정값을 매니페스트에 기록(derived → measured)
//   pnpm verify:regression --list          무엇이 등재돼 있는지만 보여준다
//   옵션: --delay=90  계정 생성 스크립트 사이 대기 초 (기본 90)
//
// ⚠️ tier=accounts 스크립트는 실행마다 운영 Supabase에 익명 계정을 만든다.
//    연달아 돌리면 익명 가입 rate limit(429)에 걸리므로 사이에 대기를 넣는다.
//    --all 은 23종 × (실행 + 90초) 라 30분을 훌쩍 넘긴다. 배포 직전이 아니면 --tier readonly 로 충분하다.
//
// ⚠️ 이 러너는 종료 코드만 믿지 않는다. 스크립트가 exit 0을 주더라도
//    요약줄의 passed/failed 를 파싱해 기준선과 대조한다. 단언이 통째로
//    사라져 "0 failed"가 된 경우는 종료 코드로 잡히지 않기 때문이다
//    (CLAUDE.md §테스트가 진짜 테스트인지 확인한다).

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MANIFEST_PATH = resolve(HERE, "regression-baselines.json");

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

// ── 인자 ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f) => {
  const eq = argv.find((a) => a.startsWith(`${f}=`));
  if (eq) return eq.slice(f.length + 1);
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

const wantList = has("--list");
const wantAll = has("--all");
const wantRecord = has("--record");
const tier = valueOf("--tier");
const only = valueOf("--only");
const delaySec = Number(valueOf("--delay") ?? 90);

// ── 대상 고르기 ─────────────────────────────────────────────────────
const all = Object.entries(manifest.scripts);
let targets;
if (only) {
  const names = only.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = names.filter((n) => !manifest.scripts[n]);
  if (unknown.length) {
    console.error(`매니페스트에 없는 이름: ${unknown.join(", ")}`);
    console.error("등재 목록은 --list 로 본다.");
    process.exit(2);
  }
  targets = names.map((n) => [n, manifest.scripts[n]]);
} else if (tier) {
  targets = all.filter(([, v]) => v.tier === tier);
  if (!targets.length) {
    console.error(`tier '${tier}' 에 해당하는 스크립트가 없다. (readonly | fixture | accounts)`);
    process.exit(2);
  }
} else if (wantAll) {
  targets = all;
} else {
  targets = all.filter(([, v]) => v.core);
}

// 무거운 것을 뒤로 — 가벼운 회귀를 먼저 보고 일찍 멈출 수 있게
const TIER_ORDER = { readonly: 0, fixture: 1, accounts: 2 };
targets.sort(
  (a, b) => TIER_ORDER[a[1].tier] - TIER_ORDER[b[1].tier] || (a[1].assertions ?? 0) - (b[1].assertions ?? 0),
);

if (wantList) {
  console.log(`\n회귀 스크립트 ${all.length}종 (도구 ${manifest.notScripts.tools.length}종은 제외)\n`);
  for (const [name, v] of all.slice().sort((a, b) => a[1].tier.localeCompare(b[1].tier) || a[0].localeCompare(b[0]))) {
    const base = v.assertions === null ? "종료코드만" : `${v.assertions} (${v.source})`;
    console.log(`  ${v.core ? "★" : " "} [${v.tier.padEnd(8)}] ${name.padEnd(36)} ${base}`);
  }
  console.log("\n  ★ = core (배포 전 기본 루틴). 기본 실행 대상.\n");
  process.exit(0);
}

// ── 요약줄 파싱 ─────────────────────────────────────────────────────
// 저장소에 다섯 가지 형식이 섞여 있다. 통일하는 게 낫지만, 그 전에는 전부 받는다.
//   "결과: 12 통과 / 0 실패"   "12 통과 / 0 실패"
//   "통과 12 · 실패 0"         ← 말 순서가 반대다(referral-tree·challenge-social)
//   "12/12 passed"
//   "12 passed, 0 failed"      "12 passed / 0 failed"
//
// ⚠️⚠️ **"통과 N · 실패 M"을 지우지 마라** (2026-09-03에 이걸로 당했다).
//    `referral-tree-check`·`challenge-social-check`는 이 형식으로 찍는데 패턴이
//    없어서, **아무리 통과해도 언제나 `NOSUM`(실패)** 로 보고됐다. 실제로
//    `통과 29 · 실패 0`을 찍고도 실패로 집계됐다. 영구히 빨간 스크립트는
//    "원래 실패하는 것"으로 굳어 **진짜 회귀를 가린다**(§테스트가 진짜
//    테스트인지 확인한다). 러너 자신의 요약("통과 1 · 증가 0 · 실패 2")은
//    사이에 `증가 N ·`가 끼어 이 정규식에 안 걸리고, 애초에 파싱 대상은
//    **자식 프로세스의 출력**뿐이라 섞이지 않는다.
function parseSummary(out) {
  const patterns = [
    { re: /(\d+)\s*통과\s*\/\s*(\d+)\s*실패/, kind: "pf" },
    { re: /통과\s*(\d+)\s*·\s*실패\s*(\d+)/, kind: "pf" },
    { re: /(\d+)\s+passed\s*[,/]\s*(\d+)\s+failed/i, kind: "pf" },
    { re: /(\d+)\s*\/\s*(\d+)\s+passed/i, kind: "pt" }, // passed / total
  ];
  // 마지막 매치를 쓴다 — 중간 로그에 같은 모양이 나올 수 있다
  let best = null;
  for (const { re, kind } of patterns) {
    const g = new RegExp(re.source, re.flags.includes("i") ? "gi" : "g");
    let m, last = null;
    while ((m = g.exec(out)) !== null) last = m;
    if (last) {
      const a = Number(last[1]), b = Number(last[2]);
      const cand = kind === "pf" ? { passed: a, failed: b } : { passed: a, failed: b - a };
      if (!best || last.index > best.index) best = { ...cand, index: last.index };
    }
  }
  if (!best) return null;
  return { passed: best.passed, failed: best.failed };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 실행 ────────────────────────────────────────────────────────────
const accountsCount = targets.filter(([, v]) => v.tier === "accounts").length;
const estMin = Math.round((accountsCount > 1 ? (accountsCount - 1) * delaySec : 0) / 60);

console.log(`\nGND 회귀 — ${targets.length}종`);
console.log(`대상: ${targets.map(([n]) => n).join(", ")}`);
if (accountsCount > 1) {
  console.log(`⚠️ 계정 생성 ${accountsCount}종 — 사이에 ${delaySec}초씩 대기한다(429 회피). 대기만 약 ${estMin}분.`);
}
const fixtureNeeded = targets.filter(([, v]) => v.tier === "fixture");
if (fixtureNeeded.length) {
  console.log(`⚠️ 픽스처 필요: ${fixtureNeeded.map(([n]) => n).join(", ")}`);
  console.log(`   먼저: node scripts/dev-fixture.mjs create && node scripts/dev-fixture.mjs challenge`);
}
console.log("");

const results = [];
let prevWasAccounts = false;

for (const [name, spec] of targets) {
  if (prevWasAccounts && spec.tier === "accounts" && delaySec > 0) {
    process.stdout.write(`   … ${delaySec}초 대기 (익명 가입 rate limit)\n`);
    await sleep(delaySec * 1000);
  }

  const started = Date.now();
  process.stdout.write(`▶ ${name} … `);

  const run = spawnSync(process.execPath, [resolve(HERE, `${name}.mjs`)], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...(spec.env ?? {}) },
    maxBuffer: 32 * 1024 * 1024,
  });

  const sec = ((Date.now() - started) / 1000).toFixed(0);
  const out = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  const summary = parseSummary(out);
  const exitCode = run.status;

  let verdict, note = "";

  if (run.error) {
    verdict = "ERROR";
    note = run.error.message;
  } else if (spec.assertions === null) {
    // 단언 카운터가 없는 스크립트 — 종료 코드만 본다
    verdict = exitCode === 0 ? "OK" : "FAIL";
    note = exitCode === 0 ? "종료코드만 확인(단언 카운터 없음)" : `exit ${exitCode}`;
  } else if (!summary) {
    verdict = "NOSUM";
    note = `요약줄을 못 찾았다 (exit ${exitCode})`;
  } else if (summary.failed > 0) {
    verdict = "FAIL";
    note = `${summary.failed}건 실패`;
  } else if (summary.passed < spec.assertions) {
    verdict = "REGRESS";
    note = `단언이 줄었다 ${spec.assertions} → ${summary.passed}`;
  } else if (summary.passed > spec.assertions) {
    verdict = "GREW";
    note = `단언이 늘었다 ${spec.assertions} → ${summary.passed} · --record 로 기준선 갱신`;
  } else {
    verdict = "OK";
    note = `${summary.passed}/${spec.assertions}`;
  }

  const mark = { OK: "✅", GREW: "🟡", FAIL: "❌", REGRESS: "❌", NOSUM: "❓", ERROR: "💥" }[verdict];
  console.log(`${mark} ${note}  (${sec}s)`);

  if (verdict === "FAIL" || verdict === "REGRESS" || verdict === "NOSUM" || verdict === "ERROR") {
    const tail = out.trim().split("\n").slice(-14).join("\n");
    console.log(tail.replace(/^/gm, "     │ "));
  }

  results.push({ name, spec, summary, verdict, exitCode, sec });
  prevWasAccounts = spec.tier === "accounts";
}

// ── 기준선 기록 ─────────────────────────────────────────────────────
if (wantRecord) {
  let changed = 0;
  for (const r of results) {
    if (!r.summary || r.summary.failed > 0) continue; // 실패한 실행의 수는 기록하지 않는다
    if (r.spec.assertions === null) continue;
    const entry = manifest.scripts[r.name];
    if (entry.assertions !== r.summary.passed || entry.source !== "measured") {
      entry.assertions = r.summary.passed;
      entry.source = "measured";
      changed++;
    }
  }
  if (changed) {
    manifest.recordedAt = new Date().toISOString().slice(0, 10);
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(`\n📝 기준선 ${changed}건을 measured 로 갱신했다 → scripts/regression-baselines.json`);
  } else {
    console.log(`\n📝 갱신할 기준선이 없다 (전부 이미 일치).`);
  }
}

// ── 요약 ────────────────────────────────────────────────────────────
const bad = results.filter((r) => ["FAIL", "REGRESS", "NOSUM", "ERROR"].includes(r.verdict));
const grew = results.filter((r) => r.verdict === "GREW");

console.log(`\n${"─".repeat(60)}`);
console.log(`통과 ${results.length - bad.length - grew.length} · 증가 ${grew.length} · 실패 ${bad.length}  (총 ${results.length}종)`);

if (grew.length && !wantRecord) {
  console.log(`\n🟡 단언이 늘어난 것 — 기준선을 갱신하라:`);
  for (const r of grew) console.log(`   ${r.name}: ${r.spec.assertions} → ${r.summary.passed}`);
  console.log(`   pnpm verify:regression --only ${grew.map((r) => r.name).join(",")} --record`);
}

if (bad.length) {
  console.log(`\n❌ 실패:`);
  for (const r of bad) console.log(`   ${r.name} — ${r.verdict}`);
  console.log(`\n판정 기준은 언제나 0 failed 다. 하나라도 있으면 회귀다 — 배포하지 않는다.`);
  process.exitCode = 1;
} else {
  console.log(`\n전부 통과. (이건 RPC·DB 계층 검증이다 — 화면 확인을 대신하지 않는다.`);
  console.log(` CLAUDE.md §개발 환경에서 먼저 확인한다)`);
}
