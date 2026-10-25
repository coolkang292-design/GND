import { buildCreatorDemo } from "@/lib/domain/creator-demo";
import { buildCreatorMemberDetail } from "@/lib/domain/creator-member-detail";
import { buildDailyProofRates } from "@/lib/domain/creator-report";
import { buildCreatorSnapshot, buildRecentActivity } from "@/lib/domain/creator-studio";
import { dayKey, DEFAULT_TIMEZONE } from "@/lib/domain/time";
import { timeAgo } from "@/lib/time-ago";

/**
 * 미리보기 화면들의 재료. `loadCreatorView`·`loadCreatorMemberDetail`과 **같은 계산 함수**를
 * 같은 순서로 부른다 — 다른 점은 데이터가 DB가 아니라 `buildCreatorDemo`에서 온다는 것뿐이다.
 */
export function demoView() {
  const todayKey = dayKey(new Date(), DEFAULT_TIMEZONE);
  const demo = buildCreatorDemo(todayKey);
  const { challenge } = demo;
  const common = { startDate: challenge.start_date, endDate: challenge.end_date, todayKey, status: challenge.status };

  const snapshot = buildCreatorSnapshot({ ...demo, ...common });
  const recent = buildRecentActivity({ ...demo, limit: 5 }).map((a) => ({ ...a, when: timeAgo(new Date(a.at)) }));
  const daily = buildDailyProofRates({ participants: demo.participants, sessions: demo.sessions, ...common });

  function memberDetail(userId: string) {
    const detail = buildCreatorMemberDetail({ userId, ...demo, ...common });
    if (!detail) return null;
    return { ...detail, todayKey, recent: detail.recent.map((r) => ({ ...r, when: timeAgo(new Date(r.at)) })) };
  }

  return { challenge, snapshot, recent, daily, memberDetail };
}
