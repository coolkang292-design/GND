import { MIN_RATIO_SAMPLE } from "@/lib/domain/analytics";
import { campaignLabel } from "@/lib/domain/analytics-acquisition";
import {
  GENERATION_BUCKETS,
  UNKNOWN_ROOT,
  type SpreadResult,
} from "@/lib/domain/analytics-referral-tree";

/**
 * 캠페인 확산 성과 — **기존 비교표와 다른 질문에 답한다.**
 *
 *   기존 `제안처·캠페인별 성과` : 그 링크로 **직접** 들어온 사람만 센다
 *   여기 `캠페인 확산 성과`      : 그 사람들이 **다시 데려온 사람까지** 센다
 *
 * ⚠️ **기존 표의 뜻을 바꾸지 않았다.** 두 표는 나란히 있고 각자 정의를 지킨다.
 *    같은 이름으로 다른 숫자를 보여주면 다음 사람이 둘 다 못 믿는다.
 *
 * ⚠️ 계보가 깨진 사람은 **어떤 캠페인에도 넣지 않고** `(뿌리 불명)` 줄에 모아
 *    이상 건수를 그대로 보여준다. 거짓으로 정확한 숫자를 만들지 않는다.
 *
 * ⚠️ 개인 감시 화면이 아니다 — 닉네임·이메일·UUID를 그리지 않는다. 숫자만이다.
 */
export function CampaignSpreadPanel({ data }: { data: SpreadResult }) {
  const { rows, anomalies, anomalyTotal, kinds } = data;
  const meaningful = rows.filter((r) => r.total > 0);

  return (
    // minWidth: 0 — 그리드 아이템은 기본적으로 안 줄어들어서 표가 패널을 밀어낸다
    <article className="panel" id="spread" style={{ minWidth: 0 }}>
      <div className="panel-title">
        <div>
          <p className="kicker">VIRAL REACH</p>
          <h2>캠페인 확산 성과</h2>
        </div>
        <span className="muted">초대까지 따라간 총 영향</span>
      </div>

      {meaningful.length === 0 ? (
        <div className="insight">
          아직 계보를 계산할 사람이 없습니다. 파일럿 링크로 사람이 들어오고 그
          사람이 친구를 초대하면 여기에 쌓입니다.
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto", minWidth: 0 }}>
            <table
              style={{
                width: "100%",
                minWidth: 720,
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: "8px 6px" }}>뿌리 캠페인</th>
                  {[
                    "직접",
                    "추가",
                    "총영향",
                    "배수",
                    "정식전환",
                    "운동시작",
                    "운동완료",
                    "3회",
                    "챌린지",
                    "7일후",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{ padding: "8px 6px", textAlign: "right" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {meaningful.map((r) => {
                  const broken = r.root === UNKNOWN_ROOT;
                  return (
                    <tr
                      key={r.root}
                      style={{
                        borderTop: "1px solid rgba(255,255,255,.08)",
                        opacity: broken ? 0.62 : 1,
                      }}
                    >
                      <td style={{ padding: "10px 6px" }}>
                        {broken ? r.root : campaignLabel(r.root)}
                        <div className="sub" style={{ fontSize: 11 }}>
                          {GENERATION_BUCKETS.map(
                            (g, i) => `${g} ${r.byGeneration[i]}`,
                          ).join(" · ")}
                        </div>
                      </td>
                      <td style={{ padding: "10px 6px", textAlign: "right" }}>
                        {r.direct}
                      </td>
                      <td style={{ padding: "10px 6px", textAlign: "right" }}>
                        {r.viral}
                      </td>
                      <td style={{ padding: "10px 6px", textAlign: "right" }}>
                        <b>{r.total}</b>
                      </td>
                      <td style={{ padding: "10px 6px", textAlign: "right" }}>
                        {/* 표본이 작으면 배수를 강조하지 않는다 — 한 명에 크게 흔들린다 */}
                        {r.multiplier === null ? (
                          "—"
                        ) : r.direct < MIN_RATIO_SAMPLE ? (
                          <span className="sub">×{r.multiplier}</span>
                        ) : (
                          <b>×{r.multiplier}</b>
                        )}
                      </td>
                      {[
                        r.permanent,
                        r.startedWorkout,
                        r.completedWorkout,
                        r.threeWorkouts,
                        r.challengeJoined,
                        r.reworkoutD7,
                      ].map((n, i) => (
                        <td
                          key={i}
                          style={{ padding: "10px 6px", textAlign: "right" }}
                        >
                          {n}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="insight" style={{ marginTop: 14 }}>
            <b>이 표는 &ldquo;그 사람이 데려온 사람&rdquo;까지 셉니다.</b>{" "}
            인플루언서 A의 링크로 철수가 들어오고, 철수가 영희를, 영희가 민수를
            데려왔다면 <b>셋 다 A의 성과</b>입니다. <b>배수</b>는 총 영향 ÷ 직접
            유입이라, ×2.5면 직접 20명이 결국 50명이 됐다는 뜻입니다.
            <br />
            <br />
            바로 위 <b>제안처·캠페인별 성과</b> 표와 뜻이 다릅니다 — 그쪽은
            그 링크로 <b>직접</b> 들어온 사람만 셉니다. 두 숫자가 다른 것이
            정상입니다.
            {meaningful.some((r) => r.direct < MIN_RATIO_SAMPLE) && (
              <>
                <br />
                <br />⚠️ 직접 유입이 {MIN_RATIO_SAMPLE}명 미만인 줄은 배수를
                흐리게 뒀습니다. 한 명이 더 들어오는 것만으로 배수가 크게
                뜁니다 — 좋다/나쁘다를 판정하지 마세요.
              </>
            )}
          </div>
        </>
      )}

      <div className="insight" style={{ marginTop: 12 }}>
        <b>어떤 경로로 들어왔나</b>
        <div style={{ marginTop: 6 }}>
          {kinds.length === 0
            ? "아직 집계할 사람이 없습니다."
            : kinds.map((k) => `${k.kind} ${k.count}명`).join(" · ")}
        </div>
      </div>

      {/* ⚠️ 이상 건을 숨기지 않는다. 숨기면 다음 사람이 총합이 안 맞는 이유를 못 찾는다 */}
      <div className="insight" style={{ marginTop: 12 }}>
        {anomalyTotal === 0 ? (
          <>✅ 초대 계보 이상 0건</>
        ) : (
          <>
            ⚠️ <b>초대 계보 이상 {anomalyTotal}건</b> — 초대자를 끝까지 따라갈 수
            없는 사람입니다. <b>어떤 캠페인에도 넣지 않고</b> 위 표의{" "}
            <code>{UNKNOWN_ROOT}</code> 줄에 모았습니다.
            <div style={{ marginTop: 6 }}>
              {anomalies
                .map((a) => `${ANOMALY_LABEL[a.kind]} ${a.count}건`)
                .join(" · ")}
            </div>
          </>
        )}
      </div>
    </article>
  );
}

const ANOMALY_LABEL: Record<string, string> = {
  cycle: "서로를 초대자로 가리킴",
  self: "자기 자신을 초대자로 가리킴",
  missing_inviter: "초대자를 찾을 수 없음",
  too_deep: "사슬이 너무 김",
};
