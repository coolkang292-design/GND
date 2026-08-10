# -*- coding: utf-8 -*-
"""GPT에서 받은 **아트 한 장**을 화면용 통짜 캔버스로 만든다 (2026-08-10).

    python scripts/make-screen-canvas.py onboarding "어플 UI 이미지/아트-온보딩.png"
    python scripts/make-screen-canvas.py nickname   "어플 UI 이미지/아트-닉네임.png"
    python scripts/make-screen-canvas.py login      "어플 UI 이미지/아트-로그인.png"

규격·좌표의 근거는 `docs/design-sources/onboarding-canvas-spec.md`. 숫자를 여기서
고치지 마라 — 그 문서의 §5-2 표와 **반드시 같은 값**이어야 한다.

──────────────────────────────────────────────────────────────────────
왜 아트만 받고 캔버스는 여기서 만드는가
──────────────────────────────────────────────────────────────────────
ChatGPT 이미지 편집은 **1024×1024 · 1024×1536 · 1536×1024** 세 가지만 준다.
목표 캔버스(예: 1080×2460, 비율 2.28)는 애초에 나올 수가 없다.

다행히 캔버스의 아래쪽은 **아무것도 없는 검정**이다 — 생성할 이유가 없다.
그래서 GPT에서는 아트만 받고(비율이 세 규격과 거의 맞는다), 검정 확장과
아래끝 페이드는 여기서 계산으로 붙인다. 페이드를 사람 손이나 생성기에 맡기면
**가로 경계선**이 남는데, 그 선이 "잘린 느낌"의 정체였다.

⚠️ 생성기는 "아래는 완전히 비워라"고 해도 잔광·불티를 남긴다. 그래서 이 스크립트는
   아트 존 아래를 **순검정으로 덮어쓴다.** 부탁이 아니라 강제다.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

# ── 프레임은 세 장 모두 같다 ──────────────────────────────────
#
# ⚠️ 2026-08-10 사용자 지적: *"3장의 이미지 전체 프레임 크기는 동일하되, 그 프레임
#    안에서 이미지 배치를 보정해야 하는 게 아닌가."* 맞다. 처음엔 화면마다 프레임
#    높이를 다르게(2460·2540·2680) 잡았는데, 그건 텍스트 블록까지 프레임 안에
#    담으려던 계산이었다 — **텍스트는 이미지 안에 담기지 않는다.** 화면 아래에
#    붙고, 이미지는 `object-cover`로 아래가 잘린다. 즉 프레임 높이가 하는 일은
#    "화면을 덮을 만큼 긴가" 하나뿐이라 화면마다 다를 이유가 없었다.
#
# 2560 = 비율 2.370. 제일 긴 폰(21:9 ≈ 2.33)보다 길어서 **가로가 잘리는 일이
# 없다.** 남는 아래쪽은 순검정이라 잘려도 티가 안 나고 용량도 거의 안 먹는다.
WIDTH = 1080
CANVAS_H = 2560

# ── 화면별로 다른 것은 아트가 끝나는 높이 하나뿐 ──────────────
#
#   art_u : 아트 존 높이 (컬럼 폭 = 1080px = 1u 기준). spec 문서 §5-2와 같은 값
#   fade  : 아트 아래끝에서 검정으로 녹이는 구간 (아트 높이 대비, 아래 FADE)
#
# ⚠️ 이 값은 화면의 **텍스트 블록 높이**가 정한 것이다(§5-1). 문구나 입력칸이
#    늘거나 줄면 다시 재서 고쳐야 한다 — 안 그러면 글자가 그림을 침범한다.
SPECS = {
    "onboarding": {"art_u": 1.520, "out": "screen-onboarding.webp"},
    "nickname": {"art_u": 1.094, "out": "screen-nickname.webp"},
    "login": {"art_u": 0.672, "out": "screen-login.webp"},
}
FADE = 0.08
# ⚠️ 80에서 올렸다 (2026-08-10). 이 그림은 **어두운 그라데이션과 글로우**가 대부분이라
#    낮은 품질에서 제일 먼저 밴딩(등고선)이 뜬다 — 사용자가 "화질이 뭉개 보인다"고
#    지적한 그것이다. 넓은 순검정은 거의 공짜로 압축되니 올려도 용량이 별로 안 는다.
# ⚠️ 같이 고쳐야 하는 것: `ScreenArt`의 `unoptimized`. 안 그러면 Next가 이 파일을
#    **한 번 더** webp q75로 재인코딩해서 여기서 올린 품질이 그대로 날아간다.
QUALITY = 92
LIMIT = 320 * 1024

OUT_DIR = Path("public") / "onboarding"


def art_black(art: Image.Image) -> tuple[int, int, int]:
    """
    아트 **자신의 검정**을 뽑는다 (아래 2%의 중앙값).

    ⚠️⚠️ 캔버스를 고정값(`#0a0a0c` 등)으로 채우면 **가로 경계선이 생긴다.**
    2026-08-10 첫 시험에서 실제로 났다 — 아트의 검정은 (0,0,0)인데 캔버스는
    (10,10,12)라, 아트가 끝나는 자리에서 배경이 갑자기 **밝아진다.** 이 작업이
    없애려던 바로 그 선이다.

    그래서 채우는 색을 아트에서 가져온다. 이러면 이어지는 지점이 정의상 같은 색이다.
    """
    w, h = art.size
    px = art.convert("RGB").load()
    band = [px[x, y] for y in range(round(h * 0.98), h) for x in range(0, w, 7)]
    band.sort(key=lambda c: c[0] + c[1] + c[2])
    return band[len(band) // 2]


def fade_to_black(art: Image.Image, fade_px: int, black: tuple[int, int, int]) -> None:
    """아래 `fade_px`를 서서히 `black`으로 눌러 경계선을 지운다 (제자리 수정)."""
    w, h = art.size
    px = art.load()
    for i in range(fade_px):
        y = h - fade_px + i
        # 선형이 아니라 제곱 — 선형은 중간쯤에서 "띠"로 읽힌다
        k = 1.0 - ((i + 1) / fade_px) ** 2
        for x in range(w):
            r, g, b = px[x, y][:3]
            px[x, y] = (
                round(r * k + black[0] * (1 - k)),
                round(g * k + black[1] * (1 - k)),
                round(b * k + black[2] * (1 - k)),
            )


def check_text_zone(canvas: Image.Image, art_h: int, label: str) -> None:
    """아트 존 아래가 정말 균일한 검정인지 **재서** 말한다.

    ⚠️ 여기서 밝은 화소가 잡히면 흰 글자가 그 위에서 지저분해진다. 이 검사가
       없으면 눈으로는 못 보고 폰에서만 보인다.
    """
    g = canvas.convert("L")
    w, h = g.size
    px = g.load()
    worst = 0
    for y in range(art_h, h, 4):
        m = max(px[x, y] for x in range(0, w, 4))
        worst = max(worst, m)
    verdict = "OK" if worst <= 12 else f"⚠️ 밝기 {worst} — 텍스트 존이 안 비었다"
    print(f"  [{label}] 텍스트 존 최대 밝기 {worst}  {verdict}")


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in SPECS:
        raise SystemExit(
            "사용법: python scripts/make-screen-canvas.py "
            f"<{' | '.join(SPECS)}> <아트 파일 경로>"
        )

    key, src_path = sys.argv[1], Path(sys.argv[2])
    if not src_path.exists():
        raise SystemExit(f"원본이 없습니다: {src_path}")

    spec = SPECS[key]
    art_h = round(WIDTH * spec["art_u"])
    canvas_h = CANVAS_H

    art = Image.open(src_path).convert("RGB")
    print(f"{key}: 받은 아트 {art.size}  h/w={art.height / art.width:.3f}")

    # 폭을 1080에 맞춘다 — 가로는 화면을 꽉 채워야 하므로 여기서 기준이 잡힌다
    scaled_h = round(art.height * WIDTH / art.width)
    art = art.resize((WIDTH, scaled_h), Image.LANCZOS)

    # ⚠️ 아트가 아트 존보다 길면 **줄이지 않고 멈춘다.** 여기서 조용히 잘라 넣으면
    #    이 작업이 없애려던 바로 그 문제(아트가 잘림)를 스크립트가 다시 만든다.
    if scaled_h > art_h:
        raise SystemExit(
            f"아트가 너무 깁니다: {scaled_h}px > 아트 존 {art_h}px\n"
            f"  → 필요한 비율은 h/w ≤ {spec['art_u']:.3f} 입니다 "
            f"(받은 것은 {scaled_h / WIDTH:.3f}).\n"
            f"  GPT에 '위아래 여백을 더 두고 같은 구도로 다시' 요청하세요."
        )

    black = art_black(art)
    fade_px = max(1, round(scaled_h * FADE))
    fade_to_black(art, fade_px, black)

    canvas = Image.new("RGB", (WIDTH, canvas_h), black)
    canvas.paste(art, (0, 0))
    print(
        f"  캔버스 {WIDTH}×{canvas_h}  아트 0~{scaled_h} "
        f"({scaled_h / canvas_h:.1%})  페이드 {fade_px}px  "
        f"여유 {art_h - scaled_h}px  이음색 rgb{black}"
    )

    check_text_zone(canvas, scaled_h, key)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dst = OUT_DIR / spec["out"]
    canvas.save(dst, "WEBP", quality=QUALITY, method=6)
    size = dst.stat().st_size
    # 첫 화면이 느려지는 것은 눈에 안 띄게 나빠지는 종류라 여기서 멈춘다
    status = "OK" if size <= LIMIT else f"⚠️ 상한 {LIMIT // 1024}KB 초과"
    print(f"  {dst}  {size / 1024:.1f}KB  {status}")
    if size > LIMIT:
        raise SystemExit("상한을 넘었습니다. QUALITY를 낮추세요.")


if __name__ == "__main__":
    main()
