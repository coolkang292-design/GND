/**
 * 익명 계정이 **스스로** 이메일을 붙일 수 있는지 실제로 확인한다.
 *
 * 확인 메일 정책에 따라 결과가 갈린다:
 *   - 즉시 반영  → 앱에서 "연결 완료"라고 말해도 된다
 *   - 확인 대기  → "메일함을 확인하세요"라고 안내해야 하고, SMTP가 필요하다
 *
 * 임시 익명 계정을 하나 만들어 시험하고 **반드시 삭제한다.**
 * 실행: node scripts/email-link-probe.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
// 앱(브라우저)과 같은 조건을 만들려면 세션이 클라이언트에 붙어 있어야 한다.
// persistSession:false면 updateUser가 세션 없이 나가 "email이 비었다"는
// 엉뚱한 오류가 난다. 메모리 저장소를 줘서 실제 앱과 같게 맞춘다.
const memory = new Map();
const client = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      storage: {
        getItem: (k) => memory.get(k) ?? null,
        setItem: (k, v) => void memory.set(k, v),
        removeItem: (k) => void memory.delete(k),
      },
    },
  },
);

// 도메인에 따라 거절될 수 있어 인자로 바꿔 시험할 수 있게 둔다
const probeEmail =
  process.argv[2] ?? `probe-${randomBytes(4).toString("hex")}@example.com`;
let tempId = null;

try {
  // 1) 앱과 똑같이 익명 로그인
  const { data: anon, error: anonErr } = await client.auth.signInAnonymously();
  if (anonErr) throw new Error(`익명 로그인 실패: ${anonErr.message}`);
  tempId = anon.user?.id ?? null;
  console.log(`\n임시 익명 계정 생성: ${tempId}`);

  // 2) 사용자가 앱에서 할 동작 그대로
  const { error: updErr } = await client.auth.updateUser({
    email: probeEmail,
    password: "probe-password-123",
  });

  console.log("\n=== updateUser({ email, password }) 결과 ===");
  if (updErr) {
    console.log(`  ❌ 실패: ${updErr.message}`);
  } else {
    console.log("  ✅ 호출 성공");
  }

  // 3) 서버에 실제로 반영됐는지 확인
  const { data: after } = await admin.auth.admin.getUserById(tempId);
  const u = after?.user;
  console.log("\n=== 서버 상태 ===");
  console.log(`  email             ${u?.email ?? "(없음)"}`);
  console.log(`  email_confirmed   ${u?.email_confirmed_at ?? "❌ 미확인"}`);
  console.log(`  new_email(대기)   ${u?.new_email ?? "(없음)"}`);
  console.log(`  is_anonymous      ${u?.is_anonymous}`);

  console.log("\n=== 결론 ===");
  if (u?.email && u?.email_confirmed_at) {
    console.log("  ✅ 즉시 반영 — 앱에서 자체 이메일 연결이 그대로 된다.");
  } else if (u?.new_email || (u?.email && !u?.email_confirmed_at)) {
    console.log(
      "  ⚠️ 확인 대기 — 확인 메일을 클릭해야 완료된다.\n" +
        "     SMTP를 붙이거나 프로젝트에서 이메일 확인을 꺼야 자체 연결이 매끄럽다.",
    );
  } else {
    console.log("  ❌ 반영 안 됨 — 관리자 스크립트로만 연결 가능하다.");
  }
} finally {
  // 4) 뒷정리 — 실패해도 반드시 지운다
  if (tempId) {
    const { error } = await admin.auth.admin.deleteUser(tempId);
    console.log(
      `\n임시 계정 정리: ${error ? `❌ ${error.message}` : "✅ 삭제됨"}`,
    );
  }
}
