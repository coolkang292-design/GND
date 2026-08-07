import { countsTowardChallenge, type GoalCategory } from "@/lib/challenge";
import type { BodyPart, CatalogExercise } from "@/lib/types";

/**
 * 초보자용 한 줄 설명 — **이름당 한 곳에만 적는다** (2026-08-06).
 *
 * 부위별 목록과 상황별 목록이 같은 종목을 공유한다(체스트프레스 머신은
 * '가슴'에도 '처음 운동해요'에도 있다). 설명을 목록마다 적으면 두 벌이
 * 되고, 문구를 다듬을 때 한쪽만 고쳐져 갈라진다.
 *
 * **DB 컬럼이 아닌 이유**: 사용자 데이터가 아니라 편집 카피다. 사용자마다
 * 다르지 않고, 서버에서 필터·정렬에 쓰지 않고, 바뀌는 계기가 "문구를
 * 다듬었다"이지 "스키마가 변했다"가 아니다.
 *
 * ⚠️ 키는 `exercise_catalog`의 시드 이름과 **글자까지 같아야 한다.** 다르면
 * `resolveNames`가 그 항목을 조용히 뺀다. 착수 실측(2026-08-06)에서 제안된
 * 이름들이 실제로 어긋나 있었다 — `숄더프레스 머신`→`숄더프레스` ·
 * `케이블 로우`→`시티드 로우` · `인클라인 체스트프레스`→`인클라인 벤치프레스` ·
 * `팩덱 플라이`→`덤벨 플라이` · `런닝머신`→`트레드밀` ·
 * `레터럴 레이즈`→`사이드 레터럴 레이즈`.
 */
export const EXERCISE_NOTES: Record<string, string> = {
  // 가슴
  "체스트프레스 머신": "기구가 움직임을 잡아줘서 처음 시작하기 쉬워요",
  "인클라인 벤치프레스": "윗가슴을 자극하기 좋고 자세도 비교적 쉬워요",
  "덤벨 플라이": "가슴 모으는 감각을 익히기 좋은 보조 운동이에요",
  "덤벨 벤치프레스": "가슴 전체를 고르게 쓰는 기본 웨이트 동작이에요",
  푸시업: "기구 없이 어디서든 할 수 있는 맨몸 기본기예요",
  "니 푸시업": "무릎을 대고 해서 푸시업이 아직 어려울 때 좋아요",
  // 등
  랫풀다운: "등을 쓰는 감각을 익히기 좋은 기본 운동이에요",
  "시티드 로우": "앉아서 당겨 허리 부담이 적은 등 운동이에요",
  "덤벨 로우": "한쪽씩 당겨 좌우 균형을 잡기 좋아요",
  "인버티드 로우": "철봉에 매달려 당기는 맨몸 등 운동이에요",
  // 하체
  레그프레스: "하체를 안전하게 밀어내며 힘을 기르기 좋아요",
  "레그 익스텐션": "앉아서 허벅지 앞쪽만 집중해서 쓸 수 있어요",
  "레그 컬": "허벅지 뒤쪽을 따로 쓰는 기구 운동이에요",
  "맨몸 스쿼트": "기구 없이 하체 전체를 쓰는 가장 기본 동작이에요",
  런지: "한 다리씩 앞으로 내디디며 균형까지 잡는 운동이에요",
  "힙 브릿지": "누워서 엉덩이만 들어 올려 허리 부담이 적어요",
  // 어깨
  숄더프레스: "어깨를 안정적으로 밀어 올리는 초보자용 운동이에요",
  "사이드 레터럴 레이즈": "가벼운 무게로 어깨 옆선을 만드는 운동이에요",
  "덤벨 숄더 프레스": "덤벨로 어깨 전체를 쓰는 기본 동작이에요",
  // 팔
  "덤벨 컬": "팔 앞쪽을 쓰는 가장 익숙한 기본 동작이에요",
  "케이블 푸시다운": "케이블로 팔 뒤쪽만 안정적으로 쓸 수 있어요",
  "덤벨 해머 컬": "손목을 세워 잡아 팔뚝까지 함께 쓰는 동작이에요",
  "벤치 딥스": "의자만 있으면 되는 맨몸 팔 뒤쪽 운동이에요",
  // 코어
  플랭크: "버티기만 하면 되는 가장 쉬운 코어 운동이에요",
  크런치: "누워서 상복부를 짧게 말아 올리는 기본기예요",
  데드버그: "허리를 바닥에 붙인 채 해서 부담이 적어요",
  "레그 레이즈": "다리를 들어 하복부를 쓰는 맨몸 운동이에요",
  // 유산소
  걷기: "가장 부담 없이 시작할 수 있는 유산소예요",
  트레드밀: "속도를 스스로 정할 수 있어 시작하기 편해요",
  사이클: "앉아서 해 무릎 부담이 적은 유산소예요",
  로잉: "상·하체를 함께 쓰는 전신 유산소예요",
};

// ── 부위별 추천 ────────────────────────────────────────────────

/**
 * 부위 그리드에 나오는 부위 (사용자 디자인 2026-08-06).
 *
 * ⚠️ 카탈로그의 `body_part` 7종 중 **유산소는 뺐다.** 유산소는 '부위'가
 * 아니라 운동 방식이고, 상황별의 '유산소만 할래요'가 덮는다. '전신'도
 * 뺐다 — 상황별의 '처음 운동해요'가 같은 자리를 대신한다. 여섯 개라
 * 2열 그리드에 딱 떨어진다.
 */
export const RECOMMEND_PARTS = [
  "가슴",
  "등",
  "하체",
  "어깨",
  "팔",
  "코어",
] as const satisfies readonly BodyPart[];

export type RecommendPart = (typeof RECOMMEND_PARTS)[number];

export const PART_META: Record<RecommendPart, { icon: string; sub: string }> = {
  가슴: { icon: "🫁", sub: "가슴을 탄탄하게" },
  등: { icon: "🔙", sub: "등을 넓고 강하게" },
  하체: { icon: "🦵", sub: "하체를 튼튼하게" },
  어깨: { icon: "🙆", sub: "어깨를 안정적으로" },
  팔: { icon: "💪", sub: "팔 힘을 기르기" },
  코어: { icon: "🎯", sub: "중심을 단단하게" },
};

/** 순서가 곧 추천 순위다 — 위에 있을수록 먼저 권한다 */
export const RECOMMENDED_BY_PART: Record<RecommendPart, readonly string[]> = {
  가슴: ["체스트프레스 머신", "인클라인 벤치프레스", "덤벨 플라이", "푸시업"],
  등: ["랫풀다운", "시티드 로우", "덤벨 로우", "인버티드 로우"],
  하체: ["레그프레스", "레그 익스텐션", "레그 컬", "맨몸 스쿼트"],
  어깨: ["숄더프레스", "사이드 레터럴 레이즈", "덤벨 숄더 프레스"],
  팔: ["덤벨 컬", "케이블 푸시다운", "덤벨 해머 컬", "벤치 딥스"],
  코어: ["플랭크", "크런치", "데드버그", "레그 레이즈"],
};

// ── 상황별 추천 ────────────────────────────────────────────────

export type SituationKey =
  | "beginner"
  | "challenge"
  | "no-machines"
  | "home"
  | "short"
  | "cardio";

export type SituationIconKey =
  | "beginner"
  | "target"
  | "help"
  | "home"
  | "clock"
  | "heart";

export type Situation = {
  key: SituationKey;
  label: string;
  sub: string;
  icon: SituationIconKey;
  /**
   * 이 상황의 종목. `challenge`만 비어 있다 — 그건 고정 목록이 아니라
   * **내 챌린지 목표에서 계산한다**(`resolveSituation`).
   */
  names: readonly string[];
};

/**
 * 오늘의 상황 (사용자 디자인 2026-08-06).
 *
 * '기구를 잘 몰라요'와 '집에서 할래요'는 일부러 다르다 — 앞은 **머신만
 * 피하는 것**(덤벨은 쓴다)이고 뒤는 **아무 기구도 없는 것**이다. 둘을 같은
 * 맨몸 목록으로 두면 카드가 둘 있을 이유가 없어진다.
 */
export const SITUATIONS: readonly Situation[] = [
  {
    key: "beginner",
    label: "처음 운동해요",
    sub: "기본부터 천천히",
    icon: "beginner",
    names: ["체스트프레스 머신", "랫풀다운", "레그프레스", "숄더프레스"],
  },
  {
    key: "challenge",
    label: "챌린지 목표에 맞게",
    sub: "목표 달성 우선으로",
    icon: "target",
    names: [],
  },
  {
    key: "no-machines",
    label: "기구를 잘 몰라요",
    sub: "기구 사용이 낯설어요",
    icon: "help",
    names: ["맨몸 스쿼트", "푸시업", "덤벨 컬", "플랭크"],
  },
  {
    key: "home",
    label: "집에서 할래요",
    sub: "집에서 간편하게",
    icon: "home",
    names: ["푸시업", "맨몸 스쿼트", "플랭크", "런지", "힙 브릿지"],
  },
  {
    key: "short",
    label: "30분만 운동할래요",
    sub: "짧고 효과적으로",
    icon: "clock",
    names: ["레그프레스", "랫풀다운", "체스트프레스 머신"],
  },
  {
    key: "cardio",
    label: "유산소만 할래요",
    sub: "걷기·러닝 위주로",
    icon: "heart",
    names: ["걷기", "트레드밀", "사이클", "로잉"],
  },
];

/**
 * '챌린지 목표에 맞게'의 후보 풀.
 *
 * 여기서 **내 목표 분류에 잡히는 것만** 남긴다. 신고 0783ca35처럼 "열심히
 * 했는데 챌린지 %가 안 올랐다"를 고르는 자리에서 막는 게 목적이다.
 */
const CHALLENGE_POOL: readonly string[] = [
  "체스트프레스 머신",
  "랫풀다운",
  "레그프레스",
  "숄더프레스",
  "맨몸 스쿼트",
  "푸시업",
  "플랭크",
  "인버티드 로우",
  "걷기",
  "트레드밀",
  "사이클",
];

// ── 해석 ───────────────────────────────────────────────────────

export type ResolvedRecommendation = {
  /** 카탈로그 실물 — 부위·유형·measure는 **여기서** 읽는다 (상수에 안 적는다) */
  item: CatalogExercise;
  note: string;
  /** `public/exercise-thumbs/{thumb}.png` (선택). 없으면 텍스트 카드다 */
  thumb?: string;
};

/**
 * `public/exercise-thumbs/{slug}.png` (2026-08-06).
 *
 * **선택 사항이다.** 없는 이름은 카드가 텍스트만으로 성립한다 — 이미지
 * 제작이 코드 일정을 막지 않게 하려는 것이다. 파일을 넣고 여기 한 줄씩
 * 채우면 그때부터 그려진다. 자산 규약은 `.webp`, 최대 384x384,
 * 개당 70KB 이하다.
 */
export const EXERCISE_THUMBS: Record<string, string> = {
  "체스트프레스 머신": "chest-press-machine.webp",
  랫풀다운: "lat-pulldown.webp",
  레그프레스: "leg-press.webp",
  숄더프레스: "shoulder-press.webp",
};

/**
 * 이름 목록을 카탈로그와 **교집합**으로 해석한다.
 *
 * 카탈로그에 없는 이름은 **뺀다.** 시드 이름이 바뀌거나 오타가 나도 화면이
 * 깨지지 않고 한 줄이 덜 나온다 — 목록 하나 때문에 운동 추가가 통째로
 * 막히는 것보다 낫다.
 *
 * 부위·유형·`measure`는 상수가 아니라 **카탈로그 행에서** 읽는다. 상수에
 * 부위를 같이 적어 두면 시드가 바뀔 때 두 곳이 갈라져 화면의 부위 태그가
 * 거짓말을 한다.
 */
export function resolveNames(
  names: readonly string[],
  catalog: readonly CatalogExercise[],
): ResolvedRecommendation[] {
  const byName = new Map(catalog.map((item) => [item.name, item]));
  const seen = new Set<string>();
  return names.flatMap((name) => {
    const item = byName.get(name);
    if (!item || seen.has(name)) return [];
    seen.add(name);
    return [
      {
        item,
        note: EXERCISE_NOTES[name] ?? "",
        thumb: EXERCISE_THUMBS[name],
      },
    ];
  });
}

export function resolveByPart(
  part: RecommendPart,
  catalog: readonly CatalogExercise[],
): ResolvedRecommendation[] {
  return resolveNames(RECOMMENDED_BY_PART[part], catalog);
}

/**
 * 상황 → 추천 종목.
 *
 * `challenge`만 고정 목록이 아니라 **내 챌린지 목표에서 계산한다.**
 * 목표를 모르면(`null`) 빈 배열 — 부르는 쪽이 그 카드를 아예 안 낸다.
 */
export function resolveSituation(
  key: SituationKey,
  catalog: readonly CatalogExercise[],
  challengeCategories: ReadonlySet<GoalCategory> | null = null,
): ResolvedRecommendation[] {
  if (key !== "challenge") {
    const situation = SITUATIONS.find((s) => s.key === key);
    return situation ? resolveNames(situation.names, catalog) : [];
  }
  if (challengeCategories === null) return [];
  return resolveNames(CHALLENGE_POOL, catalog).filter((r) =>
    countsTowardChallenge(r.item.exercise_type, challengeCategories),
  );
}

/**
 * 지금 화면에 낼 상황 목록.
 *
 * ⚠️ **챌린지 목표를 모르면 '챌린지 목표에 맞게'를 뺀다.** 눌러도 빈 목록이
 * 나오는 막다른 길을 주지 않는다 — 빈 상태의 '최근 운동 불러오기'와 같은 규칙이다.
 */
export function visibleSituations(
  challengeCategories: ReadonlySet<GoalCategory> | null,
): Situation[] {
  return SITUATIONS.filter(
    (s) => s.key !== "challenge" || challengeCategories !== null,
  );
}
