# -*- coding: utf-8 -*-
"""온보딩 자산을 만든다 (2026-08-08 사용자 제공 시안).

    python scripts/make-onboarding-assets.py

원본은 `어플 UI 이미지/`에 있고 **저장소에 커밋하지 않는다**(수 MB PNG).
이 스크립트는 그 원본에서 만든 결과물을 재현하기 위한 기록이다.
`scripts/slice-ui-icons.py`와 같은 규약이다.

──────────────────────────────────────────────────────────────────────
⚠️ 알파를 버리지 마라 — 2026-08-07에 같은 실수를 했다
──────────────────────────────────────────────────────────────────────
`방패체크.png`는 **RGBA**이고 배경이 이미 투명하다. `.convert("RGB")`로 알파를
버리면 색 채널에 구워진 글로우가 드러나 아이콘 뒤에 얼룩이 생긴다. 그때 사용자가
"왜 얼룩이 생기는거야?"라고 지적했다. 있는 알파를 그대로 쓴다.

히어로(`온보딩 히어로.png`)는 반대로 **RGB**다 — 검정 배경이 그림의 일부이고,
화면도 검정이라 투명이 필요 없다. 알파를 억지로 만들지 않는다.

──────────────────────────────────────────────────────────────────────
⚠️ 크기 — 시안 원본을 그대로 넣지 마라
──────────────────────────────────────────────────────────────────────
히어로는 온보딩 **첫 화면**에 뜬다. 원본 941×1672를 그대로 넣으면 첫인상이
느려진다. 화면 폭은 `max-w-sm`(384px)이라 2배인 768px이면 레티나에서 충분하다.
`ui-icons.test.ts`가 아이콘 40KB 상한을 단언하므로 방패도 작게 만든다.
"""

from pathlib import Path
from PIL import Image

SRC = Path("어플 UI 이미지")
ROOT = Path("public")

# ── 전체 화면 한 장 규격 (2026-08-08 사용자 제안) ──────────────
#
# 아트는 위쪽, 아래는 빈 검정. 그 검정 위에 문구·입력칸·버튼이 HTML로 올라간다.
# 규격은 `docs/design-sources/onboarding-hero-prompt.md`의 "전체 화면 한 장".
#
# ⚠️ **2026-08-08 오후: 원본이 이미 9:16 + 아래 여백으로 다시 왔다.** 그래서
#    잘라내기(`crop`)와 캔버스 만들기(`FIT_FULLSCREEN`)를 **둘 다 껐다.**
#    이 둘을 다시 켜면 여백이 두 번 들어가 아트가 위로 쏠리고 화면이 깨진다.
#    원본을 또 바꾸는 사람은 아래 "아트 아래끝" 출력값을 보고 CSS 비율을 맞춰라.
FIT_FULLSCREEN = False
ART_TOP_RATIO = 0.50
FULLSCREEN_RATIO = 16 / 9  # 세로/가로

# (원본, 결과, 목표 폭, 품질, 상한 바이트, 내용만 잘라내기)
JOBS = [
    (SRC / "온보딩 히어로.png", ROOT / "onboarding" / "hero.webp", 1080, 78, 200 * 1024, False),
    (SRC / "방패체크.png", ROOT / "ui-icons" / "shield-check.webp", 128, 88, 40 * 1024, False),
]


def trim_side_margins(im: Image.Image, threshold: int = 12) -> Image.Image:
    """
    그림 **안쪽**의 좌우 검은 여백을 걷어낸다.

    ⚠️⚠️ 2026-08-08에 이걸 몰라서 세 번 헛수고했다. 사용자가 "양쪽에 테두리가
    보인다"고 세 번 지적했고, 나는 세 번 다 **CSS 패딩**을 의심해서 `w-full` →
    `-mx-6` → full-bleed로 고쳤다. 전부 원인이 아니었다.

    실제 원인: 생성된 그림의 좌 8.0% · 우 6.8%가 순검정이었다. 폭은 이미 꽉
    채우고 있었고, **텍스처가 시작하는 지점**이 테두리처럼 보인 것이다.
    (가장자리가 (0,0,0)이라 페이지 배경 (11,11,12)보다 오히려 더 검다.)

    교훈: "여백처럼 보인다"는 신고를 받으면 **CSS를 보기 전에 자산을 먼저 재라.**
    """
    g = im.convert("L")
    w, h = g.size
    step = max(1, h // 160)
    bright = [max(g.getpixel((x, y)) for y in range(0, h, step)) for x in range(w)]
    left = next((x for x in range(w) if bright[x] > threshold), 0)
    right = next((x for x in range(w - 1, -1, -1) if bright[x] > threshold), w - 1)
    if left == 0 and right == w - 1:
        return im
    print(f"  좌우 여백 제거: 좌 {left}px({left / w:.1%}) · 우 {w - 1 - right}px({(w - 1 - right) / w:.1%})")
    return im.crop((left, 0, right + 1, h))


def report_art_bottom(im: Image.Image, label: str) -> None:
    """
    아트가 어디서 끝나는지 재서 알려 준다.

    ⚠️ **이 값이 `onboarding/page.tsx`의 `aspect-[...]`와 맞아야 한다.** 어긋나면
    문구가 그림을 침범하거나(작으면) 빈 공간이 생긴다(크면). 2026-08-08에 이걸
    눈대중으로 맞추다 두 번 틀렸다 — 이제 스크립트가 숫자를 준다.
    """
    g = im.convert("L")
    w, h = g.size
    last = 0
    for y in range(0, h, 4):
        if sum(1 for x in range(0, w, 8) if g.getpixel((x, y)) > 40) > 2:
            last = y
    print(
        f"  [{label}] 아트 아래끝 y={last} / {h}  = {last / h:.1%}"
        f"   → CSS: aspect-[{w}/{last}]"
    )


def content_box(im: Image.Image, threshold: int = 48) -> tuple[int, int, int, int]:
    """
    검은 여백을 잘라낸다.

    ⚠️ 히어로 원본은 **아래 4분의 1이 순수한 검정**이다. 그대로 쓰면 화면에서
    그림이 실제보다 훨씬 길어 보이고, 높이를 CSS로 줄이면 `object-cover`가
    **골드 문(포털)을 잘라 먹는다** — 2026-08-08에 사용자가 지적한 그 문제다.
    ("현재는 이미지가 너무 큰 거 같고" · "골드 문도 표시 되어야 하고")

    잘라내는 기준은 밝기다. 임계값을 올리면 은은한 글로우까지 날아가므로 낮게 둔다.
    """
    gray = im.convert("L")
    w, h = gray.size
    rows = [
        y
        for y in range(h)
        if max(gray.getpixel((x, y)) for x in range(0, w, 4)) > threshold
    ]
    if not rows:
        return (0, 0, w, h)
    # 위아래로 살짝 여유를 둔다 — 딱 붙여 자르면 글로우가 끊긴 티가 난다
    pad = round(h * 0.01)
    top = max(0, rows[0] - pad)
    bottom = min(h, rows[-1] + pad)
    return (0, top, w, bottom)


def main() -> None:
    for src, dst, width, quality, limit, crop in JOBS:
        if not src.exists():
            raise SystemExit(f"원본이 없습니다: {src}")

        im = Image.open(src)
        if "hero" in dst.name:
            # ⚠️ 세로(`crop`)와 무관하게 **항상** 돌린다. 생성기가 그림 안쪽에
            #    좌우 여백을 넣어 오는 일이 잦고, 그게 화면에서 테두리로 보인다.
            im = trim_side_margins(im)
        if crop:
            box = content_box(im)
            im = im.crop(box)
            # ⚠️ 검은 여백만 걷어내면 아직 h/w가 1.32라 화면에서 너무 길다. 위쪽
            #    후광 아크와 발판 아래 여운을 조금 더 잘라 **목업 비율(≈1.1)** 에
            #    맞춘다. 이 두 수치는 눈으로 맞춘 값이다 — 개와 골드 문·발판이
            #    모두 남는 선까지만 자른다(사용자 지시 "골드 문도 표시 되어야 하고").
            w0, h0 = im.size
            im = im.crop((0, round(h0 * 0.11), w0, round(h0 * 0.985)))
            print(f"  잘라내기 → {im.size}  h/w={im.size[1] / im.size[0]:.2f}")

            if FIT_FULLSCREEN:
                # 아트를 위 55%에 놓고 아래 45%를 검정으로 채운 9:16 캔버스를 만든다.
                # 새 원본이 이미 이렇게 오면 FIT_FULLSCREEN을 끄면 된다.
                aw, ah = im.size
                canvas_h = round(ah / ART_TOP_RATIO)
                canvas_w = round(canvas_h / FULLSCREEN_RATIO)
                if canvas_w < aw:
                    # 아트가 9:16 캔버스보다 넓다 — 높이를 늘려 비율을 맞춘다
                    canvas_w = aw
                    canvas_h = round(canvas_w * FULLSCREEN_RATIO)
                canvas = Image.new("RGB", (canvas_w, canvas_h), (10, 10, 12))
                canvas.paste(im, ((canvas_w - aw) // 2, 0))
                im = canvas
                print(
                    f"  전체화면 캔버스 → {im.size}  아트 {ah / canvas_h:.0%} / 여백 {1 - ah / canvas_h:.0%}"
                )
        # 알파가 있으면 유지, 없으면 만들지 않는다 (위 주석 참조)
        mode = "RGBA" if im.mode in ("RGBA", "LA", "P") and "A" in im.getbands() else "RGB"
        im = im.convert(mode)

        height = round(im.height * width / im.width)
        im = im.resize((width, height), Image.LANCZOS)

        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst, "WEBP", quality=quality, method=6)

        if "hero" in dst.name:
            report_art_bottom(im, dst.name)

        size = dst.stat().st_size
        # 상한을 넘으면 조용히 두지 않는다 — 첫 화면이 느려지는 것은 눈에 안 띄게
        # 나빠지는 종류라, 여기서 멈추지 않으면 아무도 다시 안 본다.
        status = "OK" if size <= limit else f"⚠️ 상한 {limit // 1024}KB 초과"
        print(f"{dst}  {im.size}  {mode}  {size / 1024:.1f}KB  {status}")
        if size > limit:
            raise SystemExit(f"{dst}가 상한을 넘었습니다. quality를 낮추세요.")


if __name__ == "__main__":
    main()
