/**
 * 이메일 로그인이 왜 안 되는지 서버에서 그대로 재현한다 — 읽기 전용.
 * 실행: node scripts/login-diagnose.mjs <email> <password>
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("사용법: node scripts/login-diagnose.mjs <email> <password>");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l.slice(i + 1).trim().replace(/^["']|["']$/g, ""),
      ];
    }),
);

// 1) 계정 상태를 service_role로 확인
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
const user = (list?.users ?? []).find((u) => u.email === email);

console.log("\n=== 계정 상태 ===");
if (!user) {
  console.log(`  ❌ 이메일 ${email} 인 계정이 없다`);
  process.exit(1);
}
console.log(`  uid              ${user.id}`);
console.log(`  email            ${user.email}`);
console.log(`  email_confirmed  ${user.email_confirmed_at ?? "❌ 미확인"}`);
console.log(`  is_anonymous     ${user.is_anonymous}`);
console.log(
  `  identities       ${(user.identities ?? []).map((i) => i.provider).join(", ") || "(없음)"}`,
);

// 2) 앱과 같은 anon 키로 실제 로그인 시도
console.log("\n=== 실제 로그인 시도 (앱과 동일한 anon 키) ===");
const client = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);
const { data, error } = await client.auth.signInWithPassword({
  email,
  password,
});

if (error) {
  console.log(`  ❌ 실패: ${error.message}`);
  console.log(`     status=${error.status} code=${error.code ?? "-"}`);
  console.log("\n  해석:");
  if (/email logins are disabled|not enabled/i.test(error.message)) {
    console.log(
      "  → Supabase 프로젝트에서 Email 로그인 제공자가 꺼져 있다.\n" +
        "     Authentication → Sign In / Providers → Email 을 켜야 한다.",
    );
  } else if (/invalid login credentials/i.test(error.message)) {
    console.log(
      "  → 이메일/비밀번호 불일치, 또는 이 계정에 password identity가 없다.\n" +
        "     위 identities 목록을 확인할 것.",
    );
  } else if (/email not confirmed/i.test(error.message)) {
    console.log("  → 이메일 미확인. email_confirm 을 켜서 다시 설정해야 한다.");
  }
  process.exit(1);
}

console.log(`  ✅ 성공 — uid ${data.user?.id}`);
console.log(`     is_anonymous=${data.user?.is_anonymous}`);
