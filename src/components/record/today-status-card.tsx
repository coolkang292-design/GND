import type { StreakStage } from "@/lib/domain/streak";
import { streakHeadline } from "@/lib/domain/streak-messages";
import { weekTotals, type DayBar } from "@/lib/domain/today-status";

/**
 * 기록 화면 맨 위 **오늘 상태 카드** (2026-08-19 사용자 요청).
 *
 * 앱을 켜면 여기로 떨어진다(`domain/landing.ts`). 그래서 이 카드가 **첫 화면의
 * 첫 문장**이다.
 *
 *   · 오늘 완료 → 완료 메시지 + 칭찬 + **최근 7일 막대**
 *   · 아직     → 응원 메시지 + 오늘 할 일 한 줄
 *
 * ⚠️ **두 상태는 배타적이다.** 둘을 섞으면 "완료했는데 오늘 뭐 하라는 안내"가
 *    같이 떠서 화면이 스스로 모순된다.
 *
 * ⚠️ 막대는 **SVG가 아니라 div**다. 7칸에 라이브러리(+150KB)나 좌표계산을 들일
 *    이유가 없다 — 이 앱의 다른 진행바도 전부 div다. 높이 계산은
 *    `domain/today-status.ts`에 있고 테스트가 지킨다.
 *
 * ⚠️ 운동 **중**에는 이 카드를 그리지 않는다(부르는 쪽이 판단). 진행 중 화면이
 *    이미 상태를 말하는데 그 위에 "오늘은 아직"을 얹으면 거짓말이 된다.
 */
export function TodayStatusCard({
  didWorkoutToday,
  bars,
  streak,
  stage,
  gap,
  todayKey,
  todayLine,
}: {
  didWorkoutToday: boolean;
  /** 7칸. 마지막이 오늘 */
  bars: DayBar[];
  streak: number;
  stage: StreakStage;
  gap: number | null;
  todayKey: string;
  /** 미완료일 때 "오늘 할 일" 한 줄. 없으면 안 그린다 */
  todayLine?: string | null;
}) {
  // 홈 스트릭 카드와 **같은 문구 원천**이다. 두 화면이 다른 말을 하면
  // 사용자는 어느 쪽이 맞는지 확인하러 탭을 오간다.
  const headline = streakHeadline({ stage, streak, gap, todayKey });

  if (!didWorkoutToday) {
    return (
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <p className="text-[15px] font-extrabold">오늘은 아직이에요 💪</p>
        <p className="mt-1 text-[12.5px] leading-5 text-muted">{headline}</p>
        {todayLine && (
          <p className="mt-2.5 rounded-card-sm bg-surface-2 px-3 py-2 text-[12.5px] font-bold">
            오늘의 운동 · {todayLine}
          </p>
        )}
      </section>
    );
  }

  const totals = weekTotals(bars);
  const hours = Math.floor(totals.minutes / 60);
  const mins = totals.minutes % 60;
  const totalLabel =
    totals.minutes === 0
      ? `${totals.days}일`
      : hours > 0
        ? `${totals.days}일 · ${hours}시간${mins > 0 ? ` ${mins}분` : ""}`
        : `${totals.days}일 · ${mins}분`;

  return (
    <section className="rounded-card border border-good bg-surface p-4 shadow-card">
      <p className="text-[15px] font-extrabold text-good">오늘 운동 완료! 🎉</p>
      <p className="mt-1 text-[12.5px] leading-5 text-muted">{headline}</p>

      {/* 막대 7칸. 눈이 아니라 **글자로도** 읽히게 aria-label을 붙인다 —
          스크린리더에 높이는 아무 의미가 없다. */}
      <div
        role="img"
        aria-label={`최근 7일 운동: ${bars
          .map((b) => `${b.label} ${b.done ? `${b.minutes}분` : "쉼"}`)
          .join(", ")}`}
        className="mt-3 flex h-20 items-end justify-between gap-1.5"
      >
        {bars.map((b) => (
          <div key={b.dayKey} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-14 w-full items-end">
              <div
                className={`w-full rounded-t-[3px] ${
                  b.isToday ? "bg-good" : b.done ? "bg-accent" : "bg-surface-2"
                }`}
                // 안 한 날도 바닥선이 보이게 최소 2px를 남긴다 — 칸이 아예 없으면
                // 요일 글자만 떠 있어 "그래프가 깨졌나" 싶다.
                style={{ height: b.done ? `${b.heightPercent}%` : "2px" }}
              />
            </div>
            <span
              className={`text-[10.5px] ${
                b.isToday ? "font-extrabold text-good" : "text-faint"
              }`}
            >
              {b.label}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11.5px] text-muted">이번 7일 · {totalLabel}</p>
    </section>
  );
}
