import type { GrowthDataset } from "@/lib/admin/queries";
import { MetricHelp } from "./metric-help";

const RARITY_ORDER = ["mythic", "legend", "epic", "rare", "common"];

export function GrowthPanel({ data }: { data: GrowthDataset }) {
  const maxStage = Math.max(1, ...data.stageDistribution.map((s) => s.count));
  const maxXp = Math.max(1, ...data.xpByReason.map((x) => x.total));
  const earnedTotal = data.badgeCounts.reduce((s, b) => s + b.earned, 0);

  // 희귀도별로 몇 종이 누구에게든 한 번이라도 나갔는지
  const byRarity = RARITY_ORDER.map((rarity) => {
    const of = data.badgeCounts.filter((b) => b.rarity === rarity);
    return {
      rarity,
      total: of.length,
      unlocked: of.filter((b) => b.earned > 0).length,
    };
  }).filter((r) => r.total > 0);

  return (
    <section className="grid equal" id="levels">
      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="kicker">GROWTH</p>
            <h2>성장 단계 분포</h2>
          </div>
          <span className="muted">누적 XP로 재계산</span>
        </div>

        {data.stageDistribution.length === 0 ? (
          <div className="insight">아직 XP를 쌓은 사용자가 없습니다.</div>
        ) : (
          <div className="funnel">
            {data.stageDistribution.map((s) => (
              <div className="frow" key={s.stageName}>
                <label>
                  <span>{s.stageName}</span>
                  <b>{s.count}명</b>
                </label>
                <div className="track">
                  <i style={{ width: `${(s.count / maxStage) * 100}%` }} />
                </div>
                <span className="loss" />
              </div>
            ))}
          </div>
        )}

        <div className="summary">
          {byRarity.map((r) => (
            <div key={r.rarity}>
              <small>{r.rarity.toUpperCase()}</small>
              <b>
                {r.unlocked}/{r.total}
              </b>
            </div>
          ))}
        </div>

        <MetricHelp keys={["stage-distribution", "badge-earned"]} />
      </article>

      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="kicker">XP · POINT</p>
            <h2>XP 원천과 포인트 경제</h2>
          </div>
        </div>

        {data.xpByReason.length === 0 ? (
          <div className="insight">아직 XP 거래가 없습니다.</div>
        ) : (
          <div className="funnel">
            {data.xpByReason.map((x) => (
              <div className="frow" key={x.reason}>
                <label>
                  <span>{x.label}</span>
                  <b>{x.total.toLocaleString()} XP</b>
                </label>
                <div className="track">
                  <i
                    style={{
                      width: `${(Math.abs(x.total) / maxXp) * 100}%`,
                      // 회수·정정은 음수라 색을 달리해 오해를 막는다
                      background:
                        x.total < 0
                          ? "linear-gradient(90deg,#7a3535,#ff7474)"
                          : undefined,
                    }}
                  />
                </div>
                <span className="loss" />
              </div>
            ))}
          </div>
        )}

        <div className="summary">
          <div>
            <small>포인트 발행</small>
            <b>{data.pointsIssued.toLocaleString()}</b>
          </div>
          <div>
            <small>지갑 잔액 합</small>
            <b>{data.walletBalance.toLocaleString()}</b>
          </div>
          <div>
            <small>배지 획득 총계</small>
            <b>{earnedTotal}</b>
          </div>
          <div>
            <small>배지 종류</small>
            <b className="gold">{data.badgeCounts.length}</b>
          </div>
        </div>

        <MetricHelp
          keys={["xp-by-reason", "points-issued", "wallet-balance"]}
        />
      </article>
    </section>
  );
}
