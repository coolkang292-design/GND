/**
 * 관리자 대시보드(/admin) 실 DB 검증 — **읽기 전용**. 쓰기·삭제 없음.
 *
 * 단위 테스트가 못 잡는 것 하나를 잡는다: `src/lib/admin/queries.ts`가 미는
 * 테이블·컬럼명이 실제 스키마와 맞는지. 하나라도 틀리면 /admin이 500이 된다.
 *
 * 실행: node scripts/admin-dashboard-check.mjs
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
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

console.log("\n=== 1. queries.ts가 읽는 테이블·컬럼이 실제로 존재하는가 ===");

// fetchAdminDataset
const sessions = await db
  .from("workout_sessions")
  .select("user_id,status,started_at,completed_at")
  .is("deleted_at", null);
check("workout_sessions(user_id,status,started_at,completed_at,deleted_at)",
  !sessions.error, sessions.error?.message ?? `${sessions.data.length}행`);

const profiles = await db
  .from("profiles")
  .select("id,nickname,avatar_url,created_at");
check("profiles(id,nickname,avatar_url,created_at)",
  !profiles.error, profiles.error?.message ?? `${profiles.data.length}행`);

const progress = await db.from("user_progress").select("user_id,total_xp");
check("user_progress(user_id,total_xp)",
  !progress.error, progress.error?.message ?? `${progress.data.length}행`);

const links = await db.from("crew_links").select("user_a,user_b");
check("crew_links(user_a,user_b)",
  !links.error, links.error?.message ?? `${links.data.length}행`);

const auth = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
check("auth.admin.listUsers",
  !auth.error, auth.error?.message ?? `${auth.data?.users.length}명`);

// fetchActiveChallenges
const challenges = await db
  .from("challenges")
  .select("id,name,end_date,group_id")
  .eq("status", "active");
check("challenges(id,name,end_date,group_id) status=active",
  !challenges.error, challenges.error?.message ?? `${challenges.data.length}건`);

const members = await db.from("group_members").select("group_id,user_id");
check("group_members(group_id,user_id)",
  !members.error, members.error?.message ?? `${members.data.length}행`);

// fetchGrowthDataset
const xp = await db.from("xp_transactions").select("reason,amount");
check("xp_transactions(reason,amount)",
  !xp.error, xp.error?.message ?? `${xp.data.length}행`);

const points = await db
  .from("point_transactions")
  .select("amount,transaction_type");
check("point_transactions(amount,transaction_type)",
  !points.error, points.error?.message ?? `${points.data.length}행`);

const wallet = await db.from("user_wallet").select("balance");
check("user_wallet(balance)",
  !wallet.error, wallet.error?.message ?? `${wallet.data.length}행`);

const badges = await db.from("user_badges").select("badge_key");
check("user_badges(badge_key)",
  !badges.error, badges.error?.message ?? `${badges.data.length}행`);

const badgeDefs = await db
  .from("badge_definitions")
  .select("badge_key,rarity");
check("badge_definitions(badge_key,rarity)",
  !badgeDefs.error, badgeDefs.error?.message ?? `${badgeDefs.data.length}종`);

console.log("\n=== 2. ADMIN_USER_IDS가 실재하는 계정인가 ===");
const adminIds = (env.ADMIN_USER_IDS ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
check("ADMIN_USER_IDS 설정됨", adminIds.length > 0,
  adminIds.length === 0 ? "비어 있음 — 전원 404가 된다" : `${adminIds.length}개`);
for (const id of adminIds) {
  const p = (profiles.data ?? []).find((x) => x.id === id);
  check(`  ${id.slice(0, 8)}… 계정 존재`, Boolean(p), p ? p.nickname : "profiles에 없음");
}

console.log("\n=== 3. 대시보드가 보여줄 실제 숫자 (미리보기) ===");
const completed = (sessions.data ?? []).filter((s) => s.status === "completed");
const now = new Date();
const d28 = new Date(now.getTime() - 28 * 86_400_000);
const recent = completed.filter((s) => new Date(s.completed_at) >= d28);
const byStatus = {};
for (const s of sessions.data ?? []) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;

console.log(`  auth 계정            ${auth.data?.users.length}명`);
console.log(`  프로필               ${profiles.data?.length}명`);
console.log(`  세션 status 분포     ${JSON.stringify(byStatus)}`);
console.log(`  완료 세션(전체)      ${completed.length}건`);
console.log(`  완료 세션(최근 28일) ${recent.length}건`);
console.log(`  최근 28일 활성 사용자 ${new Set(recent.map((s) => s.user_id)).size}명`);
console.log(`  크루 연결            ${links.data?.length ?? 0}쌍`);
console.log(`  진행 중 챌린지       ${challenges.data?.length ?? 0}건`);
console.log(`  배지 정의 / 획득     ${badgeDefs.data?.length ?? 0}종 / ${badges.data?.length ?? 0}건`);

console.log("\n=== 4. 앱 화면과 대조할 값 (사용자별) ===");
console.log("  아래 스트릭·레벨이 앱의 홈 🔥 / 내 정보와 같아야 한다.");
const xpBy = new Map((progress.data ?? []).map((r) => [r.user_id, r.total_xp]));
for (const p of profiles.data ?? []) {
  const mine = completed
    .filter((s) => s.user_id === p.id)
    .map((s) => new Date(s.completed_at))
    .sort((a, b) => b - a);
  const last = mine[0];
  const days = mine.length === 0 ? null
    : Math.floor((now - last) / 86_400_000);
  console.log(
    `  ${p.nickname.padEnd(12)} 완료 ${String(mine.length).padStart(3)}건 · ` +
    `누적 ${String(xpBy.get(p.id) ?? 0).padStart(5)} XP · ` +
    `마지막 ${last ? last.toISOString().slice(0, 10) : "없음"}` +
    ` · 경과 ${days === null ? "-" : days + "일"}`,
  );
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
if (fail > 0) {
  console.log("❌ 실패가 있으면 /admin이 500이 난다. 배포 전에 고칠 것.");
  process.exit(1);
}
console.log("✅ queries.ts의 모든 조회가 실 스키마와 맞는다.");
