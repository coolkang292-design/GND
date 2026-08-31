import Link from "next/link";
import { formatRatio, MIN_RATIO_SAMPLE } from "@/lib/domain/analytics";
import { campaignLabel } from "@/lib/domain/analytics-acquisition";
import {
  FUNNEL_STEPS,
  type CampaignCohortResult,
} from "@/lib/domain/analytics-funnel";

/**
 * 제안처·캠페인 비교표 (배포 D).
 *
 * 답해야 하는 질문: **"어느 인플루언서/커뮤니티가 좋은 사용자를 데려왔는가?"**
 * 운영자가 Supabase SQL Editor를 열지 않고 여기서 답할 수 있어야 완료다.
 *
 * ⚠️ **`source`까지만 보여주면 완료가 아니다.** 같은 인스타 안에서도 인플루언서
 *    A/B와 pilot01/02가 갈려야 한다. 그래서 행의 기준이 `campaign`이다.
 *
 * ⚠️ **"몇 명 데려왔나"와 "좋은 사용자를 데려왔나"는 다르다.** 유입이 많아도
 *    뒤 단계가 얇으면 질이 낮은 것이다. 그래서 유입 수로 정렬하되 전환율을
 *    같은 줄에 둔다.
 */

/** 비교표에 세울 단계 — 전부는 너무 넓어서 의미 있는 관문만 고른다 */
const COLUMNS = [
  { step: "온보딩 시작", short: "온보딩" },
  { step: "정식 계정 전환", short: "정식전환" },
  { step: "프로필 완료", short: "프로필" },
  { step: "첫 운동 시작", short: "운동시작" },
  { step: "첫 운동 완료", short: "운동완료" },
  { step: "3회 운동", short: "3회" },
  { step: "가입 7일 후 재운동", short: "7일후" },
] as const;

export function CampaignComparisonPanel({
  data,
  selected,
}: {
  data: CampaignCohortResult;
  /** 지금 상세 퍼널이 열린 캠페인 — 표에서 강조한다 */
  selected: string | null;
}) {
  const idx = (step: string) => FUNNEL_STEPS.indexOf(step as never);
  const { rows, mismatches, measured } = data;

  return (
    /*
      ⚠️⚠️ `minWidth: 0`을 빼지 마라 (2026-08-31 개발 서버 375px에서 잡았다).
         `.panel`은 `.grid` 안의 그리드 아이템인데, 그리드 아이템의 기본값은
         `min-width: auto`라 **내용보다 작아지기를 거부한다.** 그래서 아래 표의
         `minWidth: 620`이 패널을 통째로 664px로 부풀려 화면 밖으로 밀어냈다 —
         표의 오른쪽 열과 설명 문구가 잘렸다. `overflow-x: auto`는 부모가 줄어들 수
         있어야만 작동한다.
    */
    <article className="panel" id="campaigns" style={{ minWidth: 0 }}>
      <div className="panel-title">
        <div>
          <p className="kicker">ACQUISITION QUALITY</p>
          <h2>제안처·캠페인별 성과</h2>
        </div>
        <span className="muted">계측된 사용자 {formatRatio(measured)}</span>
      </div>

      {rows.length === 0 ? (
        <div className="insight">
          <b>아직 계측된 유입이 없습니다.</b> 이 표는 2026-08-31에 계측을 붙인
          뒤 <b>새로 들어온 사람</b>부터 채워집니다. 그 전에 가입한 사람은 어느
          링크로 왔는지 기록이 없어 추측으로 채우지 않습니다.
          <br />
          <br />
          파일럿 링크 예시:{" "}
          <code>
            ?utm_source=instagram&amp;utm_medium=creator&amp;utm_campaign=influencer_a_pilot01
          </code>
          <br />
          같은 인스타여도 <code>utm_campaign</code>이 다르면 여기서 다른 줄로
          갈립니다.
        </div>
      ) : (
        <>
          {/* ⚠️ 열이 많아 좁은 화면에서 넘친다. 표만 가로로 스크롤시키고
              페이지 본문은 절대 가로로 밀리지 않게 한다. */}
          <div style={{ overflowX: "auto", minWidth: 0 }}>
            <table
              style={{
                width: "100%",
                minWidth: 620,
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: "8px 6px" }}>제안처 / 캠페인</th>
                  <th style={{ padding: "8px 6px", textAlign: "right" }}>유입</th>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.step}
                      style={{ padding: "8px 6px", textAlign: "right" }}
                    >
                      {c.short}
                    </th>
                  ))}
                  <th style={{ padding: "8px 6px", textAlign: "right" }}>챌린지</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const on = r.campaign === selected;
                  return (
                    <tr
                      key={r.campaign}
                      style={{
                        borderTop: "1px solid rgba(255,255,255,.08)",
                        background: on ? "rgba(255,255,255,.05)" : undefined,
                      }}
                    >
                      <td style={{ padding: "10px 6px" }}>
                        <Link
                          href={`/admin?campaign=${encodeURIComponent(r.campaign)}#campaign-funnel`}
                          style={{ textDecoration: "underline" }}
                        >
                          {campaignLabel(r.campaign)}
                        </Link>
                        <div className="sub" style={{ fontSize: 11 }}>
                          {r.source ?? "직접"}
                          {r.medium ? ` · ${r.medium}` : ""}
                        </div>
                      </td>
                      <td style={{ padding: "10px 6px", textAlign: "right" }}>
                        <b>{r.entered}</b>
                      </td>
                      {COLUMNS.map((c) => (
                        <td
                          key={c.step}
                          style={{ padding: "10px 6px", textAlign: "right" }}
                        >
                          {r.steps[idx(c.step)]?.count ?? 0}
                        </td>
                      ))}
                      <td style={{ padding: "10px 6px", textAlign: "right" }}>
                        {r.challengeJoined}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="insight" style={{ marginTop: 14 }}>
            <b>유입이 많은 것과 좋은 사용자를 데려온 것은 다릅니다.</b> 유입
            100명에 3회 운동 5명인 곳보다, 유입 20명에 3회 운동 12명인 곳이 더
            좋은 제안처입니다. 오른쪽으로 갈수록 남은 사람이라 <b>줄어드는 속도</b>를
            보세요. 캠페인 이름을 누르면 그 집단만의 퍼널이 아래에 열립니다.
            {rows.some((r) => r.entered < MIN_RATIO_SAMPLE) && (
              <>
                <br />
                <br />
                ⚠️ 유입이 {MIN_RATIO_SAMPLE}명 미만인 줄은 비율로 읽지 마세요 —
                한 명이 들고 나는 것으로 수십 %가 흔들립니다.
              </>
            )}
          </div>
        </>
      )}

      {/* ⚠️ 불일치가 있어도 화면이 죽지 않는다. 조용히 한쪽을 고르지도 않는다 —
          무엇을 골랐는지 말하고, 어떤 쌍이 몇 건인지 보여준다. */}
      <div className="insight" style={{ marginTop: 12 }}>
        {mismatches.count === 0 ? (
          <>✅ campaign 귀속 불일치 0건</>
        ) : (
          <>
            ⚠️ <b>campaign 귀속 불일치 {mismatches.count}건</b> — 유입 기록과
            프로필 기록의 캠페인이 다릅니다. <b>비교표는 유입 기록 기준</b>으로
            셌습니다(프로필이 없는 사람까지 덮는 유일한 기록이라서요).
            <br />
            {mismatches.samples.map((m) => (
              <span key={`${m.eventCampaign}-${m.profileCampaign}`}>
                <code>{m.eventCampaign}</code> ↔{" "}
                <code>{m.profileCampaign}</code> ({m.count}건){" "}
              </span>
            ))}
          </>
        )}
      </div>
    </article>
  );
}
