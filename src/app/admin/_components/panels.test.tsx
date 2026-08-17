import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildPeriod,
  buildKpi,
  activeUserCounts,
  dailyActiveSeries,
  ratio,
  type Retention,
} from "@/lib/domain/analytics";
import {
  briefingSlotBreakdown,
  notificationConversion,
  referralMetrics,
  viewingPassMetrics,
  type EngagementNotificationRow,
} from "@/lib/domain/analytics-engagement";
import {
  buildProgramMetrics,
  type ProgramEnrollmentRow,
} from "@/lib/domain/analytics-program";
import { ActivityChart } from "./activity-chart";
import { ChallengePanel } from "./challenge-panel";
import { EngagementPanel } from "./engagement-panel";
import { FunnelPanel } from "./funnel-panel";
import { GrowthPanel } from "./growth-panel";
import { KpiCards } from "./kpi-cards";
import { NotificationPanel } from "./notification-panel";
import { ProgramPanel } from "./program-panel";
import { RetentionPanel } from "./retention-panel";

const now = new Date("2026-07-28T00:00:00Z");
const period = buildPeriod(28, now);
const KST = "Asia/Seoul";

/** 숫자가 깨진 화면은 어떤 패널에서도 나오면 안 된다 */
function expectNoBrokenNumbers(html: string) {
  expect(html).not.toContain("NaN");
  expect(html).not.toContain("Infinity");
  expect(html).not.toContain("undefined");
  expect(html).not.toContain("[object Object]");
}

describe("KpiCards", () => {
  it("빈 데이터에서도 렌더된다", () => {
    const html = renderToStaticMarkup(
      <KpiCards kpi={buildKpi([], [], period, now)} />,
    );
    expect(html).toContain("활성 사용자");
    expect(html).toContain("완료 운동");
  });

  // 직전 구간이 0일 때 ∞%나 NaN이 화면에 나오면 안 된다
  it("직전 구간이 없으면 퍼센트 대신 안내 문구", () => {
    const kpi = buildKpi(
      [
        {
          userId: "u1",
          status: "completed",
          startedAt: new Date("2026-07-20T00:00:00Z"),
          completedAt: new Date("2026-07-20T00:00:00Z"),
        },
      ],
      [],
      period,
      now,
    );
    const html = renderToStaticMarkup(<KpiCards kpi={kpi} />);
    expect(html).toContain("직전 구간 없음");
    expect(html).not.toContain("Infinity");
    expect(html).not.toContain("NaN");
  });

  it("모수가 작으면 완료율을 퍼센트로 쓰지 않는다", () => {
    const kpi = buildKpi(
      [
        {
          userId: "u1",
          status: "completed",
          startedAt: new Date("2026-07-20T00:00:00Z"),
          completedAt: new Date("2026-07-20T00:00:00Z"),
        },
        {
          userId: "u2",
          status: "cancelled",
          startedAt: new Date("2026-07-21T00:00:00Z"),
          completedAt: null,
        },
      ],
      [],
      period,
      now,
    );
    const html = renderToStaticMarkup(<KpiCards kpi={kpi} />);
    expect(html).toContain("1/2");
    expect(html).not.toContain("50%");
  });
});

describe("ActivityChart", () => {
  it("활동이 전혀 없어도 막대 자리를 그린다", () => {
    const html = renderToStaticMarkup(
      <ActivityChart
        points={dailyActiveSeries([], buildPeriod(7, now), "Asia/Seoul")}
        counts={activeUserCounts([], now)}
      />,
    );
    expect(html).toContain("일별 활성 사용자");
    expect(html).toContain("오늘");
    // DAU/MAU 모수 0은 "—"
    expect(html).toContain("—");
    expect(html).not.toContain("NaN");
  });
});

describe("RetentionPanel", () => {
  it("재방문이 아니라 재운동이라고 쓴다", () => {
    const retention: Retention = {
      d1: ratio(1, 4),
      d7: ratio(0, 0),
      d28: ratio(2, 10),
    };
    const html = renderToStaticMarkup(
      <RetentionPanel retention={retention} />,
    );
    expect(html).toContain("재운동 리텐션");
    expect(html).toContain("1/4"); // 모수 4 → 퍼센트 없음
    expect(html).toContain("20% (2/10)"); // 모수 10 → 퍼센트
    expect(html).toContain("—"); // 모수 0
  });
});

describe("FunnelPanel", () => {
  it("단계와 크루 참여율을 렌더한다", () => {
    const html = renderToStaticMarkup(
      <FunnelPanel
        steps={[
          { label: "가입 완료", count: 10 },
          { label: "프로필 설정", count: 8 },
          { label: "첫 운동 완료", count: 5 },
          { label: "3회 운동 완료", count: 2 },
        ]}
        crew={ratio(3, 10)}
      />,
    );
    expect(html).toContain("가입 완료");
    expect(html).toContain("3회 운동 완료");
    expect(html).toContain("크루 참여 30% (3/10)");
    expect(html).toContain("-20%"); // 10 → 8
  });

  it("가입자가 0이면 나눗셈이 깨지지 않는다", () => {
    const html = renderToStaticMarkup(
      <FunnelPanel
        steps={[
          { label: "가입 완료", count: 0 },
          { label: "프로필 설정", count: 0 },
          { label: "첫 운동 완료", count: 0 },
          { label: "3회 운동 완료", count: 0 },
        ]}
        crew={ratio(0, 0)}
      />,
    );
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });
});

describe("ChallengePanel", () => {
  it("진행 중 챌린지가 없으면 그렇게 말한다", () => {
    const html = renderToStaticMarkup(<ChallengePanel items={[]} />);
    expect(html).toContain("진행 중인 챌린지가 없습니다");
  });

  it("목표 미설정이면 달성률 대신 안내", () => {
    const html = renderToStaticMarkup(
      <ChallengePanel
        items={[
          {
            id: "c1",
            name: "7월 GND 탈출반",
            daysLeft: 4,
            memberCount: 3,
            achievementPct: null,
          },
        ]}
      />,
    );
    expect(html).toContain("7월 GND 탈출반");
    expect(html).toContain("D-4");
    expect(html).toContain("목표 미설정");
  });
});

describe("GrowthPanel", () => {
  it("데이터가 비어도 렌더된다", () => {
    const html = renderToStaticMarkup(
      <GrowthPanel
        data={{
          stageDistribution: [],
          xpByReason: [],
          pointsIssued: 0,
          walletBalance: 0,
          badgeCounts: [],
        }}
      />,
    );
    expect(html).toContain("성장 단계 분포");
    expect(html).toContain("아직 XP를 쌓은 사용자가 없습니다");
    expect(html).not.toContain("NaN");
  });

  it("XP 원천을 한글 라벨로 보여준다", () => {
    const html = renderToStaticMarkup(
      <GrowthPanel
        data={{
          stageDistribution: [{ stageName: "일단하개", count: 2 }],
          xpByReason: [
            { reason: "workout_completed", label: "운동 완료", total: 1400 },
            { reason: "workout_photo", label: "인증 사진", total: 30 },
          ],
          pointsIssued: 900,
          walletBalance: 900,
          badgeCounts: [
            { badgeKey: "b1", rarity: "common", earned: 2 },
            { badgeKey: "b2", rarity: "mythic", earned: 0 },
          ],
        }}
      />,
    );
    expect(html).toContain("운동 완료");
    expect(html).toContain("인증 사진");
    expect(html).not.toContain("workout_completed");
    expect(html).toContain("COMMON");
    expect(html).toContain("MYTHIC");
  });
});

// ── 2026-08-17 추가: 프로그램 · 알림 · 열람권/확산 ────────────────────

function enrollment(
  over: Partial<ProgramEnrollmentRow> & { id: string },
): ProgramEnrollmentRow {
  return {
    userId: `u-${over.id}`,
    programKey: "shoulder-frame-6w",
    title: "상체의 틀을 넓히는 6주",
    status: "active",
    createdAt: new Date("2026-07-20T00:00:00Z"),
    endedAt: null,
    ...over,
  };
}

describe("ProgramPanel", () => {
  it("등록이 없으면 퍼널을 0으로 그리지 않고 그렇게 말한다", () => {
    const html = renderToStaticMarkup(
      <ProgramPanel metrics={buildProgramMetrics([], [], 0, period)} />,
    );
    expect(html).toContain("공식 프로그램 등록·완주");
    expect(html).toContain("아직 프로그램 등록이 없습니다");
    // 빈 막대 넷은 "다 이탈했다"로 읽힌다
    expect(html).not.toContain("1회차 완료");
    expectNoBrokenNumbers(html);
  });

  it("기간 규칙을 화면에 적는다 — 누적과 신규 등록을 구분한다", () => {
    const html = renderToStaticMarkup(
      <ProgramPanel
        metrics={buildProgramMetrics([enrollment({ id: "a" })], [], 10, period)}
      />,
    );
    // 이 문구가 사라지면 "완주 0"을 기간 탓으로 오해하게 된다
    expect(html).toContain("상태·완주율·퍼널은 누적입니다");
    expect(html).toContain("기간 내 신규 1건");
  });

  it("완주율 모수가 5 미만이면 퍼센트를 쓰지 않는다", () => {
    const html = renderToStaticMarkup(
      <ProgramPanel
        metrics={buildProgramMetrics(
          [
            enrollment({ id: "a", status: "active" }),
            enrollment({ id: "b", status: "completed", endedAt: now }),
            enrollment({ id: "c", status: "cancelled", endedAt: now }),
            enrollment({ id: "d", status: "cancelled", endedAt: now }),
          ],
          [],
          10,
          period,
        )}
      />,
    );
    expect(html).toContain("1/3"); // 완주 1 / 끝난 등록 3
    expect(html).not.toContain("33%");
    expect(html).toContain("진행 1");
    expect(html).toContain("포기 2");
    expectNoBrokenNumbers(html);
  });

  it("프로그램별 목록은 등록 당시 제목으로 낸다", () => {
    const html = renderToStaticMarkup(
      <ProgramPanel
        metrics={buildProgramMetrics(
          [
            enrollment({
              id: "a",
              programKey: "interval-burn-6w",
              title: "인터벌 번",
            }),
            enrollment({
              id: "b",
              programKey: "interval-burn-6w",
              title: "인터벌 번",
            }),
            enrollment({ id: "c" }),
          ],
          [],
          10,
          period,
        )}
      />,
    );
    expect(html).toContain("인터벌 번");
    expect(html).toContain("상체의 틀을 넓히는 6주");
    expect(html).not.toContain("interval-burn-6w");
  });
});

describe("NotificationPanel", () => {
  function notif(
    over: Partial<EngagementNotificationRow> = {},
  ): EngagementNotificationRow {
    return {
      userId: "u1",
      type: "morning_briefing",
      createdAt: new Date("2026-07-20T21:40:00Z"), // KST 07-21 06:40
      readAt: null,
      ...over,
    };
  }

  const empty = {
    conversions: notificationConversion([], new Map(), period, KST),
    slots: briefingSlotBreakdown([], new Map(), period, KST),
  };

  it("발송이 하나도 없어도 렌더된다", () => {
    const html = renderToStaticMarkup(<NotificationPanel {...empty} />);
    expect(html).toContain("알림 발송과 그날의 행동");
    expect(html).toContain("기간 내 아침 발송이 없습니다");
    expect(html).toContain("—"); // 모수 0은 0%가 아니라 측정 불가
    expectNoBrokenNumbers(html);
  });

  it("인과를 주장하는 단어를 쓰지 않는다", () => {
    const html = renderToStaticMarkup(<NotificationPanel {...empty} />);
    expect(html).toContain("받은 날 운동");
    // ⚠️ 이 단언을 지우지 마라. 앱이 푸시 클릭을 수집하지 않는다 —
    //    라벨이 "전환율"이 되는 순간 없는 계측을 있다고 말하는 화면이 된다.
    expect(html).not.toContain("전환율");
    expect(html).not.toContain("클릭률");
    expect(html).toContain("알림이 원인이라는 증거는 아닙니다");
    // 라벨과 설명이 같은 말을 써야 한다 — 다르면 무엇을 설명하는지가 흐려진다
    expect(html).toContain("운동을 완료했다는 뜻입니다");
  });

  it("모수가 5 미만이면 퍼센트를 쓰지 않는다", () => {
    const rows = [notif({ readAt: new Date("2026-07-21T00:00:00Z") }), notif()];
    const html = renderToStaticMarkup(
      <NotificationPanel
        conversions={notificationConversion(
          rows,
          new Map([["u1", new Set(["2026-07-21"])]]),
          period,
          KST,
        )}
        slots={briefingSlotBreakdown(rows, new Map(), period, KST)}
      />,
    );
    expect(html).toContain("1/2");
    expect(html).not.toContain("50% (1/2)");
    expectNoBrokenNumbers(html);
  });

  it("09:00 슬롯에는 폴백이 섞인다고 적는다", () => {
    const rows = [notif({ createdAt: new Date("2026-07-21T00:05:00Z") })]; // KST 09:05
    const html = renderToStaticMarkup(
      <NotificationPanel
        conversions={notificationConversion(rows, new Map(), period, KST)}
        slots={briefingSlotBreakdown(rows, new Map(), period, KST)}
      />,
    );
    expect(html).toContain("09:00");
    expect(html).toContain("폴백");
    // 09:00 슬롯이 전부 폴백이라고 단정하면 안 된다
    expect(html).toContain("이 슬롯이 전부 폴백은 아닙니다");
  });
});

describe("EngagementPanel", () => {
  it("데이터가 비어도 렌더된다", () => {
    const html = renderToStaticMarkup(
      <EngagementPanel
        pass={viewingPassMetrics([], 0, 0, 0, KST)}
        referral={referralMetrics([], 0, 0)}
      />,
    );
    expect(html).toContain("열람권 사용");
    expect(html).toContain("크루 확산");
    expectNoBrokenNumbers(html);
  });

  it("열람권을 아무도 안 썼으면 빈 링과 0/N을 그린다", () => {
    // 2026-08-17 실측: record_views 0행. 이게 이 패널의 핵심 검증이다.
    const html = renderToStaticMarkup(
      <EngagementPanel
        pass={{
          kingEligibleWeeks: 6,
          kingUsed: 0,
          kingUsage: ratio(0, 6),
          challengeUnlocked: 3,
          challengePicked: 2,
          challengeUsage: ratio(2, 3),
        }}
        referral={referralMetrics([{ userA: "u1", userB: "u2" }], 7, 7)}
      />,
    );
    expect(html).toContain("0% (0/6)");
    expect(html).toContain("0deg"); // 링이 비어 있다
    expect(html).toContain("2/3"); // 모수 3 → 퍼센트 없음
    expectNoBrokenNumbers(html);
  });

  it("확산 패널이 측정 한계를 명시한다", () => {
    const html = renderToStaticMarkup(
      <EngagementPanel
        pass={viewingPassMetrics([], 0, 0, 0, KST)}
        referral={referralMetrics([{ userA: "u1", userB: "u2" }], 7, 7)}
      />,
    );
    // ⚠️ 이 단언을 지우지 마라. 문구가 사라지면 화면이 없는 계측을 있다고 말한다.
    expect(html).toContain("바이럴 계수는 측정할 수 없습니다");
    expect(html).toContain("crew_links에 같은 모양으로");
  });
});
