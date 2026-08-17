import type { Retention } from "@/lib/domain/analytics";
import { MetricHelp } from "./metric-help";
import { Ring } from "./ring";

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
        <Ring label="D30" r={retention.d30} />
        <Ring label="30일 생존" r={retention.aliveAfter30d} />
      </div>

      <div className="insight">
        <b>D1·D7·D30은 가입 후 그 날짜 하루에 운동을 완료한 비율입니다.</b>
        <br />
        <b>30일 생존</b>은 다릅니다 — 가입한 지 30일이 지난 사람 중{" "}
        <b>최근 7일에 운동한</b> 비율입니다. 하루 창은 29일째·31일째에 온 사람을
        놓치기 때문에, &ldquo;한 달 뒤에도 남아 있나&rdquo;는 이쪽으로 봅니다.
        <br />
        앱이 방문·페이지뷰를 수집하지 않아 &ldquo;재방문&rdquo;은 측정할 수
        없습니다. 해당 일수가 아직 지나지 않은 가입자는 분모에서 제외합니다.
      </div>

      <MetricHelp keys={["retention", "retention-alive"]} />
    </article>
  );
}
