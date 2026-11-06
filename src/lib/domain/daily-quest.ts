/**
 * 오늘의 퀘스트 — 계획 없는 날, 과거 운동으로 오늘 목록을 세팅하고 "퀘스트가
 * 도착했어요"로 알린다 (사용자 지시 2026-11-06).
 *
 * 기존 "계획 없는 날 제안"(`workout-suggestion.ts`)을 **그대로 쓴다.** 무엇을 제안할지
 * (`pickSuggestionKind`)는 건드리지 않고, 여기서는 (1) 보여 줄 **문구**와 (2) 오늘
 * 목록을 **자동으로 세팅해도 되는가**만 정한다. I/O 없음 — 서버·화면 어디서든 쓴다.
 *
 * ⚠️⚠️ **혜택 문구는 사실만 말한다.** 화면이 거짓말하는 순간 다음 퀘스트도 안
 *    믿는다(`streak-messages.ts`와 같은 규칙).
 *    - XP는 `MAX_DAILY_WORKOUT_XP_NOW`(실제로 받을 수 있는 하루 최대)를 쓴다.
 *      받을 수 없는 XP를 약속하지 않는다.
 *    - 연속 일수는 **끊긴 사람(0)에게 숫자를 말하지 않는다**("0일째" 금지).
 *    - 조회 전(`null`)이면 연속 줄을 아예 빼고, 0으로 채워 거짓을 말하지 않는다.
 *
 * ⚠️ 자동으로 담는 것은 **오늘 운동 목록(draft)뿐**이다. 달력 계획(`workout_plans`)은
 *    만들지 않는다 — 앱을 열 때마다 달력에 "예정"이 생기고 놓친 계획이 완료율을
 *    깎는다(`decidePlanPush`가 제안 draft를 쓰지 않는 이유와 같다).
 */
import { MAX_DAILY_WORKOUT_XP_NOW } from "./xp";
import { pickByDay } from "./streak-messages";
import type { SuggestionKind } from "./workout-suggestion";

/**
 * 챌린지 목표가 겨냥하는 운동 분류 (2026-11-06). 진행 중인 챌린지가 있으면 퀘스트가 그
 * 목표에 쌓이는 운동을 제안한다 — 고르는 쪽은 `lib/challenge-quest.ts`.
 */
export type QuestFocusKind = "weight" | "cardio" | "bodyweight" | "interval";

export type QuestFocus = {
  kind: QuestFocusKind;
  /** 화면에 말할 목표 이름 — 예: "유산소 거리 20km" */
  goalLabel: string;
};

const FOCUS_TAIL: Record<QuestFocusKind, string> = {
  weight: "오늘 근력 완료",
  cardio: "오늘 유산소 완료",
  bodyweight: "오늘 맨몸 완료",
  interval: "오늘 인터벌 완료",
};

export const QUEST_EYEBROW = "🎯 오늘의 퀘스트가 도착했어요";

export type QuestCopy = {
  eyebrow: string;
  /** 한 줄 후킹 제목 (알림·배너용) */
  title: string;
  /**
   * 큰 퀘스트 카드의 두 줄 제목 — 첫 줄은 흰색, 둘째 줄은 라임색으로 그린다
   * (시안 2026-11-06: "이 퀘스트 하나면 / 오늘 운동 완료").
   */
  headline: [string, string];
  /** 무엇을 하는 퀘스트인가 (종목이 정해졌으면 이름까지) */
  lead: string;
  /** 완료하면 얻는 것 — 전부 사실이어야 한다 */
  hooks: string[];
};

/**
 * 퀘스트 제목 (2026-11-07 사용자 지시 — "운동을 자극하는 문구로").
 * ⚠️ 카드는 쉼표(", ")에서 두 줄로 나눠 **뒤쪽을 라임색**으로 그린다(`splitQuestTitle`) — 문구마다
 *    쉼표가 하나 있어야 제목이 두 줄로 읽힌다. 기록·숫자를 약속하는 말은 쓰지 않는다(거짓 금지).
 */
const REPEAT_TITLES: string[] = [
  "오늘도 해낸다, 어제보다 강하게!",
  "한 번 더 가자, 한계를 넘어!",
  "지난번보다 더, 오늘의 나를 증명해!",
];
const WALK_TITLES: string[] = [
  "딱 10분이면 끝, 몸을 깨워라!",
  "발걸음 하나로, 오늘을 이겨라!",
];
const INTERVAL_TITLES: string[] = [
  "딱 4분, 심장을 깨워라!",
  "4분 불태우고, 오늘을 끝내자!",
];

/**
 * 제목을 카드의 두 줄로 나눈다 — 앞줄은 흰색, 뒷줄은 라임색.
 * 쉼표(", ")가 있으면 거기서, 없으면 단어 수의 절반쯤에서 자른다. 한 단어면 뒷줄이 비다.
 */
export function splitQuestTitle(title: string): [string, string] {
  const comma = title.indexOf(", ");
  if (comma > 0) return [title.slice(0, comma + 1), title.slice(comma + 2)];
  const words = title.split(" ");
  if (words.length < 2) return [title, ""];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

/** 푸시 제목 — 알림이 오면 이 말이 먼저 보인다 */
export const QUEST_PUSH_TITLE = "🎯 오늘의 퀘스트가 도착했어요";

/**
 * 푸시 문구 (2026-11-06). 알림 → `/record?suggest=1`(기록 탭)로 열리고, 기록 탭이
 * 열자마자 운동 목록을 세팅해 둔다(`shouldAutoSetQuest`). 그래서 본문은 "열면 바로
 * 시작할 수 있다"를 말한다 — **인터벌만** 시트를 거쳐야 해서 그 말을 빼고 4분만 말한다.
 *
 * ⚠️ 혜택은 화면 카드와 **같은 상수**(`MAX_DAILY_WORKOUT_XP_NOW`)를 쓴다.
 */
export function questPushCopy(
  kind: SuggestionKind,
  todayKey: string,
): { title: string; body: string } {
  const hook = pickByDay(
    kind === "repeat" ? REPEAT_TITLES : kind === "walk" ? WALK_TITLES : INTERVAL_TITLES,
    todayKey,
  );
  const xp = `클리어하면 최대 +${MAX_DAILY_WORKOUT_XP_NOW} XP`;
  return {
    title: QUEST_PUSH_TITLE,
    body:
      kind === "interval"
        ? `${hook} · ${xp}`
        : `${hook} · 열면 운동이 세팅돼 있어요 · ${xp}`,
  };
}

/** 종목 이름 요약 — 3개까지, 넘으면 "외 N" */
export function questNamesLine(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  return clean.length <= 3
    ? clean.join(" · ")
    : `${clean.slice(0, 3).join(" · ")} 외 ${clean.length - 3}`;
}

function leadFor(
  kind: SuggestionKind,
  names: string[],
  applied: boolean,
  planned: boolean,
  focus: QuestFocus | null,
): string {
  const line = questNamesLine(names);
  // 내가 계획한 운동이면 "세팅해 뒀어요"가 아니라 내 계획이라고 말한다 (거짓 금지)
  if (planned) {
    return line ? `오늘 계획한 운동이에요 · ${line}` : "오늘 계획한 운동이에요";
  }
  // 챌린지 목표에 맞춘 퀘스트 — 어떤 목표를 겨냥했는지 말한다
  if (focus) {
    if (focus.kind === "interval") {
      return `챌린지 목표(${focus.goalLabel})에 맞춰 4분 인터벌을 추천했어요`;
    }
    if (applied) {
      return line
        ? `챌린지 목표(${focus.goalLabel})에 맞춰 세팅해 뒀어요 · ${line}`
        : `챌린지 목표(${focus.goalLabel})에 맞춰 세팅해 뒀어요`;
    }
    return `챌린지 목표(${focus.goalLabel})에 맞춰 추천했어요`;
  }
  if (kind === "walk") return "10분만 걸어도 퀘스트 완료예요";
  if (kind === "interval") return "시간 없는 날엔 4분이면 충분해요";
  if (applied) {
    return line
      ? `지난 운동으로 오늘 목록을 세팅해 뒀어요 · ${line}`
      : "지난 운동으로 오늘 목록을 세팅해 뒀어요";
  }
  return "지난 운동을 바탕으로 추천했어요";
}

const HEADLINE_TAIL: Record<SuggestionKind, string> = {
  repeat: "오늘 운동 완료",
  walk: "오늘 걷기 완료",
  interval: "오늘 인터벌 완료",
};



/**
 * @param streak 현재 연속 일수. 아직 모르면 `null`(그 줄을 뺀다), 끊겼으면 0
 * @param names  세팅된 종목 이름 (아직 안 담았으면 빈 배열)
 * @param applied 이미 오늘 목록에 담았는가
 */
export function dailyQuestCopy(input: {
  kind: SuggestionKind;
  todayKey: string;
  streak: number | null;
  names?: string[];
  applied?: boolean;
  /** 사용자가 직접 정한 오늘 계획이다 (기계가 담은 제안이 아니다) */
  planned?: boolean;
  /** 진행 중인 챌린지의 목표에 맞춘 퀘스트 — 있으면 그 목표를 겨냥해 말한다 */
  focus?: QuestFocus | null;
}): QuestCopy {
  const { kind, todayKey, streak } = input;
  const focus = input.focus ?? null;
  const titles =
    kind === "repeat" ? REPEAT_TITLES : kind === "walk" ? WALK_TITLES : INTERVAL_TITLES;

  // 칩 두 개 — 짧게 (시안 2026-11-06 "추천 배치": "+160 XP · 25일 연속").
  // ⚠️ XP는 "최대"다. 받을 수 있는 하루 최대치만 말한다(받을 수 없는 XP 약속 금지).
  const hooks: string[] = [`⚡ 최대 +${MAX_DAILY_WORKOUT_XP_NOW} XP`];
  if (streak !== null) {
    hooks.push(streak > 0 ? `🔥 ${streak + 1}일 연속` : "🔥 다시 1일");
  }

  return {
    eyebrow: QUEST_EYEBROW,
    title: pickByDay(titles, todayKey),
    headline: ["이 퀘스트 하나면", focus ? FOCUS_TAIL[focus.kind] : HEADLINE_TAIL[kind]],
    lead: leadFor(
      kind,
      input.names ?? [],
      input.applied ?? false,
      input.planned ?? false,
      focus,
    ),
    hooks,
  };
}

/**
 * 달력에 **인터벌·프로그램 회차 계획**이 있는 날의 퀘스트 카드 문구 (사용자 지시 2026-11-07).
 * 일반 계획은 운동 목록이 곧 카드지만 이 둘은 구조가 달라 목록에 못 담기 — 같은 카드 모양으로
 * 계획을 보여 준다. 사용자가 직접 정한 계획이므로 "세팅해 뒀어요"가 아니라 "계획한"이라고 말한다.
 *
 * @param detail 종목 요약 한 줄 (인터벌: 코스 요약, 프로그램: 종목 이름들)
 */
export function planQuestCopy(input: {
  interval: boolean;
  /** 프로그램 회차의 제목 (없으면 기본 문구) */
  title: string | null;
  detail: string;
  streak: number | null;
}): QuestCopy {
  const hooks: string[] = [`⚡ 최대 +${MAX_DAILY_WORKOUT_XP_NOW} XP`];
  if (input.streak !== null) {
    hooks.push(input.streak > 0 ? `🔥 ${input.streak + 1}일 연속` : "🔥 다시 1일");
  }
  const kindLabel = input.interval ? "인터벌" : "프로그램";
  return {
    eyebrow: QUEST_EYEBROW,
    title: input.interval ? "오늘은 전신 인터벌이에요" : (input.title ?? "오늘 프로그램 회차"),
    headline: ["이 퀘스트 하나면", `오늘 ${kindLabel} 완료`],
    lead: input.detail
      ? `오늘 계획한 ${kindLabel}예요 · ${input.detail}`
      : `오늘 계획한 ${kindLabel}예요`,
    hooks,
  };
}

/**
 * 오늘 목록을 **자동으로 세팅해도 되는가** — `repeat`(지난 운동)와 `walk`(걷기).
 * 열자마자 목록이 차 있어야 "운동 시작" 한 번으로 시작한다(사용자 지시 2026-11-06).
 *
 * - 인터벌은 자동으로 담지 않는다: 시트를 열어야 하고(목록에 담으면 음원도
 *   코스도 없는 맨몸 4개가 된다) 그 시작이 퀘스트 버튼 한 번이다.
 * - 사용자가 이미 만든 상태(목록 있음 · 운동 시작)는 덮지 않는다.
 * - **하루에 한 번만.** 사용자가 목록을 비웠을 때 다시 채우면 지울 수가 없다.
 */
export function shouldAutoSetQuest(input: {
  kind: SuggestionKind | null;
  draftExerciseCount: number;
  workoutStarted: boolean;
  /** 오늘 이 기기에서 이미 자동 세팅을 했는가 */
  alreadyDoneToday: boolean;
}): boolean {
  if (input.kind !== "repeat" && input.kind !== "walk") return false;
  if (input.draftExerciseCount > 0) return false;
  if (input.workoutStarted) return false;
  if (input.alreadyDoneToday) return false;
  return true;
}
