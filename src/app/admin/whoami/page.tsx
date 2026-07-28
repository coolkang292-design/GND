import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/admin/auth";
import {
  hasAdminAccess,
  isAdminUser,
  isValidAccessKey,
  parseAdminIds,
} from "@/lib/domain/admin-access";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 이 브라우저가 어떤 계정으로 접속했는지 **자기 것만** 보여준다. 게이트 없음.
 *
 * 왜 필요한가: GND는 익명 인증이라 브라우저마다 계정이 다르고, 브라우저 데이터를
 * 지우면 새 계정이 생긴다. 그래서 ADMIN_USER_IDS에 무엇을 넣어야 하는지 알 수가
 * 없다. auth.users를 last_sign_in_at으로 추측하는 것은 틀린다 — 그 값은 새로
 * 로그인할 때만 갱신되고 세션 재사용 때는 그대로다.
 *
 * 보안: 요청자가 이미 자기 브라우저에 갖고 있는 값만 되돌려준다. 남의 정보는
 * 일절 노출하지 않으므로 게이트를 걸 이유가 없다(걸면 정작 막힌 사람이 못 쓴다).
 */
export const dynamic = "force-dynamic";

export default async function WhoAmIPage() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;

  // 진단: 서버가 나를 관리자로 보는가. 허용목록의 **개수만** 노출하고
  // 값은 절대 찍지 않는다 — 남의 UID도, 암호키도 새면 안 된다.
  const adminIds = parseAdminIds(process.env.ADMIN_USER_IDS);
  const cookieValue = (await cookies()).get(ADMIN_COOKIE)?.value ?? null;
  const accessKey = process.env.ADMIN_ACCESS_KEY;

  const byUid = isAdminUser(userId, adminIds);
  const byKey = isValidAccessKey(cookieValue, accessKey);
  const allowed = hasAdminAccess({ userId, adminIds, cookieValue, accessKey });

  return (
    <main className="main" style={{ width: "100%", margin: 0, maxWidth: 720 }}>
      <header>
        <div>
          <p className="kicker">ADMIN ACCESS</p>
          <h1>내 계정 UID</h1>
          <p>이 브라우저가 접속에 쓰는 계정입니다.</p>
        </div>
      </header>

      <article className="panel">
        {userId ? (
          <>
            <div className="panel-title">
              <div>
                <p className="kicker">USER ID</p>
                <h2 style={{ fontSize: 15, wordBreak: "break-all" }}>
                  {userId}
                </h2>
              </div>
            </div>
            <div className="summary" style={{ marginBottom: 14 }}>
              <div>
                <small>서버 판정</small>
                <b className={allowed ? "up" : ""} style={{ fontSize: 14 }}>
                  {allowed ? "✅ 관리자" : "❌ 차단"}
                </b>
              </div>
              <div>
                <small>UID 허용목록</small>
                <b style={{ fontSize: 14 }}>
                  {byUid ? "✅ 포함" : `❌ (${adminIds.length}개 등록됨)`}
                </b>
              </div>
              <div>
                <small>암호키 쿠키</small>
                <b style={{ fontSize: 14 }}>
                  {byKey ? "✅ 유효" : cookieValue ? "❌ 불일치" : "없음"}
                </b>
              </div>
              <div>
                <small>서버 암호키 설정</small>
                <b style={{ fontSize: 14 }}>{accessKey ? "✅ 있음" : "❌ 없음"}</b>
              </div>
            </div>

            <div className="insight">
              {allowed ? (
                <>
                  <b>이 브라우저는 관리자입니다.</b> <b>/admin</b>이 열립니다.
                </>
              ) : (
                <>
                  <b>여는 방법 두 가지.</b>
                  <br />① 주소 뒤에 <b>?key=암호</b>를 붙여 한 번 열면 이
                  브라우저에 쿠키가 남아 계속 열립니다(권장 — 재배포 불필요).
                  <br />② 위 UID를 <b>ADMIN_USER_IDS</b>에 추가하고 재배포합니다.
                </>
              )}
              <br />
              브라우저 데이터를 지우면 익명 계정 UID도 쿠키도 사라집니다 — 그때
              ①을 다시 하면 됩니다.
            </div>
          </>
        ) : (
          <div className="insight">
            <b>세션이 없습니다.</b>
            <br />
            앱을 한 번 연 뒤(<b>gnd-one.vercel.app</b>) 이 페이지를 새로고침하세요.
            익명 로그인이 끝나야 UID가 생깁니다.
          </div>
        )}
      </article>
    </main>
  );
}
