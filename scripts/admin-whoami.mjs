/**
 * 관리자 허용목록에 넣을 계정을 고르기 위한 조회 — **읽기 전용**.
 *
 * auth.users를 최근 로그인 순으로 보여준다. PC 브라우저에서 앱을 막 연 뒤
 * 실행하면 맨 위가 그 브라우저의 계정이다.
 *
 * 실행: node scripts/admin-whoami.mjs
 */
import { createClient } from "@supabase/supabase-js";
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

const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: auth, error } = await db.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (error) throw error;

const { data: profiles } = await db.from("profiles").select("id,nickname");
const nickOf = new Map((profiles ?? []).map((p) => [p.id, p.nickname]));

const allow = new Set(
  (env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
);

const rows = [...auth.users].sort(
  (a, b) =>
    new Date(b.last_sign_in_at ?? b.created_at) -
    new Date(a.last_sign_in_at ?? a.created_at),
);

console.log("\n최근 로그인 순 (맨 위 = 가장 최근에 앱을 연 브라우저)\n");
console.log(
  "  " +
    "UID".padEnd(38) +
    "닉네임".padEnd(16) +
    "마지막 로그인".padEnd(20) +
    "관리자",
);
console.log("  " + "-".repeat(84));
for (const u of rows) {
  const nick = nickOf.get(u.id) ?? "(프로필 없음)";
  const last = (u.last_sign_in_at ?? u.created_at ?? "").slice(0, 16).replace("T", " ");
  console.log(
    "  " +
      u.id.padEnd(38) +
      nick.padEnd(16) +
      last.padEnd(20) +
      (allow.has(u.id) ? "✅" : ""),
  );
}
console.log(
  "\n관리자로 열고 싶은 브라우저의 계정 UID를 ADMIN_USER_IDS에 쉼표로 추가하면 된다.\n",
);
