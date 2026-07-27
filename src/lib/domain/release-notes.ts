// 릴리스 노트 — "새 소식(/whats-new)"과 배포 알림의 단일 원천.
// 배포할 때마다 맨 앞에 한 건 추가한다. 사용자 4명·저자=개발자라 DB·어드민 툴은
// 만들지 않는다(YAGNI). 항목은 최신순으로 둔다(맨 앞이 가장 최근).

export type ReleaseNote = {
  /** 안정 식별자 — 알림 멱등키·앵커로 쓴다 */
  id: string;
  /** 배포일 KST 'YYYY-MM-DD' */
  date: string;
  /** 화면·알림 제목 */
  title: string;
  /** 알림 본문 한 줄 요약 */
  summary: string;
  /** 상세 화면의 항목별 설명 */
  highlights: string[];
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: "2026-07-27-badges-points",
    date: "2026-07-27",
    title: "배지 30종 + 포인트 경제",
    summary: "운동으로 포인트를 모으고 배지 30종을 수집하세요 🎖️",
    highlights: [
      "배지가 3개 → 30종으로 늘었어요. 운동·볼륨·거리·기록 갱신·불꽃까지 종류별로 모아보세요.",
      "운동할 때마다 포인트(P)가 쌓여요. 불꽃(연속 운동일)이 길수록 포인트 배수가 붙어요.",
      "내 정보에서 포인트 잔액·배수·연속일을 한눈에 볼 수 있어요.",
      "크루원 프로필을 누르면 그 사람이 모은 배지와 각 배지의 의미·보상을 볼 수 있어요.",
    ],
  },
];

/** 가장 최근 릴리스. 없으면 null. */
export function latestRelease(): ReleaseNote | null {
  return RELEASE_NOTES[0] ?? null;
}

/** id로 릴리스 조회. */
export function releaseById(id: string): ReleaseNote | null {
  return RELEASE_NOTES.find((r) => r.id === id) ?? null;
}
