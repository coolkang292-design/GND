import {
  formatRatio,
  type FunnelStep,
  type Ratio,
} from "@/lib/domain/analytics";
import { MetricHelp } from "./metric-help";

export function FunnelPanel({
  steps,
  crew,
  anonymousExcluded,
}: {
  steps: FunnelStep[];
  crew: Ratio;
  /** 프로필을 만들지 않아 퍼널에서 뺀 익명 계정 수 */
  anonymousExcluded: number;
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
          // 줄지 않았으면 아무것도 안 적는다 — "-0%"는 오류처럼 읽힌다
          const loss =
            prev === null || prev === 0 || prev === step.count
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
        <b>프로필을 만든 계정만 셉니다.</b> 앱이 익명 인증이라 브라우저를 새로 열
        때마다 계정이 하나씩 생기는데, 지금 그런 계정이{" "}
        <b>{anonymousExcluded}개</b> 있고 대부분 개발·테스트 흔적입니다. 그대로
        세면 첫 단계에서 큰 폭이 빠지지만 그건 온보딩 이탈이 아닙니다.
        <br />
        ⚠️ 대신 <b>온보딩 중도 이탈은 이제 측정하지 않습니다</b> — 진짜 이탈자도
        함께 빠졌기 때문입니다. 되살리려면 익명 계정에서 테스트 흔적을 가려낼
        표식이 먼저 필요합니다.
      </div>

      <MetricHelp
        keys={[
          "funnel-profile",
          "funnel-first-workout",
          "funnel-three-workouts",
          "crew-participation",
        ]}
      />
    </article>
  );
}
