import { formatRatio } from "@/lib/domain/analytics";
import type { ProgramMetrics } from "@/lib/domain/analytics-program";

export function ProgramPanel({ metrics }: { metrics: ProgramMetrics }) {
  const top = metrics.funnel[0]?.count ?? 0;
  const maxProgram = Math.max(1, ...metrics.byProgram.map((p) => p.count));

  return (
    <section className="grid equal" id="programs">
      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="kicker">PROGRAM</p>
            <h2>공식 프로그램 등록·완주</h2>
          </div>
          <span className="muted">
            기간 내 신규 {metrics.newEnrollmentsInPeriod}건 · 진행{" "}
            {metrics.active} · 완주 {metrics.completed} · 포기{" "}
            {metrics.cancelled}
          </span>
        </div>

        {metrics.enrollments === 0 ? (
          // 퍼널을 0으로 그리지 않는다 — 빈 막대 넷은 "다 이탈했다"로 읽힌다
          <div className="insight">아직 프로그램 등록이 없습니다.</div>
        ) : (
          <div className="funnel">
            {metrics.funnel.map((step, i) => {
              const prev = i === 0 ? null : metrics.funnel[i - 1].count;
              const loss =
                prev === null || prev === 0
                  ? ""
                  : `-${Math.round(((prev - step.count) / prev) * 100)}%`;
              return (
                <div className="frow" key={step.label}>
                  <label>
                    <span>{step.label}</span>
                    <b>{step.count}건</b>
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
        )}

        <div className="summary">
          <div>
            <small>등록자</small>
            <b>{metrics.enrolledUsers}명</b>
          </div>
          <div>
            <small>등록률(활성 대비)</small>
            <b>{formatRatio(metrics.adoption)}</b>
          </div>
          <div>
            <small>완주율(끝난 등록)</small>
            <b className="gold">{formatRatio(metrics.completionRate)}</b>
          </div>
          <div>
            <small>평균 이탈 회차</small>
            <b>
              {metrics.avgSessionsAtDropout === null
                ? "—"
                : `${metrics.avgSessionsAtDropout}회`}
            </b>
          </div>
        </div>

        <div className="insight" style={{ marginTop: 14 }}>
          <b>6주 프로그램이라 상태·완주율·퍼널은 누적입니다.</b> 기간 필터는{" "}
          <b>신규 등록</b>에만 적용됩니다 — 6주짜리를 7일 창으로 보면 완주가 0일
          수밖에 없고, 그 0은 &ldquo;아무도 못 끝냈다&rdquo;가 아니라 &ldquo;볼 수
          없는 창으로 봤다&rdquo;는 뜻이기 때문입니다.
          <br />
          완주율의 모수는 <b>완주+포기</b>입니다. 진행 중인 등록은 뺐습니다.
          포기 중 한 회차도 하지 않은 비율은{" "}
          <b>{formatRatio(metrics.dropoutBeforeFirstSession)}</b>입니다.
        </div>
      </article>

      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="kicker">BY PROGRAM</p>
            <h2>프로그램별 등록</h2>
          </div>
          <span className="muted">누적 · 등록 많은 순</span>
        </div>

        {metrics.byProgram.length === 0 ? (
          <div className="insight">아직 등록된 프로그램이 없습니다.</div>
        ) : (
          /* ⚠️ `.funnel`이 아니라 `.challenges`를 쓴다. `.frow`의 라벨 칸은 130px라
             "상체의 틀을 넓히는 6주" 같은 제목이 단어 중간에서 끊긴다(개발 서버에서
             확인). 챌린지 목록 구조는 제목에 한 줄을 통째로 준다. */
          <div className="challenges">
            {metrics.byProgram.map((p) => (
              <div className="challenge" key={p.programKey}>
                <div className="challenge-icon">▤</div>
                <div>
                  <div className="challenge-top">
                    <b>{p.title}</b>
                    <span>{p.count}건</span>
                  </div>
                  <p>완주 {p.completed}건</p>
                  <div className="progress">
                    <i style={{ width: `${(p.count / maxProgram) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="insight" style={{ marginTop: 14 }}>
          제목은 <b>등록 당시 스냅샷</b>입니다(`title_snapshot`). 프로그램 정의가
          바뀌어도 그때 이름으로 남아, 같은 키의 옛 등록과 새 등록이 한 줄로
          묶입니다.
        </div>
      </article>
    </section>
  );
}
