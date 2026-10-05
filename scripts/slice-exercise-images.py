# -*- coding: utf-8 -*-
"""사용자가 준 운동 이미지 시트(2행 5열)를 칸별로 잘라 중간 PNG를 만든다 (2026-10-05).

    python scripts/slice-exercise-images.py            # 운동 이미지/_sliced/{slug}.png
    python scripts/slice-exercise-images.py --preview  # 48px·96px 대지만 낸다

앱 자산(`public/exercise-images/{운동ID}.webp`)은 이 결과와 Codex 파일럿 PASS를 합쳐
`scripts/build-exercise-images.py`가 만든다. 여기서는 자르기만 한다.

원본 시트는 `운동 이미지/`에 있고 **저장소에 커밋하지 않는다**(.gitignore).
이 스크립트는 그 원본에서 만든 결과물을 재현하기 위한 기록이다.
프롬프트는 `docs/exercise-image-prompts.md`, 이름↔파일 연결은
`src/lib/domain/exercise-images.ts`가 갖는다.

──────────────────────────────────────────────────────────────────────
시트 화풍 (사용자 확정 2026-10-05)
──────────────────────────────────────────────────────────────────────
GPT가 만든 **회색 3D 인체 + 파란 근육 강조 + 회색 기구**, 어두운 단색 배경,
2행 5열. 배경째 쓰는 화풍이라 알파가 없다(시트가 RGB JPEG여도 된다).
타일은 시트 배경색으로 채운 정사각형이고 화면에서 둥근 모서리로 잘린다.

⚠️ 함정 — `slice-ui-icons.py`에서 배운 것과 같다
1. **행을 균등 분할하지 않는다.** 행 사이 틈이 좁아 잉크 투영 문턱을 넘기면
   두 행이 한 덩어리로 잡힌다. 세로 가운데 구간에서 잉크가 가장 적은 줄로 가른다.
2. **열을 그냥 검출하면 쪼개진다.** 페이스 풀처럼 사람과 케이블 머신 사이가
   비면 한 칸이 둘로 잡힌다. 기대 칸 수보다 많으면 **틈이 가장 좁은 쌍부터 합친다.**
3. 배경이 완전한 단색이 아니다. 행마다 좌우 가장자리 중앙값을 배경으로 본다.
4. 칸이 시트 가장자리에 붙어 있으면 정사각형 크롭이 시트 밖으로 나간다.
   밖은 검정이 아니라 **배경색**으로 채워야 타일 테두리에 띠가 안 생긴다.
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "운동 이미지")
OUT = os.path.join(SRC, "_sliced")  # .gitignore(`/운동 이미지/`) 안

#: 미리보기 대지용 크기 (앱 자산 크기는 build-exercise-images.py가 정한다)
SIZE = 160
#: 그림 둘레 여백 (그림 긴 변 대비)
MARGIN = 1.06
#: 배경과 이만큼(RGB 합) 다르면 그림으로 본다
INK = 40

# 시트 파일 → 칸 순서(왼쪽 위 → 오른쪽 아래)대로 파일 이름. None은 쓰지 않는 칸.
#
# ⚠️ `시트1.png`(같은 10종의 이전 판, 회청색 배경)는 쓰지 않는다. 아래 `전신 …`
#    판이 남색 배경이라 가슴 시트와 톤이 맞고, 4번이 상체를 숙인 리어 레터럴
#    레이즈로 다시 그려져 카탈로그와 맞는다. 시트1의 4번(허리 세운 레터럴)은
#    맞는 운동이 없어 버렸다(사용자 결정 A, 2026-10-05).
SHEETS = {
    "전신 운동 근육 인포그래픽 콜라주.png": [
        "lat-pulldown",
        "face-pull",
        "seated-cable-row",
        "seated-dumbbell-rear-lateral-raise",
        "treadmill",
        "ab-rollout",
        "bench-press",
        "barbell-back-squat",
        "deadlift",
        "overhead-press",
    ],
    "10가지 가슴 운동 해부학 인포그래픽.png": [
        "knee-push-up",
        "dumbbell-bench-press",
        "dumbbell-squeeze-press",
        "dumbbell-pullover",
        "incline-dumbbell-fly",
        "decline-dumbbell-fly",
        # 디클라인 벤치에서 덤벨 프레스 — 카탈로그에 없다(바벨판 '디클라인 벤치프레스'만 있다)
        None,
        "incline-bench-press-machine",
        "decline-push-up",
        "standing-cable-fly",
    ],
}
ROWS, COLS = 2, 5


def runs(on, minlen, gapmin):
    segs, s = [], None
    for i, v in enumerate(on):
        if v and s is None:
            s = i
        if not v and s is not None:
            segs.append([s, i])
            s = None
    if s is not None:
        segs.append([s, len(on)])
    merged = []
    for sg in segs:
        if merged and sg[0] - merged[-1][1] < gapmin:
            merged[-1][1] = sg[1]
        else:
            merged.append(sg)
    return [m for m in merged if m[1] - m[0] >= minlen]


def find_grid_lines(gray, axis, n):
    """칸 구분선이 그려진 시트면 선 위치를, 아니면 None.

    선은 이웃보다 밝은 1~3px 봉우리다. 그림 속 기구 기둥도 봉우리를 만들므로
    **기대 위치(균등 분할선) 근처에서 가장 강한 것**만 받고, 그것도 문턱을
    넘어야 선으로 본다(2026-10-05 측정: 선 33~53 → 문턱 30. 선 없는 `시트1.png`는
    기대 위치 근처 봉우리가 30을 못 넘어 None이 나온다).
    """
    prof = gray.mean(axis=axis)
    smooth = np.convolve(prof, np.ones(15) / 15, mode="same")
    d = prof - smooth
    size = len(prof)
    lines = []
    for k in range(1, n):
        c = int(size * k / n)
        lo, hi = c - int(size * 0.06), c + int(size * 0.06)
        i = lo + int(np.argmax(d[lo:hi]))
        if d[i] < 30:
            return None
        lines.append(i)
    return lines


def tile_from_cell(im, a, x0, y0, x1, y1):
    """구분선 안쪽 한 칸에서 그림 둘레를 정사각형으로 잘라 낸다 (칸 밖은 배경색)."""
    cell = a[y0:y1, x0:x1]
    ring = np.concatenate([cell[:3].reshape(-1, 3), cell[-3:].reshape(-1, 3),
                           cell[:, :3].reshape(-1, 3), cell[:, -3:].reshape(-1, 3)])
    bg = np.median(ring, axis=0)
    mask = np.abs(cell - bg).sum(axis=2) > INK
    cols = runs(mask.sum(axis=0) > 2, 10, 40)
    rows = runs(mask.sum(axis=1) > 2, 10, 40)
    c0, c1 = cols[0][0], cols[-1][1]
    r0, r1 = rows[0][0], rows[-1][1]
    side = int(max(c1 - c0, r1 - r0) * MARGIN)
    sx = (c0 + c1) // 2 - side // 2
    sy = (r0 + r1) // 2 - side // 2
    ch, cw = cell.shape[:2]
    tile = Image.new("RGB", (side, side), tuple(int(v) for v in bg))
    crop = im.crop((x0 + max(sx, 0), y0 + max(sy, 0),
                    x0 + min(sx + side, cw), y0 + min(sy + side, ch)))
    tile.paste(crop, (max(-sx, 0), max(-sy, 0)))
    return tile


def slice_sheet(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(int)
    h, w, _ = a.shape

    # 구분선이 그려진 시트(2026-10-05 두 번째 묶음부터)는 선을 따라 나눈다.
    # 선을 그림으로 오인하면 잉크 검출이 칸 전체를 한 덩어리로 잡는다.
    gray = a.mean(axis=2)
    vx = find_grid_lines(gray, 0, COLS)
    hy = find_grid_lines(gray, 1, ROWS)
    if vx and hy:
        xs, ys = [0, *vx, w], [0, *hy, h]
        inset = 6  # 선 자체와 그 번짐을 칸에서 뺀다
        return [
            tile_from_cell(im, a, xs[c] + inset, ys[r] + inset, xs[c + 1] - inset, ys[r + 1] - inset)
            for r in range(ROWS)
            for c in range(COLS)
        ]

    edge = np.concatenate([a[:, :15], a[:, -15:]], axis=1)
    bg_row = np.median(edge, axis=1)
    mask = np.abs(a - bg_row[:, None, :]).sum(axis=2) > INK

    ink = mask.sum(axis=1)
    lo, hi = int(h * 0.35), int(h * 0.65)
    split = min(range(lo, hi), key=lambda y: ink[y])

    cells = []
    for y0, y1 in ((0, split), (split, h)):
        sub = mask[y0:y1]
        cols = runs(sub.sum(axis=0) > 3, 60, 25)
        while len(cols) > COLS:
            k = min(range(len(cols) - 1), key=lambda j: cols[j + 1][0] - cols[j][1])
            cols[k] = [cols[k][0], cols[k + 1][1]]
            del cols[k + 1]
        if len(cols) != COLS:
            raise SystemExit(f"{path}: 한 행에서 {len(cols)}칸을 찾았다 (기대 {COLS})")
        for c0, c1 in cols:
            rr = runs(sub[:, c0:c1].sum(axis=1) > 2, 40, 40)
            cells.append((c0, rr[0][0] + y0, c1, rr[-1][1] + y0))

    bg = tuple(int(x) for x in bg_row[h // 2])
    tiles = []
    for c0, r0, c1, r1 in cells:
        side = int(max(c1 - c0, r1 - r0) * MARGIN)
        x0 = (c0 + c1) // 2 - side // 2
        y0 = (r0 + r1) // 2 - side // 2
        tile = Image.new("RGB", (side, side), bg)
        crop = im.crop((max(x0, 0), max(y0, 0), min(x0 + side, w), min(y0 + side, h)))
        tile.paste(crop, (max(-x0, 0), max(-y0, 0)))
        tiles.append(tile)
    return tiles


def main():
    preview = "--preview" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    all_tiles = []
    for sheet, names in SHEETS.items():
        if len(names) != ROWS * COLS:
            raise SystemExit(f"{sheet}: 이름이 {len(names)}개다 (기대 {ROWS * COLS})")
        tiles = slice_sheet(os.path.join(SRC, sheet))
        for name, tile in zip(names, tiles):
            if name is None:
                continue
            all_tiles.append(tile.resize((SIZE, SIZE), Image.LANCZOS))
            if not preview:
                tile.save(os.path.join(OUT, f"{name}.png"))
                print(f"{name}.png  {tile.width}px")
    if preview:
        card = (0x21, 0x1F, 0x18)
        for size in (48, 96):
            n = len(all_tiles)
            board = Image.new("RGB", (n * (size + 12) + 12, size + 24), card)
            for i, t in enumerate(all_tiles):
                board.paste(t.resize((size, size), Image.LANCZOS), (12 + i * (size + 12), 12))
            board.save(os.path.join(ROOT, f"exercise-images-preview-{size}.png"))


if __name__ == "__main__":
    main()
