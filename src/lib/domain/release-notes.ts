// 릴리스 노트 — "새 소식(/whats-new)"과 배포 알림의 단일 원천.
//
// 데이터는 release-notes.data.json 하나에만 둔다. 이 화면(TS)과 발송 스크립트
// (scripts/broadcast-release.mjs, node)가 같은 파일을 읽어 문구가 갈라지지 않는다.
//
// 새 기능을 배포할 때: release-notes.data.json 맨 앞에 항목 한 건 추가 →
// `node scripts/broadcast-release.mjs --send` 한 번. 스크립트가 최신 항목을 읽어
// 아직 안 보낸 것이면 전 사용자에게 알림을 보낸다(멱등).
//
// 사용자 4명·저자=개발자라 DB·어드민 툴은 만들지 않는다(YAGNI). 최신순으로 둔다.
import data from "./release-notes.data.json";

export type ReleaseNote = {
  /** 안정 식별자 — 앵커·중복발송 방어 기준 */
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

export const RELEASE_NOTES: ReleaseNote[] = data;

/** 가장 최근 릴리스. 없으면 null. */
export function latestRelease(): ReleaseNote | null {
  return RELEASE_NOTES[0] ?? null;
}

/** id로 릴리스 조회. */
export function releaseById(id: string): ReleaseNote | null {
  return RELEASE_NOTES.find((r) => r.id === id) ?? null;
}
