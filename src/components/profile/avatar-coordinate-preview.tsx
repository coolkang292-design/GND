"use client";

import Image from "next/image";
import { useState } from "react";
import {
  AVATAR_ITEM_CATALOG,
  layerStyle,
  type AvatarLayer,
} from "@/lib/domain/avatar-coordinate-items";

const BASE_SRC = "/avatar-coordinate-v2/base/avatar-base-master.png";

export function AvatarCoordinatePreview({
  equippedItemIds,
}: {
  equippedItemIds: string[];
}) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const layers = AVATAR_ITEM_CATALOG.filter((item) =>
    equippedItemIds.includes(item.id),
  )
    .flatMap((item) => item.layers)
    .sort((a, b) => a.z - b.z);

  const markFailed = (src: string) =>
    setFailedSources((current) =>
      current.includes(src) ? current : [...current, src],
    );

  return (
    <div
      className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-card border border-line bg-[#171a1f] shadow-card"
      style={{ aspectRatio: "2 / 3" }}
      data-testid="avatar-coordinate-preview"
    >
      <Image
        src={BASE_SRC}
        alt="기본 불독 캐릭터"
        fill
        priority
        sizes="(max-width: 430px) 100vw, 360px"
        className="object-contain"
        onError={() => markFailed(BASE_SRC)}
      />

      {layers.map((layer, index) => {
        const src = layer.src ?? "";
        if (!src || failedSources.includes(src)) return null;
        return (
          <Image
            key={`${src}-${index}`}
            src={src}
            alt=""
            aria-hidden="true"
            width={layer.width}
            height={layer.height}
            draggable={false}
            style={{ ...layerStyle(layer as AvatarLayer), objectFit: "fill" }}
            onError={() => markFailed(src)}
          />
        );
      })}

      {failedSources.length > 0 && (
        <p
          role="status"
          className="absolute inset-x-3 bottom-3 z-[100] rounded-card-sm bg-black/70 px-3 py-2 text-center text-xs font-bold text-white"
        >
          일부 캐릭터 이미지를 불러오지 못했어요.
        </p>
      )}
    </div>
  );
}
