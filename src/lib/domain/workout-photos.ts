/**
 * 운동 1회의 사진 묶음 — 순수 도메인 로직, I/O 없음 (2026-09-10).
 *
 * **제품 원칙: `운동 1회(workout_session) = 피드 게시물 1개`.**
 * 사진이 여러 장이어도 게시물은 하나다. 좋아요·댓글·캡션·운동 데이터는 전부
 * `session_id`에 붙는다. 사진마다 게시물이 생기는 구조가 **아니다.**
 *
 * DB 쪽 짝 (0103):
 *   - `sort_order smallint not null default 0`
 *   - `check (sort_order between 0 and 4)`      ← 여기 5장 상한이 박혀 있다
 *   - `unique (session_id, sort_order) deferrable`
 * 위 둘이 짝을 이뤄 **세션당 6행이 물리적으로 불가능**하다. 트리거가 없다.
 * 이 파일은 그 규칙을 화면 쪽에서 미리 말해 주는 것뿐이고, **진실은 DB에 있다.**
 */

export type VerificationSource = "camera" | "album";

/** `workout_images`에서 그대로 읽어 온 행 (컬럼명을 바꾸지 않는다) */
export type WorkoutPhotoRow = {
  id: string;
  image_path: string;
  source: VerificationSource;
  sort_order: number;
  client_captured_at: string | null;
};

/**
 * 화면이 쓰는 사진 한 장 — 경로 대신 **서명 URL**을 든다.
 *
 * ⚠️ 그냥 `string[]`이 아닌 이유: 삭제·재정렬은 `id`가 있어야 하고, 🔥/● 등급
 *    표시는 `source`가 있어야 한다. 반대로 **`media[]`로 넓히지 않는다** —
 *    영상은 이번 범위가 아니고, 이름이 먼저 넓어지면 범위가 따라 넓어진다.
 */
export type SessionPhoto = {
  id: string;
  url: string;
  source: VerificationSource;
  sortOrder: number;
};

/**
 * 베타 상한. **DB의 `check (sort_order between 0 and 4)`와 같은 수를 말한다.**
 * 한쪽만 바꾸면 화면과 서버가 갈린다 — 바꿀 거면 마이그레이션과 같이 바꿔라.
 */
export const MAX_WORKOUT_PHOTOS = 5;

/**
 * 슬롯 순서로 정렬 (`sort_order` ASC).
 *
 * ⚠️ PostgREST가 임베드를 어떤 순서로 돌려주는지에 기대지 않는다. 세션당 1장이던
 *    시절에는 정답이 하나뿐이라 안 보이던 문제이고, 2장이 되는 순간 드러난다
 *    (`getLatestCrewWorkout`이 실제로 이 덫에 걸려 있었다 — 2026-09-10).
 */
export function sortWorkoutPhotos<T extends { sort_order: number }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * 새 사진이 들어갈 슬롯. 꽉 찼으면 `null`.
 *
 * ⚠️ **`max + 1`이 아니라 빈 슬롯을 찾는다.** 0·1·2를 지우고 3·4만 남았을 때
 *    `max + 1`은 5가 되는데, 그 값은 `check (0..4)`에 막힌다 — **2장뿐인데
 *    추가가 안 되는** 상태가 된다. 구멍을 메우면 그 덫이 아예 없다.
 *
 * ⓘ 동시 업로드로 같은 슬롯을 두 번 계산할 수 있다. 그때는 DB가 23505로
 *   거절하는 것이 맞다 — 호출부가 다시 읽어 한 번 재시도한다(`workout.ts`).
 */
export function nextPhotoSlot(rows: readonly { sort_order: number }[]): number | null {
  const taken = new Set(rows.map((r) => r.sort_order));
  for (let slot = 0; slot < MAX_WORKOUT_PHOTOS; slot += 1) {
    if (!taken.has(slot)) return slot;
  }
  return null;
}

/** 사진을 더 붙일 수 있는가 — 장수만 보는 판정 (창(날짜)은 `photo-window.ts`) */
export function canAddWorkoutPhoto(photoCount: number): boolean {
  return photoCount < MAX_WORKOUT_PHOTOS;
}

/**
 * 사진 묶음 → 인증 등급 (§8).
 *
 * **camera가 하나라도 있으면 `camera`, 전부 album이면 `album`, 없으면 `null`.**
 *
 * ⚠️ 이 값을 `set_workout_verification(p_source)`에 그대로 넘긴다. 그 RPC는
 *    사진을 보고 등급을 계산하지 **않고** 넘어온 값을 쓴다 — 그래서 서버를
 *    고칠 필요가 없었다. 대신 **여기가 틀리면 서버도 틀린다.**
 */
export function verificationSourceForPhotos(
  rows: readonly { source: VerificationSource }[],
): VerificationSource | null {
  if (rows.length === 0) return null;
  return rows.some((r) => r.source === "camera") ? "camera" : "album";
}

/**
 * 사진 묶음 → `client_captured_at` (§8).
 *
 * **camera 사진에 실제로 저장된 값 중 가장 이른 것.** 없으면 `null`이다.
 *
 * ⚠️ **지어내지 않는다.** album의 값은 쓰지 않는다 — 파일 시각은 촬영일이
 *    아니라서 메신저 저장·다운로드에서 '지금'으로 갱신된다
 *    (`verification-photo.tsx`가 애초에 album에 null을 넣는 이유와 같다).
 */
export function capturedAtForPhotos(
  rows: readonly { source: VerificationSource; client_captured_at: string | null }[],
): string | null {
  const stamps = rows
    .filter((r) => r.source === "camera")
    .map((r) => r.client_captured_at)
    .filter((at): at is string => at !== null);
  if (stamps.length === 0) return null;
  return stamps.reduce((earliest, at) => (at < earliest ? at : earliest));
}

/**
 * 목록에서 한 장을 좌/우로 한 칸 옮긴 새 배열.
 *
 * 드래그앤드롭 대신 좌/우 버튼을 쓴다 — **모바일 사용성이 우선이다.**
 * 끝에서 더 밀면 원본을 그대로 돌려준다(테두리를 감싸지 않는다 — 사용자가
 * 마지막 사진을 오른쪽으로 밀었는데 맨 앞으로 튀면 놀란다).
 */
export function movePhoto(
  ids: readonly string[],
  index: number,
  direction: -1 | 1,
): string[] {
  const target = index + direction;
  if (index < 0 || index >= ids.length) return [...ids];
  if (target < 0 || target >= ids.length) return [...ids];
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
