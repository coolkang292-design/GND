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
  // ── 인터벌 26종 (2026-08-13, 사용자 지시) ─────────────────────
  // 전부 맨몸이라 무게 대신 **자세와 속도**가 안전을 가른다. 20초 동안
  // 빨리 하려다 자세가 먼저 무너지므로, `mistakes`에 그 이야기를 넣는다.
  {
    exerciseName: "맨몸 스쿼트",
    setup: ["발을 어깨너비로 벌리고 발끝을 살짝 바깥으로 둔다"],
    movement: ["엉덩이를 뒤로 빼며 앉았다 발바닥 전체로 밀어 선다"],
    breathing: "앉으며 들이마시고 일어나며 내쉰다",
    mistakes: ["뒤꿈치가 뜨거나 무릎이 안으로 모임", "속도를 올리려 반만 앉음"],
    caution: "무릎 앞쪽에 찌르는 통증이 생기면 깊이를 줄인다",
  },
  {
    exerciseName: "와이드 스쿼트",
    setup: ["발을 어깨보다 넓게 벌리고 발끝을 30도쯤 바깥으로 둔다"],
    movement: ["무릎을 발끝 방향으로 밀며 앉았다 안쪽 허벅지로 밀어 선다"],
    breathing: "앉으며 들이마시고 일어나며 내쉰다",
    mistakes: ["무릎이 발끝보다 안으로 모임", "허리를 뒤로 젖혀 버팀"],
    caution: "사타구니가 당기면 보폭을 좁힌다",
  },
  {
    exerciseName: "점프 스쿼트",
    setup: ["발을 어깨너비로 두고 무릎을 살짝 굽힌 채 선다"],
    movement: ["반쯤 앉았다 힘껏 뛰어오르고, 무릎을 굽혀 부드럽게 착지한다"],
    breathing: "앉으며 들이마시고 뛰며 내쉰다",
    mistakes: ["무릎을 편 채 쿵 착지함", "착지하자마자 반동으로 바로 뜀"],
    caution: "무릎·발목에 통증이 있으면 점프 없는 스쿼트로 바꾼다",
  },
  {
    exerciseName: "피스톨 스쿼트",
    setup: ["한 발로 서고 반대 다리를 앞으로 뻗는다"],
    movement: ["뻗은 다리를 든 채 천천히 앉았다 딛은 발로 밀어 선다"],
    breathing: "앉으며 들이마시고 일어나며 내쉰다",
    mistakes: ["몸이 옆으로 무너짐", "끝까지 못 앉고 털썩 주저앉음"],
    caution: "난도가 높다 — 흔들리면 의자나 벽을 잡고 한다",
  },
  {
    exerciseName: "런지",
    setup: ["발을 골반너비로 두고 상체를 세운다"],
    movement: ["한 발을 앞으로 내디뎌 두 무릎을 90도로 굽혔다 밀어 돌아온다"],
    breathing: "내디디며 들이마시고 돌아오며 내쉰다",
    mistakes: ["앞 무릎이 발끝을 크게 넘어감", "상체가 앞으로 무너짐"],
    caution: "무릎이 아프면 보폭과 깊이를 줄인다",
  },
  {
    exerciseName: "리버스 런지",
    setup: ["발을 골반너비로 두고 복부에 힘을 준다"],
    movement: ["한 발을 뒤로 보내 무릎을 굽혔다 앞발로 밀어 선다"],
    breathing: "물러나며 들이마시고 돌아오며 내쉰다",
    mistakes: ["뒤로 갈 때 몸이 휘청임", "앞발 뒤꿈치가 뜸"],
    caution: "앞으로 하는 런지보다 무릎 부담이 적다 — 무릎이 약하면 이쪽을 쓴다",
  },
  {
    exerciseName: "사이드 런지",
    setup: ["발을 모으고 서서 시선을 앞에 둔다"],
    movement: ["한 발을 옆으로 크게 디뎌 그쪽 무릎만 굽혔다 밀어 돌아온다"],
    breathing: "디디며 들이마시고 돌아오며 내쉰다",
    mistakes: ["굽힌 무릎이 안으로 무너짐", "허리를 굽혀 손만 내림"],
    caution: "안쪽 허벅지가 당기면 보폭을 줄인다",
  },
  {
    exerciseName: "점핑잭",
    setup: ["발을 모으고 팔을 몸 옆에 둔다"],
    movement: ["뛰며 다리를 벌리고 팔을 머리 위로, 다시 뛰며 처음으로 돌아온다"],
    breathing: "리듬에 맞춰 짧게 들이마시고 내쉰다",
    mistakes: ["무릎을 편 채 착지함", "팔만 움직이고 발은 제자리"],
    caution: "층간 소음이나 관절이 걱정되면 발을 번갈아 내딛는 방식으로 바꾼다",
  },
  {
    exerciseName: "하이 니",
    setup: ["제자리에 서서 팔꿈치를 90도로 굽힌다"],
    movement: ["무릎을 골반 높이까지 번갈아 빠르게 올린다"],
    breathing: "짧고 규칙적으로 쉰다",
    mistakes: ["허리를 뒤로 젖혀 무릎만 올림", "발 앞꿈치로만 쿵쿵 뜀"],
    caution: "숨이 심하게 차면 속도를 낮추고 무릎 높이를 줄인다",
  },
  {
    exerciseName: "버피",
    setup: ["발을 어깨너비로 두고 선다"],
    movement: ["앉아 손을 짚고 다리를 뒤로 뻗었다 당겨 와 일어서며 뛴다"],
    breathing: "엎드릴 때 들이마시고 일어서며 내쉰다",
    mistakes: ["허리가 아래로 꺼진 채 다리를 뻗음", "지쳐서 손목에 체중을 던짐"],
    caution: "인터벌에서 가장 힘든 동작이다 — 자세가 무너지면 점프를 뺀다",
  },
  {
    exerciseName: "니 푸시업",
    setup: ["무릎을 바닥에 대고 손을 어깨너비보다 조금 넓게 짚는다"],
    movement: ["몸을 일직선으로 유지한 채 가슴을 내렸다 밀어 올린다"],
    breathing: "내리며 들이마시고 밀며 내쉰다",
    mistakes: ["엉덩이가 위로 솟음", "고개만 먼저 내려감"],
    caution: "손목이 아프면 주먹을 쥐거나 손목 각도를 바꾼다",
  },
  {
    exerciseName: "푸시업",
    setup: ["손을 어깨너비보다 조금 넓게 짚고 몸을 일직선으로 만든다"],
    movement: ["가슴이 바닥에 가까워질 때까지 내렸다 밀어 올린다"],
    breathing: "내리며 들이마시고 밀며 내쉰다",
    mistakes: ["허리가 아래로 꺼짐", "팔꿈치를 90도로 완전히 벌림"],
    caution: "허리가 꺼지기 시작하면 무릎을 대고 이어간다",
  },
  {
    exerciseName: "와이드 푸시업",
    setup: ["손을 어깨너비보다 넓게 짚는다"],
    movement: ["가슴을 넓게 열며 내렸다 밀어 올린다"],
    breathing: "내리며 들이마시고 밀며 내쉰다",
    mistakes: ["팔꿈치가 어깨와 일직선이 되도록 과하게 벌림"],
    caution: "어깨 앞쪽이 결리면 손 간격을 좁힌다",
  },
  {
    exerciseName: "파이크 푸시업",
    setup: ["엉덩이를 높이 들어 몸으로 산 모양을 만든다"],
    movement: ["정수리를 바닥으로 내렸다 어깨 힘으로 밀어 올린다"],
    breathing: "내리며 들이마시고 밀며 내쉰다",
    mistakes: ["팔꿈치가 바깥으로 벌어짐", "허리를 굽혀 머리만 내림"],
    caution: "머리로 바닥을 찍지 않는다 — 닿기 전에 멈춘다",
  },
  {
    exerciseName: "타이슨 푸시업",
    setup: ["푸시업 자세에서 한 손을 조금 앞, 다른 손을 조금 뒤에 둔다"],
    movement: ["몸을 좌우로 옮기며 한쪽씩 눌러 내렸다 밀어 올린다"],
    breathing: "내리며 들이마시고 밀며 내쉰다",
    mistakes: ["골반이 좌우로 흔들림", "한쪽 어깨에만 체중이 실림"],
    caution: "난도가 높다 — 어깨가 결리면 일반 푸시업으로 바꾼다",
  },
  {
    exerciseName: "인치웜 푸시업",
    setup: ["선 자세에서 허리를 굽혀 손을 바닥에 짚는다"],
    movement: ["손으로 걸어 나가 푸시업 하나를 하고 다시 걸어 돌아와 선다"],
    breathing: "걸어 나가며 들이마시고 밀며 내쉰다",
    mistakes: ["허리가 꺼진 채 손으로 걸어감", "무릎을 굽혀 거리를 줄임"],
    caution: "햄스트링이 당기면 무릎을 살짝 굽히고 한다",
  },
  {
    exerciseName: "라잉 Y 레이즈",
    setup: ["엎드려 팔을 머리 위로 뻗어 Y 모양을 만든다"],
    movement: ["엄지를 위로 둔 채 팔을 바닥에서 들었다 천천히 내린다"],
    breathing: "들며 내쉬고 내리며 들이마신다",
    mistakes: ["목을 젖혀 고개부터 듦", "반동으로 팔을 튕김"],
    caution: "목이 불편하면 이마를 수건에 대고 한다",
  },
  {
    exerciseName: "슈퍼맨 로우",
    setup: ["엎드려 팔을 앞으로 뻗고 시선은 바닥에 둔다"],
    movement: ["가슴을 들어 올린 채 팔꿈치를 옆구리로 당겼다 다시 뻗는다"],
    breathing: "당기며 내쉬고 뻗으며 들이마신다",
    mistakes: ["허리를 과도하게 젖힘", "다리까지 힘껏 들어 허리로 버팀"],
    caution: "허리가 뻐근하면 가슴을 조금만 든다",
  },
  {
    exerciseName: "데드버그",
    setup: ["누워 무릎과 팔을 천장으로 들고 허리를 바닥에 붙인다"],
    movement: ["반대쪽 팔과 다리를 천천히 뻗었다 돌아온다"],
    breathing: "뻗으며 내쉬고 돌아오며 들이마신다",
    mistakes: ["허리가 바닥에서 뜸", "속도를 올려 팔다리만 흔듦"],
    caution: "허리가 뜨면 뻗는 범위를 줄인다",
  },
  {
    exerciseName: "버드독",
    setup: ["네발기기 자세에서 손은 어깨 아래, 무릎은 골반 아래에 둔다"],
    movement: ["반대쪽 팔과 다리를 몸통 높이까지 뻗었다 돌아온다"],
    breathing: "뻗으며 내쉬고 돌아오며 들이마신다",
    mistakes: ["골반이 한쪽으로 기욺", "다리를 허리 위로 높이 듦"],
    caution: "허리를 젖히지 않는다 — 몸통과 일직선까지만 든다",
  },
  {
    exerciseName: "마운틴 클라이머",
    setup: ["푸시업 자세로 손을 어깨 아래에 짚는다"],
    movement: ["무릎을 가슴 쪽으로 번갈아 빠르게 당겼다 되돌린다"],
    breathing: "짧고 규칙적으로 쉰다",
    mistakes: ["엉덩이가 위로 솟음", "속도를 올리려 무릎을 반만 당김"],
    caution: "손목이 아프면 주먹을 쥐거나 속도를 낮춘다",
  },
  {
    exerciseName: "바이시클 크런치",
    setup: ["누워 손을 귀 옆에 가볍게 두고 무릎을 든다"],
    movement: ["한쪽 팔꿈치와 반대쪽 무릎을 마주 보내며 번갈아 반복한다"],
    breathing: "비틀며 내쉬고 돌아오며 들이마신다",
    mistakes: ["손으로 목을 당김", "허리가 바닥에서 들림"],
    caution: "목이 아프면 손을 가슴에 모으고 한다",
  },
  {
    exerciseName: "러시안 트위스트",
    setup: ["앉아 무릎을 굽히고 상체를 뒤로 살짝 기울인다"],
    movement: ["손을 모아 좌우로 번갈아 몸통을 돌린다"],
    breathing: "돌리며 내쉬고 중앙에서 들이마신다",
    mistakes: ["팔만 움직이고 몸통은 그대로", "등이 둥글게 말림"],
    caution: "허리가 불편하면 발을 바닥에 대고 각도를 낮춘다",
  },
  {
    exerciseName: "레그 레이즈",
    setup: ["누워 손을 엉덩이 옆에 두고 허리를 바닥에 붙인다"],
    movement: ["다리를 모아 천천히 들었다 바닥에 닿기 전에 멈춘다"],
    breathing: "올리며 내쉬고 내리며 들이마신다",
    mistakes: ["허리가 뜨며 반동으로 다리를 던짐"],
    caution: "허리가 뜨면 무릎을 굽히고 한다",
  },
  {
    exerciseName: "플러터 킥",
    setup: ["누워 다리를 살짝 들고 허리를 바닥에 붙인다"],
    movement: ["다리를 번갈아 작게 위아래로 젓는다"],
    breathing: "짧고 규칙적으로 쉰다",
    mistakes: ["허리가 뜸", "다리를 크게 휘저어 반동을 씀"],
    caution: "허리가 뜨면 손을 엉덩이 밑에 넣거나 다리를 높인다",
  },
  {
    exerciseName: "브이 업",
    setup: ["누워 팔을 머리 위로 뻗는다"],
    movement: ["상체와 다리를 동시에 들어 V 모양을 만들었다 천천히 내린다"],
    breathing: "올리며 내쉬고 내리며 들이마신다",
    mistakes: ["반동으로 튕겨 올림", "목을 앞으로 당김"],
    caution: "난도가 높다 — 어려우면 무릎을 굽혀 범위를 줄인다",
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
