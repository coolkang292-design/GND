import type { MembershipCounts } from "@/lib/domain/analytics-accounts";

/**
 * 회원 수의 실체 (2026-08-31).
 *
 * 왜 이 패널이 있나: Supabase 대시보드의 `auth.users` 총수를 그대로 "회원 수"로
 * 읽으면 크게 틀린다. GND는 첫 방문자에게 곧바로 익명 계정을 발급하므로
 * (`auth-provider.tsx`) 브라우저를 새로 열 때마다 계정이 하나 생긴다.
 * 2026-08-31 실측: **123개 중 116개가 익명**, 프로필까지 만든 실사용자는 4명.
 *
 * 그래서 한 숫자로 뭉치지 않고 **네 층을 그대로 보여준다.** 각 층은 다음 층을
 * 포함한다 — 뒤집히면 집계가 틀린 것이고, 그건 테스트가 잡는다
 * (`analytics-accounts.test.ts`의 "각 층은 다음 층보다 크거나 같다").
 *
 * ⚠️ **`.funnel`/`.frow`를 쓰지 않는다.** 처음엔 그걸 재사용했는데 375px에서
 *    ① 각 줄의 사유(`.loss`)가 `display:none`이 되어 **폰에서 통째로 사라지고**
 *    ② 라벨 칸이 105px이라 긴 라벨이 2줄로 깨지면서 숫자 "7개"가 "7"/"개"로
 *    갈렸다. 퍼널에서 `.loss`는 있으면 좋은 퍼센트지만 **여기서는 사유가 본문**이다
 *    ("익명 117개 제외"를 못 보면 층이 왜 줄었는지 알 수 없다). 그래서 막대
 *    (`.track`)만 빌려 쓰고 줄 구조는 직접 짠다.
 */
export function MembershipPanel({ m }: { m: MembershipCounts }) {
  const layers = [
    {
      label: "auth 계정 전체",
      count: m.authTotal,
      note: "⚠️ 이것은 회원 수가 아닙니다",
      dim: true,
    },
    {
      label: "영구 계정",
      count: m.authPermanent,
      note: `카카오·구글·이메일이 연결된 계정 · 익명 ${m.authAnonymous}개 제외`,
      dim: false,
    },
    {
      label: "프로필 생성",
      count: m.profilesTotal,
      note: "온보딩을 끝낸 계정",
      dim: false,
    },
    {
      label: "실사용자",
      count: m.profilesReal,
      note:
        m.profilesExcluded > 0
          ? `픽스처·테스트 ${m.profilesExcluded}개를 뺀 수 — "회원 수"에 가장 가깝습니다`
          : '제외한 테스트 계정 없음 — "회원 수"에 가장 가깝습니다',
      dim: false,
    },
  ];
  const top = Math.max(1, m.authTotal);

  return (
    <article className="panel" id="membership">
      <div className="panel-title">
        <div>
          <p className="kicker">MEMBERSHIP</p>
          <h2>회원 수의 실체</h2>
        </div>
        <span className="muted">
          최근 가입 7일 {m.permanentSignups7d}명 · 30일 {m.permanentSignups30d}명
        </span>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {layers.map((l) => (
          <div key={l.label} style={l.dim ? { opacity: 0.62 } : undefined}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 10,
                marginBottom: 6,
              }}
            >
              <span>{l.label}</span>
              {/* nowrap이 없으면 좁은 폭에서 "7개"가 "7"/"개"로 갈린다 */}
              <b style={{ whiteSpace: "nowrap" }}>
                {l.count.toLocaleString()}개
              </b>
            </div>
            <div className="track">
              <i style={{ width: `${(l.count / top) * 100}%` }} />
            </div>
            {/* 퍼널의 .loss와 달리 항상 보인다 — 사유가 본문이다 */}
            <div className="sub" style={{ marginTop: 6, fontSize: 12 }}>
              {l.note}
            </div>
          </div>
        ))}
      </div>

      <div className="insight" style={{ marginTop: 16 }}>
        <b>맨 윗줄을 회원 수로 읽지 마세요.</b> 앱이 익명 인증이라 브라우저를 새로
        열 때마다 auth 계정이 하나씩 생깁니다. 지금 {m.authTotal}개 중{" "}
        <b>{m.authAnonymous}개가 익명</b>이고, 대부분 앱을 열기만 하고 프로필도
        만들지 않은 빈 계정입니다. <b>&ldquo;회원&rdquo;에 가장 가까운 숫자는 맨
        아랫줄 {m.profilesReal}명</b>입니다.
        <br />
        <br />
        ⚠️ <b>최근 가입 7일·30일은 &ldquo;계정이 만들어진 날&rdquo;로 셉니다 —
        승격한 날이 아닙니다.</b> GND는 익명 계정에 카카오를 붙여 그 자리에서
        영구 계정으로 바꾸기 때문에(계정이 새로 갈리지 않습니다), 어제 카카오를
        연결했더라도 계정이 3주 전에 생겼으면 7일 집계에 안 들어갑니다.
      </div>
    </article>
  );
}
