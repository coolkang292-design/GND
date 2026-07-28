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
 * 이 브라우저가 /admin에 왜 들어가지고/못 들어가는지 보여준다. 게이트 없음.
 *
 * 왜 필요한가: GND는 익명 인증이라 브라우저마다 계정이 다르고, 브라우저 데이터를
 * 지우면 새 계정이 생긴다. 무엇이 막고 있는지 알 방법이 없으면 404만 보고
 * 추측하게 된다(실제로 그렇게 여러 번 헛짚었다).
 *
 * **진단은 세션이 없어도 보여준다.** 암호키 경로는 세션 없이도 통과하므로,
 * 세션이 없을 때야말로 이 화면이 필요하다.
 *
 * 보안: 요청자가 이미 자기 브라우저에 갖고 있는 값(자기 UID)만 되돌려주고,
 * 허용목록과 암호키는 **개수·불리언만** 노출한다. 남의 UID도 키도 새지 않는다.
 */
export const dynamic = "force-dynamic";

export default async function WhoAmIPage() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;

  const adminIds = parseAdminIds(process.env.ADMIN_USER_IDS);
  const cookieValue = (await cookies()).get(ADMIN_COOKIE)?.value ?? null;
  const accessKey = process.env.ADMIN_ACCESS_KEY;

  const byUid = isAdminUser(userId, adminIds);
  const byKey = isValidAccessKey(cookieValue, accessKey);
  const allowed = hasAdminAccess({ userId, adminIds, cookieValue, accessKey });

  return (
    <main className="main" style={{ width: "100%", margin: 0, maxWidth: 760 }}>
      <header>
        <div>
          <p className="kicker">ADMIN ACCESS</p>
          <h1>{allowed ? "접근 가능" : "차단됨"}</h1>
          <p>이 브라우저가 /admin에 들어갈 수 있는지 진단합니다.</p>
        </div>
      </header>

      <article className="panel">
        <div className="summary" style={{ marginTop: 0, marginBottom: 16 }}>
          <div>
            <small>최종 판정</small>
            <b className={allowed ? "up" : ""} style={{ fontSize: 14 }}>
              {allowed ? "✅ 관리자" : "❌ 차단"}
            </b>
          </div>
          <div>
            <small>암호키 쿠키</small>
            <b style={{ fontSize: 14 }}>
              {byKey ? "✅ 유효" : cookieValue ? "❌ 불일치" : "— 없음"}
            </b>
          </div>
          <div>
            <small>UID 허용목록</small>
            <b style={{ fontSize: 14 }}>
              {byUid ? "✅ 포함" : `❌ (${adminIds.length}개 등록)`}
            </b>
          </div>
          <div>
            <small>서버 암호키</small>
            <b style={{ fontSize: 14 }}>{accessKey ? "✅ 설정됨" : "❌ 없음"}</b>
          </div>
        </div>

        <div className="panel-title" style={{ marginBottom: 8 }}>
          <div>
            <p className="kicker">이 브라우저의 계정 UID</p>
            <h2 style={{ fontSize: 14, wordBreak: "break-all" }}>
              {userId ?? "세션 없음 (익명 로그인 전)"}
            </h2>
          </div>
        </div>

        <div className="insight">
          {allowed ? (
            <>
              <b>이 브라우저는 /admin이 열립니다.</b>
              <br />
              암호키 쿠키는 180일간 유지됩니다. 브라우저 데이터를 지우면 사라지니
              그때 다시 <b>?key=</b>로 한 번 열면 됩니다.
            </>
          ) : !accessKey ? (
            <>
              <b>서버에 암호키가 설정돼 있지 않습니다.</b> Vercel 환경변수
              <b> ADMIN_ACCESS_KEY</b>를 등록하고 재배포해야 합니다. 설정이 없으면
              무엇을 보내도 통과하지 않습니다(fail-closed).
            </>
          ) : cookieValue ? (
            <>
              <b>쿠키는 있는데 서버 키와 다릅니다.</b> 키가 바뀌었거나 오타로
              들어왔습니다. <b>/admin?key=…</b>를 다시 열어 주세요 — 주소를 직접
              입력하면 대소문자·하이픈에서 틀리기 쉬우니 <b>복사해서 붙여넣기</b>를
              권합니다.
            </>
          ) : (
            <>
              <b>아직 암호키로 연 적이 없습니다.</b>
              <br />
              <b>/admin?key=암호</b> 형태로 한 번 열면 이 브라우저에 쿠키가 남아
              이후로는 <b>/admin</b>만으로 열립니다. 세션이 없어도 됩니다.
              <br />
              주소를 손으로 입력하면 틀리기 쉽습니다 —{" "}
              <b>복사해서 붙여넣으세요.</b>
            </>
          )}
        </div>
      </article>
    </main>
  );
}
