import Link from "next/link";
import { formatRatio, MIN_RATIO_SAMPLE } from "@/lib/domain/analytics";
import { campaignLabel } from "@/lib/domain/analytics-acquisition";
import {
  biggestFrictions,
  type CampaignRow,
  type FunnelStepCount,
} from "@/lib/domain/analytics-funnel";

/**
 * 캠페인 상세 퍼널 (배포 D) — 선택한 집단만 대상으로 어디서 빠졌는지 본다.
 *
 * ⚠️ **가장 큰 마찰 구간은 표본이 충분할 때만 말한다.** 실사용자 4명 규모에서
 *    "32% 이탈이 문제다"는 가짜 확신이다. `biggestFrictions`가 빈 배열을 주면
 *    화면이 "표본 부족 — 판정 안 함"이라고 정직하게 말한다.
 *
 * ⚠️ 마지막 칸은 **RETENTION 패널의 D7과 다르다.** 그쪽은 가입 7일째 하루만
 *    본다. 여기는 "일주일 뒤에도 살아 있나"라서 그 이후 아무 날이나 한 번이면
 *    도달로 센다. 이름을 다르게 지어 둔 이유다 — 섞어 읽으면 둘 다 틀린다.
 */
export function CampaignFunnelPanel({
  row,
  campaigns,
}: {
  /** 선택된 캠페인. 없으면 안내만 그린다 */
  row: CampaignRow | null;
  /** 고를 수 있는 캠페인 목록 */
  campaigns: string[];
}) {
  return (
    // minWidth: 0 — 위 비교표 패널과 같은 이유 (그리드 아이템은 안 줄어든다)
    <article className="panel" id="campaign-funnel" style={{ minWidth: 0 }}>
      <div className="panel-title">
        <div>
          <p className="kicker">CAMPAIGN FUNNEL</p>
          <h2>{row ? campaignLabel(row.campaign) : "캠페인 상세 퍼널"}</h2>
        </div>
        {row && <span className="muted">유입 {row.entered}명</span>}
      </div>

      {campaigns.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 14,
          }}
        >
          {campaigns.map((c) => (
            <Link
              key={c}
              href={`/admin?campaign=${encodeURIComponent(c)}#campaign-funnel`}
              className="sub"
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,.14)",
                background:
                  row?.campaign === c ? "rgba(255,255,255,.10)" : undefined,
              }}
            >
              {campaignLabel(c)}
            </Link>
          ))}
        </div>
      )}

      {!row ? (
        <div className="insight">
          위 표에서 캠페인을 고르면 <b>그 집단만의 퍼널</b>이 여기 열립니다.
          {campaigns.length === 0 && (
            <>
              {" "}
              아직 계측된 캠페인이 없습니다 — 파일럿 링크로 사람이 들어오면
              채워집니다.
            </>
          )}
        </div>
      ) : (
        <>
          <FunnelBars steps={row.steps} />
          <Frictions steps={row.steps} entered={row.entered} />
          <div className="insight" style={{ marginTop: 12 }}>
            <b>챌린지 참가 {row.challengeJoined}명</b>은 퍼널 단계에 넣지
            않았습니다 — 챌린지는 모두가 거치는 길이 아니라서, 단계로 넣으면
            혼자 운동하는 정상 사용자가 전부 이탈로 보입니다.
          </div>
        </>
      )}
    </article>
  );
}

function FunnelBars({ steps }: { steps: FunnelStepCount[] }) {
  const top = Math.max(1, steps[0]?.count ?? 1);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {steps.map((s) => (
        <div key={s.step}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 10,
              marginBottom: 5,
            }}
          >
            <span style={{ fontSize: 13 }}>{s.step}</span>
            <b style={{ whiteSpace: "nowrap" }}>{s.count}명</b>
          </div>
          <div className="track">
            <i style={{ width: `${(s.count / top) * 100}%` }} />
          </div>
          {/* ⚠️ 퍼널의 `.loss`와 달리 항상 보이게 한다 — 폰에서 사라지면
              "왜 줄었나"를 알 수 없다(MEMBERSHIP 패널에서 같은 실수를 했다). */}
          {s.dropped !== null && s.dropRate !== null && (
            <div className="sub" style={{ marginTop: 5, fontSize: 12 }}>
              {s.dropped > 0
                ? `직전 대비 -${s.dropped}명 (${formatRatio(s.dropRate)})`
                : "이탈 없음"}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Frictions({
  steps,
  entered,
}: {
  steps: FunnelStepCount[];
  entered: number;
}) {
  const frictions = biggestFrictions(steps);

  if (frictions.length === 0) {
    return (
      <div className="insight" style={{ marginTop: 14 }}>
        <b>표본 부족 — 마찰 구간 판정 안 함.</b> 이 집단의 유입이 {entered}명이라
        비율이 한두 명으로 크게 흔들립니다. 어느 단계가 진짜 문제인지 말하려면
        각 구간의 직전 단계 인원이 최소 {MIN_RATIO_SAMPLE}명은 되어야 합니다.
      </div>
    );
  }

  return (
    <div className="insight" style={{ marginTop: 14 }}>
      <b>가장 크게 빠진 구간</b>
      {frictions.map((f) => (
        <div key={`${f.from}-${f.to}`} style={{ marginTop: 6 }}>
          🔴 {f.from} → {f.to} · <b>{f.dropped}명</b> 이탈 (
          {formatRatio(f.dropRate)})
        </div>
      ))}
    </div>
  );
}
