# -*- coding: utf-8 -*-
"""`public/ui-icons/*.webp`가 작은 화면에서 읽히는지 잰다.

    python scripts/check-ui-icons.py            # 미달만 찍는다
    python scripts/check-ui-icons.py --all      # 전부 표로 찍는다

제작 지침은 `docs/ui-icon-asset-guide.md`. 이 스크립트는 그 §2의 세 수치를
그대로 검사한다.

──────────────────────────────────────────────────────────────────────
⚠️ 왜 눈으로 보지 않고 재는가
──────────────────────────────────────────────────────────────────────
2026-08-07 1차 시안은 **192px 대지에서 멀쩡해 보였고** 그대로 넘어갔다.
화면의 28~40px에서 뭉갠 것을 사용자가 잡았다. 흰 배경 뷰어에서 보면 검게
채운 아이콘도 멀쩡해 보인다 — 실제로는 카드 위에서 대비 1.0:1이었다.

**축소한 뒤 카드 색에 합성해서 재야만 드러난다.**
"에러가 안 났다"가 아니라 "숫자가 기준을 넘는가"를 본다.
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

#: 검사할 폴더. 새로 받은 시안을 `public/`에 넣기 **전에** 재 보려면 이걸 쓴다
#: (배지 스크립트의 `BADGE_SHEETS`와 같은 방식):
#:     UI_ICON_DIR=/tmp/새시안 python scripts/check-ui-icons.py --all
ICONS = os.environ.get("UI_ICON_DIR") or os.path.join(ROOT, "public", "ui-icons")

#: 카드 바탕 — `globals.css`의 `--surface-2`. 아이콘이 가장 많이 얹히는 색이다.
#: 더 어두운 `--surface`(#16161a)·`--bg`(#0b0b0c)에서는 대비가 더 잘 나오므로
#: 여기만 통과하면 나머지도 통과한다.
CARD = (0x21, 0x1F, 0x18)

#: §2의 세 관문.
#:
#: ⚠️ 획은 **비율이 아니라 화면 px**로 잰다 (2026-08-07 2차에서 고침).
#:
#: 처음엔 `획/몸통 >= 8%` 하나로 고정했는데, 그 8%는 **가장 작은 사용처인
#: 탭바 28px**에서 유도한 값이다(2 ÷ 28 = 7.1% + 여유). 그걸 40px 아이콘에
#: 그대로 대면 3.2px를 요구하게 되어 **물리적 필요치의 1.6배**가 된다.
#: 실제로 2차 시안의 `hub-routine`이 7.0%(화면 2.8px)로 걸렸는데, 40px 자리에
#: 2.8px면 충분히 보인다 — 게이트가 틀린 것이지 자산이 틀린 게 아니었다.
#:
#: 근거가 되는 사실은 하나다: **획이 화면에서 2px 아래로 내려가면 선으로 안 보인다.**
#: 표시 크기를 알고 있으니 거기서 직접 재고, 20% 여유만 얹는다.
MIN_STROKE_PX = 2.4  # 화면에 그려지는 잉크 획 (px) — 2px 하한 + 20% 여유
MIN_INK = 0.06       # 잉크가 아이콘 상자에서 차지하는 넓이 — 너무 적으면 안 보인다
MIN_OPAQUE = 0.70    # 몸통 픽셀 중 알파 240 이상의 비율
MIN_RATIO = 3.0      # '잉크'의 문턱 — 카드 대비 (WCAG 비텍스트 최소)

#: 파일 이름 앞자리 → 화면에서 그려지는 px. 지침 §1 표와 같아야 한다.
DISPLAY = {"tab-": 28, "hub-": 40, "part-": 40, "situ-": 40}
DEFAULT_DISPLAY = 18  # `UiIcon`의 기본값


def display_size(name):
    for prefix, size in DISPLAY.items():
        if name.startswith(prefix):
            return size
    return DEFAULT_DISPLAY


def lum(rgb):
    def f(c):
        c /= 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])


CARD_L = lum(CARD)


def contrast(l):
    hi, lo = max(l, CARD_L), min(l, CARD_L)
    return (hi + 0.05) / (lo + 0.05)


def measure(path, display):
    """**표시 크기로 줄여 카드에 합성한 뒤, 보이는 잉크만** 잰다.

    ⚠️ 처음엔 원본 256px에서 '몸통 픽셀의 중앙값 밝기'를 대비로 삼았다.
    **속이 빈 아이콘에서 그게 완전히 틀린다** (2026-08-07에 잡음). 굵은 골드
    외곽선 + 어두운 속인 `tab-home`은 화면에서 잘 보이는데, 어두운 속이 면적의
    대부분이라 중앙값이 어둡게 나와 `대비 1.1:1`로 찍혔다. 사람이 보는 것은
    외곽선인데 지표는 구멍을 재고 있었다.

    지금은 **대비 3:1을 넘는 픽셀만 '잉크'로 세고** 나머지는 구멍으로 친다.
    구멍은 카드 색이 비쳐야 하는 자리라 어두운 게 정상이다.

    ⚠️ 그리고 **표시 크기로 줄인 뒤에** 잰다. 원본 256px에서 재면 축소로 사라질
    획도 굵어 보인다 — 브라우저가 하는 일을 똑같이 해야 같은 답이 나온다.
    """
    im = Image.open(path).convert("RGBA").resize((display, display), Image.LANCZOS)
    flat = Image.new("RGB", (display, display), CARD)
    flat.paste(im, (0, 0), im)
    fpx, apx = flat.load(), im.load()

    ink = [[contrast(lum(fpx[x, y])) >= MIN_RATIO for x in range(display)]
           for y in range(display)]
    n = sum(sum(row) for row in ink)
    if not n:
        return None

    # 불투명도는 **원본**에서 본다 — 축소하면 안티에일리어싱이 섞여 항상 낮아진다
    src = Image.open(path).convert("RGBA")
    spx = src.load()
    body = [(x, y) for y in range(src.height) for x in range(src.width)
            if spx[x, y][3] >= 128]
    opaque = sum(1 for x, y in body if spx[x, y][3] >= 240) / len(body) if body else 0

    runs = []
    for y in range(display):
        c = 0
        for x in range(display):
            if ink[y][x]:
                c += 1
            elif c:
                runs.append(c)
                c = 0
        if c:
            runs.append(c)
    runs.sort()

    return {
        "stroke_px": runs[len(runs) // 2] if runs else 0,
        "ink": n / (display * display),
        "opaque": opaque,
        "alpha_ok": apx is not None,
    }


def main():
    show_all = "--all" in sys.argv
    if not os.path.isdir(ICONS):
        raise SystemExit(f"자산 폴더가 없다: {ICONS}")

    names = sorted(
        f[:-5] for f in os.listdir(ICONS) if f.endswith(".webp")
    )
    if not names:
        raise SystemExit(f"검사할 자산이 없다: {ICONS}")

    print(f"{'자산':<24} {'표시':>4} {'잉크 획':>8} {'잉크 면적':>9} "
          f"{'불투명':>7}  판정")
    print("-" * 70)

    failed = []
    for name in names:
        d = display_size(name)
        m = measure(os.path.join(ICONS, name + ".webp"), d)
        if m is None:
            # 잉크가 한 점도 없다 = 카드 위에서 통째로 안 보인다
            failed.append((name, ["보이는 잉크 없음"]))
            print(f"{name:<24} {d:>3}px {'—':>8} {'0.0%':>9} {'—':>7}  "
                  f"❌ 보이는 잉크 없음")
            continue

        bad = []
        if m["stroke_px"] < MIN_STROKE_PX:
            bad.append(f"획 {m['stroke_px']}px")
        if m["ink"] < MIN_INK:
            bad.append(f"잉크 {m['ink']*100:.1f}%")
        if m["opaque"] < MIN_OPAQUE:
            bad.append(f"불투명 {m['opaque']*100:.0f}%")

        if bad:
            failed.append((name, bad))
        if bad or show_all:
            print(f"{name:<24} {d:>3}px {m['stroke_px']:>6}px "
                  f"{m['ink']*100:>8.1f}% {m['opaque']*100:>6.0f}%  "
                  f"{'❌ ' + ' · '.join(bad) if bad else '✅'}")

    print("-" * 70)
    print(f"기준: 잉크 획 ≥{MIN_STROKE_PX}px · 잉크 면적 ≥{MIN_INK*100:.0f}% "
          f"· 불투명 ≥{MIN_OPAQUE*100:.0f}%")
    print(f"      잉크 = 카드 #211f18 위에서 대비 {MIN_RATIO:.0f}:1을 넘는 픽셀")

    if failed:
        print(f"\n{len(failed)}/{len(names)}장 미달 — 시안을 다시 받는다.")
        print("⚠️ 스크립트로 밝기·감마를 보정해 통과시키지 마라. 1차에서 전부")
        print("   시도했고 원화를 죽였다 (docs/ui-icon-asset-guide.md §6).")
        raise SystemExit(1)

    print(f"\n{len(names)}장 전부 통과.")


if __name__ == "__main__":
    main()
