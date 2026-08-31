/**
 * 익명 → 정식 계정 승격 직후 **JWT가 실제로 갱신되는지** 확인한다.
 *
 * 왜 이게 최우선인가: GND는 익명 계정에 카카오·구글을 붙여 **그 자리에서**
 * 승격시킨다(계정 id가 안 바뀐다). 그런데 JWT는 발급 시점에 굳는다.
 * 승격 뒤에도 옛 토큰이 `is_anonymous: true`를 들고 있으면,
 * `is_anonymous`로 막는 RLS는 **정식 가입한 사람을 익명으로 오인해서 막는다.**
 * 그 상태로 배포하면 가입한 사용자가 기능을 못 쓴다.
 *
 * 실행: node scripts/anon-upgrade-jwt-check.mjs
 *
 * ⚠️ 익명 계정 1개를 만들고 끝나면 지운다. 실사용자를 건드리지 않는다.
 * ⚠️ 카카오·구글 왕복은 자동화할 수 없어서 **이메일 신원 연결**로 검증한다.
 *    Supabase가 익명 계정을 승격시키는 경로는 같다(identity가 붙으면
 *    `is_anonymous`가 false가 되고 새 토큰이 발급된다).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL_, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
const check = (label, ok, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label} ${detail}`);
  }
};

/** JWT 페이로드만 꺼낸다 — 서명 검증은 서버 몫이라 여기서는 안 한다 */
function claims(token) {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

let userId = null;

try {
  console.log("익명 → 정식 승격 시 JWT 갱신 검증\n");

  // ── 1. 익명 가입 ──────────────────────────────────────────────────────────
  const signup = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: "{}",
  }).then((r) => r.json());
  if (!signup.access_token) throw new Error("익명 가입 실패: " + JSON.stringify(signup));
  userId = signup.user.id;

  const before = claims(signup.access_token);
  console.log("[1] 익명 가입 직후 토큰");
  check("JWT에 is_anonymous 클레임이 있다", "is_anonymous" in before, JSON.stringify(Object.keys(before)));
  check("is_anonymous = true", before.is_anonymous === true, String(before.is_anonymous));
  check("role = authenticated (익명도 authenticated다)", before.role === "authenticated", String(before.role));
  console.log(`      sub=${before.sub?.slice(0, 8)}… role=${before.role} is_anonymous=${before.is_anonymous}`);

  // ── 2. 이메일 신원을 붙여 승격 ────────────────────────────────────────────
  /*
    카카오·구글 왕복은 자동화할 수 없다. 그래서 **서버 쪽에서** 이메일 신원을
    붙여 승격시킨다(admin API). 확인하려는 것은 "어떻게 승격했나"가 아니라
    **승격된 뒤 클라이언트 토큰이 그 사실을 반영하나**이므로 경로가 달라도 된다.
  */
  const email = `zzjwt-${userId.slice(0, 8)}@example.com`;
  const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });

  console.log("\n[2] 이메일 신원 연결 (승격)");
  check("승격 요청이 오류를 내지 않았다", !updErr, updErr?.message ?? "");

  // DB에서 실제 상태를 본다 — 토큰이 아니라 서버가 뭐라고 하는지.
  const { data: got } = await admin.auth.admin.getUserById(userId);
  const serverAnon = got?.user?.is_anonymous;
  const identityCount = got?.user?.identities?.length ?? 0;
  check("서버 기준 is_anonymous = false (승격됨)", serverAnon === false, String(serverAnon));
  check("identity가 붙었다", identityCount >= 1, String(identityCount));

  // ── 3. 옛 토큰은 어떤가 (갱신 전) ─────────────────────────────────────────
  const stale = claims(signup.access_token);
  console.log("\n[3] ⚠️ 갱신하지 않은 옛 토큰");
  console.log(`      is_anonymous=${stale.is_anonymous}  ← 승격 전 값이 그대로다`);
  check(
    "옛 토큰은 여전히 is_anonymous=true다 (JWT는 발급 시점에 굳는다)",
    stale.is_anonymous === true,
    String(stale.is_anonymous),
  );

  // ── 4. 토큰을 갱신하면? ───────────────────────────────────────────────────
  const refreshed = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: signup.refresh_token }),
  }).then((r) => r.json());

  console.log("\n[4] refresh_token으로 갱신한 토큰");
  if (!refreshed.access_token) {
    check("토큰 갱신 성공", false, JSON.stringify(refreshed).slice(0, 160));
  } else {
    const after = claims(refreshed.access_token);
    console.log(`      is_anonymous=${after.is_anonymous}`);
    check(
      "⚠️⚠️ 갱신하면 is_anonymous = false가 된다",
      after.is_anonymous === false,
      String(after.is_anonymous),
    );
    check("같은 사용자다 (계정이 갈리지 않았다)", after.sub === before.sub, `${after.sub} vs ${before.sub}`);
  }

  // ── 5. 갱신된 토큰으로 RLS가 정식으로 보는가 ──────────────────────────────
  if (refreshed.access_token) {
    const probe = await fetch(`${URL_}/rest/v1/profiles?select=id&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${refreshed.access_token}` },
    });
    check("갱신 토큰이 실제로 유효하다 (REST가 받아들인다)", probe.status < 400, `HTTP ${probe.status}`);
  }
} finally {
  if (userId) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    console.log(`\n[정리] 테스트 계정 삭제`);
  }
  console.log(`\n${"─".repeat(52)}\n통과 ${passed} · 실패 ${failed}`);
}

process.exit(failed > 0 ? 1 : 0);
