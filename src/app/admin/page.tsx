import { requireAdmin } from "@/lib/admin/auth";
import {
  fetchActiveChallenges,
  fetchAdminDataset,
  fetchEngagementDataset,
  fetchGrowthDataset,
  fetchProgramDataset,
} from "@/lib/admin/queries";
import {
  activationFunnel,
  activeUserCounts,
  buildKpi,
  buildPeriod,
  buildUserRows,
  crewParticipation,
  dailyActiveSeries,
  reworkoutRetention,
  type PeriodDays,
} from "@/lib/domain/analytics";
import {
  briefingSlotBreakdown,
  notificationConversion,
  referralMetrics,
  viewingPassMetrics,
  workoutDayKeysByUser,
} from "@/lib/domain/analytics-engagement";
import { buildProgramMetrics } from "@/lib/domain/analytics-program";
import { DEFAULT_TIMEZONE } from "@/lib/domain/time";
import { ActivityChart } from "./_components/activity-chart";
import { ChallengePanel } from "./_components/challenge-panel";
import { EngagementPanel } from "./_components/engagement-panel";
import { FunnelPanel } from "./_components/funnel-panel";
import { GrowthPanel } from "./_components/growth-panel";
import { KpiCards } from "./_components/kpi-cards";
import { NotificationPanel } from "./_components/notification-panel";
import { ProgramPanel } from "./_components/program-panel";
import { RetentionPanel } from "./_components/retention-panel";
import { UserTable, type UserTableRow } from "./_components/user-table";

const ALLOWED_PERIODS: PeriodDays[] = [7, 28, 90];

function parsePeriod(raw: string | undefined): PeriodDays {
  const n = Number(raw);
  return (ALLOWED_PERIODS as number[]).includes(n) ? (n as PeriodDays) : 28;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  // 유일한 관문. 이 줄 위에는 어떤 데이터 조회도 두지 말 것.
  await requireAdmin();

  const days = parsePeriod((await searchParams).period);
  const now = new Date();
  const period = buildPeriod(days, now);

  const data = await fetchAdminDataset();
  // 테스트 계정 기준은 fetchAdminDataset()이 한 번만 정한다 — 아래 조회들이
  // 각자 판정하면 패널마다 모수가 조용히 갈린다.
  const testIds = new Set(data.testUserIds);
  // 순차 await를 붙이면 페이지가 그만큼 느려진다 — 서로 의존이 없으니 같이 던진다
  const [challenges, growth, program, engagement] = await Promise.all([
    fetchActiveChallenges(now, testIds),
    fetchGrowthDataset(data.totalXpByUser),
    fetchProgramDataset(testIds),
    fetchEngagementDataset(testIds),
  ]);

  const kpi = buildKpi(data.sessions, data.profiles, period, now);
  const points = dailyActiveSeries(data.sessions, period, DEFAULT_TIMEZONE);
  const counts = activeUserCounts(data.sessions, now);
  const retention = reworkoutRetention(data.profiles, data.sessions, now);
  const funnel = activationFunnel(data.profiles, data.sessions);
  const crew = crewParticipation(data.profiles, data.crewLinkUserIds);

  // 등록률의 모수는 **위 KPI가 이미 센 활성 사용자**를 그대로 쓴다. 다시 세면
  // 화면 위쪽 숫자와 아래쪽 모수가 조용히 갈린다.
  const programMetrics = buildProgramMetrics(
    program.enrollments,
    program.programSessions,
    kpi.activeUsers,
    period,
  );
  // 새 질의를 하지 않는다 — 완료 세션은 이미 data.sessions에 다 있다
  const workoutDays = workoutDayKeysByUser(data.sessions, DEFAULT_TIMEZONE);
  const conversions = notificationConversion(
    engagement.notifications,
    workoutDays,
    period,
    DEFAULT_TIMEZONE,
  );
  const slots = briefingSlotBreakdown(
    engagement.notifications,
    workoutDays,
    period,
    DEFAULT_TIMEZONE,
  );
  const pass = viewingPassMetrics(
    data.sessions,
    engagement.recordViewCount,
    engagement.challengeUnlockedCount,
    engagement.challengePickCount,
    DEFAULT_TIMEZONE,
  );
  const referral = referralMetrics(
    data.crewLinkPairs,
    data.profiles.length,
    data.inviteCodeCount,
  );

  const userRows = buildUserRows(
    data.profiles,
    data.sessions,
    data.totalXpByUser,
    period,
    now,
    DEFAULT_TIMEZONE,
  );

  // userId를 비롯해 화면·CSV에 안 쓰는 필드는 여기서 잘라낸다.
  // 게이트가 유일한 방어선이므로 페이로드에 불필요한 값을 싣지 않는다.
  const tableRows: UserTableRow[] = userRows
    .slice()
    .sort((a, b) => b.workoutsInPeriod - a.workoutsInPeriod)
    .map((r) => ({
      nickname: r.nickname,
      avatar: r.avatarUrl ?? "🙂",
      stageName: r.stageName,
      level: r.level,
      workoutsInPeriod: r.workoutsInPeriod,
      streakDays: r.streakDays,
      lastActiveLabel: r.lastActiveAt
        ? r.lastActiveAt.toLocaleDateString("ko-KR", {
            timeZone: DEFAULT_TIMEZONE,
            month: "numeric",
            day: "numeric",
          })
        : "기록 없음",
      status: r.status,
      churnRisk: r.churnRisk,
    }));

  return (
    <>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">🏋️</span>
          <div>
            <b>GND</b>
            <small>ADMIN</small>
          </div>
        </div>
        <nav>
          <a className="active" href="#overview">
            <i>▦</i>대시보드
          </a>
          <a href="#users">
            <i>♙</i>사용자
          </a>
          <a href="#activity">
            <i>↗</i>운동 기록
          </a>
          <a href="#challenges">
            <i>♛</i>챌린지
          </a>
          <a href="#levels">
            <i>✦</i>성장·XP
          </a>
          {/* i는 글리프 문자다 — 이미지·이모지를 넣으면 폰트가 달라 정렬이 깨진다 */}
          <a href="#programs">
            <i>▤</i>프로그램
          </a>
          <a href="#notify">
            <i>◈</i>알림·참여
          </a>
        </nav>
        <div className="sidebar-foot">GND ADMIN · 운영자 전용</div>
      </aside>

      <main className="main">
        <header>
          <div>
            <p className="kicker">GND PERFORMANCE CENTER</p>
            <h1>사용자 현황</h1>
            <p>유저가 들어오고, 운동하고, 다시 돌아오는지 확인합니다.</p>
          </div>
          <div className="actions">
            <span className="live">실데이터</span>
            <div className="seg">
              {ALLOWED_PERIODS.map((d) => (
                <a
                  key={d}
                  href={`/admin?period=${d}`}
                  className={d === days ? "on" : ""}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 30,
                    padding: "0 11px",
                    borderRadius: 6,
                    textDecoration: "none",
                    fontWeight: 700,
                    color: d === days ? "var(--gold2)" : "#737680",
                    background: d === days ? "#2a2519" : "transparent",
                  }}
                >
                  {d}일
                </a>
              ))}
            </div>
          </div>
        </header>

        <div className="notice">
          <span>ⓘ</span>
          <div>
            <b>모수가 5명 미만인 비율은 퍼센트 대신 원시수치로 표시합니다.</b>{" "}
            작은 표본에서 퍼센트는 실제보다 확신을 주기 때문입니다.
            <br />
            {/* 뺐다는 사실을 화면이 말한다 — 안 그러면 DB 숫자와 조용히 갈린다 */}
            <b>
              테스트 계정 {data.excludedTestAccounts.length}개
              {data.excludedTestAccounts.length > 0
                ? `(${data.excludedTestAccounts.map((a) => a.nickname).join("·")})`
                : ""}
              와 프로필 없는 익명 계정 {data.anonymousWithoutProfile}개를 모든
              집계에서 제외했습니다.
            </b>{" "}
            DB는 그대로이고 화면에서만 뺍니다 — 되돌릴 수 있습니다.
          </div>
        </div>

        <div id="overview" />
        <KpiCards kpi={kpi} />

        <section className="grid" id="activity">
          <ActivityChart points={points} counts={counts} />
          <RetentionPanel retention={retention} />
        </section>

        <section className="grid equal">
          <FunnelPanel
            steps={funnel}
            crew={crew}
            anonymousExcluded={data.anonymousWithoutProfile}
          />
          <ChallengePanel items={challenges} />
        </section>

        <ProgramPanel metrics={programMetrics} />

        <NotificationPanel conversions={conversions} slots={slots} />

        <UserTable rows={tableRows} periodDays={days} />

        <GrowthPanel data={growth} />

        <EngagementPanel pass={pass} referral={referral} />

        <footer>
          <span>
            실데이터 · {DEFAULT_TIMEZONE} 기준 · 최근 {days}일
          </span>
          <span>GND Analytics</span>
        </footer>
      </main>
    </>
  );
}
