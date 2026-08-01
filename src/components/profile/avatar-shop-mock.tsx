"use client";

import Image from "next/image";
import { useState } from "react";
import { AvatarCoordinatePreview } from "@/components/profile/avatar-coordinate-preview";
import {
  AVATAR_ITEM_CATALOG,
  createAvatarMockState,
  equipAvatarItem,
  purchaseAvatarItem,
  unequipAvatarItem,
} from "@/lib/domain/avatar-coordinate-items";

export function AvatarShopMock() {
  const [state, setState] = useState(createAvatarMockState);
  const [selectedItemId, setSelectedItemId] = useState("gnd-cap-v2");
  const selected =
    AVATAR_ITEM_CATALOG.find((item) => item.id === selectedItemId) ??
    AVATAR_ITEM_CATALOG[0];
  const owned = state.ownedItemIds.includes(selected.id);
  const equipped = state.equippedBySlot[selected.slot] === selected.id;
  const equippedItemIds = Object.values(state.equippedBySlot).filter(
    (itemId): itemId is string => Boolean(itemId),
  );

  function handlePrimaryAction() {
    if (!owned) {
      setState((current) => purchaseAvatarItem(current, selected.id));
      return;
    }
    setState((current) =>
      equipped
        ? unequipAvatarItem(current, selected.id)
        : equipAvatarItem(current, selected.id),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-card border border-line bg-surface p-3 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-muted">보유 포인트</p>
            <p className="text-lg font-extrabold text-accent">
              {state.balance.toLocaleString()} P
            </p>
          </div>
          <span className="rounded-full border border-accent/30 bg-accent-weak px-2.5 py-1 text-[11px] font-extrabold text-accent">
            개발 목업
          </span>
        </div>
        <AvatarCoordinatePreview equippedItemIds={equippedItemIds} />
      </section>

      <section className="rounded-card border border-line bg-surface p-3 shadow-card">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <h2 className="text-sm font-extrabold">아이템 선택</h2>
            <p className="text-[11px] text-muted">모자 장착 흐름을 먼저 검증해요.</p>
          </div>
          <p className="text-[10px] font-bold text-faint">6개 자산 준비</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {AVATAR_ITEM_CATALOG.map((item) => {
            const active = item.id === selected.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={item.comingSoon}
                aria-label={item.comingSoon ? `${item.name} 준비 중` : item.name}
                onClick={() => setSelectedItemId(item.id)}
                className={`relative overflow-hidden rounded-card-sm border p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                  active
                    ? "border-accent bg-accent-weak"
                    : "border-line bg-surface-2"
                }`}
              >
                <div className="relative mx-auto aspect-square w-full">
                  <Image
                    src={item.thumbnailSrc}
                    alt=""
                    fill
                    sizes="110px"
                    className="object-contain"
                  />
                </div>
                <p className="mt-1 truncate text-[11px] font-extrabold">
                  {item.name}
                </p>
                <p className="text-[10px] font-bold text-accent">
                  {item.comingSoon ? "준비 중" : `${item.price.toLocaleString()} P`}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-3 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold">{selected.name}</p>
            <p className="mt-0.5 text-[11px] text-muted">
              {owned ? (equipped ? "현재 장착 중" : "구매 완료") : "구매 전"}
            </p>
          </div>
          <p className="text-base font-extrabold text-accent">
            {selected.price.toLocaleString()} P
          </p>
        </div>
        <button
          type="button"
          disabled={selected.comingSoon}
          onClick={handlePrimaryAction}
          aria-label={
            selected.comingSoon
              ? `${selected.name} 준비 중`
              : !owned
                ? `${selected.price.toLocaleString()} P 구매하기`
                : equipped
                  ? "해제하기"
                  : "장착하기"
          }
          className="mt-3 h-12 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-50"
        >
          {selected.comingSoon
            ? "준비 중"
            : !owned
              ? `${selected.price.toLocaleString()} P 구매하기`
              : equipped
                ? "해제하기"
                : "장착하기"}
        </button>
        <p className="mt-2 text-center text-[10px] text-faint">
          새로고침하면 초기화돼요 · 실제 포인트 차감 없음
        </p>
      </section>
    </div>
  );
}
