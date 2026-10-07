import { Avatar } from "@/components/avatar";
import { detailArtFor } from "@/lib/domain/challenge-art";
import { formatPeriod } from "@/lib/domain/challenge-report";

/**
 * 최종 시안(2026-10-07) 상세 히어로 — 진행 중·종료 공용.
 * 사진 위에 상태 칩 · 이름 · `9.1 (월) ~ 9.30 (화)` · `D-25` · 아바타 겹침 `+N 참여자 N명`.
 *
 * ⚠️ 사진은 챌린지 사진(`detailArtFor` — 사용자 사진이 언제나 이긴다). 시안의 인물·트로피
 *    일러스트는 그리지 않는다(사용자 지시: 이미지는 제외).
 * ⚠️ 아바타는 3명까지만 겹치고 나머지는 `+N` — 참가자가 수십 명일 수 있다.
 */
export function ChallengeHero({
  name,
  startDate,
  endDate,
  recruitImageUrl,
  status,
  dday,
  members,
}: {
  name: string;
  startDate: string;
  endDate: string;
  recruitImageUrl: string | null;
  status: "active" | "ended";
  /** 진행 중일 때만 — 남은 날 */
  dday?: number;
  members: readonly { id: string; avatar_url: string | null }[];
}) {
  const shown = members.slice(0, 3);
  const more = members.length - shown.length;
  return (
    <section className="relative -mx-4 -mt-1 overflow-hidden">
      <div className="relative h-[200px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={detailArtFor(recruitImageUrl)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-right"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-bg via-bg/75 to-bg/10" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-end gap-1.5 px-4 pb-3">
          <span
            className={`w-fit rounded-md px-2 py-0.5 text-[11px] font-extrabold ${
              status === "active"
                ? "bg-accent-weak text-accent ring-1 ring-accent/50"
                : "bg-surface-3 text-muted ring-1 ring-line-strong"
            }`}
          >
            {status === "active" ? "진행 중" : "종료"}
          </span>
          <h1 className="line-clamp-2 max-w-[88%] text-[22px] leading-tight font-black">{name}</h1>
          <p className="flex items-center gap-2 text-[12.5px] text-muted">
            {formatPeriod(startDate, endDate)}
            {status === "active" && dday !== undefined && (
              <span className="rounded-md border border-accent/60 px-1.5 text-[11.5px] font-extrabold text-accent">
                {dday <= 0 ? "D-DAY" : `D-${dday}`}
              </span>
            )}
          </p>
          <div className="mt-1 flex items-center gap-2" aria-label={`참여자 ${members.length}명`}>
            <span className="flex -space-x-2">
              {shown.map((m) => (
                <Avatar
                  key={m.id}
                  src={m.avatar_url}
                  className="grid h-7 w-7 place-items-center overflow-hidden rounded-full border-2 border-bg bg-surface-2 text-xs"
                />
              ))}
              {more > 0 && (
                <span className="grid h-7 min-w-7 place-items-center rounded-full border-2 border-bg bg-surface-3 px-1 text-[10.5px] font-extrabold">
                  +{more}
                </span>
              )}
            </span>
            <span className="text-[12px] font-bold text-muted">참여자 {members.length}명</span>
          </div>
        </div>
      </div>
    </section>
  );
}
