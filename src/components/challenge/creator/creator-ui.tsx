import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";
import { detailArtFor } from "@/lib/domain/challenge-art";
import { formatPeriod } from "@/lib/domain/challenge-report";
import { isDemoChallenge } from "@/lib/domain/creator-return";
import { challengeStatusLabel, type CreatorBadge } from "@/lib/domain/creator-studio";
import type { Challenge } from "@/lib/types";

/**
 * Creator Studio 공용 조각 (시안 2026-10-24 4장). 색은 전부 기존 토큰이다 —
 * 블랙&라임은 `globals.css`가 이미 갖고 있다. 새 색을 만들지 않는다.
 */

export const card = "rounded-card border border-line bg-surface shadow-card";

const BADGE: Record<CreatorBadge, { label: string; className: string }> = {
  "done-today": { label: "완료", className: "border-accent/60 bg-accent/10 text-accent" },
  attention: { label: "확인 필요", className: "border-gold/70 bg-gold/10 text-gold" },
  "needs-goal": { label: "설정 필요", className: "border-line-strong text-muted" },
  new: { label: "신규", className: "border-sky-400/60 bg-sky-400/10 text-sky-300" },
  active: { label: "진행 중", className: "border-line text-muted" },
  ready: { label: "준비 완료", className: "border-accent/60 text-accent" },
};

export function StatusBadge({ badge }: { badge: CreatorBadge }) {
  const b = BADGE[badge];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-[12px] font-bold ${b.className}`}>
      {b.label}
    </span>
  );
}

/** 시안의 사진 카드 — 상태 칩 · 기간 · 이름 · 모집 문구. 누르면 기존 챌린지 상세. */
export function CreatorChallengeCard({
  challenge,
}: {
  challenge: Pick<Challenge, "id" | "name" | "status" | "start_date" | "end_date" | "recruit_image_url"> & {
    recruit_note?: string | null;
  };
}) {
  const live = challenge.status === "active";
  const demo = isDemoChallenge(challenge.id);
  const body = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- 같은 일러스트를 챌린지 상세 히어로도 <img>로 쓴다 */}
      <img
        src={detailArtFor(challenge.recruit_image_url)}
        alt=""
        className="h-[76px] w-[96px] shrink-0 rounded-card-sm object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-extrabold ${
              live ? "bg-accent text-accent-ink" : "bg-surface-3 text-muted"
            }`}
          >
            {challengeStatusLabel(challenge.status)}
          </span>
          <span className="truncate">{formatPeriod(challenge.start_date, challenge.end_date)}</span>
        </div>
        <p className="mt-1.5 truncate text-[17px] font-black">{challenge.name}</p>
        {challenge.recruit_note && (
          <p className="mt-0.5 truncate text-[12px] text-muted">{challenge.recruit_note}</p>
        )}
      </div>
      {!demo && <Icon name="chevron" size={18} className="shrink-0 text-muted" />}
    </>
  );
  const box = `${card} flex items-center gap-3 overflow-hidden p-2.5 pr-3`;
  // 미리보기의 가짜 챌린지는 실제 챌린지 상세로 이어지지 않는다
  return demo ? (
    <div className={box}>{body}</div>
  ) : (
    <Link href={`/challenge?open=${encodeURIComponent(challenge.id)}`} className={box}>{body}</Link>
  );
}

export type KpiDelta = { text: string; tone: "up" | "down" };

/** 시안의 4칸 지표. 값이 없으면 "–" — 0과 "모름"을 섞지 않는다. */
export function KpiCard({
  icon, label, value, unit, delta, tone = "accent",
}: {
  icon: IconName;
  label: string;
  value: number | string | null;
  unit?: string;
  delta?: KpiDelta | null;
  tone?: "accent" | "warn";
}) {
  return (
    <div className={`${card} flex min-w-0 flex-col gap-1 p-2.5`}>
      <Icon name={icon} size={20} className={tone === "warn" ? "text-gold" : "text-accent"} />
      <p className="mt-1 truncate text-[11.5px] font-bold text-muted">{label}</p>
      <p className="text-[20px] font-black leading-tight tabular-nums">
        {value ?? "–"}
        {value !== null && value !== "–" && unit && <span className="ml-0.5 text-[13px] font-extrabold">{unit}</span>}
      </p>
      {delta && (
        <span
          className={`mt-0.5 self-start rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
            delta.tone === "up" ? "bg-accent/10 text-accent" : "bg-red-500/10 text-red-400"
          }`}
        >
          {delta.tone === "up" ? "▲" : "▼"} {delta.text}
        </span>
      )}
    </div>
  );
}

export function SectionTitle({
  icon, title, moreHref, moreLabel = "모두 보기",
}: {
  icon: IconName;
  title: string;
  moreHref?: string;
  moreLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-[16px] font-extrabold">
        <Icon name={icon} size={19} className="text-accent" />
        {title}
      </h2>
      {moreHref && (
        <Link href={moreHref} className="flex min-h-9 items-center text-[12.5px] font-bold text-muted">
          {moreLabel}
        </Link>
      )}
    </div>
  );
}
