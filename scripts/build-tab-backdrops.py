# -*- coding: utf-8 -*-
"""탭 첫 화면 배경 사진 5장을 만든다 — `public/tab-backdrops/{tab}.webp` (2026-10-05).

    python scripts/build-tab-backdrops.py

왜 따로 만드나: 원본(`public/program-assets/*.webp`, 1254×1254, 130~300KB)을 Next 이미지
변환으로 그대로 쓰면 장당 70~110KB가 오고, 변환 캐시가 비면 0.7~1초가 더 걸렸다. 앱을 연
직후 나머지 탭 사진을 미리 받자 그 350KB가 피드로 넘어가는 요청 앞을 막아 전환이 2초 넘게
늦어졌다(2026-10-05 측정 — 사용자 신고 "피드로 옮기는 로딩이 더 늘었다").

배경은 70% 투명도에 아래로 어두워지는 장식이라 고해상도가 필요 없다. 화면에 실제로 보이는
세로 영역(폭 375~430 × 높이 560, `object-[50%_25%]`)만 남기고 줄인다.

⚠️ 원본 `program-assets`는 프로그램 화면 등 다른 곳도 쓴다 — 덮어쓰지 않는다.
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "program-assets")
OUT = os.path.join(ROOT, "public", "tab-backdrops")

# 탭 → 원본 (tab-backdrop.tsx의 BACKDROPS와 같은 짝)
SOURCES = {
    "home": "lower-v2.webp",
    "feed": "shoulder.webp",
    "record": "interval.webp",
    "challenge": "lean-v2.webp",
    "profile": "chest.webp",
}

# 보이는 영역의 가로:세로 = 430:560 (가장 넓은 폰). 더 좁은 폰은 object-cover가 더 자른다.
ASPECT = 430 / 560
SIZE = (640, 832)  # 2배 밀도에 가깝다 — 70% 투명도 장식에는 충분하다
QUALITY = 60


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for tab, name in SOURCES.items():
        im = Image.open(os.path.join(SRC, name)).convert("RGB")
        w, h = im.size
        crop_w = round(h * ASPECT)
        left = (w - crop_w) // 2  # object-position x 50%
        im = im.crop((left, 0, left + crop_w, h)).resize(SIZE, Image.LANCZOS)
        path = os.path.join(OUT, f"{tab}.webp")
        im.save(path, "WEBP", quality=QUALITY, method=6)
        print(f"{tab}: {name} -> {os.path.relpath(path, ROOT)} {os.path.getsize(path) // 1024}KB")


if __name__ == "__main__":
    main()
