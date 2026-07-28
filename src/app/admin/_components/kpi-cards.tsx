import { formatRatio, type Kpi } from "@/lib/domain/analytics";

function Delta({ pct }: { pct: number | null }) {
  // 직전 구간이 0이면 퍼센트를 만들지 않는다(0→5는 ∞%)
  if (pct === null) return <span className="sub">직전 구간 없음</span>;
  const up = pct >= 0;
  return (
    <span className={up ? "up" : "sub"}>
      {up ? "↗" : "↘"} {Math.abs(pct)}%
    </span>
  );
}

export function KpiCards({ kpi }: { kpi: Kpi }) {
  return (
    <section className="metrics">
      <article className="card">
        <div className="card-head">
          <span>활성 사용자</span>
          <i>♙</i>
        </div>
        <strong>
          {kpi.activeUsers}
          <small>명</small>
        </strong>
        <div className="card-foot">
          <Delta pct={kpi.activeUsersDeltaPct} />
          <span className="sub">신규 +{kpi.newUsers}명</span>
        </div>
      </article>

      <article className="card">
        <div className="card-head">
          <span>완료 운동</span>
          <i>✓</i>
        </div>
        <strong>
          {kpi.completedWorkouts.toLocaleString()}
          <small>회</small>
        </strong>
        <div className="card-foot">
          <Delta pct={kpi.completedWorkoutsDeltaPct} />
          <span className="sub">취소 {kpi.cancelledWorkouts}회</span>
        </div>
      </article>

      <article className="card">
        <div className="card-head">
          <span>운동 완료율</span>
          <i>◎</i>
        </div>
        {/* 모수가 작으면 formatRatio가 퍼센트 대신 "2/4"를 준다 */}
        <strong style={{ fontSize: 26 }}>
          {formatRatio(kpi.completionRate)}
        </strong>
        <div className="card-foot">
          <span className="sub">방치 {kpi.abandonedWorkouts}회</span>
          <span className="sub">분모 = 완료+취소+방치</span>
        </div>
      </article>

      <article className="card accent">
        <div className="card-head">
          <span>1인당 운동</span>
          <i>⚡</i>
        </div>
        <strong>
          {kpi.workoutsPerUser.toFixed(1)}
          <small>회</small>
        </strong>
        <div className="card-foot">
          <span className="sub">상위 25% {kpi.topQuartileWorkouts}회</span>
        </div>
      </article>
    </section>
  );
}
