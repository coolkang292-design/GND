/**
 * 권한 드리프트 감시 — 0096이 좁혀 놓은 것이 도로 넓어지지 않았는가.
 *
 * 실행: node scripts/default-privilege-check.mjs
 *
 * ⚠️⚠️ **이 스크립트가 왜 필요한가 — 스냅샷이 GRANT를 안 담는다.**
 *    `pnpm db:snapshot`이 만드는 `docs/db-current-schema.sql`에는 함수·정책·인덱스만
 *    들어간다. `grep -c "grant\|revoke"` → **0**. 즉 **권한이 도로 넓어져도 스냅샷
 *    diff는 한 줄도 안 바뀐다.** 코드 리뷰로도 안 잡힌다(DB에만 있는 상태다).
 *    감시자가 이 스크립트와 `cross-user-abuse-check` 둘뿐이다.
 *
 * ⚠️ **근본 원인은 Supabase의 기본값이다.** `alter default privileges ... grant all
 *    on tables to anon, authenticated` 가 걸려 있어서, public에 테이블을 만드는 순간
 *    anon·authenticated가 **TRUNCATE 포함 8개 권한**을 자동으로 받았다.
 *    0093의 `analytics_events`가 실제로 그랬다 — `grant insert` 하나만 줬는데
 *    직후 조회하니 둘 다 전 권한을 갖고 있었다.
 *    **TRUNCATE는 RLS를 우회한다.** 정책이 아무리 촘촘해도 테이블 전체가 사라진다.
 *    0096 STEP 3이 이 기본값을 좁혔고, 이 스크립트가 그게 유지되는지 본다.
 *
 * ⚠️ 읽기 전용이다. 계정도 안 만들고 아무것도 안 쓴다 (tier: readonly).
 *    카탈로그는 PostgREST로 못 읽으므로 `permission_audit_snapshot()` RPC를 쓴다
 *    (0097, SECURITY DEFINER · service_role 전용 · 읽기 전용).
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SVC) throw new Error(".env.local에 Supabase 설정이 없습니다");

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  OK  ${name}`);
  } else {
    fail++;
    failures.push(`${name} — ${detail}`);
    console.log(`  XX  ${name}\n        ${detail}`);
  }
}

const res = await fetch(`${URL_}/rest/v1/rpc/permission_audit_snapshot`, {
  method: "POST",
  headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" },
  body: "{}",
});
if (!res.ok) {
  throw new Error(
    `permission_audit_snapshot 호출 실패 (0097을 적용했나요?): ${res.status} ${await res.text()}`,
  );
}
const snap = await res.json();

/** `{role=privs/grantor,...}` 에서 한 롤의 권한 문자를 뽑는다. 없으면 null. */
function privsOf(aclText, role) {
  const m = String(aclText ?? "").match(new RegExp(`(?:^|[{,])${role}=([^/]*)/`));
  return m ? m[1] : null;
}

const acl = snap.default_acl ?? {};
const pgTable = acl["postgres:r"];
const pgFunc = acl["postgres:f"];
const pgSeq = acl["postgres:S"];

console.log(`대상 테이블 ${snap.measured_tables}개 · 정책 ${snap.live_policies}개\n`);

// ── 0. 픽스처 가드 — 비어 있으면 아래가 전부 공허하게 통과한다 ─────────
console.log("[0] 가드");
check("잴 테이블이 있다", snap.measured_tables >= 40, `테이블 ${snap.measured_tables}개 (40 이상이어야 한다)`);
check("잴 정책이 있다", snap.live_policies >= 79, `정책 ${snap.live_policies}개 (79 이상이어야 한다)`);
check("postgres의 public TABLE 기본권한 항목이 존재한다", typeof pgTable === "string", `${pgTable}`);

// ── 1. 기본 권한 — 앞으로 만들 객체 ────────────────────────────────────
console.log("\n[1] 기본 권한 (앞으로 만들 객체가 받는 것)");
check(
  "새 테이블에 anon 권한이 안 붙는다",
  privsOf(pgTable, "anon") === null,
  `postgres:TABLE anon=${privsOf(pgTable, "anon")} — 붙으면 로그인 안 한 요청에 테이블이 열린다`,
);
{
  // a=INSERT r=SELECT w=UPDATE d=DELETE | D=TRUNCATE x=REFERENCES t=TRIGGER m=MAINTAIN
  const authed = privsOf(pgTable, "authenticated") ?? "";
  const risky = [...authed].filter((c) => "Dxtm".includes(c));
  check(
    "새 테이블의 authenticated에 TRUNCATE·REFERENCES·TRIGGER·MAINTAIN이 안 붙는다",
    authed !== "" && risky.length === 0,
    `postgres:TABLE authenticated=${authed} · 위험문자=${risky.join("") || "없음"}`,
  );
  check(
    "그러나 앱이 쓰는 4개(SELECT·INSERT·UPDATE·DELETE)는 그대로 붙는다",
    ["a", "r", "w", "d"].every((c) => authed.includes(c)),
    `postgres:TABLE authenticated=${authed} — 빠지면 새 테이블마다 손으로 grant해야 한다`,
  );
}
check(
  "새 함수에 anon EXECUTE가 안 붙는다",
  privsOf(pgFunc, "anon") === null,
  `postgres:FUNCTION anon=${privsOf(pgFunc, "anon")}`,
);
check(
  "새 함수의 authenticated EXECUTE는 그대로 붙는다",
  (privsOf(pgFunc, "authenticated") ?? "").includes("X"),
  `postgres:FUNCTION authenticated=${privsOf(pgFunc, "authenticated")} — 빠지면 새 RPC마다 반드시 빠뜨린다`,
);
check(
  "새 시퀀스에 anon 권한이 안 붙는다",
  privsOf(pgSeq, "anon") === null,
  `postgres:SEQUENCE anon=${privsOf(pgSeq, "anon")}`,
);

// ⚠️ supabase_admin 소유분은 **고칠 수 없다.** postgres에게 권한이 없어
//    `alter default privileges for role supabase_admin`이 42501로 거부된다(2026-09-02 실측).
//    지금 public의 객체는 전부 postgres 소유라 실질 영향이 없지만, 상태는 기록해 둔다.
{
  const saTable = acl["supabase_admin:r"];
  const stillWide = privsOf(saTable, "anon") !== null;
  console.log(
    stillWide
      ? `  ..  [알고 있음] supabase_admin 기본권한은 여전히 넓다 (anon=${privsOf(saTable, "anon")}).\n` +
          "        postgres에게 이걸 바꿀 권한이 없다(42501). public 객체는 전부 postgres 소유라 실질 영향 없음."
      : "  ..  supabase_admin 기본권한도 좁혀져 있다 (예상 밖 — 좋은 쪽이다)",
  );
}

// ── 2. 지금 있는 객체 — 도로 넓어지지 않았는가 ─────────────────────────
console.log("\n[2] 지금 있는 객체");
{
  const risky = snap.risky_table_grants ?? [];
  check(
    "어떤 테이블도 anon·authenticated에게 TRUNCATE·REFERENCES·TRIGGER·MAINTAIN을 주지 않는다",
    risky.length === 0,
    `${risky.length}건 — ${risky.slice(0, 6).join(" | ")}${risky.length > 6 ? " …" : ""}`,
  );
}
{
  // 0096 STEP 1이 잠근 4개. SECURITY DEFINER + 인자 미검증 조합이라 열리면 남의 데이터가 샌다.
  const locked = snap.locked_functions ?? {};
  const expected = [
    "current_streak_days",
    "notify_challenge_peek_unlock",
    "is_blocked_between",
    "pending_bug_report_count",
  ];
  check("잠근 함수 4개가 전부 존재한다", expected.every((f) => f in locked), Object.keys(locked).join(","));
  for (const fn of expected) {
    const a = locked[fn] ?? "";
    check(
      `${fn} 이 authenticated에게 안 열려 있다`,
      a !== "" && !a.includes("authenticated=X") && !a.includes("anon=X"),
      `acl=${a || "(없음)"} — 열리면 아무 로그인 사용자가 남의 id를 인자로 넣을 수 있다`,
    );
  }
  check(
    "그래도 service_role은 부를 수 있다 (배지·XP·운동완료·브리핑이 여기 걸려 있다)",
    Object.values(locked).every((a) => String(a).includes("service_role=X")),
    JSON.stringify(locked).slice(0, 200),
  );
}
check(
  "anon EXECUTE 함수가 늘지 않았다",
  snap.anon_execute_functions <= 21,
  `${snap.anon_execute_functions}개 (2026-09-02 기준선 21). 늘었으면 새 함수가 anon에 열린 것이다`,
);

console.log(`\n${pass} 통과 / ${fail} 실패`);
if (fail) {
  console.log("\n■ 넓어진 권한:");
  for (const f of failures) console.log(`   · ${f}`);
}
process.exitCode = fail ? 1 : 0;
