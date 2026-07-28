import { requireAdmin } from "@/lib/admin/auth";
import {
  fetchActiveChallenges,
  fetchAdminDataset,
  fetchGrowthDataset,
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
import { DEFAULT_TIMEZONE } from "@/lib/domain/time";
import { ActivityChart } from "./_components/activity-chart";
import { ChallengePanel } from "./_components/challenge-panel";
import { FunnelPanel } from "./_components/funnel-panel";
import { GrowthPanel } from "./_components/growth-panel";
import { KpiCards } from "./_components/kpi-cards";
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
  const [challenges, growth] = await Promise.all([
    fetchActiveChallenges(now),
    fetchGrowthDataset(data.totalXpByUser),
  ]);

  const kpi = buildKpi(data.sessions, data.profiles, period, now);
  const points = dailyActiveSeries(data.sessions, period, DEFAULT_TIMEZONE);
  const counts = activeUserCounts(data.sessions, now);
  const retention = reworkoutRetention(data.profiles, data.sessions, now);
  const funnel = activationFunnel(data.authUsers, data.profiles, data.sessions);
  const crew = crewParticipation(data.profiles, data.crewLinkUserIds);

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
          </div>
        </div>

        <div id="overview" />
        <KpiCards kpi={kpi} />

        <section className="grid" id="activity">
          <ActivityChart points={points} counts={counts} />
          <RetentionPanel retention={retention} />
        </section>

        <section className="grid equal">
          <FunnelPanel steps={funnel} crew={crew} />
          <ChallengePanel items={challenges} />
        </section>

        <UserTable rows={tableRows} periodDays={days} />

        <GrowthPanel data={growth} />

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
