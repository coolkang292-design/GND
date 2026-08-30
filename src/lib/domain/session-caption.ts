/**
 * 게시물 캡션 — 운동에 붙이는 **내 말** (2026-08-30).
 *
 * 저장 자리는 `workout_sessions.title`이다. 0004부터 있던 컬럼인데
 * (`check (title is null or char_length(title) <= 60)`) **아무도 쓰지도
 * 보여주지도 않고 있었다** — 피드는 이미 `title`을 조회해 `FeedItem.title`로
 * 들고 있으면서 렌더하지 않았다. 새 컬럼도 마이그레이션도 필요 없다.
 * 쓰기는 `sessions_update_own` 정책(0004:234)이 이미 주인에게 열려 있다.
 *
 * ── 왜 칩(chip) 하나 누르는 방식인가 (사용자 결정 2026-08-30) ──
 *
 * 인스타는 캡션을 **소파에서** 쓴다. GND는 **방금 운동을 끝낸 사람**이 쓴다 —
 * 땀나고, 숨차고, 한 손에 폰을 든 상태다. 같은 자유 입력창을 놓으면 그 순간의
 * 비용을 감당할 수 있는 사람만 쓰고 나머지는 비워 둔다. 그러면 게시물이 계속
 * 순수 데이터로 남고, **답할 거리가 없어서 댓글도 안 달린다.**
 *
 * 그래서 지친 사람이 지불할 수 있는 비용을 **탭 1회**로 못 박는다.
 * 자유 서술은 접어 두고 원하는 사람만 편다.
 *
 * ⚠️ **칩은 코드가 아니라 문구를 저장한다.** `title`에 라벨 그대로 넣는다.
 *    코드(enum)로 저장하면 ① 새 컬럼이나 매핑표가 필요하고 ② 나중에 칩 목록을
 *    바꾸는 순간 옛 게시물이 **뜻을 잃는다**(모르는 코드 → 빈 캡션). 문구로
 *    저장하면 목록을 갈아엎어도 이미 달린 말은 그대로 읽힌다.
 *
 * ⚠️ 그래서 **라벨을 고치면 옛 게시물은 옛 문구로 남는다.** 그게 맞다 —
 *    사용자가 그때 고른 말이다. 소급해서 바꾸지 마라.
 */

/** `workout_sessions.title`의 CHECK가 60자다 (0004:68). 화면도 같은 값을 쓴다 */
export const CAPTION_MAX_LENGTH = 60;

/**
 * 원탭 캡션 후보.
 *
 * **축은 "얼마나 힘들었나"다.** 크루가 가장 잘 받아치는 신호가 그것이고
 * ("ㅋㅋ고생했다", "대박"), 캡션의 목적은 문학이 아니라 **답할 거리를 주는 것**이다.
 *
 * 6개인 이유 — 지친 상태에서는 고르는 것도 비용이다. 한 줄에 가로로 다 들어가고
 * 훑는 데 1초를 안 넘겨야 한다. 늘리고 싶으면 대신 하나를 빼라.
 */
export const CAPTION_CHIPS: readonly string[] = [
  "💀 오늘 다 털렸다",
  "🔥 컨디션 좋았다",
  "😮‍💨 겨우 해냈다",
  "🎯 목표 채웠다",
  "💪 가볍게 몸풀기",
  "🧊 몸이 무거웠다",
];

/**
 * 저장 전 다듬기. 공백뿐이면 `null` — 빈 캡션 줄을 그리지 않기 위해
 * 빈 문자열과 `null`을 구분하지 않고 하나로 접는다.
 */
export function normalizeCaption(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * 저장해도 되는 값인가. 서버 CHECK(60자)에 걸려 **저장이 통째로 실패하기 전에**
 * 화면에서 막는다.
 */
export function isValidCaption(raw: string | null | undefined): boolean {
  const value = normalizeCaption(raw);
  return value === null || value.length <= CAPTION_MAX_LENGTH;
}

/** 이 칩이 지금 선택된 것인가 — 칩 문구를 그대로 저장하므로 문자열 비교다 */
export function isChipSelected(
  caption: string | null | undefined,
  chip: string,
): boolean {
  return normalizeCaption(caption) === chip;
}

/**
 * 칩을 눌렀을 때의 다음 캡션. 같은 칩을 다시 누르면 **해제**한다 —
 * 잘못 누른 것을 되돌릴 길이 없으면 원탭이 위험해진다.
 */
export function toggleChip(
  caption: string | null | undefined,
  chip: string,
): string | null {
  return isChipSelected(caption, chip) ? null : chip;
}
