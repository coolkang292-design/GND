import { isAdminUser, parseAdminIds } from "@/lib/domain/admin-access";
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
  // 값은 절대 찍지 않는다 — 남의 UID가 새면 안 된다.
  const adminIds = parseAdminIds(process.env.ADMIN_USER_IDS);
  const allowed = isAdminUser(userId, adminIds);

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
                  {allowed ? "✅ 관리자" : "❌ 허용목록에 없음"}
                </b>
              </div>
              <div>
                <small>ADMIN_USER_IDS 항목 수</small>
                <b style={{ fontSize: 14 }}>{adminIds.length}개</b>
              </div>
            </div>

            <div className="insight">
              {allowed ? (
                <>
                  <b>이 브라우저는 관리자입니다.</b> <b>/admin</b>이 열립니다.
                </>
              ) : adminIds.length === 0 ? (
                <>
                  <b>ADMIN_USER_IDS가 서버에 없습니다.</b> 환경변수를 등록하고
                  재배포해야 합니다(값이 없으면 fail-closed로 전원 차단).
                </>
              ) : (
                <>
                  위 UID를 <b>ADMIN_USER_IDS</b>에 쉼표로 추가한 뒤 재배포하면 이
                  브라우저에서 <b>/admin</b>이 열립니다.
                </>
              )}
              <br />
              브라우저 데이터를 지우면 새 익명 계정이 만들어져 UID가 바뀝니다 —
              그때 이 페이지를 다시 열면 됩니다.
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
