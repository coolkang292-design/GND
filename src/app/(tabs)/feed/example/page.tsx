"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { UserAvatar } from "@/components/user-avatar";
import { FeedItemCard } from "@/components/feed/feed-item";
import { Icon, type IconName } from "@/components/ui/icon";
import { primeCharacterFaces } from "@/lib/character-faces";
import {
  buildExampleChallenge,
  buildExampleFeed,
  exampleCharacterFaces,
} from "@/lib/domain/example-tour";

/**
 * "챌린지는 이렇게 흘러가요" 예시 화면 (2026-11-26).
 *
 * 크루가 0명인 새 회원의 피드는 비어 있다. 챌린지 안에서 무슨 일이 일어나는지 보여 주려고
 * **가짜 회원의 하루**를 이야기 순서(열림 → 인증 → 응원 → 순위 → 결과)로 펼친다.
 *
 * ⚠️ 피드 카드는 진짜 `FeedItemCard`를 `demo`로 쓴다 — 서버에 쓰는 길이 전부 닫혀 있다.
 * ⚠️ "예시 화면이에요" 띠를 **지우지 마라.** 연출 사진과 가짜 회원을 진짜처럼 보이게 하면
 *    새 회원을 속이는 것이 된다. 띠는 스크롤해도 위에 붙어 있다.
 * ⚠️ 대본은 `lib/domain/example-tour.ts`에 있다. 이 파일에서 숫자를 따로 만들지 않는다.
 */
export default function ExampleTourPage() {
  const { userId } = useAuth();
  // 기준 시각은 마운트 때 한 번 고정 (렌더 중 Date.now()는 purity 규칙 위반)
  const [story] = useState(() => {
    // 자식 카드가 그려지기 **전에** 얼굴을 넣어 둬야 첫 화면부터 캐릭터가 뜬다
    primeCharacterFaces(exampleCharacterFaces());
    const now = new Date();
    return { feed: buildExampleFeed(now), challenge: buildExampleChallenge(now) };
  });
  const { feed, challenge } = story;
  // 로그인 전이어도 그려져야 한다. 아무 사람과도 겹치지 않는 값이면 "(나)" 표시가 안 붙는다
  const viewerId = userId ?? "viewer";

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header className="flex items-center gap-2 pt-1">
        <Link
          href="/feed"
          aria-label="피드로 돌아가기"
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-muted"
        >
          <Icon name="back" size={22} />
        </Link>
        <h1 className="text-[20px] font-black tracking-tight">챌린지는 이렇게 흘러가요</h1>
      </header>

      <p
        role="note"
        className="sticky top-0 z-10 -mx-1 flex items-center justify-center gap-1.5 rounded-full border border-accent/40 bg-bg/95 px-3 py-2 text-[12.5px] font-extrabold text-accent backdrop-blur"
      >
        <Icon name="eye" size={15} />
        예시 화면이에요 · 실제 회원이 아니에요
      </p>

      {/* ① 열림 */}
      <Step n={1} title="챌린지가 열려요">
        누군가 챌린지를 열면 피드의 <b>챌린지 모집</b>에 올라와요. 참가하면 시작 전에 각자 목표를
        하나씩 정해요.
      </Step>
      <section className="rounded-card border border-line-strong bg-surface p-4 shadow-card">
        <p className="text-[11.5px] font-extrabold text-accent">
          {shortDate(challenge.startDate)} ~ {shortDate(challenge.endDate)} · {challenge.totalDays}일
        </p>
        <h2 className="mt-1 text-[18px] font-black">{challenge.title}</h2>
        <div className="mt-3 flex items-center gap-2">
          <span className="flex -space-x-2">
            {challenge.participants.map((p) => (
              <UserAvatar
                key={p.id}
                userId={p.id}
                src={p.avatarUrl}
                className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-surface bg-surface-3 text-sm"
              />
            ))}
          </span>
          <span className="text-[12.5px] font-bold text-muted">{challenge.participants.length}명 참가</span>
        </div>
        <div className="mt-3">
          <p className="text-[11.5px] font-bold text-faint">참가자들이 고른 목표</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {challenge.goals.map((g) => (
              <li
                key={g}
                className="rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-[12px] font-bold"
              >
                {g}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[11.5px] font-bold text-muted">
            <span>지금 {challenge.day}일째</span>
            <span>{challenge.totalDays - challenge.day}일 남음</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.round((challenge.day / challenge.totalDays) * 100)}%` }}
            />
          </div>
        </div>
      </section>

      {/* ② 인증 + ③ 응원 — 진짜 피드 카드 */}
      <Step n={2} title="운동하고 인증해요">
        운동을 끝내면 기록과 인증사진이 피드에 올라가요. 아래는 어제 하루 동안 올라온 운동이에요.
      </Step>
      <Step n={3} title="하트와 댓글로 서로 챙겨요">
        하트(<Icon name="heart" size={13} className="inline -mt-0.5" />)를 누르거나 댓글(
        <Icon name="comment" size={13} className="inline -mt-0.5" />)을 열어 보세요. 운동 중인 사람에게는
        실시간 응원도 보낼 수 있어요.
      </Step>
      <section className="flex flex-col gap-3">
        <p className="mt-1 flex items-center gap-2 text-xs font-extrabold text-muted">
          <Icon name="calendar" size={14} className="text-accent" />
          어제
          <span className="font-bold text-faint">운동 {feed.length}</span>
        </p>
        {feed.map((item) => (
          <FeedItemCard
            key={item.sessionId}
            item={item}
            userId={viewerId}
            onProfileClick={() => {}}
            demo
            openComments={item.sessionId === "example-session-minsu" || item.sessionId === "example-session-yujin"}
          />
        ))}
      </section>

      {/* ④ 순위 */}
      <Step n={4} title="매일 순위가 바뀌어요">
        목표를 얼마나 채웠는지로 순위가 매겨져요. 누가 운동하면 순위가 바뀌어서, 쉬려던 날에도 한 번 더 하게
        돼요.
      </Step>
      <section className="rounded-card border border-line-strong bg-surface p-4 shadow-card">
        <p className="flex items-center gap-1.5 text-[12px] font-extrabold text-muted">
          <Icon name="ranking" size={15} className="text-accent" />
          {challenge.day}일째 순위 · 지금까지 목표 {challenge.standings[0]?.target ?? 0}회
        </p>
        <ol className="mt-3 flex flex-col gap-2.5">
          {challenge.standings.map((s, i) => {
            const pct = Math.min(100, Math.round((s.done / Math.max(1, s.target)) * 100));
            return (
              <li key={s.who.id} className="flex items-center gap-2.5">
                <span
                  className={`w-5 flex-none text-center text-[13px] font-black ${i === 0 ? "text-accent" : "text-muted"}`}
                >
                  {i + 1}
                </span>
                <UserAvatar
                  userId={s.who.id}
                  src={s.who.avatarUrl}
                  className="flex h-7 w-7 flex-none items-center justify-center overflow-hidden rounded-full bg-surface-3 text-xs"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-extrabold">{s.who.nickname}</span>
                    <span className="flex-none text-[12px] font-bold text-muted">
                      {s.done}/{s.target}회
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={`h-full rounded-full ${pct >= 100 ? "bg-accent" : "bg-muted"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ⑤ 결과 */}
      <Step n={5} title="끝나면 함께 돌아봐요">
        {challenge.totalDays}일이 지나면 결과가 나와요. 누가 완주했는지, 서로 얼마나 응원했는지 한눈에 볼
        수 있어요.
      </Step>
      <section className="grid grid-cols-2 gap-2">
        <Stat icon="trophy" value={`${challenge.result.finishers}/${challenge.result.total}명`} label="완주" />
        <Stat icon="dumbbell" value={`${challenge.result.workouts}회`} label="함께 한 운동" />
        <Stat icon="heart" value={`${challenge.result.cheers}개`} label="주고받은 하트·응원" />
        <Stat icon="comment" value={`${challenge.result.comments}개`} label="댓글" />
      </section>

      <div className="mt-2 flex flex-col gap-2">
        <Link
          href="/feed?tab=recruit"
          className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-card-sm bg-accent text-[15px] font-extrabold text-accent-ink"
        >
          모집 중인 챌린지 보러 가기
          <Icon name="arrow" size={17} />
        </Link>
        <Link
          href="/feed"
          className="flex min-h-[44px] items-center justify-center rounded-card-sm border border-line text-[13.5px] font-bold text-muted"
        >
          피드로 돌아가기
        </Link>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="mt-2 flex gap-2.5">
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent text-[12px] font-black text-accent-ink">
        {n}
      </span>
      <div className="min-w-0">
        <h2 className="text-[16px] font-black leading-6">{title}</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{children}</p>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  return (
    <div className="rounded-card border border-line-strong bg-surface p-3.5 shadow-card">
      <Icon name={icon} size={18} className="text-accent" />
      <p className="mt-1.5 text-[20px] font-black tracking-tight">{value}</p>
      <p className="text-[11.5px] font-bold text-muted">{label}</p>
    </div>
  );
}

/** `11/17` */
function shortDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
