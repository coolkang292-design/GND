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
import { ActivityChart } from "./activity-chart";
import { ChallengePanel } from "./challenge-panel";
import { FunnelPanel } from "./funnel-panel";
import { GrowthPanel } from "./growth-panel";
import { KpiCards } from "./kpi-cards";
import { RetentionPanel } from "./retention-panel";

const now = new Date("2026-07-28T00:00:00Z");
const period = buildPeriod(28, now);

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
