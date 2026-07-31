// 버그 신고 파이프라인 — 에이전트가 신고를 읽고 처리하는 도구 (0052).
//
// 설계: docs/superpowers/specs/2026-07-31-bug-report-pipeline-design.md
//
//   node scripts/bug-reports.mjs                       미처리(new) 전량 — 기본
//   node scripts/bug-reports.mjs --all                 상태 무관 전량
//   node scripts/bug-reports.mjs --brief               한 줄 요약 (SessionStart 훅용)
//   node scripts/bug-reports.mjs --id <uuid>           1건 상세 (trail 전량)
//   node scripts/bug-reports.mjs --triage <id> --note "원인: ..."
//   node scripts/bug-reports.mjs --fix <id> --release <release-id>          DRY RUN
//   node scripts/bug-reports.mjs --fix <id> --release <release-id> --send   실제 발송
//   node scripts/bug-reports.mjs --wontfix <id> --note "..."
//
// ⚠️ 프로덕션 DB에 직접 붙는다(스테이징이 없다). 읽기가 기본이고, 상태를 바꾸는
//    것은 --triage/--fix/--wontfix뿐이다. **알림 발송은 --send가 있을 때만** 나간다
//    — broadcast-release.mjs와 같은 규약이고, 되돌릴 수 없는 외부 작업이다.
import { readFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);

const env = Object.fromEntries(
  readFileSync(new URL(".env.local", ROOT), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !KEY) throw new Error(".env.local에 Supabase 설정이 없다");

const h = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

async function api(path, init = {}) {
  const res = await fetch(`${SUPA}${path}`, { ...init, headers: { ...h, ...init.headers } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${res.status} ${path} — ${text.slice(0, 300)}`);
  return body;
}

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : null;
};

// ── 표시 도우미 ────────────────────────────────────────────
const kst = (iso) =>
  new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

const kstTime = (iso) =>
  new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

/** 번들이 며칠 묵었는지 — 배포 누락을 한눈에 잡는 지표다. */
function buildAge(buildIso, nowMs) {
  if (!buildIso || buildIso === "unknown") return "빌드시각 없음";
  const t = Date.parse(buildIso);
  if (Number.isNaN(t)) return "빌드시각 이상";
  const days = Math.floor((nowMs - t) / 86_400_000);
  const when = kst(buildIso);
  if (days <= 0) return `${when} (오늘)`;
  return `${when} (${days}일 전)`;
}

/** iPhone/Android + 브라우저만 뽑는다. UA 원문은 길어서 못 읽는다. */
function shortUA(ua) {
  if (!ua) return "기기 미상";
  const os = /iPhone|iPad/.test(ua) ? "iPhone"
    : /Android/.test(ua) ? "Android"
    : /Macintosh/.test(ua) ? "Mac"
    : /Windows/.test(ua) ? "Windows" : "기타";
  const br = /CriOS|Chrome/.test(ua) ? "Chrome"
    : /FxiOS|Firefox/.test(ua) ? "Firefox"
    : /Safari/.test(ua) ? "Safari" : "기타";
  return `${os}/${br}`;
}

const KIND_MARK = { nav: "nav  ", action: "act  ", fail: "FAIL " };

function renderReport(r, nameOf, { full = false } = {}) {
  const ctx = r.context ?? {};
  const lines = [];
  lines.push(
    `[${r.status}] ${kst(r.created_at)} KST · ${nameOf.get(r.user_id) ?? "(프로필 없음)"} · ${r.route ?? "경로 없음"}`,
  );
  lines.push(`  "${r.message}"`);
  lines.push(
    `  build ${buildAge(ctx.build, Date.now())}   ${shortUA(ctx.ua)}   ${ctx.viewport ?? "?"}${ctx.standalone === false ? "   ⚠️설치본아님" : ""}`,
  );
  if (ctx.crash) lines.push(`  💥 ${String(ctx.crash).slice(0, 200)}`);
  if (r.triage_note) lines.push(`  📝 ${r.triage_note}`);
  if (r.fixed_release) lines.push(`  ✅ ${r.fixed_release}${r.notified_at ? " (알림 발송함)" : " (알림 미발송)"}`);

  const trail = Array.isArray(r.trail) ? r.trail : [];
  if (trail.length > 0) {
    lines.push("  trail:");
    for (const e of full ? trail : trail.slice(0, 6)) {
      const mark = KIND_MARK[e.kind] ?? "?    ";
      lines.push(`    ${kstTime(e.t)}  ${mark} ${e.label}${e.detail ? `  ${e.detail}` : ""}`);
    }
    if (!full && trail.length > 6) {
      lines.push(`    … ${trail.length - 6}건 더 (--id ${r.id})`);
    }
  }
  lines.push(`  id ${r.id}`);
  return lines.join("\n");
}

async function loadNames() {
  const profiles = await api("/rest/v1/profiles?select=id,nickname");
  return new Map(profiles.map((p) => [p.id, p.nickname]));
}

// ── 조회 ───────────────────────────────────────────────────
async function listReports() {
  const brief = has("--brief");
  const all = has("--all");
  const one = val("--id");

  let query = "/rest/v1/bug_reports?select=*&order=created_at.desc";
  if (one) query += `&id=eq.${one}`;
  else if (!all) query += "&status=eq.new";

  const rows = await api(query);

  if (brief) {
    // SessionStart 훅이 읽는 한 줄. 없으면 아무 말도 하지 않는다 — 조용한 게 정상이다.
    if (rows.length === 0) return;
    const nameOf = await loadNames();
    const summary = rows
      .slice(0, 5)
      .map((r) => `${nameOf.get(r.user_id) ?? "?"} · ${r.route ?? "?"} · ${r.message.slice(0, 40)}`)
      .join(" / ");
    console.log(
      `미처리 버그 신고 ${rows.length}건 — ${summary}${rows.length > 5 ? " …" : ""} (자세히: node scripts/bug-reports.mjs)`,
    );
    return;
  }

  const nameOf = await loadNames();
  const label = one ? "지정 신고" : all ? "전체 신고" : "미처리(new) 신고";
  console.log(`${label} ${rows.length}건\n`);
  if (rows.length === 0) {
    console.log("없다.");
    return;
  }
  for (const r of rows) {
    console.log(renderReport(r, nameOf, { full: Boolean(one) }));
    console.log("");
  }
}

// ── 상태 변경 ──────────────────────────────────────────────
async function patchReport(id, patch) {
  const rows = await api(`/rest/v1/bug_reports?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  if (!rows || rows.length === 0) throw new Error(`신고를 찾지 못했다: ${id}`);
  return rows[0];
}

async function triage() {
  const id = val("--triage");
  const note = val("--note");
  if (!note) throw new Error("--note 로 원인·판단을 남겨라");
  const row = await patchReport(id, { status: "triaged", triage_note: note });
  console.log(`triaged — ${row.id}\n  📝 ${row.triage_note}`);
}

async function wontfix() {
  const id = val("--wontfix");
  const note = val("--note");
  if (!note) throw new Error("--note 로 이유를 남겨라");
  const row = await patchReport(id, {
    status: "wontfix",
    triage_note: note,
    resolved_at: new Date().toISOString(),
  });
  console.log(`wontfix — ${row.id}\n  📝 ${row.triage_note}`);
}

async function fix() {
  const id = val("--fix");
  const release = val("--release");
  const send = has("--send");
  const force = has("--force");

  if (!release) throw new Error("--release <release-id> 로 어느 배포가 고쳤는지 적어라");

  // 릴리스 id 오타를 여기서 잡는다. 틀린 id를 박으면 사용자가 새 소식에서
  // 아무것도 못 찾는다.
  const notes = JSON.parse(
    readFileSync(new URL("src/lib/domain/release-notes.data.json", ROOT), "utf8"),
  );
  const note = notes.find((n) => n.id === release);
  if (!note) {
    throw new Error(
      `release-notes.data.json에 '${release}'가 없다. 먼저 릴리스 항목을 추가해라.\n` +
        `  있는 id: ${notes.slice(0, 5).map((n) => n.id).join(", ")}`,
    );
  }

  const [report] = await api(`/rest/v1/bug_reports?id=eq.${id}&select=*`);
  if (!report) throw new Error(`신고를 찾지 못했다: ${id}`);

  const nameOf = await loadNames();
  const reporter = nameOf.get(report.user_id) ?? null;

  const title = "🔧 신고하신 문제를 고쳤어요";
  const body = `"${report.message.slice(0, 80)}" — ${note.title}`;

  console.log(`신고   ${report.id}`);
  console.log(`신고자 ${reporter ?? "(프로필 없음 — 알림 못 보냄)"}`);
  console.log(`릴리스 ${note.id} · ${note.title}`);
  console.log(`알림   ${title}`);
  console.log(`       ${body}`);

  if (report.notified_at && !force) {
    console.log(`\n이미 ${kst(report.notified_at)} KST에 알렸다. 다시 보내려면 --force.`);
  }

  if (!send) {
    console.log("\nDRY RUN — 실제로 보내려면 --send 를 붙여라.");
    return;
  }

  const patch = {
    status: "fixed",
    fixed_release: release,
    resolved_at: new Date().toISOString(),
  };

  // 프로필이 없으면 notifications.user_id FK(→ profiles)가 막는다. 온보딩에서
  // 막힌 사람의 신고가 여기 해당한다 — 알림만 건너뛰고 상태는 그대로 닫는다.
  const canNotify = reporter !== null && (!report.notified_at || force);
  if (canNotify) {
    await api("/rest/v1/notifications", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: report.user_id,
        type: "bug_fixed",
        reference_id: report.id,
        title,
        body,
      }),
    });
    patch.notified_at = new Date().toISOString();
  }

  await patchReport(id, patch);
  console.log(
    `\nfixed — ${id}${canNotify ? " · 알림 발송함" : " · 알림 건너뜀"}`,
  );
}

// ── 진입 ───────────────────────────────────────────────────
try {
  if (val("--triage")) await triage();
  else if (val("--wontfix")) await wontfix();
  else if (val("--fix")) await fix();
  else await listReports();
} catch (e) {
  // --brief는 SessionStart 훅에서 돈다. 거기서 실패가 세션 시작을 막으면 안 된다.
  if (has("--brief")) process.exit(0);
  console.error(`실패: ${e.message}`);
  process.exit(1);
}
