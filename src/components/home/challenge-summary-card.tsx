import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { challengeDday } from "@/lib/domain/challenge-time";
import { pickPrimaryRow } from "@/lib/domain/challenge-room";
import { KING_DAYS } from "@/lib/domain/viewing-pass";
import { dayKey } from "@/lib/domain/time";
import type { MyChallenge, MyChallengeScore } from "@/lib/challenge";

/**
 * 홈의 진행 중 챌린지 요약 (2026-08-13).
 *
 * 설계: `docs/superpowers/specs/2026-08-13-home-today-card-and-challenge-cta-design.md` §4.3
 *
 * ⚠️⚠️ **달성률·참여율·종합점수를 여기에 그리지 마라.** 그 숫자들은 챌린지 탭이
 * 이미 그린다. 같은 숫자를 두 화면에 두면 서로 다른 시점의 집계를 보여주게 되고,
 * 그게 이 저장소가 반복해서 당한 사고다(`CLAUDE.md` §같은 사실을 두 곳에 두지 않는다).
 * 홈이 말할 것은 **존재와 기한**뿐이다. `challenge-summary-card.test.tsx`가 부정
 * 단언으로 막는다.
 *
 * ⚠️ **표시 전용이다.** 조회는 `home-client`가 이미 하는 `Promise.all`에서 한다 —
 * 여기서 부르면 홈에 네 번째 워터폴이 생기고, 표시 규칙 하나를 테스트할 때마다
 * Supabase를 흉내 내야 한다(`FriendBoardBody`와 같은 규약).
 *
 * ⚠️ **타임존은 챌린지 탭과 같은 것을 받는다**(프로필 우선). 홈의 다른 위젯들이 쓰는
 * `DEFAULT_TIMEZONE`으로 계산하면 해외 사용자에게 **같은 챌린지가 홈에서 D-15,
 * 탭에서 D-14**로 보인다. D-day와 "오늘 반영"이 **둘 다** 이 타임존을 쓴다 —
 * 하나만 바꾸면 카드 한 장이 자기모순이 된다.
 */
export function ChallengeSummaryCard({
  challenges,
  timeZone,
  score,
}: {
  /** 조회 전이면 `null` — 그동안 아무것도 그리지 않는다(빈 상태가 깜빡이지 않게) */
  challenges: MyChallenge[] | null;
  timeZone: string;
  /**
   * 내 점수 — 챌린지 탭과 **같은** `scoreParticipant`가 만든 값
   * (`getMyChallengeScore`). 아직 안 왔으면 `null`이고 화면은 `—`를 그린다.
   *
   * ⚠️ 여기서 다시 계산하지 마라. 홈과 탭이 다른 숫자를 말하게 된다.
   */
  score: MyChallengeScore | null;
}) {
  // ⚠️ 조회 전에 빈 상태를 그리면, 챌린지가 있는 사람에게도 "챌린지를 시작해
  //    보세요"가 한 번 번쩍이고 요약으로 바뀐다.
  if (challenges === null) return null;

  // ⚠️ `myStatus`를 반드시 본다. `invited`는 **아직 수락하지 않은 초대장**이라
  //    내 진행 중 챌린지가 아니다. `dropped`도 마찬가지다.
  // ⚠️ 대표 선택은 `pickPrimaryRow`다 — 챌린지 탭과 **같은 함수**여야 홈에서 본
  //    챌린지와 탭에서 열리는 챌린지가 같다.
  const active = challenges.filter(
    (c) => c.status === "active" && c.myStatus === "joined",
  );
  const challenge = pickPrimaryRow(active);

  if (!challenge) return <NoChallengeCard />;

  /**
   * 대표 말고 더 있는 진행 중 챌린지 수 (2026-08-13 사용자 확정).
   *
   * ⚠️ **쌓지 않는다.** 진행 중 챌린지 수만큼 카드를 늘리면 3개일 때 351px라
   * 성장·스트릭·주간 통계가 통째로 접힘선 밖으로 밀린다. 홈은 대표 하나만 그리고,
   * **나머지가 있다는 사실만** 말한다 — 안 말하면 사용자는 나머지를 못 찾는다.
   */
  const others = active.length - 1;

  const now = new Date();
  const dday = challengeDday(dayKey(now, timeZone), challenge.end_date);

  const pct = Math.min(100, Math.round(score?.achievement ?? 0));
  const href = `/challenge?open=${challenge.id}`;

  return (
    /* 2026-10-05 Performance Social — 시안의 `ACTIVE CHALLENGE` 카드.
       왼쪽은 사진 위 챌린지 이름·진행 바, 오른쪽은 **내** 진행률·종합점수.

       ⚠️⚠️ **진행 중에는 순위를 그리지 않는다** (사용자 확정 2026-10-05 "진행 중
       챌린지는 내 목표·활동을 표시하고, TOP 3는 종료 후"). 시안의 `#3 · 12명 중 ·
       1위까지 2회`는 진행 중 참가자 공개 순위라서 쓰지 않는다 — 기존 조건부 공개
       (`KING_DAYS`일 연속 시 성과 공개)를 그대로 지킨다.

       ⚠️ 숫자 둘은 `scoreParticipant`가 준 값 그대로다(챌린지 탭과 같은 함수).
       조회 전에는 `—`다 — 0%로 채우면 실패한 성적처럼 읽힌다. */
    <section>
      <div className="flex items-center justify-between gap-2 px-0.5">
        <h3 className="text-[18px] font-black italic tracking-tight">
          <span aria-hidden>ACTIVE CHALLENGE</span>
          <span className="sr-only">진행 중 챌린지</span>
        </h3>
        <Link
          href={href}
          className="flex min-h-[32px] flex-none items-center gap-0.5 text-[12px] font-bold text-muted"
        >
          {others > 0 ? `외 ${others}개 · 전체 보기` : "전체 보기"}
          <Icon name="chevron" size={14} />
        </Link>
      </div>

      <Link
        href={href}
        className="mt-2.5 grid grid-cols-[1fr_118px] overflow-hidden rounded-card border border-line-strong bg-surface shadow-card"
      >
        <div className="relative min-h-[132px] overflow-hidden">
          <Image
            src="/gnd/photos/challenge-860.webp"
            alt=""
            fill
            sizes="280px"
            className="object-cover object-right"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-surface via-surface/75 to-surface/20" />
          <div className="relative flex h-full flex-col justify-between p-3.5">
            <div>
              <p className="line-clamp-2 text-[20px] font-black italic leading-tight tracking-tight">
                {challenge.name}
              </p>
              <div className="mt-2 h-1.5 w-[82%] overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
              {/* ⚠️ `5`를 손으로 적지 마라 — `KING_DAYS`에서 온다 */}
              <span className="flex min-w-0 items-center gap-1 truncate">
                <Icon name="lock" size={13} />
                {KING_DAYS}일 연속 시 성과 공개
              </span>
              <span className="flex flex-none items-center gap-1 font-bold text-text">
                <Icon name="calendar" size={13} className="text-muted" />
                {dday < 0 ? "종료" : `D-${dday}`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between border-l border-line bg-surface-2 px-3 py-3">
          <div>
            <p className="flex items-center gap-1 text-[11px] font-extrabold text-accent">
              <Icon name="target" size={14} />
              MY
            </p>
            <p className="mt-1 text-[11px] text-muted">목표 진행률</p>
            <p className="font-mono text-[26px] font-black leading-none text-accent">
              {score ? `${Math.round(score.achievement)}%` : "—"}
            </p>
          </div>
          <p className="mt-2 flex items-baseline justify-between gap-1 border-t border-line pt-2 text-[11px] text-muted">
            종합점수
            {/* 진행 중 종합 점수는 내 것도 종료일 공개 (사용자 결정 2026-10-08) */}
            <b className="flex items-center gap-0.5 text-[11px] font-extrabold text-muted">
              <Icon name="lock" size={12} />
              종료일 공개
            </b>
          </p>
        </div>
      </Link>
    </section>
  );
}

/**
 * 진행 중 챌린지가 없을 때 (2026-08-13 사용자 지시 — *"챌린지가 없으면 함께 하면
 * 운동을 지속하는 확률이 올라간다는 마케팅 문구로 표시"*).
 *
 * ⚠️ **숫자를 지어내지 마라.** `3배 더 오래 갑니다` 같은 문구는 출처가 있어야 한다.
 * 이 앱은 운동 처방 근거를 인용과 함께 적는 규약이 있고(프로그램 설계 §11), 앱이
 * 스스로 만든 통계는 그 규약을 무너뜨린다. 지금 문구는 **수치를 말하지 않는다** —
 * 출처를 확보하면 그때 숫자를 넣는다.
 */
function NoChallengeCard() {
  return (
    <section>
      <h3 className="px-0.5 text-[18px] font-black italic tracking-tight">
        <span aria-hidden>ACTIVE CHALLENGE</span>
        <span className="sr-only">진행 중 챌린지</span>
      </h3>
      <div className="relative mt-2.5 overflow-hidden rounded-card border border-line-strong bg-surface p-4 shadow-card">
        <Image
          src="/gnd/photos/challenge-860.webp"
          alt=""
          fill
          sizes="430px"
          className="object-cover object-right opacity-70"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-surface via-surface/85 to-surface/20" />
        <div className="relative">
          <p className="flex items-center gap-1.5 text-[15px] font-extrabold">
            <Icon name="trophy" size={18} className="text-accent" />
            혼자보다 같이가 더 오래 갑니다
          </p>
          <p className="mt-1 max-w-[80%] text-xs text-muted">
            기간과 목표를 정해 친구와 함께하면 중간에 그만두기 어려워져요. 4주만 같이
            달려 보세요.
          </p>
          <Link
            href="/challenge"
            className="mt-3 inline-flex h-10 items-center rounded-full border border-accent/60 bg-bg/60 px-4 text-[13px] font-extrabold text-accent"
          >
            챌린지 시작하기 ›
          </Link>
        </div>
      </div>
    </section>
  );
}
