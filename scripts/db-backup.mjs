/**
 * 운영 DB **논리 백업** — 외부 파일럿 직전 1회용 안전장치 (2026-09-03).
 *
 * ⚠️⚠️ **읽기 전용이다.** GET과, 읽기 전용 RPC(`admin_schema_snapshot`) 호출뿐이다.
 *    INSERT·UPDATE·DELETE·DDL을 하지 않는다. 이 파일에 쓰기 요청을 추가하지 마라 —
 *    "백업 스크립트"라는 이름 뒤에 쓰기가 숨으면 아무도 의심하지 않는다.
 *
 * ── 왜 `supabase db dump`가 아닌가 (2026-09-03 실측) ──────────────
 * 두 겹으로 막혔다:
 *   1. `supabase db dump`는 **Docker Desktop을 요구한다.** 이 PC에 없다
 *      (`LegacyDockerRunError`로 실측 확인).
 *   2. 그리고 **Postgres 비밀번호**가 필요한데 `.env.local`에 없다
 *      (거기 있는 건 anon/service_role 키지 DB 비밀번호가 아니다).
 * 그래서 이 저장소가 원래 쓰는 방식 — service_role + REST — 으로 같은 목적을
 * 달성한다. `scripts/dump-schema-snapshot.mjs`와 같은 경로다.
 *
 * ⚠️ **무엇이 안 들어가는지 알고 써라.**
 *   · Storage의 **이미지 바이너리**는 안 들어간다. 파일 **목록과 메타데이터**만
 *     담는다. 사진 원본까지 받으려면 별도 작업이다(파일럿 P0 범위 밖).
 *   · `auth.users`는 관리자 API로 담지만 **비밀번호 해시는 API가 주지 않는다.**
 *     즉 이 백업만으로 계정을 그대로 되살릴 수는 없다. 사고 시 "무엇이 있었는지"를
 *     복원하는 자료이지, 클릭 한 번으로 되돌리는 스냅샷이 아니다.
 *
 * ⛔ **결과물을 저장소 안에 두지 않는다.** 아래 `assertOutsideRepo()`가 강제한다.
 *    개인정보가 통째로 든 파일이라 실수로 커밋되면 되돌릴 수 없다.
 *
 * 사용법:
 *   node scripts/db-backup.mjs                 # 기본: ~/GND-private-backups/
 *   node scripts/db-backup.mjs --out <경로>
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join, sep } from "node:path";

// ── 설정 ────────────────────────────────────────────────────────
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
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) throw new Error(".env.local에 Supabase 설정이 없습니다");

const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

const argOut = (() => {
  const i = process.argv.indexOf("--out");
  return i >= 0 ? process.argv[i + 1] : null;
})();

/**
 * ⚠️ **현지 날짜**를 쓴다. `toISOString()`은 UTC라서 한국 시간 오전 9시 이전에
 *    돌리면 **하루 전 날짜**로 폴더가 생긴다(2026-09-03 새벽에 실제로 그랬다).
 *    백업 폴더 이름은 사람이 "언제 받은 것"인지 읽는 유일한 단서다.
 */
const today = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();
const baseDir = resolve(argOut ?? join(homedir(), "GND-private-backups"));
const outDir = join(baseDir, `gnd-pre-public-pilot-${today}`);

/**
 * ⛔ 저장소 안에 쓰면 즉시 죽는다. 백업 파일이 git에 들어가는 것이 이 작업에서
 *    제일 나쁜 결과다 — 개인정보가 원격에 영구히 남는다.
 */
function assertOutsideRepo(target) {
  const repo = resolve(process.cwd());
  const t = resolve(target);
  if (t === repo || t.startsWith(repo + sep)) {
    throw new Error(
      `백업 위치가 저장소 안입니다(${t}). 저장소 밖 경로를 쓰세요 — git에 개인정보가 들어갑니다.`,
    );
  }
}
assertOutsideRepo(outDir);

// ── HTTP (읽기 전용) ────────────────────────────────────────────
async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { ...H, ...headers } });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** PostgREST 한 테이블 전량 — 1000행씩 끊어 받는다. */
async function fetchTable(table) {
  const rows = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const url = `${URL_}/rest/v1/${encodeURIComponent(table)}?select=*&limit=${PAGE}&offset=${offset}`;
    const chunk = await getJson(url);
    if (!Array.isArray(chunk)) break;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return rows;
}

/** 공개 스키마의 테이블 목록 — PostgREST OpenAPI 문서에서 읽는다. */
async function listTables() {
  const spec = await getJson(`${URL_}/rest/v1/`);
  const defs = spec?.definitions ?? spec?.components?.schemas ?? {};
  return Object.keys(defs).sort();
}

/** auth.users — 관리자 API. 비밀번호 해시는 포함되지 않는다(위 주석). */
async function fetchAuthUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const res = await getJson(
      `${URL_}/auth/v1/admin/users?page=${page}&per_page=200`,
    );
    const batch = res?.users ?? [];
    users.push(...batch);
    if (batch.length < 200) break;
  }
  return users;
}

/** Storage 파일 **목록·메타데이터**만. 바이너리는 받지 않는다. */
async function fetchStorageListing(bucket) {
  const out = [];
  async function walk(prefix) {
    const res = await fetch(`${URL_}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
    });
    if (!res.ok) throw new Error(`storage list ${bucket}/${prefix} → ${res.status}`);
    for (const e of await res.json()) {
      // id가 null이면 폴더다. 파일이면 메타데이터가 붙어 있다.
      if (e.id === null) await walk(prefix ? `${prefix}/${e.name}` : e.name);
      else out.push({ path: prefix ? `${prefix}/${e.name}` : e.name, ...e });
    }
  }
  await walk("");
  return out;
}

// ── 실행 ────────────────────────────────────────────────────────
const started = new Date();
mkdirSync(join(outDir, "data"), { recursive: true });
console.log(`백업 위치: ${outDir}`);

const manifest = {
  generatedAt: started.toISOString(),
  supabaseUrl: URL_,
  note: "논리 백업(읽기 전용). Storage 이미지 바이너리와 비밀번호 해시는 포함되지 않음.",
  tables: {},
};

// 1) 스키마 DDL
try {
  const res = await fetch(`${URL_}/rest/v1/rpc/admin_schema_snapshot`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  writeFileSync(join(outDir, "schema-snapshot.json"), await res.text(), "utf8");
  console.log("✅ schema-snapshot.json");
} catch (e) {
  console.error(`⚠️  스키마 스냅샷 실패: ${e.message}`);
  manifest.schemaSnapshotError = String(e.message);
}

// 2) 공개 스키마 데이터
const tables = await listTables();
console.log(`테이블 ${tables.length}종`);
let totalRows = 0;
for (const t of tables) {
  try {
    const rows = await fetchTable(t);
    writeFileSync(
      join(outDir, "data", `${t}.json`),
      JSON.stringify(rows, null, 2),
      "utf8",
    );
    manifest.tables[t] = rows.length;
    totalRows += rows.length;
    console.log(`  ✅ ${t.padEnd(32)} ${rows.length}행`);
  } catch (e) {
    manifest.tables[t] = `ERROR: ${e.message}`;
    console.error(`  ❌ ${t}: ${e.message}`);
  }
}

// 3) auth 사용자
try {
  const users = await fetchAuthUsers();
  writeFileSync(
    join(outDir, "auth-users.json"),
    JSON.stringify(users, null, 2),
    "utf8",
  );
  manifest.authUsers = users.length;
  console.log(`✅ auth-users.json — ${users.length}명`);
} catch (e) {
  manifest.authUsersError = String(e.message);
  console.error(`⚠️  auth 사용자 실패: ${e.message}`);
}

// 4) Storage 목록 (바이너리 제외)
manifest.storage = {};
for (const bucket of ["avatars", "workout-images"]) {
  try {
    const objs = await fetchStorageListing(bucket);
    writeFileSync(
      join(outDir, `storage-${bucket}.json`),
      JSON.stringify(objs, null, 2),
      "utf8",
    );
    manifest.storage[bucket] = objs.length;
    console.log(`✅ storage-${bucket}.json — ${objs.length}개(메타데이터만)`);
  } catch (e) {
    manifest.storage[bucket] = `ERROR: ${e.message}`;
    console.error(`⚠️  storage ${bucket} 실패: ${e.message}`);
  }
}

manifest.totalRows = totalRows;
manifest.finishedAt = new Date().toISOString();
writeFileSync(
  join(outDir, "manifest.json"),
  JSON.stringify(manifest, null, 2),
  "utf8",
);

// ── 완료 검증 — "명령이 성공했다"로 끝내지 않는다 ──────────────
const must = [join(outDir, "manifest.json"), join(outDir, "auth-users.json")];
let bad = 0;
for (const f of must) {
  if (!existsSync(f) || statSync(f).size === 0) {
    console.error(`❌ 검증 실패: ${f} 없음 또는 0바이트`);
    bad += 1;
  }
}
const failedTables = Object.values(manifest.tables).filter(
  (v) => typeof v === "string",
).length;
if (failedTables > 0) {
  console.error(`❌ 테이블 ${failedTables}종 실패`);
  bad += 1;
}

console.log(`\n총 ${totalRows}행 · 테이블 ${tables.length}종`);
console.log(bad === 0 ? "✅ 백업 완료" : `❌ 백업에 문제 ${bad}건`);
process.exitCode = bad === 0 ? 0 : 1;
