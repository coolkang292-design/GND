import { dayKey } from "@/lib/domain/time";

/**
 * 인증사진을 나중에 붙일 수 있는 창 (2026-08-04, 사용자 결정).
 *
 * **왜 필요한가** — 신고 4805090f. 인증사진은 완료 직후 결과 화면에서만 올릴 수
 * 있었고, '확인'을 누르면 그 세션에는 영영 못 붙였다. 챌린지가
 * `photo_required = true`면 사진 없는 세션은 집계에서 통째로 빠지므로,
 * 사용자는 사진을 붙이려 **같은 운동을 4분 뒤 다시 기록**했다. 그 중복이
 * "기록도 이상해요"의 정체였다. 덫을 없애면 중복이 생길 이유가 없다.
 *
 * **왜 '같은 날'인가** — 이 창이 묶는 것은 **붙이는 시점**이지 촬영 시점이 아니다.
 * 사진이 언제 찍혔는지는 검사하지 않는다(할 수도 없다 — verification-photo.tsx
 * 참조: EXIF도 파일 시각도 조작 가능하고, 지금 파이프라인은 canvas 재인코딩이라
 * EXIF가 남지도 않는다). 창의 목적은 **지난 기록을 무제한으로 소급 수정하지
 * 못하게 막는 것**이다. 오늘 것은 고칠 수 있고, 지나간 날은 지나간 대로 남는다.
 *
 * ⓘ 2026-08-04에 앨범 선택이 되살아났다(사용자 결정). 처음 이 창을 만들 때는
 *   "카메라 촬영만 허용해 인증의 뜻을 지킨다"를 근거로 적었는데 그 전제가
 *   바뀌었으므로 위와 같이 고쳐 쓴다. 창 자체는 근거가 달라져도 유효하다.
 *
 * ⚠️ 이 판정은 화면용이다. 서버(`set_workout_verification`, 0005)에는 시간
 *    제약이 없다. 서버에 창을 박으면 23:59 완료 → 00:01 업로드처럼 지금 멀쩡히
 *    되는 즉시 업로드가 새로 깨진다.
 */
export function canAttachPhotoLater(input: {
  completedAt: Date;
  now: Date;
  timeZone: string;
  /** 이미 사진이 있으면 못 붙인다 — workout_images는 세션당 1장(0005 unique) */
  hasPhoto: boolean;
}): boolean {
  if (input.hasPhoto) return false;
  return (
    dayKey(input.completedAt, input.timeZone) ===
    dayKey(input.now, input.timeZone)
  );
}

/**
 * 이 세션이 챌린지 집계에서 빠지는가 — 사진 필수 챌린지인데 사진이 없을 때.
 *
 * 재기록 동기를 없애려면 **왜 안 잡히는지**를 그 자리에서 말해 줘야 한다.
 * 사진 필수가 아닌 챌린지이거나 챌린지가 없으면 아무 말도 하지 않는다.
 */
export function missingRequiredPhoto(input: {
  hasPhoto: boolean;
  photoRequired: boolean;
}): boolean {
  return input.photoRequired && !input.hasPhoto;
}
