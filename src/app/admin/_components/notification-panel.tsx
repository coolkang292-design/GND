import { formatRatio, type Ratio } from "@/lib/domain/analytics";
import type {
  BriefingSlot,
  NotificationConversion,
} from "@/lib/domain/analytics-engagement";
import { MetricHelp } from "./metric-help";

/** 발송을 100%로 놓고 그 아래 단계를 비율로 그린다 */
function Row({
  label,
  value,
  width,
}: {
  label: string;
  value: string;
  width: number;
}) {
  return (
    <div className="frow">
      <label>
        <span>{label}</span>
        <b>{value}</b>
      </label>
      <div className="track">
        <i style={{ width: `${width}%` }} />
      </div>
      <span className="loss" />
    </div>
  );
}

function pct(r: Ratio): number {
  return r.denominator === 0 ? 0 : (r.numerator / r.denominator) * 100;
}

export function NotificationPanel({
  conversions,
  slots,
}: {
  conversions: NotificationConversion[];
  slots: BriefingSlot[];
}) {
  const maxSent = Math.max(1, ...slots.map((s) => s.sent));
  const hasFallbackSlot = slots.some((s) => s.isFallbackSlot);

  return (
    <section className="grid equal" id="notify">
      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="kicker">NOTIFICATION</p>
            <h2>알림 발송과 그날의 행동</h2>
          </div>
          <span className="muted">기간 내 발송 기준</span>
        </div>

        {conversions.map((c) => (
          <div key={c.type} style={{ marginBottom: 16 }}>
            <p className="kicker" style={{ margin: "0 0 8px" }}>
              {c.label}
            </p>
            <div className="funnel">
              <Row label="발송" value={`${c.sent}건`} width={c.sent === 0 ? 0 : 100} />
              <Row label="열람" value={formatRatio(c.opened)} width={pct(c.opened)} />
              {/* ⚠️ "전환"이 아니다 — 아래 insight가 뜻을 그대로 적는다.
                   라벨을 "받은 날 운동 완료"로 길게 쓰면 130px 칸에서 "완/료"로
                   끊긴다(개발 서버에서 확인). 뜻은 insight가 온전히 말한다. */}
              <Row
                label="받은 날 운동"
                value={formatRatio(c.workedOutSameDay)}
                width={pct(c.workedOutSameDay)}
              />
            </div>
          </div>
        ))}

        <div className="insight">
          <b>
            &ldquo;받은 날 운동&rdquo;은 알림을 받은 날 그 사용자가 운동을 완료했다는
            뜻입니다. 알림이 원인이라는 증거는 아닙니다.
          </b>
          <br />
          앱이 푸시 클릭을 수집하지 않습니다. &ldquo;열람&rdquo;은 알림함에서 열어
          본 것(`read_at`)이지 푸시를 누른 것이 아닙니다. 모수는 사람이 아니라{" "}
          <b>발송 건</b>입니다.
        </div>

        <MetricHelp
          keys={["notify-sent", "notify-opened", "notify-same-day-workout"]}
        />
      </article>

      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="kicker">SEND TIME</p>
            <h2>아침 발송 시각 분포</h2>
          </div>
          <span className="muted">30분 슬롯 · KST</span>
        </div>

        {slots.length === 0 ? (
          <div className="insight">기간 내 아침 발송이 없습니다.</div>
        ) : (
          <div className="funnel">
            {slots.map((s) => (
              <div className="frow" key={s.minuteOfDay}>
                <label>
                  <span>
                    {s.label}
                    {s.isFallbackSlot ? " *" : ""}
                  </span>
                  <b>{formatRatio(s.workedOutSameDay)}</b>
                </label>
                <div className="track">
                  <i style={{ width: `${(s.sent / maxSent) * 100}%` }} />
                </div>
                <span className="loss">{s.sent}건</span>
              </div>
            ))}
          </div>
        )}

        {hasFallbackSlot ? (
          <p className="muted" style={{ margin: "10px 0 0" }}>
            * 09:00은 평소 시각 추정이 없을 때 떨어지는 기본 시각이라 폴백이
            섞입니다. 이 슬롯이 전부 폴백은 아닙니다.
          </p>
        ) : null}

        <div className="insight" style={{ marginTop: 14 }}>
          <b>막대는 발송량, 오른쪽 비율은 그날 운동을 완료한 비율입니다.</b>
          <br />
          발송 시각은 각자 <b>평소 운동 시작 30분 전</b>으로 추정합니다. 전원이
          09:00에 몰려 있다면 추정이 거의 되지 않고 있다는 뜻입니다.
        </div>

        <MetricHelp keys={["briefing-slots"]} />
      </article>
    </section>
  );
}
