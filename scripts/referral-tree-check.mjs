/**
 * 추천 계보 실 DB 검증 — **인플루언서 A → 철수 → 영희 → 민수**가 실제 운영 DB에서
 * 이어지는지 본다.
 *
 * 왜 필요한가: 순수 함수 테스트는 "내가 만든 입력"을 검증한다. 이 스크립트는
 * **운영 DB의 진짜 트리거·제약·RLS를 통과한 행**으로 같은 것을 검증한다.
 * 특히 `clear_profile_invited_by_on_insert`(가입 시 invited_by 강제 null)와
 * `freeze_profile_attribution`(유입값 동결)이 걸려 있어서, 화면이 기대하는 모양의
 * 데이터가 실제로 만들어지는지는 여기서만 확인된다.
 *
 * 실행: node scripts/referral-tree-check.mjs
 *
 * ⚠️ 익명 계정 3개를 만들고 **끝나면 지운다.** 중간에 죽어도 finally가 정리한다.
 * ⚠️ 실사용자 데이터를 절대 건드리지 않는다 — 방금 만든 id만 다룬다.
 * ⚠️ 연달아 돌리면 익명 가입 rate limit(429)에 걸린다. 사이에 1~2분 둔다.
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
if (!URL_ || !ANON || !SERVICE) {
  throw new Error(".env.local에 Supabase 설정이 없습니다");
}

const admin = createClient(URL_, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CAMPAIGN = "referral_check_influencer_a";
let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label} ${detail}`);
  }
}

async function anonUser() {
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error("익명 가입 실패: " + JSON.stringify(json));
  }
  return json.user.id;
}

const made = [];

try {
  console.log("추천 계보 검증 — 인플루언서 A → 철수 → 영희 → 민수\n");

  const chulsoo = await anonUser();
  const younghee = await anonUser();
  const minsoo = await anonUser();
  made.push(chulsoo, younghee, minsoo);

  // 철수만 캠페인 링크로 들어왔다. 영희·민수는 초대로 들어와 캠페인이 비어 있다.
  // ⚠️ 닉네임은 20자 제한이다(profiles_nickname_check). 넘기면 INSERT가 통째로 막힌다.
  const rows = [
    // ⚠️ `acquisition_captured_at`을 반드시 함께 넣는다 — 운영 코드(`acquisitionColumns()`)가
    //    6칸을 항상 같이 쓰고, **동결 트리거가 captured_at이 있을 때만 작동**하기 때문이다.
    { id: chulsoo, nickname: `zzchk-c-${chulsoo.slice(0, 6)}`, acquisition_source: "instagram", acquisition_medium: "creator", acquisition_campaign: CAMPAIGN, acquisition_captured_at: new Date().toISOString() },
    { id: younghee, nickname: `zzchk-y-${younghee.slice(0, 6)}` },
    { id: minsoo, nickname: `zzchk-m-${minsoo.slice(0, 6)}` },
  ];
  for (const r of rows) {
    const { error } = await admin.from("profiles").insert({
      avatar_url: "🦍",
      weekly_goal: 3,
      ...r,
    });
    if (error) throw new Error(`프로필 생성 실패(${r.nickname}): ${error.message}`);
  }

  // 초대 관계. INSERT 트리거가 invited_by를 강제로 null로 만들기 때문에
  // **반드시 UPDATE로** 넣어야 한다 — 화면이 보는 것과 같은 경로다.
  await admin.from("profiles").update({ invited_by: chulsoo }).eq("id", younghee);
  await admin.from("profiles").update({ invited_by: younghee }).eq("id", minsoo);

  // 친구/챌린지 경로 구분도 실제 컬럼으로 심는다.
  await admin.from("crew_links").insert([
    {
      user_a: chulsoo < younghee ? chulsoo : younghee,
      user_b: chulsoo < younghee ? younghee : chulsoo,
      origin: "invite_link",
      initiated_by: chulsoo,
    },
    {
      user_a: younghee < minsoo ? younghee : minsoo,
      user_b: younghee < minsoo ? minsoo : younghee,
      origin: "challenge",
      initiated_by: younghee,
    },
  ]);

  const { data: got, error: readErr } = await admin
    .from("profiles")
    .select("id,invited_by,acquisition_campaign")
    .in("id", made);
  if (readErr) throw new Error("조회 실패: " + readErr.message);

  const byId = Object.fromEntries(got.map((p) => [p.id, p]));

  console.log("\n[저장된 모양 — 화면이 읽는 것과 같은 행]");
  check("철수의 캠페인이 저장됐다", byId[chulsoo].acquisition_campaign === CAMPAIGN, byId[chulsoo].acquisition_campaign);
  check("철수는 초대자가 없다 (0세대)", byId[chulsoo].invited_by === null);
  check("영희의 직접 초대자 = 철수", byId[younghee].invited_by === chulsoo);
  check("민수의 직접 초대자 = 영희", byId[minsoo].invited_by === younghee);

  console.log("\n[first-touch 보존 — 초대가 유입값을 덮지 않는다]");
  check("영희의 캠페인은 비어 있다 (철수 값으로 덮이지 않았다)", byId[younghee].acquisition_campaign === null, String(byId[younghee].acquisition_campaign));
  check("민수의 캠페인도 비어 있다", byId[minsoo].acquisition_campaign === null, String(byId[minsoo].acquisition_campaign));

  /*
    트리거가 실제로 막는지 — 철수의 유입값을 덮어쓰려 해도 안 바뀌어야 한다.

    ⚠️⚠️ **`freeze_profile_attribution`은 `acquisition_captured_at`이 있을 때만 동결한다.**
       2026-08-31에 이 스크립트가 그 사실을 잡았다 — captured_at 없이 campaign만
       심었더니 덮어쓰기가 그대로 통과했다. 운영 코드는 6칸을 항상 같이 쓰므로
       실사용자 행은 보호되지만, **campaign만 따로 쓰는 코드를 새로 만들면
       그 행은 동결되지 않는다.** 아래 두 단언이 그 경계를 고정한다.
  */
  await admin.from("profiles").update({ acquisition_campaign: "덮어쓰기시도" }).eq("id", chulsoo);
  const { data: after } = await admin.from("profiles").select("acquisition_campaign").eq("id", chulsoo).single();
  check("⚠️ 유입값 덮어쓰기를 DB 트리거가 막는다 (captured_at 있는 정상 행)", after.acquisition_campaign === CAMPAIGN, after.acquisition_campaign);

  // 경계 확인: captured_at이 없으면 동결이 걸리지 않는다는 것을 명시적으로 남긴다.
  await admin.from("profiles").update({ acquisition_campaign: "무방비" }).eq("id", younghee);
  const { data: unguarded } = await admin.from("profiles").select("acquisition_campaign").eq("id", younghee).single();
  check(
    "⚠️ captured_at이 없는 행은 동결되지 않는다 (알려진 경계 — 운영 코드는 항상 함께 쓴다)",
    unguarded.acquisition_campaign === "무방비",
    String(unguarded.acquisition_campaign),
  );

  console.log("\n[뿌리 캠페인 — 거슬러 올라가 계산]");
  const map = new Map(got.map((p) => [p.id, { userId: p.id, invitedBy: p.invited_by, profileCampaign: p.acquisition_campaign }]));
  function root(id) {
    const seen = new Set([id]);
    let cur = map.get(id);
    let gen = 0;
    while (cur) {
      if (cur.profileCampaign != null) return { root: cur.profileCampaign, gen };
      const next = cur.invitedBy;
      if (!next || next === cur.userId || seen.has(next)) return { root: "(불명)", gen };
      seen.add(next);
      cur = map.get(next);
      gen += 1;
      if (gen > 50) return { root: "(불명)", gen };
    }
    return { root: "(불명)", gen };
  }
  const rc = root(chulsoo), ry = root(younghee), rm = root(minsoo);
  check("철수 뿌리 = 캠페인 A · 0세대", rc.root === CAMPAIGN && rc.gen === 0, JSON.stringify(rc));
  check("영희 뿌리 = 캠페인 A · 1세대", ry.root === CAMPAIGN && ry.gen === 1, JSON.stringify(ry));
  check("민수 뿌리 = 캠페인 A · 2세대", rm.root === CAMPAIGN && rm.gen === 2, JSON.stringify(rm));

  console.log("\n[초대 종류 — crew_links.origin]");
  const { data: links } = await admin.from("crew_links").select("user_a,user_b,origin").or(`user_a.in.(${made.join(",")}),user_b.in.(${made.join(",")})`);
  const origins = (links ?? []).map((l) => l.origin).sort();
  check("친구 초대와 챌린지 초대가 구별돼 저장됐다", origins.includes("invite_link") && origins.includes("challenge"), origins.join(","));
} finally {
  // ⚠️ 방금 만든 id만 지운다. 실사용자는 어떤 경우에도 건드리지 않는다.
  for (const id of made) {
    await admin.from("crew_links").delete().or(`user_a.eq.${id},user_b.eq.${id}`);
  }
  for (const id of made) {
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
  const { data: left } = await admin.from("profiles").select("id").in("id", made.length ? made : ["-"]);
  console.log(`\n[정리] 만든 계정 ${made.length}개 · 남은 프로필 ${left?.length ?? 0}개`);
  console.log(`\n${"─".repeat(52)}\n통과 ${passed} · 실패 ${failed}`);
}

process.exit(failed > 0 ? 1 : 0);
