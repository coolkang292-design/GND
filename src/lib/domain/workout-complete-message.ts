import { pickByDay } from "./streak-messages";

/**
 * 마지막 세트를 끝냈을 때의 안내 + 응원 (2026-08-04, 사용자 요청).
 *
 * ⚠️ **렌더 중 랜덤을 쓰지 않는다.** `streak-messages.ts`가 같은 이유로
 * `pickByDay`를 쓴다 — 재렌더마다 문구가 바뀌면 화면이 덜컹거리고, 서버·클라이언트
 * 문구가 갈리면 하이드레이션이 어긋난다. 문구 추가·수정은 이 파일만 고친다.
 */
export type CompletionMessage = {
  headline: string;
  cheer: string;
};

/** GND 톤: 손실회피 없이, 끝낸 사람에게는 능청스럽게 칭찬만 */
const CHEERS = [
  "담은 거 하나도 안 남기셨네요. 오늘의 승자십니다 🏆",
  "계획대로 끝내는 사람, 생각보다 드뭅니다. 오늘 그중 하나예요 💪",
  "미룬 세트 0개. 이 기록은 좀 자랑하셔도 됩니다 🔥",
  "몸은 힘들었겠지만 기록은 아주 깔끔합니다 ✨",
  "오늘 몫 완납. 내일의 나에게 빚 안 남겼어요 👏",
  "끝까지 한 날은 티가 납니다. 오늘이 그런 날이에요 🙌",
  "세트 다 채우셨습니다. 이제 쉬는 것도 운동의 일부예요 😌",
];

const HEADLINE = "오늘 계획한 운동을 다 했어요 🎉";

export function workoutCompletionMessage(input: {
  /** 사용자 tz 기준 오늘 (YYYY-MM-DD) — 문구 로테이션 기준 */
  todayKey: string;
}): CompletionMessage {
  return {
    headline: HEADLINE,
    cheer: pickByDay(CHEERS, input.todayKey),
  };
}

/**
 * **마지막 세트를 하기 직전**의 응원 (2026-08-09 사용자 지시
 * "치얼업 메시지 운동중 세션 마지막 세트에 나타나게").
 *
 * ⚠️ **`CHEERS`를 여기 쓰지 마라. 전부 과거형이다** — "안 남기셨네요", "끝까지 한
 * 날은". 아직 하지 않은 세트 앞에 띄우면 하지도 않은 일을 했다고 말하는 셈이다.
 * 2026-08-04 요구는 원래 "마지막 세트를 **할 때** 응원"이었는데, 구현이 응원을
 * 완료 화면에만 두는 바람에 정작 제일 힘든 순간이 비어 있었다.
 *
 * 톤 (사용자 지시 2026-08-09): **탁재훈식 유머 — 가볍게 던지되 속은 묵직하게.**
 * 능청스럽게 흘리다가 진심 한 방. 훈계하거나 몰아붙이지 않는다.
 * 문구를 고칠 때 이 톤을 지켜라 — "할 수 있어요!" 류의 평범한 응원으로
 * 되돌리면 이 파일이 존재할 이유가 없어진다.
 */
const LAST_SET_CHEERS = [
  "지금 그만둬도 아무도 모릅니다. 근데 본인이 알죠.",
  "마지막 세트가 제일 무겁습니다. 무게가 아니라 마음이.",
  "여기서 접으면 '거의 다'고, 하나 더 하면 '다'예요. 글자 하나 차이.",
  "한 세트 남기면 내일의 내가 이자까지 쳐서 갚습니다.",
  "포기하기 딱 좋은 타이밍인 거 압니다. 그래서 여기가 승부처예요.",
  "남은 게 한 세트라는 건 사실상 다 했다는 뜻입니다. 사실상.",
  "이거 하나로 오늘이 '한 날'이 되기도, '하려던 날'이 되기도 합니다.",
];

/**
 * ⚠️ `CHEERS`와 **같은 길이일 필요는 없다.** 다만 둘 다 `pickByDay`라 하루 안에서는
 * 고정이다 — 렌더 중 랜덤은 재렌더마다 문구가 바뀌고 하이드레이션이 어긋난다.
 */
export function lastSetCheer(input: { todayKey: string }): string {
  return pickByDay(LAST_SET_CHEERS, input.todayKey);
}

/**
 * 운동 완료 카드 (2026-09-28 사용자 요청 — "성취감이 느껴지게 사진 자산과
 * '오늘도 해냈다'는 느낌, 기록이 쌓여서 실력이 된다는 느낌의 마케팅 문구").
 *
 * ⚠️ 마케팅 문구("오늘도 해냈다", "오늘의 기록이 쌓여 내일의 실력이 된다")는
 *    **사용자가 만든 이미지 안에 박혀 있다.** 같은 문구를 글자로 또 얹지 마라 —
 *    두 벌이 되어 산만해진다. 이미지를 바꾸면 `alt`도 같이 고친다.
 * - `progressLine`은 이미지가 못 하는 것, **실제 운동한 날 수**를 말한다.
 *   "기록이 쌓인다"의 근거가 숫자다. 모르면(null) 지어내지 않고 숨긴다
 */
export type CompletionHero = {
  image: string;
  alt: string;
  progressLine: string | null;
};

/**
 * 완료 카드 사진 풀 — 운동할 때마다 무작위로 하나 (2026-09-29 사용자 요청).
 * 원본: `어플 UI 이미지/운동완료 사진/` (1672×941 PNG → 1200px WebP).
 *
 * ⚠️ `alt`는 **그 사진 안에 박힌 문구**다. 사진을 바꾸면 alt도 같이 고친다.
 * ⚠️ 원본 `05_04_26`은 `05_00_40`과 사실상 같은 사진(평균 차 2.4/255)이라 뺐다.
 */
export const COMPLETION_HERO_IMAGES: readonly { src: string; alt: string }[] = [
  {
    src: "/record-assets/workout-complete-hero.webp",
    alt: "오늘도 해냈다 — 오늘의 기록이 쌓여 내일의 실력이 된다",
  },
  {
    src: "/record-assets/workout-complete-01.webp",
    alt: "오늘도 해냈다 — 기록은 쌓이고, 실력은 남는다",
  },
  {
    src: "/record-assets/workout-complete-02.webp",
    alt: "오늘도 해냈다 — 무게를 견딘 시간이 결국 몸을 만든다",
  },
  {
    src: "/record-assets/workout-complete-03.webp",
    alt: "오늘도 해냈다 — 버틴 시간이 결국 체력을 만든다",
  },
  {
    src: "/record-assets/workout-complete-04.webp",
    alt: "오늘도 해냈다 — 기록은 쌓이고, 실력은 남는다. 오늘 운동 완료",
  },
  {
    src: "/record-assets/workout-complete-05.webp",
    alt: "오늘도 해냈다 — 기록은 쌓이고, 실력은 남는다. 오늘 운동 완료",
  },
  {
    src: "/record-assets/workout-complete-06.webp",
    alt: "오늘도 해냈다 — 기록은 쌓이고, 실력은 남는다. 오늘 운동 완료",
  },
  {
    src: "/record-assets/workout-complete-07.webp",
    alt: "기록이 실력이 된다 — 오늘의 완료가 내일의 기준이 된다. 기록 저장 완료",
  },
  {
    src: "/record-assets/workout-complete-08.webp",
    alt: "오늘도 해냈다 — 오늘의 한 번이 내일의 변화를 만든다",
  },
];

/**
 * 사진 번호를 뽑는다. `random`은 [0, 1) 난수 — 밖에서 받아야 테스트할 수 있다.
 *
 * **직전에 본 사진은 빼고** 뽑는다. 무작위여도 같은 사진이 연달아 나오면
 * "랜덤이 안 되나?"로 보인다. `previous`가 목록 밖 값이면 없는 것으로 친다.
 *
 * ⚠️ 렌더 중에 부르지 않는다(위 `pickByDay` 이유와 같다). 완료하는 순간
 *    **한 번** 뽑아 결과에 저장한다.
 */
export function pickCompletionHeroIndex(
  random: number,
  previous: number | null,
): number {
  const n = COMPLETION_HERO_IMAGES.length;
  const r = Math.min(Math.max(Number.isFinite(random) ? random : 0, 0), 0.999999);
  const hasPrevious =
    previous !== null && Number.isInteger(previous) && previous >= 0 && previous < n;
  if (!hasPrevious || n < 2) return Math.floor(r * n);
  // 직전을 뺀 n-1장 중에서 고르고, 직전 번호 이상이면 한 칸 민다
  const picked = Math.floor(r * (n - 1));
  return picked >= previous ? picked + 1 : picked;
}

export function completionHero(input: {
  /** 오늘을 포함한 누적 운동일 수. 아직 모르면 null */
  workoutDays: number | null;
  /** `pickCompletionHeroIndex`로 뽑은 번호 */
  imageIndex: number;
}): CompletionHero {
  const n = COMPLETION_HERO_IMAGES.length;
  const image = COMPLETION_HERO_IMAGES[((input.imageIndex % n) + n) % n];
  const days = input.workoutDays;
  let progressLine: string | null = null;
  if (days !== null && days >= 1) {
    progressLine =
      days === 1
        ? "오늘이 첫 기록이에요. 여기서부터 쌓입니다"
        : `운동한 날 ${days}일째, 기록이 쌓이고 있어요`;
  }
  return { image: image.src, alt: image.alt, progressLine };
}
