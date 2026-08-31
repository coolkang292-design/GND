/**
 * 회귀 스크립트용 **정식 계정** 만들기 (0094 이후 필수).
 *
 * ⚠️⚠️ **왜 이게 생겼나.** 0094부터 익명 계정은 세 가지를 못 한다 —
 *    초대 코드 발행 · 크루 요청 · 챌린지 방 생성. 회귀 스크립트들은 지금까지
 *    `/auth/v1/signup`으로 **익명** 픽스처를 만들어 그 기능들을 시험했다.
 *    그대로 두면 스크립트가 통째로 빨개지는데, **제품이 고장난 게 아니라
 *    픽스처가 실사용자와 다른 상태**인 것이다 — 실사용자는 온보딩에서
 *    카카오·구글을 먼저 거치므로 **정식 계정이 정상 상태다.**
 *
 * ⚠️ 승격 뒤 **토큰을 반드시 갱신한다.** JWT는 발급 시점에 굳어서, 갱신하지
 *    않으면 서버는 is_anonymous=false인데 토큰은 true를 들고 있다
 *    (scripts/anon-upgrade-jwt-check.mjs가 이걸 실측으로 고정한다).
 *
 * 쓰는 법 — 각 스크립트의 가입 직후 한 줄:
 *
 *     const json = await (await fetch(`${URL}/auth/v1/signup`, ...)).json();
 *     if (!json.access_token) throw new Error(...);
 *     json.access_token = await makePermanent(json);   // ← 이 줄
 *
 * 아래 코드는 `json.access_token`을 그대로 쓰면 된다.
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

let admin = null;
function adminClient() {
  if (!admin) {
    admin = createClient(URL_, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return admin;
}

/**
 * 방금 익명으로 가입한 계정을 정식으로 올리고 **새 access_token**을 준다.
 *
 * @param signup `/auth/v1/signup` 응답 (`user.id`와 `refresh_token`이 필요하다)
 * @returns 갱신된 access_token
 */
export async function makePermanent(signup) {
  const id = signup?.user?.id;
  if (!id) throw new Error("makePermanent: user.id가 없다");

  const { error } = await adminClient().auth.admin.updateUserById(id, {
    // ⚠️ `.local` 같은 TLD는 Supabase 검증기가 거부한다. example.com을 쓴다.
    email: `zzperm-${id.slice(0, 12)}@example.com`,
    email_confirm: true,
  });
  if (error) throw new Error(`makePermanent 실패: ${error.message}`);

  const fresh = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: signup.refresh_token }),
  }).then((r) => r.json());

  if (!fresh.access_token) {
    throw new Error(`makePermanent 토큰 갱신 실패: ${JSON.stringify(fresh)}`);
  }
  return fresh.access_token;
}
