"use client";

/**
 * 인증사진 위 날짜·시간 오버레이 스탬프 (§11 — 파일에 굽지 않고 화면에서만).
 * 완료 화면·홈 최근 활동·피드 등 사진이 보이는 모든 곳에서 재사용한다.
 */
export function PhotoStamp({
  completedAt,
  durationMinutes,
  streakLabel,
  position = "bottom",
}: {
  completedAt: Date;
  durationMinutes?: number;
  streakLabel?: string;
  position?: "bottom" | "top";
}) {
  const dateLabel = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(completedAt)
    .replaceAll("-", ".");
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" })
    .format(completedAt)
    .toUpperCase();
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(completedAt);

  const detail = [
    timeLabel,
    durationMinutes != null && durationMinutes > 0
      ? `${durationMinutes}분`
      : null,
    streakLabel || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={
        position === "bottom"
          ? "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white"
          : "pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-3 text-white"
      }
    >
      <p className="font-mono text-sm font-extrabold">
        {dateLabel} {weekday}
      </p>
      <p className="font-mono text-[11px] opacity-90">{detail}</p>
      <p className="text-[9px] font-bold tracking-[0.2em] opacity-75">
        WORKOUT COMPLETED
      </p>
    </div>
  );
}
