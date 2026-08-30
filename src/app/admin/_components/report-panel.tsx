import { REPORT_REASONS } from "@/lib/domain/moderation";
import type { AdminReport } from "@/lib/admin/queries";

const REASON_LABEL = new Map(REPORT_REASONS.map((r) => [r.id as string, r.label]));

function shortWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

/**
 * 신고함 (0089).
 *
 * ⚠️ **맨 위에 둔다.** 지표 패널 사이에 끼우면 스크롤을 내려야 보이고, 안 내리면
 *    신고가 며칠씩 방치된다. 0건이면 한 줄로 접히므로 자리를 거의 안 먹는다.
 *
 * 자동 조치는 없다(사용자 결정 2026-08-31). 8명 규모에서 "N건이면 자동 숨김"은
 * 소수가 담합해 정상 글을 내리는 쪽으로 먼저 악용된다. 사람이 보고 판단한다.
 *
 * 처리(reviewed/dismissed)는 아직 SQL Editor에서 한다:
 *   update public.user_reports set status='reviewed', reviewed_at=now() where id='...';
 */
export function ReportPanel({ items }: { items: AdminReport[] }) {
  return (
    <article className="panel" id="reports">
      <div className="panel-title">
        <div>
          <p className="kicker">SAFETY</p>
          <h2>처리 안 된 신고</h2>
        </div>
        <span className="muted">{items.length}건</span>
      </div>

      {items.length === 0 ? (
        <div className="insight">처리할 신고가 없습니다.</div>
      ) : (
        <div className="challenges">
          {items.map((r) => (
            <div className="challenge" key={r.id}>
              <div className="challenge-icon">🚩</div>
              <div>
                <div className="challenge-top">
                  <b>{r.targetNickname}</b>
                  <span>{shortWhen(r.createdAt)}</span>
                </div>
                <p>
                  {REASON_LABEL.get(r.reason) ?? r.reason} · 신고자{" "}
                  {r.reporterNickname}
                  {r.challengeName && ` · 모집글 「${r.challengeName}」`}
                </p>
                {/* 신고자가 쓴 설명. 판단의 핵심이라 접지 않는다. */}
                {r.note && (
                  <p style={{ whiteSpace: "pre-line" }}>“{r.note}”</p>
                )}
                <p className="muted" style={{ fontSize: 11 }}>
                  대상 id {r.targetId}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <MetricHelpNote />
    </article>
  );
}

function MetricHelpNote() {
  return (
    <div className="insight" style={{ marginTop: 12 }}>
      처리하려면 SQL Editor에서:{" "}
      <code>
        update public.user_reports set status=&#39;reviewed&#39;, reviewed_at=now() where
        id=&#39;…&#39;;
      </code>{" "}
      — <b>dismissed</b>는 근거 없는 신고입니다. 처리하면 신고자가 같은 사람을 다시
      신고할 수 있게 됩니다.
    </div>
  );
}
