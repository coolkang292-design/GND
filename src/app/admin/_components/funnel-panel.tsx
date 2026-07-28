import {
  formatRatio,
  type FunnelStep,
  type Ratio,
} from "@/lib/domain/analytics";

export function FunnelPanel({
  steps,
  crew,
}: {
  steps: FunnelStep[];
  crew: Ratio;
}) {
  const top = steps[0]?.count ?? 0;

  return (
    <article className="panel">
      <div className="panel-title">
        <div>
          <p className="kicker">ACTIVATION FUNNEL</p>
          <h2>가입 후 첫 운동 전환</h2>
        </div>
        {/* 크루 참여는 퍼널 단계가 아니다 — 혼자모드가 단조성을 깨기 때문 */}
        <span className="muted">크루 참여 {formatRatio(crew)}</span>
      </div>

      <div className="funnel">
        {steps.map((step, i) => {
          const prev = i === 0 ? null : steps[i - 1].count;
          const loss =
            prev === null || prev === 0
              ? ""
              : `-${Math.round(((prev - step.count) / prev) * 100)}%`;
          return (
            <div className="frow" key={step.label}>
              <label>
                <span>{step.label}</span>
                <b>{step.count}명</b>
              </label>
              <div className="track">
                <i
                  style={{
                    width: `${top === 0 ? 0 : (step.count / top) * 100}%`,
                  }}
                />
              </div>
              <span className="loss">{loss}</span>
            </div>
          );
        })}
      </div>

      <div className="insight" style={{ marginTop: 14 }}>
        가입은 <b>auth 계정</b> 기준, 프로필 설정은 <b>profiles</b> 기준입니다 —
        온보딩을 시작만 하고 프로필을 안 만든 사람이 이탈로 잡히게 하기 위해서입니다.
      </div>
    </article>
  );
}
