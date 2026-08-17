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
  if (ok) pass++;
  else fail++;
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
  .select("id,nickname,avatar_url,created_at,invite_code");
check("profiles(id,nickname,avatar_url,created_at,invite_code)",
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

const participants = await db
  .from("challenge_participants")
  .select("challenge_id,status")
  .in("status", ["joined", "dropped"]);
check("challenge_participants(challenge_id,status) status in joined,dropped",
  !participants.error, participants.error?.message ?? `${participants.data.length}행`);

for (const challenge of challenges.data ?? []) {
  const periodSessions = await db.rpc("get_challenge_period_sessions", {
    p_challenge_id: challenge.id,
  });
  check(
    `get_challenge_period_sessions(${challenge.id.slice(0, 8)}…)`,
    !periodSessions.error && Array.isArray(periodSessions.data),
    periodSessions.error?.message ?? `${periodSessions.data.length}행`,
  );
}

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

// fetchProgramDataset (2026-08-17)
const enrollments = await db
  .from("program_enrollments")
  .select(
    "id,user_id,program_key,title_snapshot,status,created_at,completed_at,cancelled_at",
  );
check(
  "program_enrollments(id,user_id,program_key,title_snapshot,status,created_at,completed_at,cancelled_at)",
  !enrollments.error,
  enrollments.error?.message ?? `${enrollments.data.length}행`,
);

const programSessions = await db
  .from("workout_sessions")
  .select("program_enrollment_id,completed_at")
  .not("program_enrollment_id", "is", null)
  .is("deleted_at", null);
check("workout_sessions(program_enrollment_id) — 0067에서 추가된 컬럼",
  !programSessions.error,
  programSessions.error?.message ?? `${programSessions.data.length}행`);

// fetchEngagementDataset (2026-08-17)
const ENGAGEMENT_TYPES = [
  "workout_suggestion",
  "morning_briefing",
  "challenge_peek_unlocked",
];
const notifications = await db
  .from("notifications")
  .select("user_id,type,created_at,read_at")
  .in("type", ENGAGEMENT_TYPES);
check("notifications(user_id,type,created_at,read_at) in 대시보드 유형",
  !notifications.error,
  notifications.error?.message ?? `${notifications.data.length}행`);

const recordViews = await db
  .from("record_views")
  .select("id", { count: "exact", head: true });
check("record_views 개수 질의(head:true)",
  !recordViews.error, recordViews.error?.message ?? `${recordViews.count}행`);

const peekPicks = await db
  .from("challenge_peek_picks")
  .select("viewer_id", { count: "exact", head: true });
check("challenge_peek_picks 개수 질의(head:true)",
  !peekPicks.error, peekPicks.error?.message ?? `${peekPicks.count}행`);

console.log("\n=== 2. ADMIN_USER_IDS가 실재하는 계정인가 ===");
const adminIds = (env.ADMIN_USER_IDS ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
check("ADMIN_USER_IDS 설정됨", adminIds.length > 0,
  adminIds.length === 0 ? "비어 있음 — 전원 404가 된다" : `${adminIds.length}개`);
// 관리자가 프로필을 가질 필요는 없다 — /admin은 프로필을 요구하지 않고,
// 익명 계정으로 접속하는 브라우저는 프로필이 없는 것이 정상이다. 참고 표시만 한다.
for (const id of adminIds) {
  const p = (profiles.data ?? []).find((x) => x.id === id);
  const known = (auth.data?.users ?? []).some((u) => u.id === id);
  check(
    `  ${id.slice(0, 8)}… auth 계정 존재`,
    known,
    p ? `프로필: ${p.nickname}` : "프로필 없음(정상 — 관리자에 프로필 불필요)",
  );
}

console.log("\n=== 3. 대시보드가 보여줄 실제 숫자 (미리보기) ===");
console.log("  ⚠️ 아래 숫자는 **DB 전체**다. /admin은 2026-08-17부터 테스트 계정을 빼고 그린다.");
console.log("     그래서 화면 숫자가 더 작은 것이 정상이다. 제외 대상은 섹션 5 참조.");
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

// 새 패널 3종이 화면에 낼 숫자 — /admin을 눈으로 볼 때 이 값과 대조한다
const enrollByStatus = {};
for (const e of enrollments.data ?? []) {
  enrollByStatus[e.status] = (enrollByStatus[e.status] ?? 0) + 1;
}
const enrollByProgram = {};
for (const e of enrollments.data ?? []) {
  enrollByProgram[e.program_key] = (enrollByProgram[e.program_key] ?? 0) + 1;
}
const notifyByType = {};
const notifyReadByType = {};
for (const n of notifications.data ?? []) {
  notifyByType[n.type] = (notifyByType[n.type] ?? 0) + 1;
  if (n.read_at) notifyReadByType[n.type] = (notifyReadByType[n.type] ?? 0) + 1;
}
console.log(`  프로그램 등록        ${enrollments.data?.length ?? 0}건 ${JSON.stringify(enrollByStatus)}`);
console.log(`  프로그램별 등록      ${JSON.stringify(enrollByProgram)}`);
console.log(`  프로그램 회차 행     ${programSessions.data?.length ?? 0}행 (완료 ${(programSessions.data ?? []).filter((s) => s.completed_at).length}건)`);
for (const type of ENGAGEMENT_TYPES) {
  console.log(`  알림 ${type.padEnd(24)} ${String(notifyByType[type] ?? 0).padStart(4)}건 · 열람 ${notifyReadByType[type] ?? 0}건`);
}
console.log(`  꾸준왕 열람 사용     ${recordViews.count ?? 0}회`);
console.log(`  챌린지 대상 선택     ${peekPicks.count ?? 0}회`);
console.log(`  초대코드 보유 프로필 ${(profiles.data ?? []).filter((p) => p.invite_code).length}명 / ${profiles.data?.length ?? 0}명`);

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

console.log("\n=== 5. /admin이 집계에서 빼는 계정 (2026-08-17~) ===");
console.log("  판정 규칙은 src/lib/domain/analytics-accounts.ts와 같아야 한다.");
const emailById = new Map((auth.data?.users ?? []).map((u) => [u.id, (u.email ?? "").toLowerCase()]));
const manualIds = (env.ANALYTICS_EXCLUDED_USER_IDS ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const reasonOf = (p) => {
  if (manualIds.includes(p.id)) return "수동 제외 목록";
  if ((emailById.get(p.id) ?? "").endsWith("@gnd.local")) return "픽스처 계정";
  if ((p.nickname ?? "").trim().toLowerCase() === "test") return "테스트 닉네임";
  return null;
};
const excluded = (profiles.data ?? []).filter((p) => reasonOf(p));
const testIds = new Set(excluded.map((p) => p.id));
for (const p of excluded) {
  const mine = (sessions.data ?? []).filter((s) => s.user_id === p.id);
  console.log(
    `  · ${p.nickname.padEnd(12)} ${reasonOf(p).padEnd(8)} 운동 ${String(mine.length).padStart(3)}건 · ` +
    `프로그램 ${(enrollments.data ?? []).filter((e) => e.user_id === p.id).length}건`,
  );
}
const anonNoProfile = (auth.data?.users ?? []).filter(
  (u) => !(profiles.data ?? []).some((p) => p.id === u.id),
).length;
console.log(`  · 프로필 없는 익명 계정 ${anonNoProfile}개 (가입 퍼널에서 제외)`);
console.log("\n  ── 화면에 떠야 하는 값 (테스트 제외 후) ──");
const realProfiles = (profiles.data ?? []).filter((p) => !testIds.has(p.id));
const realEnroll = (enrollments.data ?? []).filter((e) => !testIds.has(e.user_id));
const realLinks = (links.data ?? []).filter(
  (l) => !testIds.has(l.user_a) && !testIds.has(l.user_b),
);
const realEnrollByStatus = {};
for (const e of realEnroll) realEnrollByStatus[e.status] = (realEnrollByStatus[e.status] ?? 0) + 1;
console.log(`  실사용자            ${realProfiles.length}명 (${realProfiles.map((p) => p.nickname).join(", ")})`);
console.log(`  프로그램 등록        ${realEnroll.length}건 ${JSON.stringify(realEnrollByStatus)}`);
console.log(`  크루 연결            ${realLinks.length}쌍`);
console.log(
  `  완료 세션            ${(sessions.data ?? []).filter((s) => s.status === "completed" && !testIds.has(s.user_id)).length}건`,
);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
if (fail > 0) {
  console.log("❌ 실패가 있으면 /admin이 500이 난다. 배포 전에 고칠 것.");
  process.exit(1);
}
console.log("✅ queries.ts의 모든 조회가 실 스키마와 맞는다.");
