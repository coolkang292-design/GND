import {
  formatRatio,
  type ActiveUserCounts,
  type DailyActivePoint,
} from "@/lib/domain/analytics";
import { MetricHelp } from "./metric-help";

/** 막대가 촘촘할 때 라벨을 솎아낸다 — 7개는 전부, 그 이상은 간헐 표기 */
function labelFor(points: DailyActivePoint[], i: number): string {
  if (i === points.length - 1) return "오늘";
  const step = points.length <= 7 ? 1 : Math.ceil(points.length / 6);
  if (i % step !== 0) return "";
  return points[i].dayKey.slice(5).replace("-", "/");
}

export function ActivityChart({
  points,
  counts,
}: {
  points: DailyActivePoint[];
  counts: ActiveUserCounts;
}) {
  const max = Math.max(1, ...points.map((p) => p.count));

  return (
    <article className="panel">
      <div className="panel-title">
        <div>
          <p className="kicker">ACTIVE USERS</p>
          <h2>일별 활성 사용자</h2>
        </div>
        <span className="muted">최대 {max}명</span>
      </div>

      <div className="bars" aria-label="일별 활성 사용자 막대그래프">
        {points.map((p, i) => (
          <div
            className="bar-wrap"
            key={p.dayKey}
            title={`${p.dayKey} · ${p.count}명`}
          >
            {/* 0인 날도 자리를 남겨 가로축이 거짓말하지 않게 한다 */}
            <div
              className="bar"
              style={{
                height:
                  p.count === 0 ? "2%" : `${Math.max(12, (p.count / max) * 100)}%`,
                opacity: p.count === 0 ? 0.35 : 1,
              }}
            />
            <span>{labelFor(points, i)}</span>
          </div>
        ))}
      </div>

      <div className="summary">
        <div>
          <small>DAU · 오늘</small>
          <b>{counts.dau}</b>
        </div>
        <div>
          <small>WAU · 주간</small>
          <b>{counts.wau}</b>
        </div>
        <div>
          <small>MAU · 월간</small>
          <b>{counts.mau}</b>
        </div>
        <div>
          <small>DAU / MAU</small>
          <b className="gold" style={{ fontSize: 13 }}>
            {formatRatio(counts.dauOverMau)}
          </b>
        </div>
      </div>

      <MetricHelp
        keys={["daily-active", "dau", "wau", "mau", "dau-over-mau"]}
      />
    </article>
  );
}
