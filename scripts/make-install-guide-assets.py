# 설치 안내 스크린샷 — 크롭 + 빨간 표시 + webp 저장.
#
# ⚠️ 원본 PNG는 **git에 없다.** 장당 1~3MB이고 이 저장소는 design-sources에
#    문서만 두기 때문이다(docs/design-sources/install-guide/README.md 참고).
#    산출물인 webp(전부 합쳐 18KB)는 커밋돼 있으므로 **빌드·배포에는 지장이 없다.**
#    이 스크립트는 사진을 다시 만들 때만 필요하고, 그때는 원본을 다시 찍어야 한다.
#
# ⚠️ 자르기 좌표는 **아이폰 1170×2532 세로** 기준이다. 다른 해상도로 찍으면
#    좌표를 다시 잡아야 한다.
from PIL import Image, ImageDraw
import os

SRC = "docs/design-sources/install-guide"
OUT = "public/onboarding/install"
os.makedirs(OUT, exist_ok=True)

RED = (255, 59, 48)
TARGET_W = 640


def build(src, box, mark, name, ratio_pad=0):
    """crop → 폭 640으로 축소 → 축소된 좌표계에서 빨간 표시 → webp."""
    path = os.path.join(SRC, src)
    if not os.path.exists(path):
        # ⚠️ 조용히 넘어가면 옛 webp가 남은 채 "다시 만들었다"고 착각한다.
        raise SystemExit(
            f"""원본이 없습니다: {path}

원본 PNG는 git에 없습니다(장당 1~3MB). 무엇을 어떻게 찍어야 하는지는
  {SRC}/README.md
에 적혀 있습니다.

앱에 들어가는 webp는 이미 커밋돼 있으니, 사진을 바꾸려는 것이 아니라면
이 스크립트를 돌릴 필요가 없습니다."""
        )
    im = Image.open(path).convert("RGB").crop(box)
    w, h = im.size
    scale = TARGET_W / w
    im = im.resize((TARGET_W, round(h * scale)), Image.LANCZOS)

    d = ImageDraw.Draw(im)
    l, t, r, b = [round(v * scale) for v in mark]
    # 둥근 사각형 2겹 — 밝은 배경/어두운 배경 어디서도 보이게 흰 테두리를 깐다
    d.rounded_rectangle([l - 3, t - 3, r + 3, b + 3], radius=18, outline=(255, 255, 255), width=9)
    d.rounded_rectangle([l, t, r, b], radius=16, outline=RED, width=6)

    p = os.path.join(OUT, name)
    im.save(p, "WEBP", quality=84, method=6)
    print(f"{name:26} {im.size}  {os.path.getsize(p)/1024:.0f}KB")


# ① 카톡 하단바 — 맨 오른쪽 공유 버튼
build(
    "kakao-inapp-login.png",
    (0, 2285, 1170, 2420),
    (1020, 20, 1150, 130),
    "step-kakao-share.webp",
)

# ② 카톡 공유시트 — Safari로 열기
build(
    "kakao-share-sheet-clean.png",
    (40, 1150, 820, 1460),
    (10, 25, 180, 290),
    "step-open-safari.webp",
)

# ③ 사파리 공유시트 — 홈 화면에 추가
build(
    "safari-share-sheet.png",
    (55, 2030, 1110, 2205),
    (20, 32, 1000, 152),
    "step-add-home.webp",
)

# ⚠️ ④ 사파리 하단바의 **점 3개(···)** — 2026-08-21 사장님이 실물로 잡아준 것.
#    카톡에서 `Safari로 열기`로 넘어온 사파리는 하단바에 **공유 버튼이 없다.**
#    `< | 주소 ⟳ | ···` 이고 공유는 `···` 안에 들어 있다. 처음 만든 안내가
#    "맨 아래 공유 버튼"이라 **첫 단계부터 틀렸었다.**
build(
    "safari-bottombar-more.png",
    (0, 2270, 1170, 2440),
    (912, 8, 1088, 162),
    "step-safari-more.webp",
)
