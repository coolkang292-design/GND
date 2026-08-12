/**
 * 운동 자세 안내 — GND가 직접 쓴 카피와, 선택적인 외부 원문 링크.
 *
 * 왜 정적 TypeScript 맵인가: 사용자 데이터가 아니라 **버전 관리할 카피**다.
 * DB에 두면 문구를 고칠 때마다 마이그레이션이 필요하고, 어느 버전이 배포됐는지
 * 코드에서 알 수 없다.
 *
 * ⚠️ 외부(네이버 지식백과) 본문·사진·영상은 **복사하지도 iframe으로 넣지도
 *    않는다.** 링크만 새 창으로 연다. 링크가 없어도 GND 안내는 그대로 동작한다.
 *
 * ⚠️ 새 링크를 추가하기 전에 사람이 네 가지를 확인한다.
 *    1. 운동명과 원문이 설명하는 동작이 같은가
 *    2. 브라우저에서 지금 열리는가
 *    3. provider와 checkedAt이 있는가
 *    4. 원문 콘텐츠를 저장소에 복사하지 않았는가
 *    문서 ID를 검색 패턴으로 **추측해 만들지 않는다.** 확인 못 한 운동은
 *    GND 안내만 두는 것이 정상이다.
 */

export type ReviewedSource = {
  provider: "네이버 지식백과";
  url: string;
  /** 사람이 원문을 연 날 (YYYY-MM-DD) */
  checkedAt: string;
};

export type ExerciseGuide = {
  exerciseName: string;
  /** 시작 자세 — 화면에서 한 줄씩 보인다 */
  setup: readonly string[];
  /** 동작 순서 */
  movement: readonly string[];
  breathing: string;
  mistakes: readonly string[];
  caution: string;
  source?: ReviewedSource;
};

/** 시트 하단에 늘 한 번 더 붙는 공통 안내 */
export const GUIDE_SAFETY_NOTE =
  "통증·저림·어지럼이 생기면 중단하고 전문가에게 확인하세요.";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 외부 원문 링크가 계약을 지키는가.
 *
 * 검증기를 따로 둔 이유: 등록된 링크만 훑는 테스트는 **등록이 0건이면 아무것도
 * 검사하지 않고 통과한다.** 이 함수는 나쁜 입력을 직접 넣어 시험할 수 있다.
 *
 * `today`는 호출자가 넘긴다 — 테스트가 시계에 의존하지 않게.
 */
export function isReviewedSource(
  source: ReviewedSource,
  today: string,
): boolean {
  if (source.provider !== "네이버 지식백과") return false;
  if (!DATE_KEY.test(source.checkedAt)) return false;
  // 아직 오지 않은 날에 "검수했다"고 적힌 것은 검수가 아니다
  if (source.checkedAt > today) return false;
  let parsed: URL;
  try {
    parsed = new URL(source.url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  // ⚠️ endsWith로 보면 terms.naver.com.evil.test가 통과한다. 정확히 같아야 한다.
  return parsed.hostname === "terms.naver.com";
}

/** 이름 비교 규칙은 tabata.ts·workout-import.ts와 같다 — 갈라지면 안내가 사라진다 */
function normalizedName(name: string): string {
  return name.trim().toLocaleLowerCase("ko-KR");
}

const GUIDES: readonly ExerciseGuide[] = [
  {
    exerciseName: "바벨 백스쿼트",
    setup: ["발을 어깨너비로 두고 복부에 힘을 준다"],
    movement: ["무릎과 발끝 방향을 맞추며 앉았다 발바닥 전체로 민다"],
    breathing: "내려가며 들이마시고 올라오며 내쉰다",
    mistakes: ["무릎이 안으로 모이거나 허리가 둥글게 말림"],
    caution: "허리·무릎에 날카로운 통증이 생기면 중단한다",
  },
  {
    exerciseName: "벤치프레스",
    setup: ["발을 바닥에 고정하고 견갑을 벤치에 안정시킨다"],
    movement: ["바를 가슴 중간으로 내린 뒤 손목과 팔꿈치를 정렬해 민다"],
    breathing: "내리며 들이마시고 밀며 내쉰다",
    mistakes: ["손목이 꺾이거나 팔꿈치를 과하게 벌림"],
    caution: "안전바 또는 보조자 없이 한계 반복을 시도하지 않는다",
  },
  {
    exerciseName: "시티드 로우",
    setup: ["가슴을 세우고 어깨를 귀에서 멀리 둔다"],
    movement: ["팔꿈치를 뒤로 보내 손잡이를 몸통 쪽으로 당긴다"],
    breathing: "당기며 내쉬고 돌아가며 들이마신다",
    mistakes: ["허리를 크게 젖히거나 어깨를 으쓱함"],
    caution: "허리 반동 대신 조절 가능한 무게를 쓴다",
  },
  {
    exerciseName: "숄더프레스",
    setup: ["엉덩이와 등을 지지대에 붙이고 손목을 세운다"],
    movement: ["손잡이를 머리 위로 밀되 어깨가 들리지 않게 한다"],
    breathing: "밀며 내쉬고 내리며 들이마신다",
    mistakes: ["허리를 과하게 꺾거나 팔꿈치를 너무 뒤로 보냄"],
    caution: "어깨 앞쪽이 찝히면 가동범위와 무게를 줄이거나 중단한다",
  },
  {
    exerciseName: "사이드 레터럴 레이즈",
    setup: ["가벼운 무게를 들고 팔꿈치를 살짝 굽힌다"],
    movement: ["팔꿈치가 손보다 약간 높게 옆으로 들어 올린다"],
    breathing: "올리며 내쉬고 내리며 들이마신다",
    mistakes: ["반동으로 던지거나 어깨를 으쓱함"],
    caution: "통증 없는 범위까지만 올린다",
  },
  {
    exerciseName: "루마니안 데드리프트",
    setup: ["발을 골반너비로 두고 바를 몸 가까이 잡는다"],
    movement: ["엉덩이를 뒤로 보내며 바를 다리 가까이 내렸다 엉덩이를 편다"],
    breathing: "내려가기 전 들이마셔 버티고 올라오며 내쉰다",
    mistakes: ["무릎을 과하게 굽히거나 등이 둥글게 말림"],
    caution: "허리가 아니라 엉덩이와 허벅지 뒤쪽 긴장을 느낄 범위만 쓴다",
  },
  {
    exerciseName: "랫풀다운",
    setup: ["허벅지를 고정하고 가슴을 가볍게 세운다"],
    movement: ["팔꿈치를 아래로 내려 바를 윗가슴 쪽으로 당긴다"],
    breathing: "당기며 내쉬고 올리며 들이마신다",
    mistakes: ["몸을 뒤로 크게 젖히거나 목 뒤로 당김"],
    caution: "어깨 통증이 있으면 손잡이와 가동범위를 조정한다",
  },
  {
    exerciseName: "인클라인 벤치프레스",
    setup: ["발과 견갑을 고정하고 벤치 각도를 확인한다"],
    movement: ["바를 윗가슴 방향으로 내린 뒤 수직에 가깝게 민다"],
    breathing: "내리며 들이마시고 밀며 내쉰다",
    mistakes: ["벤치 각도를 지나치게 높이거나 손목을 꺾음"],
    caution: "안전바 또는 보조자를 사용하고 한계 반복을 피한다",
  },
  {
    exerciseName: "페이스풀",
    setup: ["케이블을 얼굴 높이에 두고 몸통을 세운다"],
    movement: ["손잡이를 얼굴 쪽으로 당기며 손을 양옆으로 벌린다"],
    breathing: "당기며 내쉬고 돌아가며 들이마신다",
    mistakes: ["허리를 젖히거나 팔꿈치를 아래로 떨어뜨림"],
    caution: "어깨가 불편하면 무게와 당기는 높이를 낮춘다",
  },
  {
    exerciseName: "덤벨 컬",
    setup: ["팔꿈치를 몸통 옆에 두고 손목을 곧게 편다"],
    movement: ["팔꿈치 위치를 유지하며 덤벨을 올리고 천천히 내린다"],
    breathing: "올리며 내쉬고 내리며 들이마신다",
    mistakes: ["몸을 흔들거나 손목을 꺾음"],
    caution: "팔꿈치나 손목 통증이 생기면 중단한다",
  },
  {
    exerciseName: "레그프레스",
    setup: ["허리와 엉덩이를 등받이에 붙이고 발을 발판에 둔다"],
    movement: ["무릎과 발끝 방향을 맞춰 내렸다 발판 전체를 민다"],
    breathing: "내리며 들이마시고 밀며 내쉰다",
    mistakes: ["엉덩이가 들리거나 무릎이 안으로 모임"],
    caution: "무릎을 잠그지 말고 허리가 말리기 전까지만 내린다",
  },
  {
    exerciseName: "덤벨 벤치프레스",
    setup: ["발과 견갑을 고정하고 덤벨을 가슴 옆에 둔다"],
    movement: ["양쪽 덤벨을 같은 속도로 밀고 조절해 내린다"],
    breathing: "내리며 들이마시고 밀며 내쉰다",
    mistakes: ["덤벨이 흔들리거나 팔꿈치를 과하게 벌림"],
    caution: "들고 눕고 일어나는 과정에서 무리한 무게를 피한다",
  },
  {
    exerciseName: "바벨 로우",
    setup: ["무릎을 살짝 굽히고 엉덩이를 뒤로 보내 몸통을 고정한다"],
    movement: ["바를 몸 가까이 당긴 뒤 등이 무너지지 않게 내린다"],
    breathing: "당기며 내쉬고 내리며 들이마신다",
    mistakes: ["상체를 들썩이거나 허리가 둥글게 말림"],
    caution: "몸통 고정이 어렵다면 무게를 낮추거나 지지형 로우로 바꾼다",
  },
  {
    exerciseName: "덤벨 레터럴 레이즈",
    setup: ["덤벨을 몸 옆에 두고 팔꿈치를 살짝 굽힌다"],
    movement: ["반동 없이 양옆으로 들고 천천히 내린다"],
    breathing: "올리며 내쉬고 내리며 들이마신다",
    mistakes: ["손이 팔꿈치보다 높거나 몸을 흔듦"],
    caution: "어깨 통증 없는 높이까지만 움직인다",
  },
  {
    exerciseName: "케이블 푸시다운",
    setup: ["팔꿈치를 몸통 옆에 고정하고 손목을 세운다"],
    movement: ["팔꿈치를 펴 손잡이를 아래로 누른 뒤 조절해 돌아온다"],
    breathing: "누르며 내쉬고 돌아가며 들이마신다",
    mistakes: ["어깨와 몸통을 흔들거나 팔꿈치가 앞으로 움직임"],
    caution: "팔꿈치 통증이 생기면 손잡이와 무게를 조정한다",
  },
];

/** 정규화한 이름 → 안내. 화면은 `guideForExercise()`만 쓴다. */
export const EXERCISE_GUIDES: Readonly<Record<string, ExerciseGuide>> =
  Object.fromEntries(
    GUIDES.map((guide) => [normalizedName(guide.exerciseName), guide] as const),
  );

/**
 * 이 운동의 안내. **없으면 null** — 커스텀 운동이나 아직 카피를 쓰지 않은
 * 종목에 빈 시트를 열지 않는다. 부르는 쪽은 null이면 버튼 자체를 숨긴다.
 */
export function guideForExercise(name: string): ExerciseGuide | null {
  return EXERCISE_GUIDES[normalizedName(name)] ?? null;
}
