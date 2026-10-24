"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Icon, type IconName } from "@/components/ui/icon";
import { challengeInviteUrl } from "@/lib/domain/challenge-invite";
import { CREATOR_BASE_PATH } from "@/lib/domain/creator-return";
import { ATTENTION_INACTIVE_DAYS, type CreatorSnapshot } from "@/lib/domain/creator-studio";
import type { Challenge } from "@/lib/types";
import { card, CreatorChallengeCard, KpiCard, SectionTitle, type KpiDelta } from "./creator-ui";

export type CreatorHomeActivity = {
  kind: "join" | "proof";
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  hasPhoto: boolean;
  when: string;
};

type HomeChallenge = Pick<
  Challenge,
  "id" | "name" | "status" | "start_date" | "end_date" | "invite_code" | "recruit_image_url" | "recruit_note"
>;

function countDelta(n: number | null, unit: string): KpiDelta | null {
  if (n === null || n === 0) return null;
  return { text: `${Math.abs(n)}${unit}`, tone: n > 0 ? "up" : "down" };
}

/**
 * 운영 홈 (시안 4, 2026-10-24). 숫자는 전부 `buildCreatorSnapshot` 한 곳에서 온다.
 * ⚠️ 측정하지 않는 것(링크 클릭 · 유입 채널 · 재참여 의향)은 칸도 만들지 않는다 — 계획서 §5.4.
 * ⚠️ 진행 중·종료 챌린지에 "초대 링크 공유"를 주 버튼으로 두지 않는다. 서버가 setup에서만
 *    참가를 받는다(`join_discoverable_challenge` · `accept_challenge_invite`).
 */
export function CreatorHome({
  challenge, snapshot, recent, viewerId,
}: {
  challenge: HomeChallenge;
  snapshot: CreatorSnapshot;
  recent: readonly CreatorHomeActivity[];
  viewerId: string;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const base = `${CREATOR_BASE_PATH}/${encodeURIComponent(challenge.id)}`;
  const members = `${base}/members`;
  const tracked = snapshot.todayTracked;

  async function shareInvite() {
    if (challenge.status !== "setup" || !challenge.invite_code) return;
    const url = challengeInviteUrl(window.location.origin, challenge.invite_code, viewerId);
    try {
      if (navigator.share) {
        await navigator.share({ title: challenge.name, text: "GND 운동 챌린지에 함께해요", url });
        setNotice("초대 링크를 공유했어요");
      } else {
        await navigator.clipboard.writeText(url);
        setNotice("초대 링크를 복사했어요");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setNotice("링크를 공유하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  const firstProofRate =
    challenge.status === "setup" || snapshot.memberCount === 0
      ? null
      : `${Math.round((snapshot.firstProofCount / snapshot.memberCount) * 100)}`;
  const todayDelta =
    tracked && snapshot.yesterdayProofCount !== null
      ? countDelta(snapshot.todayProofCount - snapshot.yesterdayProofCount, "명")
      : null;

  // 오늘 할 일 — 0명인 줄은 그리지 않는다(할 일이 아니다).
  const todos: { filter: string; icon: IconName; title: string; hint: string; count: number }[] = [
    ...(tracked
      ? [{
          filter: "attention", icon: "warning" as const,
          title: `${ATTENTION_INACTIVE_DAYS}일 이상 기록 없음 ${snapshot.attentionCount}명`,
          // ⚠️ "응원으로 안부"라고 쓰지 마라 — send_cheer는 운동 중인 세션만 받는다(not_active).
          //    쉬고 있는 회원에게 보낼 경로는 아직 없다(계획서 §5.3, P2).
          hint: "상세에서 기록을 확인해 보세요.", count: snapshot.attentionCount,
        }]
      : []),
    ...(challenge.status !== "ended"
      ? [
          {
            filter: "no-goal", icon: "target" as const,
            title: `목표 미설정 ${snapshot.noGoalCount}명`,
            hint: "개인 목표를 정하도록 안내해 주세요.", count: snapshot.noGoalCount,
          },
          {
            filter: "new", icon: "users" as const,
            title: `이번 주 새로 합류 ${snapshot.recentJoinCount}명`,
            hint: "환영 인사로 좋은 시작을 함께해 주세요.", count: snapshot.recentJoinCount,
          },
        ]
      : []),
  ].filter((t) => t.count > 0);

  const primary =
    challenge.status === "setup" && challenge.invite_code
      ? { kind: "share" as const, label: "초대 링크 공유", icon: "share" as const }
      : challenge.status === "ended"
        ? { kind: "link" as const, label: "결과 보기", icon: "trophy" as const, href: `/challenge?open=${encodeURIComponent(challenge.id)}` }
        : { kind: "link" as const, label: "참여자 관리", icon: "users" as const, href: members };
  const secondary =
    primary.label === "참여자 관리"
      ? { label: "챌린지 상세", icon: "eye" as const, href: `/challenge?open=${encodeURIComponent(challenge.id)}` }
      : { label: "참여자 관리", icon: "users" as const, href: members };

  return (
    <div className="flex flex-col gap-3.5 pb-6 text-text">
      <header className="flex items-start gap-2">
        <Link href={CREATOR_BASE_PATH} aria-label="운영 챌린지 목록" className="-ml-1 grid h-10 w-8 shrink-0 place-items-center text-muted">
          <Icon name="back" size={22} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-[24px] font-black leading-tight">
            <span className="text-accent">GND</span> Creator Studio
          </h1>
          <p className="mt-0.5 text-[12.5px] text-muted">회원 한 명 한 명의 꾸준함을 챙겨 보세요.</p>
        </div>
      </header>

      <CreatorChallengeCard challenge={challenge} />

      <section className="grid grid-cols-4 gap-1.5" aria-label="운영 현황">
        <KpiCard icon="users" label="참여자" value={snapshot.memberCount} unit="명"
          delta={challenge.status === "ended" ? null : countDelta(snapshot.recentJoinCount, "명")} />
        <KpiCard icon="check" label="오늘 인증" value={tracked ? snapshot.todayProofCount : null} unit="명" delta={todayDelta} />
        {/* 4칸이 375px에 들어가야 한다 — "오늘 기록 없음"은 잘린다(2026-10-24 화면 확인) */}
        <KpiCard icon="warning" tone="warn" label="미기록"
          value={tracked ? snapshot.memberCount - snapshot.todayProofCount : null} unit="명" />
        <KpiCard icon="flame" label="첫 인증률" value={firstProofRate} unit="%" />
      </section>
      {tracked && (
        <p className="-mt-2 text-[10.5px] text-muted">▲ 참여자는 최근 7일 합류 수, 오늘 인증은 어제 대비예요.</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {primary.kind === "share" ? (
          <button
            type="button"
            onClick={() => void shareInvite()}
            className="flex min-h-14 items-center justify-center gap-2 rounded-card bg-accent px-3 text-[15px] font-extrabold text-accent-ink"
          >
            <Icon name={primary.icon} size={19} /> {primary.label}
          </button>
        ) : (
          <Link
            href={primary.href}
            className="flex min-h-14 items-center justify-center gap-2 rounded-card bg-accent px-3 text-[15px] font-extrabold text-accent-ink"
          >
            <Icon name={primary.icon} size={19} /> {primary.label}
          </Link>
        )}
        <Link
          href={secondary.href}
          className={`${card} flex min-h-14 items-center justify-center gap-2 px-3 text-[15px] font-extrabold`}
        >
          <Icon name={secondary.icon} size={19} /> {secondary.label}
        </Link>
      </div>
      {challenge.status === "active" && (
        <p className="-mt-1.5 text-[11px] text-muted">진행 중에는 새 회원이 참가할 수 없어 초대 공유를 숨겼어요.</p>
      )}
      {notice && <p role="status" className="-mt-1.5 text-xs font-bold text-accent">{notice}</p>}

      {challenge.status !== "ended" && (
        <section className={`${card} p-3.5`}>
          <SectionTitle icon="check" title="오늘 할 일" moreHref={members} />
          {todos.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-muted">지금 챙길 회원이 없어요.</p>
          ) : (
            <div className="mt-2.5 flex flex-col gap-2">
              {todos.map((t) => (
                <Link
                  key={t.filter}
                  href={`${members}?filter=${t.filter}`}
                  className="flex items-center gap-3 rounded-card-sm bg-surface-2 px-3 py-3"
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                    t.filter === "attention" ? "bg-gold/15 text-gold" : "bg-surface-3 text-text"
                  }`}>
                    <Icon name={t.icon} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[14px]">{t.title}</strong>
                    <span className="block text-[11.5px] text-muted">{t.hint}</span>
                  </span>
                  <Icon name="chevron" size={16} className="shrink-0 text-muted" />
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <section className={`${card} p-3.5`}>
        <SectionTitle icon="bell" title="최근 활동" />
        {recent.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-muted">
            {challenge.status === "active" ? "아직 활동이 없어요." : "합류 소식이 여기에 쌓여요."}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {recent.map((a) => (
              <li key={`${a.kind}-${a.userId}-${a.when}`} className="flex items-center gap-3 py-2.5">
                <Avatar src={a.avatarUrl} label={a.nickname} className="h-10 w-10 shrink-0" />
                <p className="min-w-0 flex-1 text-[13px]">
                  <strong>{a.nickname}</strong>님이{" "}
                  {a.kind === "join" ? "챌린지에 새로 참여했어요." : "운동 인증을 완료했어요."}
                  {a.kind === "proof" && a.hasPhoto && (
                    <span className="ml-1 inline-flex translate-y-0.5 text-muted" aria-label="사진 인증">
                      <Icon name="camera" size={14} />
                    </span>
                  )}
                </p>
                <span className="shrink-0 text-[11px] text-muted">{a.when}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
