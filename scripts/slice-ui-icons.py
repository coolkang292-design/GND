# -*- coding: utf-8 -*-
"""시안 시트에서 UI 아이콘 자산을 만든다 (2026-08-07 사용자 제공 이미지).

    python scripts/slice-ui-icons.py            # public/ 아래에 자산을 쓴다
    python scripts/slice-ui-icons.py --preview  # 실제 표시 크기로 대지를 낸다

원본은 `어플 UI 이미지/`에 있고 **저장소에 커밋하지 않는다**(수 MB PNG).
이 스크립트는 그 원본에서 만든 결과물을 재현하기 위한 기록이다.

──────────────────────────────────────────────────────────────────────
⚠️ 가장 큰 함정 — 원본에 **이미 알파가 있다**
──────────────────────────────────────────────────────────────────────
시트 PNG는 전부 `RGBA`이고 아이콘이 **이미 배경 없이 잘려 있다.** 색 채널에는
글로우가 구워져 있지만 알파가 그걸 가린다.

2026-08-07에 `.convert("RGB")`로 **알파를 버리고** 밝기 키잉으로 배경을 다시
빼내려 했다. 그 결과 색 채널의 글로우가 그대로 딸려 나와 아이콘 뒤에 구름 같은
얼룩이 생겼고, 사용자가 "왜 얼룩이 생기는거야? 그냥 예쁘게 잘라서 쓰면 되는거
아냐?"라고 지적했다. **맞는 말이었다.** 이미 있는 것을 재발명하지 마라.

지금은 원본 알파를 그대로 쓴다. 키잉·감마·단색 칠하기가 전부 사라졌다.

⚠️ 남은 함정 두 가지
1. **행을 균등 분할하면 안 된다.** `부위별` 시트는 아이콘이 위쪽에 몰려 있어
   4등분선이 아이콘 몸통을 가로지른다. 행은 알파 투영으로 검출한다.
2. **열을 그냥 검출해도 안 된다.** 가슴·어깨처럼 좌우대칭인 아이콘은 가운데가
   비어서 열 경계로 오인돼 반씩 쪼개진다. 검출한 뒤 칸이 기대보다 많으면
   **틈이 가장 좁은 쌍부터 합친다** — 쪼개진 반쪽 사이 틈은 아이콘 사이
   틈보다 언제나 좁다.
3. 시트에 **얇은 격자 구분선**이 그려져 있다. 알파가 낮아서 문턱으로 무시한다.
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "어플 UI 이미지")

#: 이 알파 아래는 배경·격자선으로 본다. 아이콘 본체는 훨씬 진하다.
FLOOR = 40

#: 저장 전에 알파를 이 값에서 잘라 0~255로 다시 편다.
#:
#: ⚠️ 원본 알파는 **깨끗한 컷아웃이 아니다.** 시안이 그린 발광이 알파의 완만한
#: 꼬리로 들어 있고, 그 구간의 RGB는 짙은 갈색이다. 그대로 두면 어두운 카드
#: 위에서 아이콘 뒤에 **갈색 얼룩**으로 보인다 (2026-08-07 사용자가 세 번 지적).
#: 시트 위쪽 두 줄이 유독 심했다 — 원본 글로우가 그 영역에서 가장 밝다.
#:
#: ⚠️ 색을 단색으로 칠해 해결하려 한 적이 있는데, 그건 원화를 죽인다(흰 실루엣·
#: 주황 불꽃이 전부 골드가 됐다). **알파만** 손대는 것이 맞다.
ALPHA_CUT = 80

# (파일, 열 수)
#
# ⚠️ 2026-08-07 **2차 시안**으로 교체했다. 1차(`부위별 이미지.png` 등)는 획이
#    가늘어(28px에서 1px) 화면에서 흐렸다 — `docs/ui-icon-asset-guide.md` §0.
#    2차는 시트를 뜻대로 나눠 받았고, 그래서 아래 `ASSETS` 매핑이 통째로 바뀌었다.
SHEETS = {
    "hub": ("허브.png", 3),
    "part": ("부위별.png", 3),
    "situ": ("상황별.png", 3),
    "tab": ("탭바.png", 5),
    "chal": ("챌린지.png", 4),
    "misc": ("스트릭친구.png", 2),
}

HERO = "Codex 이미지 2026년 8월 7일 오후 02_59_40.png"

# 자산 이름 ← 시트 칸.
#
# ⚠️ `situ-beginner`만 `part` 시트에서 온다 — 상황 시트에 '처음 운동해요'에
#    맞는 그림이 없고, 부위 시트의 전신 실루엣이 "아직 어디를 할지 모르는
#    사람"에 가장 가깝다.
#
# ⚠️ 탭은 **2행=비활성(테두리) · 3행=활성(채움)**을 쓴다. 1행은 밝은 배경에
#    올려진 같은 그림이라 어두운 탭바에서 대비가 죽는다.
ASSETS = {
    # 운동 추가 허브
    "ui-icons/hub-situation": "hub-r1c1",  # 과녁 + 다트
    "ui-icons/hub-part": "hub-r1c2",  # 토르소
    "ui-icons/hub-search": "hub-r1c3",  # 돋보기
    "ui-icons/hub-past": "hub-r2c1",  # 되돌아가는 시계
    "ui-icons/hub-routine": "hub-r2c2",  # 체크리스트
    "ui-icons/hub-tabata": "hub-r2c3",  # 불붙은 스톱워치
    # 부위별 추천
    "ui-icons/part-chest": "part-r1c1",
    "ui-icons/part-back": "part-r1c2",
    "ui-icons/part-legs": "part-r1c3",
    "ui-icons/part-shoulders": "part-r2c1",
    "ui-icons/part-arms": "part-r2c2",
    "ui-icons/part-core": "part-r2c3",
    # 상황별 추천
    "ui-icons/situ-beginner": "situ-r1c1",  # 전신 실루엣
    "ui-icons/situ-challenge": "situ-r1c2",  # 과녁 + 화살
    "ui-icons/situ-no-machines": "situ-r1c3",  # 물음표 + 덤벨
    "ui-icons/situ-home": "situ-r2c1",  # 집
    "ui-icons/situ-short": "situ-r2c2",  # 스톱워치
    "ui-icons/situ-cardio": "situ-r2c3",  # 심장 + 맥박
    # 하단 탭 — 1행=비활성(속 빈 외곽선) · 2행=활성(골드 채움)
    #
    # ⚠️ 2차 1판 탭 시트는 **4열이라 다섯째 탭(내 정보)이 없었고**, 비활성/활성이
    #    형태가 같고 색조만 달랐다(면적차 0.0~0.6%p). 2판에서 둘 다 고쳐 받았다 —
    #    5열이고, 1행은 속이 비어 있다. `tab-bar.tsx` 주석이 말하는 "속이 찬
    #    그림이라 색을 못 봐도 안다"가 이제 실제로 성립한다.
    "ui-icons/tab-home": "tab-r1c1",
    "ui-icons/tab-feed": "tab-r1c2",
    "ui-icons/tab-record": "tab-r1c3",
    "ui-icons/tab-challenge": "tab-r1c4",
    "ui-icons/tab-profile": "tab-r1c5",
    "ui-icons/tab-home-active": "tab-r2c1",
    "ui-icons/tab-feed-active": "tab-r2c2",
    "ui-icons/tab-record-active": "tab-r2c3",
    "ui-icons/tab-challenge-active": "tab-r2c4",
    "ui-icons/tab-profile-active": "tab-r2c5",
    # 스트릭 · 친구
    #
    # ⚠️ 불꽃이 **두 벌**인 것이 핵심이다. 스트릭 카드는 원래
    #    `streak > 0 ? "🔥" : "🪵"`(불꽃/장작)로 갈렸는데, 장작은 "아직 안 붙은
    #    불"이라는 뜻을 화면에서 스스로 설명하지 못했다. 같은 불꽃의 **꺼진 판**을
    #    쓰면 켜진 것과 나란히 놓였을 때 뜻이 바로 읽힌다.
    "ui-icons/streak-on": "misc-r1c1",  # 채워진 불꽃
    "ui-icons/streak-off": "misc-r1c2",  # 같은 형태의 꺼진(테두리) 불꽃
    "ui-icons/friends": "misc-r2c1",  # 친구 목록 헤딩
    "ui-icons/friends-add": "misc-r2c2",  # 플러스 붙은 판 — 부르기·빈 상태
    # 챌린지 탭 (2026-08-07 추가 시안)
    "ui-icons/lock": "chal-r1c1",
    "ui-icons/finish": "chal-r1c2",  # 체커 깃발
    "ui-icons/thumbsup": "chal-r1c3",
    "ui-icons/trash": "chal-r1c4",
    "ui-icons/handshake": "chal-r2c1",
    "ui-icons/warning": "chal-r2c2",
    "ui-icons/camera": "chal-r2c3",
    "ui-icons/crown": "chal-r2c4",
    # 챌린지 탭이 쓰는, 다른 시트에 이미 있는 셋.
    # ⚠️ `tab-*`·`situ-*` 경로를 그대로 재사용하지 않는다 — 챌린지 화면의 트로피가
    #    `tab-challenge-active`라는 이름을 참조하면, 나중에 탭바 그림만 바꾸려다
    #    챌린지 화면까지 같이 바뀐다. 뜻이 다르면 파일도 나눈다.
    "ui-icons/goal": "situ-r1c2",  # 과녁 + 화살
    "ui-icons/trophy": "tab-r2c4",
    "ui-icons/person": "tab-r2c5",  # 채워진 사람 흉상
}

ICON_SIZE = 256  # 화면에서 26~40px로 그리므로 3배 밀도까지 넉넉히 덮는다


def solid_mask(rgba):
    """격자선·잔광을 뺀 '아이콘 본체' 마스크."""
    return rgba.split()[3].point(lambda v: 255 if v >= FLOOR else 0)


def bands(mask, axis, min_run):
    """마스크를 한 축으로 투영해 내용이 있는 (시작, 끝) 구간들을 돌려준다.

    ⚠️ `max`가 아니라 **문턱을 넘는 픽셀 개수**로 센다. max면 노이즈 한 점이
    띠를 살려 둬서 `부위별`의 네 줄이 통째로 한 띠로 붙는다.
    """
    w, h = mask.size
    px = mask.load()
    need = max(3, w // 150)
    span = h if axis == "y" else w

    def count(i):
        rng = range(w) if axis == "y" else range(h)
        return sum(1 for j in rng if (px[j, i] if axis == "y" else px[i, j]))

    out, start = [], None
    for i in range(span):
        if count(i) >= need:
            if start is None:
                start = i
        elif start is not None:
            if i - start >= min_run:
                out.append((start, i))
            start = None
    if start is not None and span - start >= min_run:
        out.append((start, span))
    return out


def merge_to(runs, want):
    """칸이 기대보다 많으면 **틈이 가장 좁은 쌍부터** 합친다."""
    runs = list(runs)
    while len(runs) > want:
        i = min(range(len(runs) - 1), key=lambda j: runs[j + 1][0] - runs[j][1])
        runs[i : i + 2] = [(runs[i][0], runs[i + 1][1])]
    return runs


def cut_glow(cell, t=ALPHA_CUT):
    """알파 꼬리(발광)를 잘라 낸다. **RGB는 건드리지 않는다** — `ALPHA_CUT` 참조."""
    a = cell.split()[3]
    span = 255 - t
    cell.putalpha(
        a.point(lambda v: 0 if v <= t else min(255, (v - t) * 255 // span))
    )
    return cell


def square(cell, size=ICON_SIZE, pad=0.05):
    """알파 여백을 잘라 정사각 캔버스 가운데에 **같은 비율로** 놓는다.

    ⚠️ 예전엔 `cell.thumbnail(...)`이었는데 **thumbnail은 축소만 한다.** 글로우를
    잘라 내면 몸통이 작아지는데 그것을 그대로 둬서, 256px 캔버스 안 아이콘이
    123~193px로 제각각이었다. 40px 자리에 얹히면 실제로는 19~30px로 그려져
    **아이콘마다 크기가 달랐다.**

    배지 스크립트(`slice-badge-sheets.mjs`)가 같은 함정을 겪고 `CORE_FRAC`으로
    풀었다 — 축소·확대를 **둘 다** 해서 몸통이 캔버스의 일정 비율을 차지하게 한다.
    확대가 화질을 만들어 주지는 않지만, 나란히 놓인 아이콘이 같은 크기로 보이는
    것은 그것대로 필요하다.
    """
    cell = cut_glow(cell)
    bbox = cell.split()[3].getbbox()
    if bbox:
        cell = cell.crop(bbox)
    inner = int(size * (1 - pad * 2))
    scale = inner / max(cell.width, cell.height)
    cell = cell.resize(
        (max(1, round(cell.width * scale)), max(1, round(cell.height * scale))),
        Image.LANCZOS,
    )
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(cell, ((size - cell.width) // 2, (size - cell.height) // 2), cell)
    return canvas


def slice_sheet(name, filename, cols):
    # ⚠️ `convert("RGB")`로 알파를 버리지 마라 — 모듈 주석의 가장 큰 함정이다.
    sheet = Image.open(os.path.join(SRC, filename)).convert("RGBA")
    mask = solid_mask(sheet)
    w, h = sheet.size
    min_run, cap = min(w, h) // 30, min(w, h) // 40

    cells = {}
    rows = bands(mask, "y", min_run)
    for ri, (y0, y1) in enumerate(rows, 1):
        strip = mask.crop((0, max(0, y0 - cap), w, min(h, y1 + cap)))
        found = bands(strip, "x", min_run)
        if len(found) < cols:
            raise SystemExit(f"{name} {ri}행: 열 {len(found)}개만 찾았다 (기대 {cols})")
        for ci, (x0, x1) in enumerate(merge_to(found, cols), 1):
            box = (
                max(0, x0 - cap),
                max(0, y0 - cap),
                min(w, x1 + cap),
                min(h, y1 + cap),
            )
            cells[f"{name}-r{ri}c{ci}"] = square(sheet.crop(box))
    return cells


def main():
    cells = {}
    for name, (filename, cols) in SHEETS.items():
        got = slice_sheet(name, filename, cols)
        print(f"{name}: {len(got)}칸")
        cells.update(got)

    if "--preview" in sys.argv:
        # ⚠️ **실제 표시 크기로** 본다. 192px 대지에서만 보고 넘어갔다가
        #    화면의 28px에서 흐린 것을 사용자가 잡았다(2026-08-07).
        SIZES = [26, 40, 96]
        CELL_W, ROW_H, GAP, PER = sum(SIZES) + 30, max(SIZES) + 14, 10, 5
        keys = list(ASSETS.values())
        n = (len(keys) + PER - 1) // PER
        board = Image.new(
            "RGB",
            (PER * (CELL_W + GAP) + GAP, n * (ROW_H + GAP) + GAP),
            (24, 24, 27),  # 카드 배경(bg-surface-2)에 가깝게
        )
        for i, cell in enumerate(keys):
            x = GAP + (i % PER) * (CELL_W + GAP)
            y = GAP + (i // PER) * (ROW_H + GAP)
            for s in SIZES:
                r = cells[cell].resize((s, s), Image.LANCZOS)
                board.paste(r, (x, y + (ROW_H - s) // 2), r)
                x += s + 10
        board.save(os.path.join(ROOT, "icon-preview.png"))
        print(f"미리보기: {len(keys)}개 · 크기 {SIZES}")
        return

    missing = [c for c in ASSETS.values() if c not in cells]
    if missing:
        raise SystemExit(f"칸을 찾지 못했다: {missing}")

    total = 0
    for dest, cell in ASSETS.items():
        path = os.path.join(ROOT, "public", dest + ".webp")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        cells[cell].save(path, "WEBP", quality=90, method=6)
        total += os.path.getsize(path)
    print(f"아이콘 {len(ASSETS)}개 · 합계 {total/1024:.0f} KB")

    hero = Image.open(os.path.join(SRC, HERO)).convert("RGB")
    hero.thumbnail((1200, 1200), Image.LANCZOS)
    hp = os.path.join(ROOT, "public", "record-assets", "exercise-picker-hero.webp")
    os.makedirs(os.path.dirname(hp), exist_ok=True)
    hero.save(hp, "WEBP", quality=82, method=6)
    print(f"히어로 {hero.size} · {os.path.getsize(hp)/1024:.0f} KB")


if __name__ == "__main__":
    main()
