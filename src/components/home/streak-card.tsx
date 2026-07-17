"use client";

import {
  currentStreak,
  streakStage,
  workoutDayKeys,
  type StreakStage,
} from "@/lib/domain/streak";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";

// 손실회피 + 능청 유머: 잃을 숫자(n일)는 정확히 찌르되, 약올리듯 능청스럽게.
// 단계마다 변형 여러 개 — 날짜 기반으로 하루마다 돌아가며 나온다(렌더 중 랜덤은
// 하이드레이션 불일치·재렌더마다 문구 바뀜 문제가 있어 결정적 로테이션 사용).
const STAGE_MESSAGES: Partial<
  Record<StreakStage, ((streak: number) => string)[]>
> = {
  d4: [
    (n) =>
      `어제 쉬셨다? 어~ 그럴 수 있죠. 근데 ${n}일 불꽃은 그렇게 생각 안 하던데요? (소멸 D-4)`,
    (n) =>
      `하루 걸렀네요? 티 안 날 줄 알았죠? ${n}일 불꽃이 다 보고 있어요 (소멸 D-4)`,
    (n) =>
      `어제 뭐 하셨어요~ ${n}일 쌓아놓고 벌써 여유 부리시면 어떡해요 (소멸 D-4)`,
  ],
  d3: [
    (n) =>
      `이틀째 조용~하시네요. 쌓는 덴 ${n}일, 날리는 덴 3일이면 충분합니다? (소멸 D-3)`,
    (n) =>
      `이틀 연속 휴식이라… 어우, ${n}일 불꽃이 슬슬 서운해하는데요? (소멸 D-3)`,
    (n) =>
      `혹시 잊으셨나 해서요~ ${n}일짜리 불꽃 주인 어디 가셨어요? (소멸 D-3)`,
  ],
  d2: [
    (n) =>
      `어우~ 위험해 위험해. ${n}일 불꽃, 지금 바람 앞의 촛불이에요 (소멸 D-2)`,
    (n) =>
      `3일째라… 이쯤 되면 ${n}일 불꽃 유언 준비합니다? 살릴 거면 오늘이에요 (소멸 D-2)`,
    (n) =>
      `${n}일 모으는 데 얼마나 걸렸는지 기억하시죠? 날아가는 덴 이틀 남았어요 (소멸 D-2)`,
  ],
  d1: [
    (n) =>
      `자~ 마지막 경고입니다? 오늘 안 하면 ${n}일 전부 리셋. 후회는 셀프예요 (D-1)`,
    (n) =>
      `내일이면 ${n}일 → 0일. 이 계산 맞아요? 오늘 딱 30분이면 다 지켜요 (D-1)`,
    (n) =>
      `진짜 마지막이에요~ ${n}일 불꽃 장례식 보실 거예요, 살리실 거예요? (D-1)`,
  ],
};

const TODAY_DONE_MESSAGES = [
  "오늘 완료! 🔥 어우~ 좀 치시는데요?",
  "오늘 완료! 🔥 이 맛에 운동하죠~",
  "오늘 완료! 🔥 불꽃이 아주 팔팔합니다",
];

const EXPIRED_MESSAGES = [
  "불꽃 나갔습니다~ 괜찮아요, 원래 없던 걸로 해요. 오늘부터 다시 1일?",
  "불꽃 꺼진 지 좀 됐어요. 뭐 어때요, 오늘 켜면 또 1일이죠~",
];

/** 날짜 문자열 해시로 변형 하나 선택 — 같은 날엔 고정, 날마다 로테이션 */
function pickByDay<T>(variants: T[], todayKey: string): T {
  let h = 0;
  for (const c of todayKey) h = (h * 31 + c.charCodeAt(0)) % 997;
  return variants[h % variants.length];
}

function weekdayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return "일월화수목금토"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** 🔥 스트릭 카드 + 소멸 경고 배너 (목업 streakcard·warn) */
export function StreakCard({ completedAts }: { completedAts: Date[] }) {
  const tz = DEFAULT_TIMEZONE;
  const now = new Date();
  const keys = workoutDayKeys(completedAts, tz);
  const todayKey = dayKey(now, tz);
  const streak = currentStreak(keys, todayKey);
  const stage = streakStage(keys, todayKey);
  const keySet = new Set(keys);

  // 최근 7일(오늘 포함) 요일 점
  const dots = Array.from({ length: 7 }, (_, i) => {
    const k = dayKey(new Date(now.getTime() - (6 - i) * 86_400_000), tz);
    return { key: k, done: keySet.has(k) };
  });

  const sub =
    stage === "none"
      ? "운동을 시작하면 불꽃이 켜져요"
      : stage === "today_done"
        ? pickByDay(TODAY_DONE_MESSAGES, todayKey)
        : stage === "expired"
          ? pickByDay(EXPIRED_MESSAGES, todayKey)
          : (STAGE_MESSAGES[stage] &&
              pickByDay(STAGE_MESSAGES[stage], todayKey)(streak)) ||
            "";

  const warning =
    streak > 0 && STAGE_MESSAGES[stage]
      ? pickByDay(STAGE_MESSAGES[stage], todayKey)(streak)
      : undefined;

  return (
    <>
      <section className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
        <span className="text-3xl">{streak > 0 ? "🔥" : "🪵"}</span>
        <div className="flex-1">
          <p className="text-[15px] font-extrabold">
            {streak > 0 ? `스트릭 ${streak}일 유지 중` : "스트릭 없음"}
          </p>
          <p className="mt-0.5 text-xs text-muted">{sub}</p>
          <div className="mt-2 flex gap-1.5">
            {dots.map((d) => (
              <span key={d.key} className="flex flex-col items-center gap-0.5">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    d.done ? "bg-accent" : "border border-line bg-surface-2"
                  }`}
                />
                <span className="text-[10px] text-faint">
                  {weekdayLabel(d.key)}
                </span>
              </span>
            ))}
          </div>
        </div>
      </section>
      {warning && (
        <p className="rounded-card-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs font-bold text-amber-600 dark:text-amber-400">
          ⚠️ {warning}
        </p>
      )}
    </>
  );
}
