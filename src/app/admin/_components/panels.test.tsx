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
  activeCrewMetrics,
  briefingSlotBreakdown,
  notificationConversion,
  referralMetrics,
  viewingPassMetrics,
  type EngagementNotificationRow,
} from "@/lib/domain/analytics-engagement";
import {
  acquisitionBreakdown,
  acquisitionCaptureRate,
  crewOriginBreakdown,
  originKnownRate,
  topInviters,
  type AcquisitionProfileRow,
  type CrewLinkOriginRow,
} from "@/lib/domain/analytics-acquisition";
import {
  buildProgramMetrics,
  type ProgramEnrollmentRow,
} from "@/lib/domain/analytics-program";
import {
  FUNNEL_STEPS,
  campaignCohorts,
} from "@/lib/domain/analytics-funnel";
import {
  UNKNOWN_ROOT,
  campaignSpread,
} from "@/lib/domain/analytics-referral-tree";
import { METRIC_HELP, type MetricHelpKey } from "@/lib/domain/metric-help";
import { MetricHelp } from "./metric-help";
import { AcquisitionPanel } from "./acquisition-panel";
import { ActivityChart } from "./activity-chart";
import { ChallengePanel } from "./challenge-panel";
import { EngagementPanel } from "./engagement-panel";
import { FunnelPanel } from "./funnel-panel";
import { GrowthPanel } from "./growth-panel";
import { KpiCards } from "./kpi-cards";
import { CampaignComparisonPanel } from "./campaign-comparison-panel";
import { CampaignFunnelPanel } from "./campaign-funnel-panel";
import { CampaignSpreadPanel } from "./campaign-spread-panel";
import { MembershipPanel } from "./membership-panel";
import { NotificationPanel } from "./notification-panel";
import { ProgramPanel } from "./program-panel";
import { RetentionPanel } from "./retention-panel";

const now = new Date("2026-07-28T00:00:00Z");
const period = buildPeriod(28, now);
const KST = "Asia/Seoul";

/**
 * 유입 패널용 최소 픽스처. **빈 입력이면 줄이 하나도 안 그려져** 라벨이 화면에
 * 나오지 않는다 — 카탈로그 단언이 라벨을 찾으므로 각 갈래를 1건씩 넣는다.
 */
const ORIGIN_ROWS: CrewLinkOriginRow[] = [
  { userA: "a", userB: "b", origin: "invite_link", initiatedBy: "a" },
  { userA: "c", userB: "d", origin: "unknown", initiatedBy: null },
];
const ACQ_PROFILES: AcquisitionProfileRow[] = [
  {
    userId: "a",
    nickname: "부른사람",
    invitedBy: null,
    source: "kakao",
    referrer: null,
  },
  {
    userId: "b",
    nickname: "들어온사람",
    invitedBy: "a",
    source: null,
    referrer: null,
  },
];

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
      d30: ratio(2, 10),
      aliveAfter30d: ratio(5, 10),
    };
    const html = renderToStaticMarkup(
      <RetentionPanel retention={retention} />,
    );
    expect(html).toContain("재운동 리텐션");
    expect(html).toContain("1/4"); // 모수 4 → 퍼센트 없음
    expect(html).toContain("20% (2/10)"); // 모수 10 → 퍼센트
    expect(html).toContain("—"); // 모수 0
  });

  it("D30과 30일 생존을 둘 다 그리고, 옛 D28 라벨은 없다", () => {
    const html = renderToStaticMarkup(
      <RetentionPanel
        retention={{
          d1: ratio(1, 10),
          d7: ratio(2, 10),
          d30: ratio(3, 10),
          aliveAfter30d: ratio(7, 10),
        }}
      />,
    );
    expect(html).toContain(">D30<");
    expect(html).toContain("30일 생존");
    // 제거 확인 — 새 라벨이 있는지만 보면 교체를 검증한 게 아니다
    expect(html).not.toContain(">D28<");
    expect(html).toContain("70% (7/10)");
  });
});

describe("FunnelPanel", () => {
  it("단계와 크루 참여율을 렌더한다", () => {
    const html = renderToStaticMarkup(
      <FunnelPanel
        steps={[
          { label: "가입·프로필 완료", count: 10 },
          { label: "첫 운동 완료", count: 8 },
          { label: "3회 운동 완료", count: 2 },
        ]}
        crew={ratio(3, 10)}
        anonymousExcluded={59}
      />,
    );
    expect(html).toContain("가입·프로필 완료");
    expect(html).toContain("3회 운동 완료");
    expect(html).toContain("크루 참여 30% (3/10)");
    expect(html).toContain("-20%"); // 10 → 8
  });

  it("단계가 줄지 않으면 -0%를 적지 않는다", () => {
    // "-0%"는 화면에서 오류처럼 읽힌다 (2026-08-17 개발 서버에서 확인)
    const html = renderToStaticMarkup(
      <FunnelPanel
        steps={[
          { label: "가입·프로필 완료", count: 4 },
          { label: "첫 운동 완료", count: 4 },
        ]}
        crew={ratio(4, 4)}
        anonymousExcluded={0}
      />,
    );
    expect(html).not.toContain("-0%");
  });

  it("뺀 익명 계정 수와 그 대가를 화면에 적는다", () => {
    const html = renderToStaticMarkup(
      <FunnelPanel
        steps={[{ label: "가입·프로필 완료", count: 4 }]}
        crew={ratio(1, 4)}
        anonymousExcluded={59}
      />,
    );
    expect(html).toContain("59개");
    // ⚠️ 이 단언을 지우지 마라. 뺀 대가를 안 적으면 "온보딩 이탈 0%"로 읽힌다.
    expect(html).toContain("온보딩 중도 이탈은 이제 측정하지 않습니다");
  });

  it("가입자가 0이면 나눗셈이 깨지지 않는다", () => {
    const html = renderToStaticMarkup(
      <FunnelPanel
        steps={[
          { label: "가입·프로필 완료", count: 0 },
          { label: "첫 운동 완료", count: 0 },
          { label: "3회 운동 완료", count: 0 },
        ]}
        crew={ratio(0, 0)}
        anonymousExcluded={0}
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
        activeCrew={activeCrewMetrics([], [], period)}
        periodDays={28}
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
        activeCrew={activeCrewMetrics([{ userA: "u1", userB: "u2" }], [], period)}
        periodDays={28}
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
        activeCrew={activeCrewMetrics([{ userA: "u1", userB: "u2" }], [], period)}
        periodDays={28}
      />,
    );
    // ⚠️ 이 단언을 지우지 마라. 문구가 사라지면 화면이 없는 정밀도를 있다고 말한다.
    expect(html).toContain("바이럴 계수는 내지 않습니다");
    expect(html).toContain("출처와 무관한 총량");
    // 제거 확인 — 0079로 출처가 기록되기 시작했으므로 옛 문구가 남아 있으면
    // 바로 아래 INVITE ORIGIN 패널과 정반대 말을 하는 화면이 된다
    expect(html).not.toContain("초대 출처가 기록되지 않아");
    expect(html).not.toContain("crew_links에 같은 모양으로");
  });
});

describe("지표 설명", () => {
  /** 모든 패널을 최소 데이터로 한 번씩 그린 HTML */
  function renderAllPanels(): string {
    const emptyProgram = buildProgramMetrics([], [], 0, period);
    return [
      renderToStaticMarkup(<KpiCards kpi={buildKpi([], [], period, now)} />),
      renderToStaticMarkup(
        <ActivityChart
          points={dailyActiveSeries([], period, KST)}
          counts={activeUserCounts([], now)}
        />,
      ),
      renderToStaticMarkup(
        <RetentionPanel
          retention={{
            d1: ratio(0, 0),
            d7: ratio(0, 0),
            d30: ratio(0, 0),
            aliveAfter30d: ratio(0, 0),
          }}
        />,
      ),
      renderToStaticMarkup(
        <FunnelPanel steps={[]} crew={ratio(0, 0)} anonymousExcluded={0} />,
      ),
      renderToStaticMarkup(<ChallengePanel items={[]} />),
      renderToStaticMarkup(
        <GrowthPanel
          data={{
            stageDistribution: [],
            xpByReason: [],
            pointsIssued: 0,
            walletBalance: 0,
            badgeCounts: [],
          }}
        />,
      ),
      renderToStaticMarkup(<ProgramPanel metrics={emptyProgram} />),
      renderToStaticMarkup(
        <NotificationPanel
          conversions={notificationConversion([], new Map(), period, KST)}
          slots={briefingSlotBreakdown([], new Map(), period, KST)}
        />,
      ),
      renderToStaticMarkup(
        <EngagementPanel
          pass={viewingPassMetrics([], 0, 0, 0, KST)}
          referral={referralMetrics([], 0, 0)}
          activeCrew={activeCrewMetrics([], [], period)}
          periodDays={28}
        />,
      ),
      renderToStaticMarkup(
        <AcquisitionPanel
          origins={crewOriginBreakdown(ORIGIN_ROWS)}
          originKnown={originKnownRate(ORIGIN_ROWS)}
          inviters={topInviters(ORIGIN_ROWS, ACQ_PROFILES)}
          channels={acquisitionBreakdown(ACQ_PROFILES)}
          captureRate={acquisitionCaptureRate(ACQ_PROFILES)}
        />,
      ),
    ].join("");
  }

  it("카탈로그의 모든 지표가 어느 패널엔가 붙어 있다", () => {
    // ⚠️ 이 단언이 이 기능의 핵심이다. 지표를 새로 만들고 설명을 안 붙이면
    //    "설명이 있는 지표와 없는 지표가 섞인 화면"이 되는데, 그건 설명이
    //    아예 없는 것보다 나쁘다 — 없는 것을 찾다가 자기가 잘못 본 줄 안다.
    const html = renderAllPanels();
    for (const [key, help] of Object.entries(METRIC_HELP)) {
      expect(html, `설명이 어느 패널에도 안 붙은 지표: ${key}`).toContain(
        help.label,
      );
    }
  });

  it("뜻·계산·주의를 라벨과 함께 낸다", () => {
    const html = renderToStaticMarkup(
      <MetricHelp keys={["notify-same-day-workout"]} />,
    );
    expect(html).toContain("받은 날 운동");
    expect(html).toContain("뜻");
    expect(html).toContain("계산");
    expect(html).toContain("주의");
    // 인과가 아니라는 경고가 설명에도 들어 있어야 한다
    expect(html).toContain("인과가 아닙니다");
  });

  it("자바스크립트 없이 접힌다 — details/summary로 그린다", () => {
    // 클라이언트 컴포넌트로 내리면 /admin 전체가 서버 렌더가 아니게 된다
    const html = renderToStaticMarkup(<MetricHelp keys={["dau"]} />);
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).not.toContain("onclick");
  });

  it("주의가 없는 지표는 주의 칸을 만들지 않는다", () => {
    const html = renderToStaticMarkup(<MetricHelp keys={["dau"]} />);
    expect(html).not.toContain("metric-caveat");
  });

  it("**강조**를 별표째로 찍지 않는다", () => {
    // ⚠️ 개발 서버에서 실제로 별표가 그대로 보였다(2026-08-17). 설명 글에
    //    마크다운 강조를 쓰는 이상 이 단언이 있어야 한다.
    const withBold = Object.entries(METRIC_HELP).filter(([, h]) =>
      [h.meaning, h.howMeasured, h.caveat ?? ""].some((t) => t.includes("**")),
    );
    expect(withBold.length).toBeGreaterThan(0); // 표본이 있어야 의미 있는 단언이다
    const html = renderToStaticMarkup(
      <MetricHelp keys={withBold.map(([k]) => k) as MetricHelpKey[]} />,
    );
    expect(html).not.toContain("**");
    expect(html).toContain("<b>");
  });

  it("빈 목록이면 아무것도 그리지 않는다", () => {
    expect(renderToStaticMarkup(<MetricHelp keys={[]} />)).toBe("");
  });
});

describe("MembershipPanel", () => {
  const m = {
    authTotal: 124,
    authAnonymous: 117,
    authPermanent: 7,
    profilesTotal: 8,
    profilesExcluded: 4,
    profilesReal: 4,
    permanentSignups7d: 0,
    permanentSignups30d: 2,
  };

  it("네 층을 모두 그린다 — 하나로 뭉치면 다시 오판한다", () => {
    const html = renderToStaticMarkup(<MembershipPanel m={m} />);
    expect(html).toContain("124개");
    expect(html).toContain("7개");
    expect(html).toContain("8개");
    expect(html).toContain("4개");
  });

  it("각 층의 사유를 본문으로 그린다 — 폰에서 사라지면 안 된다", () => {
    /*
      2026-08-31 회귀. 처음엔 `.funnel`/`.frow`를 재사용했는데 375px에서
      사유가 들어가는 `.loss`가 `display:none`이 되어 **폰에서 통째로
      사라졌다**("익명 117개 제외"를 못 보면 층이 왜 줄었는지 알 수 없다).
      그래서 `.loss`를 쓰지 않고 사유를 본문으로 그린다. 이 단언은 그 결정을
      고정한다 — `.loss`로 되돌리면 여기서 걸린다.
    */
    const html = renderToStaticMarkup(<MembershipPanel m={m} />);
    expect(html).toContain("익명 117개 제외");
    expect(html).toContain("픽스처·테스트 4개");
    expect(html).toContain("회원 수가 아닙니다");
    expect(html).not.toContain('class="loss"');
  });

  it("최근 가입은 영구 계정 기준임을 화면이 말한다", () => {
    const html = renderToStaticMarkup(<MembershipPanel m={m} />);
    expect(html).toContain("최근 가입 7일 0명");
    expect(html).toContain("30일 2명");
    // 승격 시점이 아니라 계정 생성 시점이라는 한계를 숨기지 않는다
    expect(html).toContain("승격한 날이 아닙니다");
  });

  it("제외한 테스트 계정이 없으면 그렇게 말한다", () => {
    const html = renderToStaticMarkup(
      <MembershipPanel m={{ ...m, profilesExcluded: 0, profilesReal: 8 }} />,
    );
    expect(html).toContain("제외한 테스트 계정 없음");
  });

  it("계정이 하나도 없어도 0으로 나누지 않는다", () => {
    const empty = {
      authTotal: 0,
      authAnonymous: 0,
      authPermanent: 0,
      profilesTotal: 0,
      profilesExcluded: 0,
      profilesReal: 0,
      permanentSignups7d: 0,
      permanentSignups30d: 0,
    };
    const html = renderToStaticMarkup(<MembershipPanel m={empty} />);
    expect(html).toContain("회원 수의 실체");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });
});

describe("CampaignComparisonPanel", () => {
  const cohorts = campaignCohorts(
    [
      {
        userId: "a1",
        isAnonymous: false,
        hasProfile: true,
        startedWorkout: true,
        completedWorkouts: 3,
        joinedChallenge: true,
        reworkoutD7: false,
        invitedBy: null,
        inviteOrigin: null,
        profileCampaign: "influencer_a_pilot01",
      },
      {
        userId: "b1",
        isAnonymous: true,
        hasProfile: false,
        startedWorkout: false,
        completedWorkouts: 0,
        joinedChallenge: false,
        reworkoutD7: false,
        invitedBy: null,
        inviteOrigin: null,
        profileCampaign: null,
      },
    ],
    [
      {
        userId: "a1",
        eventName: "landing_opened",
        source: "instagram",
        medium: "creator",
        campaign: "influencer_a_pilot01",
      },
      {
        userId: "b1",
        eventName: "landing_opened",
        source: "instagram",
        medium: "creator",
        campaign: "influencer_b_pilot01",
      },
    ],
  );

  it("같은 instagram 안에서 인플루언서 A와 B를 다른 줄로 그린다", () => {
    const html = renderToStaticMarkup(
      <CampaignComparisonPanel data={cohorts} selected={null} />,
    );
    expect(html).toContain("influencer_a_pilot01");
    expect(html).toContain("influencer_b_pilot01");
  });

  it("캠페인 이름이 상세 퍼널 링크가 된다 — SQL Editor를 열 필요가 없다", () => {
    const html = renderToStaticMarkup(
      <CampaignComparisonPanel data={cohorts} selected={null} />,
    );
    expect(html).toContain("campaign=influencer_a_pilot01");
  });

  it("불일치가 0건이면 초록 한 줄로 조용히 말한다", () => {
    const html = renderToStaticMarkup(
      <CampaignComparisonPanel data={cohorts} selected={null} />,
    );
    expect(html).toContain("campaign 귀속 불일치 0건");
  });

  it("⚠️ 불일치가 있으면 화면이 죽지 않고 건수와 쌍을 보여준다", () => {
    /*
      운영에서 불일치가 나도 /admin이 500이 되면 안 된다(사용자 지시 2026-08-31).
      운영 데이터에는 아직 불일치가 없어서 화면으로 확인할 수 없다 —
      그래서 이 단언이 그 화면 상태를 대신 지킨다.
    */
    const withMismatch = campaignCohorts(
      [
        {
          userId: "m1",
          isAnonymous: false,
          hasProfile: true,
          startedWorkout: false,
          completedWorkouts: 0,
          joinedChallenge: false,
          reworkoutD7: false,
        invitedBy: null,
        inviteOrigin: null,
          profileCampaign: "pilot02",
        },
      ],
      [
        {
          userId: "m1",
          eventName: "landing_opened",
          source: "instagram",
          medium: "creator",
          campaign: "pilot01",
        },
      ],
    );
    expect(() =>
      renderToStaticMarkup(
        <CampaignComparisonPanel data={withMismatch} selected={null} />,
      ),
    ).not.toThrow();
    const html = renderToStaticMarkup(
      <CampaignComparisonPanel data={withMismatch} selected={null} />,
    );
    expect(html).toContain("campaign 귀속 불일치 1건");
    expect(html).toContain("pilot01");
    expect(html).toContain("pilot02");
    // 무엇을 기준으로 셌는지 화면이 말한다 — 조용히 한쪽을 고르지 않는다
    expect(html).toContain("유입 기록 기준");
    // 표는 그대로 그려진다
    expect(html).toContain("pilot01");
  });

  it("계측된 유입이 없으면 '왜 비었는지'를 말한다", () => {
    const empty = campaignCohorts([], []);
    const html = renderToStaticMarkup(
      <CampaignComparisonPanel data={empty} selected={null} />,
    );
    expect(html).toContain("아직 계측된 유입이 없습니다");
    expect(html).toContain("utm_campaign");
  });

  it("⚠️ minWidth:0을 지운다 — 좁은 화면에서 표가 패널을 밀어냈다", () => {
    /*
      2026-08-31 개발 서버 375px에서 잡았다. `.panel`은 그리드 아이템이라
      기본 `min-width: auto`로 내용보다 작아지기를 거부한다. 표의 minWidth(620)가
      패널을 664px로 부풀려 오른쪽 열과 설명이 잘렸다.
    */
    const html = renderToStaticMarkup(
      <CampaignComparisonPanel data={cohorts} selected={null} />,
    );
    expect(html).toContain("min-width:0");
    expect(html).toContain("overflow-x:auto");
  });
});

describe("CampaignFunnelPanel", () => {
  const bigCohort = campaignCohorts(
    Array.from({ length: 10 }, (_, i) => ({
      userId: `u${i}`,
      isAnonymous: i >= 3,
      hasProfile: i < 2,
      startedWorkout: false,
      completedWorkouts: 0,
      joinedChallenge: false,
      reworkoutD7: false,
      invitedBy: null,
      inviteOrigin: null,
      profileCampaign: null,
    })),
    Array.from({ length: 10 }, (_, i) => ({
      userId: `u${i}`,
      eventName: "landing_opened",
      source: "youtube",
      medium: "creator",
      campaign: "pilot01",
    })),
  );

  it("선택 전에는 고르라고 안내한다", () => {
    const html = renderToStaticMarkup(
      <CampaignFunnelPanel row={null} campaigns={["pilot01"]} />,
    );
    expect(html).toContain("캠페인을 고르면");
  });

  it("선택하면 그 집단의 단계를 전부 그린다", () => {
    const html = renderToStaticMarkup(
      <CampaignFunnelPanel row={bigCohort.rows[0]} campaigns={["pilot01"]} />,
    );
    for (const step of FUNNEL_STEPS) expect(html).toContain(step);
  });

  it("표본이 충분하면 가장 크게 빠진 구간을 말한다", () => {
    const html = renderToStaticMarkup(
      <CampaignFunnelPanel row={bigCohort.rows[0]} campaigns={["pilot01"]} />,
    );
    expect(html).toContain("가장 크게 빠진 구간");
  });

  it("⚠️ 표본이 적으면 판정하지 않는다 — 4명으로 32% 이탈이라 말하지 않는다", () => {
    const small = campaignCohorts(
      Array.from({ length: 3 }, (_, i) => ({
        userId: `s${i}`,
        isAnonymous: i > 0,
        hasProfile: false,
        startedWorkout: false,
        completedWorkouts: 0,
        joinedChallenge: false,
        reworkoutD7: false,
        invitedBy: null,
        inviteOrigin: null,
        profileCampaign: null,
      })),
      Array.from({ length: 3 }, (_, i) => ({
        userId: `s${i}`,
        eventName: "landing_opened",
        source: null,
        medium: null,
        campaign: "tiny",
      })),
    );
    const html = renderToStaticMarkup(
      <CampaignFunnelPanel row={small.rows[0]} campaigns={["tiny"]} />,
    );
    expect(html).toContain("표본 부족");
    expect(html).not.toContain("가장 크게 빠진 구간");
  });

  it("챌린지 참가는 퍼널 단계가 아니라고 화면이 말한다", () => {
    const html = renderToStaticMarkup(
      <CampaignFunnelPanel row={bigCohort.rows[0]} campaigns={["pilot01"]} />,
    );
    expect(html).toContain("퍼널 단계에 넣지");
  });
});

describe("CampaignSpreadPanel", () => {
  const person = (id: string, over = {}) => ({
    userId: id,
    isAnonymous: false,
    hasProfile: true,
    startedWorkout: false,
    completedWorkouts: 0,
    joinedChallenge: false,
    reworkoutD7: false,
    profileCampaign: null as string | null,
    invitedBy: null as string | null,
    inviteOrigin: null as string | null,
    ...over,
  });

  // 인플루언서 A → 철수 → 영희 → 민수
  const chain = campaignSpread([
    person("chulsoo", { profileCampaign: "influencer_a_pilot01" }),
    person("younghee", { invitedBy: "chulsoo", inviteOrigin: "invite_link" }),
    person("minsoo", { invitedBy: "younghee", inviteOrigin: "challenge" }),
  ]);

  it("직접 1명 · 추가 2명 · 총 3명 · 배수 3을 그린다", () => {
    const html = renderToStaticMarkup(<CampaignSpreadPanel data={chain} />);
    expect(html).toContain("influencer_a_pilot01");
    expect(html).toContain("×3");
  });

  it("세대별 분포를 보여준다", () => {
    const html = renderToStaticMarkup(<CampaignSpreadPanel data={chain} />);
    expect(html).toContain("0세대 1");
    expect(html).toContain("1세대 1");
    expect(html).toContain("2세대 1");
  });

  it("초대 경로별 인원을 보여준다 — 친구/챌린지가 구별된다", () => {
    const html = renderToStaticMarkup(<CampaignSpreadPanel data={chain} />);
    expect(html).toContain("친구 초대 1명");
    expect(html).toContain("챌린지 초대 1명");
    expect(html).toContain("외부 유입 1명");
  });

  it("⚠️ 기존 비교표와 뜻이 다르다는 것을 화면이 말한다", () => {
    const html = renderToStaticMarkup(<CampaignSpreadPanel data={chain} />);
    expect(html).toContain("직접");
    expect(html).toContain("두 숫자가 다른 것이");
  });

  it("이상이 없으면 초록 한 줄", () => {
    const html = renderToStaticMarkup(<CampaignSpreadPanel data={chain} />);
    expect(html).toContain("초대 계보 이상 0건");
  });

  it("⚠️ 계보가 깨져도 화면이 죽지 않고 이상 건수를 보여준다", () => {
    const broken = campaignSpread([
      person("a1", { profileCampaign: "campaign_a" }),
      person("X", { invitedBy: "Y" }),
      person("Y", { invitedBy: "X" }),
    ]);
    expect(() =>
      renderToStaticMarkup(<CampaignSpreadPanel data={broken} />),
    ).not.toThrow();
    const html = renderToStaticMarkup(<CampaignSpreadPanel data={broken} />);
    expect(html).toContain("초대 계보 이상 2건");
    expect(html).toContain("서로를 초대자로 가리킴");
    expect(html).toContain(UNKNOWN_ROOT);
    // 깨진 사람이 campaign_a에 섞이지 않았다
    expect(html).toContain("campaign_a");
  });

  it("⚠️ 개인정보를 그리지 않는다 — 숫자표다", () => {
    const html = renderToStaticMarkup(<CampaignSpreadPanel data={chain} />);
    expect(html).not.toContain("chulsoo");
    expect(html).not.toContain("younghee");
    expect(html).not.toContain("minsoo");
    expect(html).not.toContain("@");
  });

  it("사람이 없으면 안내만 그리고 던지지 않는다", () => {
    const empty = campaignSpread([]);
    const html = renderToStaticMarkup(<CampaignSpreadPanel data={empty} />);
    expect(html).toContain("아직 계보를 계산할 사람이 없습니다");
  });

  it("좁은 화면 대비 — minWidth:0과 가로 스크롤이 있다", () => {
    const html = renderToStaticMarkup(<CampaignSpreadPanel data={chain} />);
    expect(html).toContain("min-width:0");
    expect(html).toContain("overflow-x:auto");
  });
});
