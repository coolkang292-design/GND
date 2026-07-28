import type { AdminChallenge } from "@/lib/admin/queries";

export function ChallengePanel({ items }: { items: AdminChallenge[] }) {
  return (
    <article className="panel" id="challenges">
      <div className="panel-title">
        <div>
          <p className="kicker">CHALLENGE HEALTH</p>
          <h2>진행 중 챌린지</h2>
        </div>
        <span className="muted">{items.length}개</span>
      </div>

      {items.length === 0 ? (
        <div className="insight">진행 중인 챌린지가 없습니다.</div>
      ) : (
        <div className="challenges">
          {items.map((c) => (
            <div className="challenge" key={c.id}>
              <div className="challenge-icon">🔥</div>
              <div>
                <div className="challenge-top">
                  <b>{c.name}</b>
                  <span>D-{c.daysLeft}</span>
                </div>
                <p>
                  {c.memberCount}명 참여
                  {c.achievementPct === null
                    ? " · 목표 미설정"
                    : ` · 달성률 ${c.achievementPct}%`}
                </p>
                <div className="progress">
                  <i style={{ width: `${c.achievementPct ?? 0}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
