import { formatRatio, type Ratio } from "@/lib/domain/analytics";
import type {
  ChannelCount,
  CrewOriginCount,
  InviterRow,
} from "@/lib/domain/analytics-acquisition";
import { MetricHelp } from "./metric-help";

/** 채널 코드 → 한글. 없으면 코드를 그대로 쓴다(줄이 사라지는 것보다 낫다) */
const CHANNEL_LABELS: Record<string, string> = {
  direct: "직접 들어옴",
  kakao: "카카오톡",
  instagram: "인스타그램",
  google: "구글",
  naver: "네이버",
  daum: "다음",
  youtube: "유튜브",
  facebook: "페이스북",
};

export function AcquisitionPanel({
  origins,
  originKnown,
  inviters,
  channels,
  captureRate,
}: {
  origins: CrewOriginCount[];
  originKnown: Ratio;
  inviters: InviterRow[];
  channels: ChannelCount[];
  captureRate: Ratio;
}) {
  const originTotal = origins.reduce((s, o) => s + o.count, 0);
  const channelTotal = channels.reduce((s, c) => s + c.count, 0);

  return (
    <section className="grid equal">
      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="kicker">INVITE ORIGIN</p>
            <h2>누가 어떻게 불렀나</h2>
          </div>
          <span className="muted">누적</span>
        </div>

        <div className="funnel">
          {origins.length === 0 ? (
            <p className="muted">아직 크루 연결이 없습니다.</p>
          ) : (
            origins.map((o) => (
              <div className="frow" key={o.origin}>
                <label>
                  <span>{o.label}</span>
                  <b>{o.count}건</b>
                </label>
                <div className="track">
                  <i
                    style={{
                      width: `${originTotal === 0 ? 0 : (o.count / originTotal) * 100}%`,
                    }}
                  />
                </div>
                <span className="loss" />
              </div>
            ))
          )}
        </div>

        <div className="summary" style={{ marginTop: 14 }}>
          <div>
            <small>출처를 아는 연결</small>
            <b>{formatRatio(originKnown)}</b>
          </div>
        </div>

        {inviters.length > 0 && (
          <>
            <div className="panel-title" style={{ marginTop: 26 }}>
              <div>
                <p className="kicker">TOP INVITERS</p>
                <h2>사람을 데려온 사람</h2>
              </div>
            </div>
            {/* ⚠️ `<table>`을 쓰지 않는다 — admin.css의 table은 min-width:800px이라
                반쪽 폭 패널에서 가로 스크롤이 생긴다 */}
            <div style={{ display: "grid", gap: 9 }}>
              {inviters.map((i) => (
                <div
                  key={i.nickname}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 10,
                    fontSize: 12,
                  }}
                >
                  <span>{i.nickname}</span>
                  <span className="muted" style={{ marginLeft: "auto" }}>
                    먼저 연 연결 {i.linksInitiated}건
                  </span>
                  <b className={i.broughtIn > 0 ? "gold" : undefined}>
                    {i.broughtIn}명
                  </b>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ⚠️ 이 문구를 지우지 마라 — 백필이 절반이라는 사실이 사라지면
            "친구 초대 2건"이 전부인 줄 읽힌다 */}
        <div className="insight" style={{ marginTop: 14 }}>
          <b>출처는 2026-08-17(0079)부터 연결에 직접 적힙니다.</b> 그 이전 연결은
          알림 흔적으로 되살릴 수 있는 것만 채웠고, 나머지는{" "}
          <b>&ldquo;알 수 없음&rdquo;</b>입니다 — 흔적이 없는 것을 검색으로 치면
          통계가 조용히 거짓말을 합니다.
          <br />
          <b>데려온 사람</b>은 그 사람의 <b>첫 연결</b>을 만들어 준 경우만 셉니다.
          이미 크루가 있는 사람이 남의 링크를 눌러도 초대자가 바뀌지 않습니다.
        </div>

        <MetricHelp keys={["crew-origin", "origin-known", "top-inviters"]} />
      </article>

      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="kicker">ACQUISITION</p>
            <h2>어디서 들어왔나</h2>
          </div>
          <span className="muted">누적</span>
        </div>

        <div className="funnel">
          {channels.length === 0 ? (
            <p className="muted">아직 가입자가 없습니다.</p>
          ) : (
            channels.map((c) => (
              <div className="frow" key={c.channel}>
                <label>
                  <span>{CHANNEL_LABELS[c.channel] ?? c.channel}</span>
                  <b>{c.count}명</b>
                </label>
                <div className="track">
                  <i
                    style={{
                      width: `${channelTotal === 0 ? 0 : (c.count / channelTotal) * 100}%`,
                    }}
                  />
                </div>
                <span className="loss" />
              </div>
            ))
          )}
        </div>

        <div className="summary" style={{ marginTop: 14 }}>
          <div>
            <small>출처가 잡힌 가입자</small>
            <b>{formatRatio(captureRate)}</b>
          </div>
        </div>

        {/* ⚠️ 이 단서가 이 패널의 전부다. 없으면 "직접 들어옴 8명"이
            진짜 직접 유입으로 읽힌다 */}
        <div className="insight" style={{ marginTop: 14 }}>
          <b>
            유입 계측은 2026-08-17에 붙었습니다. 그 이전 가입자는 값이 없어 전부
            &ldquo;직접 들어옴&rdquo;으로 잡힙니다.
          </b>
          <br />
          위의 <b>출처가 잡힌 가입자</b> 비율이 낮으면 &ldquo;직접
          들어옴&rdquo;은 채널이 아니라 <b>계측 전 가입자</b>라는 뜻입니다. 이
          비율이 올라온 뒤에 채널 분포를 읽으세요.
          <br />
          링크에 <code>?utm_source=kakao&amp;utm_medium=social</code>을 붙여
          보내면 그 값이 그대로 채널이 됩니다. 아무것도 안 붙이면 referrer
          호스트로 추정합니다.
        </div>

        <MetricHelp keys={["acquisition-channel", "acquisition-capture"]} />
      </article>
    </section>
  );
}
