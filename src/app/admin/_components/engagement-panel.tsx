import { formatRatio } from "@/lib/domain/analytics";
import type {
  ActiveCrewMetrics,
  ReferralMetrics,
  ViewingPassMetrics,
} from "@/lib/domain/analytics-engagement";
import { MetricHelp } from "./metric-help";
import { Ring } from "./ring";

export function EngagementPanel({
  pass,
  referral,
  activeCrew,
  periodDays,
}: {
  pass: ViewingPassMetrics;
  referral: ReferralMetrics;
  activeCrew: ActiveCrewMetrics;
  periodDays: number;
}) {
  return (
    <section className="grid equal">
      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="kicker">VIEWING PASS</p>
            <h2>열람권 사용</h2>
          </div>
          <span className="muted">누적</span>
        </div>

        <div className="rings">
          <Ring label="꾸준왕" r={pass.kingUsage} />
          <Ring label="챌린지" r={pass.challengeUsage} />
        </div>

        <div className="summary">
          <div>
            <small>자격 획득 주</small>
            <b>{pass.kingEligibleWeeks}</b>
          </div>
          <div>
            <small>열람 사용</small>
            <b className={pass.kingUsed === 0 ? undefined : "gold"}>
              {pass.kingUsed}
            </b>
          </div>
          <div>
            <small>챌린지 창 열림</small>
            <b>{pass.challengeUnlocked}</b>
          </div>
          <div>
            <small>참가자 선택</small>
            <b>{pass.challengePicked}</b>
          </div>
        </div>

        <div className="insight" style={{ marginTop: 14 }}>
          <b>
            꾸준왕 열람권은 주 5일(월요일 시작, 고유 날짜)을 채운 주 기준입니다.
          </b>
          <br />
          획득하고 24시간 안에 쓰지 않으면 소멸합니다 — 자격 주보다 사용이 적은
          것은 버그가 아니라 안 쓴 것입니다. 챌린지 쪽 모수는 &ldquo;창이
          열렸다&rdquo;는 알림 수이고, 분자는 실제로 대상을 고른 횟수입니다.
        </div>

        <MetricHelp
          keys={[
            "king-eligible-weeks",
            "king-used",
            "challenge-unlocked",
            "challenge-picked",
          ]}
        />
      </article>

      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="kicker">ACTIVE CREW</p>
            <h2>크루가 작동하나</h2>
          </div>
          <span className="muted">최근 {periodDays}일</span>
        </div>

        <div className="rings">
          <Ring label="양쪽 다 운동" r={activeCrew.bothActiveRate} />
        </div>

        <div className="summary">
          <div>
            <small>크루 쌍</small>
            <b>{activeCrew.pairs}</b>
          </div>
          <div>
            <small>양쪽 다</small>
            <b className={activeCrew.bothActive > 0 ? "gold" : undefined}>
              {activeCrew.bothActive}
            </b>
          </div>
          <div>
            <small>한쪽만</small>
            <b>{activeCrew.oneSideOnly}</b>
          </div>
          <div>
            <small>아무도 안</small>
            <b>{activeCrew.neitherActive}</b>
          </div>
        </div>

        <div className="insight" style={{ marginTop: 14 }}>
          <b>
            크루 연결 하나를 쌍으로 놓고, 기간 안에 양쪽 모두 운동을 끝냈는지
            봅니다.
          </b>{" "}
          양쪽이 다 움직인 쌍에 속한 사람은 {activeCrew.usersInActivePair}명입니다.
          <br />
          {/* ⚠️ 이 단서를 지우지 마라 — "함께 운동"으로 읽히는 순간 없는 계측이 된다 */}
          ⚠️ <b>&ldquo;함께&rdquo; 운동했다는 뜻은 아닙니다.</b> 같은 날 같은
          자리에서 했는지는 앱이 기록하지 않습니다.
        </div>

        {/* 확산은 같은 패널 안에 둔다 — `.grid.equal`이 2칸이라 패널을 셋으로
            나누면 셋째가 반쪽만 차지하고 오른쪽이 빈다. 주제도 같은 크루다. */}
        <div className="panel-title" style={{ marginTop: 26 }}>
          <div>
            <p className="kicker">REFERRAL</p>
            <h2>크루 확산</h2>
          </div>
          <span className="muted">누적</span>
        </div>

        <div className="summary">
          <div>
            <small>크루 연결</small>
            <b>{referral.crewLinks}</b>
          </div>
          <div>
            <small>크루 보유율</small>
            <b>{formatRatio(referral.usersWithCrew)}</b>
          </div>
          <div>
            <small>1인 평균 크루</small>
            <b>{referral.avgCrewPerUser}</b>
          </div>
          <div>
            <small>초대코드 발급</small>
            <b>{formatRatio(referral.inviteCodeIssued)}</b>
          </div>
        </div>

        {/* ⚠️ 이 문구를 지우지 마라. 사라지면 화면이 없는 정밀도를 있다고 말하게 된다.
            2026-08-17: 0079로 출처가 기록되기 시작해 옛 문구("측정할 수 없습니다")를
            갈아 끼웠다 — 바로 아래 INVITE ORIGIN 패널과 정반대 말을 하고 있었다. */}
        <div className="insight" style={{ marginTop: 14 }}>
          <b>
            초대 출처는 아래 <span style={{ whiteSpace: "nowrap" }}>“누가 어떻게 불렀나”</span>
            에서 봅니다.
          </b>
          <br />
          여기 네 숫자는 <b>출처와 무관한 총량</b>입니다 — 어떻게 맺어졌든 연결이
          몇 개인지, 몇 명이 크루를 가졌는지입니다.
          <br />
          ⚠️ 아직 <b>바이럴 계수는 내지 않습니다.</b> 0079(2026-08-17) 이전 연결은
          출처를 되살릴 수 없는 것이 남아 있어, 모수가 반쪽인 채로 계수를 만들면
          없는 정밀도를 있다고 말하게 됩니다.
        </div>

        <MetricHelp
          keys={[
            "active-crew",
            "crew-links",
            "crew-coverage",
            "avg-crew",
            "invite-code",
            "referral-attribution",
          ]}
        />
      </article>
    </section>
  );
}
