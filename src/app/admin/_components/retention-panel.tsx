import {
  formatRatio,
  MIN_RATIO_SAMPLE,
  type Ratio,
  type Retention,
} from "@/lib/domain/analytics";

function Ring({ label, r }: { label: string; r: Ratio }) {
  // 모수가 작으면 링을 채우지 않는다 — 1/1을 꽉 찬 100% 링으로 그리면
  // 숫자는 정직해도 그림이 거짓 인상을 준다.
  const showRing = r.denominator >= MIN_RATIO_SAMPLE;
  const deg = showRing ? (r.numerator / r.denominator) * 360 : 0;

  return (
    <div className="ring" style={{ ["--p" as string]: `${deg}deg` }}>
      <div>
        <b style={{ fontSize: 12 }}>{formatRatio(r)}</b>
        <small>{label}</small>
      </div>
    </div>
  );
}

export function RetentionPanel({ retention }: { retention: Retention }) {
  return (
    <article className="panel">
      <div className="panel-title">
        <div>
          <p className="kicker">RETENTION</p>
          <h2>재운동 리텐션</h2>
        </div>
      </div>

      <div className="rings">
        <Ring label="D1" r={retention.d1} />
        <Ring label="D7" r={retention.d7} />
        <Ring label="D28" r={retention.d28} />
      </div>

      <div className="insight">
        <b>가입 후 D일차에 운동을 완료한 비율입니다.</b>
        <br />
        앱이 방문·페이지뷰를 수집하지 않아 &ldquo;재방문&rdquo;은 측정할 수
        없습니다. 해당 일수가 아직 지나지 않은 가입자는 분모에서 제외합니다.
      </div>
    </article>
  );
}
