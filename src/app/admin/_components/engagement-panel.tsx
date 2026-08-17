import { formatRatio } from "@/lib/domain/analytics";
import type {
  ReferralMetrics,
  ViewingPassMetrics,
} from "@/lib/domain/analytics-engagement";
import { Ring } from "./ring";

export function EngagementPanel({
  pass,
  referral,
}: {
  pass: ViewingPassMetrics;
  referral: ReferralMetrics;
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
      </article>

      <article className="panel">
        <div className="panel-title">
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

        {/* ⚠️ 이 문구를 지우지 마라. 사라지면 화면이 없는 계측을 있다고 말하게 된다 */}
        <div className="insight" style={{ marginTop: 14 }}>
          <b>초대 출처가 기록되지 않아 바이럴 계수는 측정할 수 없습니다.</b>
          <br />
          검색으로 맺은 크루, 초대 링크를 타고 온 크루, 챌린지 자동 연결이{" "}
          <b>crew_links에 같은 모양으로</b> 저장됩니다. `profiles.invite_code`는
          발급만 기록하고 그 코드로 누가 왔는지는 남기지 않습니다. 측정하려면
          출처 컬럼과 RPC 3곳(크루 요청·친구 초대·챌린지 초대 수락)의 기록이
          필요합니다.
        </div>
      </article>
    </section>
  );
}
