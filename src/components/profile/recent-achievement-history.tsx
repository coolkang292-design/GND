import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import {
  achievementKstDay, type AchievementEvent,
} from "@/lib/domain/profile-achievements";

function eventDate(at: Date): string {
  return achievementKstDay(at).slice(2).replaceAll("-", ".");
}

function EventSymbol({ type }: { type: AchievementEvent["type"] }) {
  const icon = type === "level" ? "level" : type === "badge" ? "award" : "play";
  const colors = type === "level"
    ? "bg-[#2c425b] text-[#a6d4ff]"
    : type === "badge" ? "bg-[#493524] text-[#ffc36c]" : "bg-accent/15 text-accent";
  return (
    <span aria-hidden className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " + colors}>
      <Icon name={icon} size={24} />
    </span>
  );
}

/** 프로필 최근 이력은 3건만 표시한다. 전체는 별도 페이지에서 필터·월별 열람. */
export function RecentAchievementHistory({ events }: { events: AchievementEvent[] }) {
  return (
    <section aria-labelledby="recent-achievements-heading" className="border-t border-line pt-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="recent-achievements-heading" className="text-[18px] font-extrabold">최근 이력</h2>
        <Link
          href="/profile/history"
          className="tap-44 flex items-center rounded-full border border-accent/50 bg-accent/10 px-4 text-[12px] font-extrabold text-accent"
        >
          전체 이력 ›
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-4 text-[12px] text-muted">
          아직 표시할 성취 이력이 없어요. 운동을 완료하면 기록이 쌓여요.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {events.slice(0, 3).map((event) => (
            <li
              key={event.id}
              className="flex min-h-[72px] items-center gap-3 rounded-card border border-line bg-surface px-3 py-3 shadow-card"
            >
              <time dateTime={achievementKstDay(event.at)} className="w-[67px] shrink-0 text-[11px] tabular-nums text-muted">
                {eventDate(event.at)}
              </time>
              <EventSymbol type={event.type} />
              <span className="min-w-0 flex-1">
                <span className="block break-keep text-[13px] font-extrabold">{event.title}</span>
                <span className="mt-1 block text-[11px] text-muted">{event.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** 시안의 월별 타임라인. 실제 발생일에만 마커를 그린다. */
export function AchievementHistoryTimeline({ events }: { events: AchievementEvent[] }) {
  if (events.length === 0) {
    return <p className="rounded-card border border-line bg-surface p-4 text-sm text-muted">해당하는 이력이 없어요.</p>;
  }
  const months = new Map<string, AchievementEvent[]>();
  for (const event of events) {
    const month = achievementKstDay(event.at).slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), event]);
  }

  return (
    <div className="flex flex-col gap-6">
      {[...months].map(([month, rows]) => {
        const [year, m] = month.split("-");
        return (
          <section key={month} aria-label={year + "년 " + Number(m) + "월"}>
            <h2 className="mb-4 text-[18px] font-extrabold">{year}년 {Number(m)}월</h2>
            <ol className="ml-[16px] border-l-2 border-line">
              {rows.map((event, index) => {
                const day = achievementKstDay(event.at);
                const highlight = index === 0 && month === achievementKstDay(events[0].at).slice(0, 7);
                return (
                  <li key={event.id} className="relative ml-[24px] pb-3 last:pb-0">
                    <span
                      aria-hidden
                      className={"absolute -left-[35px] top-8 h-5 w-5 rounded-full border-[3px] border-bg " +
                        (highlight ? "bg-accent ring-2 ring-accent" : "bg-muted ring-1 ring-line")}
                    />
                    <div className="min-h-[98px] rounded-card border border-line bg-surface px-4 py-3">
                      <div className="flex gap-3">
                        <EventSymbol type={event.type} />
                        <div className="min-w-0 flex-1">
                          <p className="break-keep text-[15px] font-extrabold">{event.title}</p>
                          <p className="mt-1 text-[11.5px] leading-snug text-muted">{event.detail}</p>
                        </div>
                      </div>
                      <time dateTime={day} className="mt-1 block text-right text-[11px] tabular-nums text-muted">
                        {day.slice(5).replace("-", ".")}
                      </time>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
