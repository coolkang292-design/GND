# -*- coding: utf-8 -*-
"""부위별 추천 카드 아이콘 6개를 만든다 — `public/part-images/{key}.webp` (2026-10-05).

    python scripts/build-part-icons.py

원본은 Codex가 만든 `운동 이미지/GPT 생성된 이미지/부위별아이콘_2026-10-05/PNG_512/*.png`
(은회색 인체 + 남색 배경 + 파란 대상 근육, 운동 그림과 같은 화풍). 연결표의 SHA-256과
대조한 뒤 160px webp로 줄인다(카드 40px · 3배 밀도 + 여유).

⚠️ `public/ui-icons/part-*.webp`(금색)를 **덮어쓰지 않는다.** 그 파일은 챌린지 목표 설정
화면(`goal-setup-flow.tsx`의 웨이트 = part-arms)과 운동 그림 로딩 실패 대체 아이콘
(`exercise-images.ts`)도 쓴다. 이번 교체는 부위별 추천 카드(`PART_META`)만이다(사용자 지시).
"""
import csv
import hashlib
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "운동 이미지", "GPT 생성된 이미지", "부위별아이콘_2026-10-05")
OUT = os.path.join(ROOT, "public", "part-images")
SIZE = 160


def main():
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(SRC, "부위별_아이콘_연결표.csv"), encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))
    if len(rows) != 6:
        raise SystemExit(f"부위 아이콘이 {len(rows)}개다 (기대 6)")
    for r in rows:
        if r["qa"] != "PASS":
            raise SystemExit(f"{r['body_part']}: QA {r['qa']}")
        path = os.path.join(SRC, r["file"].replace("\\", "/"))
        digest = hashlib.sha256(open(path, "rb").read()).hexdigest()
        if digest != r["sha256"]:
            raise SystemExit(f"{r['body_part']}: 해시가 다르다")
        out = os.path.join(OUT, f"{r['asset_key']}.webp")
        Image.open(path).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS).save(
            out, "WEBP", quality=85, method=6
        )
        print(f"{r['body_part']} → part-images/{r['asset_key']}.webp  {os.path.getsize(out) // 1024}KB")


if __name__ == "__main__":
    main()
