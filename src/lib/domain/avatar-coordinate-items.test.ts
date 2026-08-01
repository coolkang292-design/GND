import { describe, expect, it } from "vitest";
import {
  AVATAR_ITEM_CATALOG,
  MASTER_CANVAS,
  createAvatarMockState,
  equipAvatarItem,
  isAvatarMockEnabled,
  layerStyle,
  purchaseAvatarItem,
  unequipAvatarItem,
  validateAvatarLayer,
} from "./avatar-coordinate-items";

describe("avatar coordinate layers", () => {
  it("1024x1536 좌표를 캔버스 백분율로 변환한다", () => {
    expect(
      layerStyle({ x: 256, y: 384, width: 512, height: 384, z: 20 }),
    ).toMatchObject({
      left: "25%",
      top: "25%",
      width: "50%",
      height: "25%",
      zIndex: 20,
    });
  });

  it("레이어가 마스터 캔버스를 벗어나면 거부한다", () => {
    expect(
      validateAvatarLayer({ x: 900, y: 0, width: 200, height: 100, z: 1 }),
    ).toContain("canvas");
  });

  it("마스터 캔버스를 1024x1536으로 고정한다", () => {
    expect(MASTER_CANVAS).toEqual({ width: 1024, height: 1536 });
  });

  it("모자만 구매 가능하고 나머지 5개는 준비 중이다", () => {
    expect(AVATAR_ITEM_CATALOG).toHaveLength(6);
    expect(AVATAR_ITEM_CATALOG.find((item) => item.id === "gnd-cap-v2"))
      .toMatchObject({ price: 500, comingSoon: false });
    expect(AVATAR_ITEM_CATALOG.filter((item) => item.comingSoon)).toHaveLength(5);
  });

  it("구매 전에는 장착할 수 없고 구매하면 500P가 차감된다", () => {
    const initial = createAvatarMockState();
    expect(equipAvatarItem(initial, "gnd-cap-v2")).toEqual(initial);

    const purchased = purchaseAvatarItem(initial, "gnd-cap-v2");
    expect(purchased.balance).toBe(12_340);
    expect(purchased.ownedItemIds).toContain("gnd-cap-v2");
  });

  it("구매한 모자를 장착, 해제, 재장착할 수 있다", () => {
    const purchased = purchaseAvatarItem(createAvatarMockState(), "gnd-cap-v2");
    const equipped = equipAvatarItem(purchased, "gnd-cap-v2");
    expect(equipped.equippedBySlot.head).toBe("gnd-cap-v2");

    const unequipped = unequipAvatarItem(equipped, "gnd-cap-v2");
    expect(unequipped.equippedBySlot.head).toBeUndefined();
    expect(equipAvatarItem(unequipped, "gnd-cap-v2").equippedBySlot.head).toBe(
      "gnd-cap-v2",
    );
  });

  it("새 초기 상태는 목업 잔액과 미구매 상태로 돌아간다", () => {
    const changed = purchaseAvatarItem(createAvatarMockState(), "gnd-cap-v2");
    expect(changed.balance).toBe(12_340);
    expect(createAvatarMockState()).toEqual({
      balance: 12_840,
      ownedItemIds: [],
      equippedBySlot: {},
    });
  });

  it("개발 환경에서는 목업을 열고 운영 환경에서는 명시적 플래그가 없으면 막는다", () => {
    expect(isAvatarMockEnabled("development", undefined)).toBe(true);
    expect(isAvatarMockEnabled("test", undefined)).toBe(true);
    expect(isAvatarMockEnabled("production", undefined)).toBe(false);
    expect(isAvatarMockEnabled("production", "true")).toBe(true);
  });

  it("상품 카드에는 작은 WebP 썸네일을 사용한다", () => {
    expect(
      AVATAR_ITEM_CATALOG.every((item) =>
        item.thumbnailSrc.startsWith("/avatar-coordinate-v2/thumbnails/"),
      ),
    ).toBe(true);
    expect(AVATAR_ITEM_CATALOG.every((item) => item.thumbnailSrc.endsWith(".webp"))).toBe(
      true,
    );
  });
});
