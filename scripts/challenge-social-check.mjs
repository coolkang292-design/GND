/**
 * 영구 크루 vs 챌린지 임시 소셜 — 실 DB 검증 (0095).
 *
 * 무엇을 지키나:
 *   친구 데려오기 링크 → 영구 크루 O
 *   챌린지 초대 링크   → 영구 크루 X · 챌린지 참가 O · invited_by O
 *   active 동안만 임시 소셜(활동 피드·응원) · ended면 자동 종료
 *   추천 계보(invited_by)는 crew_links 없이도 이어진다
 *
 * 실행: node scripts/challenge-social-check.mjs
 *
 * ⚠️ 익명 계정 4개를 만들고 끝나면 지운다. 실사용자를 건드리지 않는다.
 * ⚠️ 챌린지는 service_role로 직접 만든다 — start_challenge는 전원 목표·동의를
 *    요구해서 상태 전이만 보려는 이 검증에는 과하다.
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
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label}  ${detail}`);
  }
}
const section = (s) => console.log(`\n${s}`);

/**
 * 테스트 사용자 = **정식 계정**으로 만든다.
 *
 * ⚠️⚠️ 익명으로 두면 0094가 초대 발행·크루 요청·챌린지 생성을 막아서
 *    이 검증이 "제품이 고장났다"로 잘못 읽힌다. 여기서 보려는 것은
 *    **영구 크루 vs 임시 소셜**이지 익명 게이트가 아니다.
 *    (익명 게이트는 scripts/anon-capability-probe.mjs가 따로 본다)
 *
 * 승격은 서버에서 하고 **토큰을 갱신한다** — 갱신 안 하면 옛 토큰이
 * is_anonymous=true를 들고 있어 0094에 걸린다(0094 주석 참조).
 */
async function permanentUser(nick) {
  const r = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: "{}",
  }).then((x) => x.json());
  if (!r.access_token) throw new Error("가입 실패: " + JSON.stringify(r));

  await admin.auth.admin.updateUserById(r.user.id, {
    email: `${nick}@example.com`,
    email_confirm: true,
  });
  const fresh = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: r.refresh_token }),
  }).then((x) => x.json());
  if (!fresh.access_token) throw new Error("토큰 갱신 실패: " + JSON.stringify(fresh));

  const { error } = await admin.from("profiles").insert({
    id: r.user.id,
    nickname: nick,
    avatar_url: "🦍",
    weekly_goal: 3,
  });
  if (error) throw new Error(`프로필 실패(${nick}): ${error.message}`);
  return { id: r.user.id, token: fresh.access_token };
}

async function rpc(token, name, args) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args ?? {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* empty */
  }
  return { status: res.status, json, text: text.slice(0, 140) };
}

const crewCount = async (a, b) =>
  (
    await admin
      .from("crew_links")
      .select("user_a", { count: "exact", head: true })
      .or(`and(user_a.eq.${a < b ? a : b},user_b.eq.${a < b ? b : a})`)
  ).count ?? 0;

const made = [];
let challengeId = null;
let groupId = null;

try {
  const stamp = Date.now().toString(36).slice(-4);
  const A = await permanentUser(`zzcs-a-${stamp}`); // 링크 주인 / 방장
  const B = await permanentUser(`zzcs-b-${stamp}`); // 친구 링크로 들어온 사람
  const C = await permanentUser(`zzcs-c-${stamp}`); // 챌린지 링크로 들어온 사람
  const D = await permanentUser(`zzcs-d-${stamp}`); // 아무 관계 없는 사람
  made.push(A, B, C, D);

  /* ── 시나리오 A · B — 친구 데려오기 링크는 영구 크루를 만든다 ───────────── */
  section("[A] 친구 데려오기 링크 → 영구 크루");
  const codeRes = await rpc(A.token, "issue_my_invite_code", {});
  const friendCode = codeRes.json;
  check("A가 초대 코드를 발급받는다", typeof friendCode === "string", codeRes.text);

  const accept = await rpc(B.token, "accept_friend_invite", { p_code: friendCode });
  check("B가 친구 링크를 수락한다", accept.status === 200, accept.text);
  check("A↔B crew_links가 생긴다 (영구 크루)", (await crewCount(A.id, B.id)) === 1);
  const { data: bProf } = await admin
    .from("profiles").select("invited_by").eq("id", B.id).single();
  check("B.invited_by = A", bProf.invited_by === A.id, String(bProf.invited_by));

  /* ── 챌린지 준비 (service_role로 직접 만든다) ───────────────────────────── */
  const { data: g } = await admin
    .from("groups")
    .insert({ name: `zzcs-${stamp}`, invite_code: `GNDZ${stamp.toUpperCase()}`, owner_id: A.id })
    .select().single();
  groupId = g.id;
  await admin.from("group_members").insert({ group_id: groupId, user_id: A.id, role: "owner" });

  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const { data: ch } = await admin
    .from("challenges")
    .insert({
      group_id: groupId,
      name: `zzcs-${stamp}`,
      start_date: iso(new Date(today.getTime() - 86400000)),
      end_date: iso(new Date(today.getTime() + 6 * 86400000)),
      photo_required: false,
      created_by: A.id,
      invite_code: `GND-Z${stamp.toUpperCase()}`,
      status: "setup",
    })
    .select().single();
  challengeId = ch.id;
  await admin.from("challenge_participants").insert({
    challenge_id: challengeId, user_id: A.id, role: "host", status: "joined", joined_at: new Date().toISOString(),
  });

  /* ── 시나리오 C — 챌린지 링크(신규)는 영구 크루를 만들지 않는다 ─────────── */
  section("[C] 챌린지 초대 링크(신규) → 참가 O · 영구 크루 X");
  const join = await rpc(C.token, "join_challenge_as_newcomer", {
    p_code: ch.invite_code, p_inviter: A.id,
  });
  check("C가 챌린지에 참가한다", join.status === 200, join.text);
  check("⚠️ crewLinked = 0을 돌려준다", join.json?.crewLinked === 0, JSON.stringify(join.json).slice(0, 90));

  const { count: cPart } = await admin
    .from("challenge_participants")
    .select("user_id", { count: "exact", head: true })
    .eq("challenge_id", challengeId).eq("user_id", C.id).eq("status", "joined");
  check("C가 joined 참가자다", cPart === 1, String(cPart));
  check("⚠️⚠️ A↔C crew_links가 생기지 않는다", (await crewCount(A.id, C.id)) === 0);

  const { data: cProf } = await admin
    .from("profiles").select("invited_by").eq("id", C.id).single();
  check("⚠️ C.invited_by = A (계보는 남는다)", cProf.invited_by === A.id, String(cProf.invited_by));

  /* ── 시나리오 L — 계보가 crew_links 없이도 이어진다 ─────────────────────── */
  section("[L] 추천 계보 — crew_links 없이도 이어진다");
  await admin.from("profiles")
    .update({ acquisition_source: "instagram", acquisition_medium: "creator",
              acquisition_campaign: "zzcs_influencer", acquisition_captured_at: new Date().toISOString() })
    .eq("id", A.id);
  const { data: chain } = await admin
    .from("profiles").select("id,invited_by,acquisition_campaign").in("id", [A.id, C.id]);
  const byId = Object.fromEntries(chain.map((p) => [p.id, p]));
  check("A의 캠페인이 뿌리다", byId[A.id].acquisition_campaign === "zzcs_influencer");
  check("C는 자기 캠페인이 없다 (덮어쓰지 않았다)", byId[C.id].acquisition_campaign === null);
  check("⚠️ C → A로 거슬러 올라가 뿌리를 찾을 수 있다", byId[C.id].invited_by === A.id);

  /* ── 시나리오 E — setup에서는 임시 소셜이 닫혀 있다 ─────────────────────── */
  section("[E-0] setup 단계 — 임시 소셜은 아직 닫힘");
  let act = await rpc(C.token, "get_challenge_activity", { p_challenge_id: challengeId });
  check("setup이면 활동 피드가 막힌다", act.status >= 400 && /challenge_not_found/.test(act.text), act.text);

  /* ── active로 전이 ─────────────────────────────────────────────────────── */
  await admin.from("challenges").update({ status: "active" }).eq("id", challengeId);

  section("[E] active — 비크루끼리 임시 소셜이 열린다");
  const share = await rpc(C.token, "shares_active_challenge_with", { p_other: A.id });
  check("C와 A는 active 챌린지를 공유한다", share.json === true, share.text);
  check("⚠️ 둘은 여전히 크루가 아니다", (await crewCount(A.id, C.id)) === 0);

  // A가 운동을 시작하고 끝낸다 (챌린지 기간 안)
  /*
    ⚠️ 응원은 **운동 중(active)** 세션에만 보낼 수 있다(send_cheer의 not_active).
       완료된 세션으로 시험하면 권한이 아니라 상태에 걸려 결과를 오독한다.
  */
  const { data: sess } = await admin.from("workout_sessions")
    .insert({ user_id: A.id, timezone: "Asia/Seoul", visibility: "group",
              status: "active", started_at: new Date().toISOString() })
    .select().single();

  act = await rpc(C.token, "get_challenge_activity", { p_challenge_id: challengeId });
  const rows = Array.isArray(act.json) ? act.json : [];
  check("C가 활동 피드에서 A의 운동을 본다", rows.some((r) => r.session_id === sess.id), act.text.slice(0, 80));
  const row = rows.find((r) => r.session_id === sess.id);
  check("⚠️ 개인정보는 최소만 온다 (이메일·유입 없음)",
    row != null && !("email" in row) && !("acquisition_campaign" in row) && !("invite_code" in row));

  const cheer = await rpc(C.token, "send_cheer", { p_session_id: sess.id, p_cheer_type: "fire" });
  check("⚠️ 비크루인데 응원이 된다 (active 챌린지 덕분)", cheer.status === 200, cheer.text);

  /* ── 시나리오 K — 무관한 사용자는 아무것도 못 한다 ─────────────────────── */
  section("[K] 무관한 사용자 D");
  const dAct = await rpc(D.token, "get_challenge_activity", { p_challenge_id: challengeId });
  check("D는 활동 피드에 접근 못 한다", dAct.status >= 400, dAct.text.slice(0, 60));
  const dCheer = await rpc(D.token, "send_cheer", { p_session_id: sess.id, p_cheer_type: "fire" });
  check("D는 응원 못 한다", dCheer.status >= 400 && /session_not_found/.test(dCheer.text), dCheer.text.slice(0, 60));
  const dShare = await rpc(D.token, "shares_active_challenge_with", { p_other: A.id });
  check("D는 active 챌린지를 공유하지 않는다", dShare.json === false, dShare.text);

  /* ── 시나리오 F — ended면 임시 소셜이 자동으로 닫힌다 ──────────────────── */
  section("[F] ended — 임시 소셜 자동 종료");
  await admin.from("challenges").update({ status: "ended" }).eq("id", challengeId);

  const endShare = await rpc(C.token, "shares_active_challenge_with", { p_other: A.id });
  check("⚠️ ended면 임시 권한이 false가 된다", endShare.json === false, endShare.text);
  const endAct = await rpc(C.token, "get_challenge_activity", { p_challenge_id: challengeId });
  check("ended면 활동 피드가 막힌다", endAct.status >= 400, endAct.text.slice(0, 60));

  /*
    ⚠️ 한 사람에게 진행 중(active) 운동은 하나뿐이다 — 앞 세션을 끝내고 새로 만든다.
       이걸 안 하면 insert가 조용히 null을 주고 다음 줄에서 크래시한다(2026-08-31).
  */
  await admin.from("workout_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", sess.id);
  const { data: sess2, error: s2err } = await admin.from("workout_sessions")
    .insert({ user_id: A.id, timezone: "Asia/Seoul", visibility: "group",
              status: "active", started_at: new Date().toISOString() })
    .select().single();
  if (!sess2) throw new Error("두 번째 세션 생성 실패: " + (s2err?.message ?? "unknown"));
  const endCheer = await rpc(C.token, "send_cheer", { p_session_id: sess2.id, p_cheer_type: "fire" });
  check("ended면 새 응원이 막힌다", endCheer.status >= 400 && /session_not_found/.test(endCheer.text), endCheer.text.slice(0, 60));

  const { count: keptCheers } = await admin
    .from("cheers").select("id", { count: "exact", head: true }).eq("session_id", sess.id);
  check("⚠️ 이미 보낸 응원은 지워지지 않는다", keptCheers === 1, String(keptCheers));

  /* ── 시나리오 J — 영구 크루는 챌린지가 끝나도 그대로 ──────────────────── */
  section("[J] 영구 크루는 챌린지 종료와 무관하다");
  const bCheer = await rpc(B.token, "send_cheer", { p_session_id: sess2.id, p_cheer_type: "fire" });
  check("⚠️ 크루인 B는 챌린지와 무관하게 응원할 수 있다", bCheer.status === 200, bCheer.text.slice(0, 80));

  /* ── 시나리오 G — 챌린지 참가자에게 크루 신청은 여전히 가능 ────────────── */
  section("[G] 챌린지 참가자 → 크루 신청 → 수락 → 영구 크루");
  const req = await rpc(C.token, "send_crew_request", { p_target_id: A.id });
  check("C가 A에게 크루 요청을 보낸다", req.status === 200, req.text.slice(0, 80));
  const reqId = req.json?.requestId;
  if (reqId) {
    const acc = await rpc(A.token, "accept_crew_request", { p_request_id: reqId });
    check("A가 수락한다", acc.status === 200, acc.text.slice(0, 80));
    check("⚠️ 이제 A↔C가 영구 크루다", (await crewCount(A.id, C.id)) === 1);
  } else {
    check("A가 수락한다", false, "requestId 없음");
  }
} finally {
  // ⚠️ 방금 만든 id만 지운다.
  if (challengeId) {
    await admin.from("challenge_participants").delete().eq("challenge_id", challengeId);
    await admin.from("challenges").delete().eq("id", challengeId);
  }
  for (const u of made) {
    await admin.from("cheers").delete().or(`sender_id.eq.${u.id},receiver_id.eq.${u.id}`);
    await admin.from("workout_sessions").delete().eq("user_id", u.id);
    await admin.from("crew_requests").delete().or(`requester_id.eq.${u.id},addressee_id.eq.${u.id}`);
    await admin.from("crew_links").delete().or(`user_a.eq.${u.id},user_b.eq.${u.id}`);
    await admin.from("notifications").delete().or(`user_id.eq.${u.id},actor_id.eq.${u.id}`);
    await admin.from("group_members").delete().eq("user_id", u.id);
  }
  if (groupId) await admin.from("groups").delete().eq("id", groupId);
  for (const u of made) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
  const { data: left } = await admin
    .from("profiles").select("id").in("id", made.length ? made.map((u) => u.id) : ["-"]);
  console.log(`\n[정리] 계정 ${made.length}개 · 남은 프로필 ${left?.length ?? 0}개`);
  console.log(`\n${"─".repeat(56)}\n통과 ${passed} · 실패 ${failed}`);
}

process.exit(failed > 0 ? 1 : 0);
