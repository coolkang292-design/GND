/**
 * 익명 계정에 이메일+비밀번호를 붙여 **영구 계정으로 승격**한다.
 *
 * uid가 바뀌지 않으므로 기록·XP·배지·크루 연결이 전부 그대로 유지된다.
 * 데이터 이관이 아니다 — 같은 계정에 로그인 수단만 추가하는 것이다.
 *
 * 쓰는 때: 세션이 끊겨 앱에서 스스로 연결할 수 없는 계정을 서버에서 구제할 때.
 * (세션이 살아있는 사용자는 앱의 "계정 연결" 화면으로 직접 하는 편이 낫다.)
 *
 * 실행:
 *   node scripts/link-email-to-account.mjs <uid> <email>            # 미리보기
 *   node scripts/link-email-to-account.mjs <uid> <email> --apply    # 실제 적용
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const [, , uid, email, ...flags] = process.argv;
const apply = flags.includes("--apply");

if (!uid || !email) {
  console.error(
    "사용법: node scripts/link-email-to-account.mjs <uid> <email> [--apply]",
  );
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

const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// ── 1. 대상 계정이 실재하는지, 무엇을 들고 있는지 먼저 보여준다 ──────────
const { data: got, error: getErr } = await db.auth.admin.getUserById(uid);
if (getErr || !got?.user) {
  console.error(`❌ 계정을 찾을 수 없다: ${uid} (${getErr?.message ?? "없음"})`);
  process.exit(1);
}

const { data: profile } = await db
  .from("profiles")
  .select("nickname,created_at")
  .eq("id", uid)
  .maybeSingle();

const { count: sessionCount } = await db
  .from("workout_sessions")
  .select("*", { count: "exact", head: true })
  .eq("user_id", uid)
  .eq("status", "completed")
  .is("deleted_at", null);

const { data: progress } = await db
  .from("user_progress")
  .select("total_xp")
  .eq("user_id", uid)
  .maybeSingle();

console.log("\n=== 대상 계정 ===");
console.log(`  uid          ${uid}`);
console.log(`  닉네임        ${profile?.nickname ?? "(프로필 없음)"}`);
console.log(`  익명 계정      ${got.user.is_anonymous ? "예" : "아니오"}`);
console.log(`  현재 이메일    ${got.user.email ?? "(없음)"}`);
console.log(`  완료 운동      ${sessionCount ?? 0}건`);
console.log(`  누적 XP       ${progress?.total_xp ?? 0}`);
console.log(`\n  붙일 이메일    ${email}`);

if (got.user.email && got.user.email !== email) {
  console.error(
    `\n❌ 이미 다른 이메일(${got.user.email})이 붙어 있다. 덮어쓰지 않는다.`,
  );
  process.exit(1);
}

if (!apply) {
  console.log("\n미리보기다. 실제로 적용하려면 --apply 를 붙여 다시 실행할 것.");
  process.exit(0);
}

// ── 2. 적용 ────────────────────────────────────────────────────────────
// email_confirm: true — 확인 메일 없이 즉시 쓸 수 있게 한다(SMTP 미설정 환경).
const password = randomBytes(12).toString("base64url");

const { error: updErr } = await db.auth.admin.updateUserById(uid, {
  email,
  password,
  email_confirm: true,
});

if (updErr) {
  console.error(`\n❌ 실패: ${updErr.message}`);
  process.exit(1);
}

// ── 3. uid가 안 바뀌었고 데이터가 그대로인지 확인 ───────────────────────
const { data: after } = await db.auth.admin.getUserById(uid);
const { count: afterSessions } = await db
  .from("workout_sessions")
  .select("*", { count: "exact", head: true })
  .eq("user_id", uid)
  .eq("status", "completed")
  .is("deleted_at", null);

console.log("\n=== 적용 결과 ===");
console.log(`  uid 유지       ${after?.user?.id === uid ? "✅" : "❌ 바뀜!"}`);
console.log(`  이메일         ${after?.user?.email}`);
console.log(
  `  완료 운동      ${afterSessions ?? 0}건 ${afterSessions === sessionCount ? "✅ 그대로" : "❌ 달라짐!"}`,
);
console.log(`\n  임시 비밀번호   ${password}`);
console.log("\n  로그인 후 반드시 비밀번호를 바꿀 것.");
