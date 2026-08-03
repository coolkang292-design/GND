import { describe, expect, it } from "vitest";
import {
  canAttachPhotoLater,
  missingRequiredPhoto,
} from "@/lib/domain/photo-window";

const KST = "Asia/Seoul";

/** KST 벽시계로 읽는 순간 (KST = UTC+9, 서머타임 없음) */
function kst(iso: string): Date {
  return new Date(`${iso}+09:00`);
}

describe("canAttachPhotoLater — 나중에 사진 붙이기 창 (2026-08-04)", () => {
  it("같은 날이면 붙일 수 있다", () => {
    expect(
      canAttachPhotoLater({
        completedAt: kst("2026-08-03T21:54:00"),
        now: kst("2026-08-03T23:59:00"),
        timeZone: KST,
        hasPhoto: false,
      }),
    ).toBe(true);
  });

  it("자정을 넘기면 못 붙인다", () => {
    // 창은 '완료 후 N시간'이 아니라 '같은 KST 날짜'다 — 사용자가 이해하기 쉽고
    // 챌린지 집계도 날짜 단위라 어긋나지 않는다.
    expect(
      canAttachPhotoLater({
        completedAt: kst("2026-08-03T21:54:00"),
        now: kst("2026-08-04T00:01:00"),
        timeZone: KST,
        hasPhoto: false,
      }),
    ).toBe(false);
  });

  it("5분밖에 안 지났어도 날짜가 바뀌었으면 못 붙인다", () => {
    // "2시간 창"이었다면 통과했을 경우다. 규칙이 날짜 기준임을 고정한다.
    expect(
      canAttachPhotoLater({
        completedAt: kst("2026-08-03T23:58:00"),
        now: kst("2026-08-04T00:03:00"),
        timeZone: KST,
        hasPhoto: false,
      }),
    ).toBe(false);
  });

  it("이미 사진이 있으면 같은 날이어도 못 붙인다", () => {
    // workout_images는 세션당 1장(0005 unique) — 두 번째 insert는 어차피 409다
    expect(
      canAttachPhotoLater({
        completedAt: kst("2026-08-03T21:54:00"),
        now: kst("2026-08-03T22:00:00"),
        timeZone: KST,
        hasPhoto: true,
      }),
    ).toBe(false);
  });

  it("어제 운동은 못 붙인다", () => {
    expect(
      canAttachPhotoLater({
        completedAt: kst("2026-08-02T12:05:00"),
        now: kst("2026-08-03T12:05:00"),
        timeZone: KST,
        hasPhoto: false,
      }),
    ).toBe(false);
  });
});

describe("missingRequiredPhoto — 왜 안 잡히는지 말해 준다", () => {
  it("사진 필수인데 없으면 참", () => {
    expect(missingRequiredPhoto({ hasPhoto: false, photoRequired: true })).toBe(
      true,
    );
  });

  it("사진이 있으면 거짓", () => {
    expect(missingRequiredPhoto({ hasPhoto: true, photoRequired: true })).toBe(
      false,
    );
  });

  it("사진 필수가 아니면 아무 말도 안 한다", () => {
    // 챌린지가 없거나 photo_required=false인데 경고하면 겁만 준다
    expect(missingRequiredPhoto({ hasPhoto: false, photoRequired: false })).toBe(
      false,
    );
  });
});
