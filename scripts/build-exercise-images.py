# -*- coding: utf-8 -*-
"""운동 그림 앱 자산을 만든다 — `public/exercise-images/{운동ID}.webp` + 연결표 JSON (2026-10-05).

    python scripts/build-exercise-images.py

두 출처를 합친다.
1. **Codex 파일럿 PASS** — `운동 이미지/GPT 생성된 이미지/전체NN_UUID_파일매핑.json`(누적,
   2026-10-05 두 번째 묶음부터 누적 파일을 쓴다 — 80 → 120 → 160. 첫 묶음은 `운동_UUID_파일매핑.json`)에서
   `final_qa == "PASS"`이고 file이 있는 행만. 인수인계서 지시대로 **운동 ID(UUID)로** 잇는다.
2. **사용자 시트에서 자른 것** — `scripts/slice-exercise-images.py`가 만든
   `운동 이미지/_sliced/{slug}.png`. 아래 `SLICED`가 slug → 카탈로그 이름을 잇는다.

겹치면 **Codex PASS가 이긴다**(운동마다 개별 생성·검수를 거쳤다). 사용자 시트는
Codex에 없는 운동만 채운다(2026-10-05 기준 10개 — 랫풀다운은 Codex가 FAIL).

이름 → 운동 ID는 `data/exercise-image-manifest.json`에서 찾는다. 이 매니페스트의
시드 335개 (ID, 이름) 쌍은 2026-10-05 운영 DB와 해시까지 같음을 확인했다.

⚠️ 가장자리 조각 지우기 — Codex 검수가 놓친 것
2×2 원본을 칸으로 자르면서 **옆 칸의 조각**(원판·머리·기구)이 가장자리에 남은
PASS가 4장 있었다(푸시업·사이드 런지·마운틴 클라이머·덤벨 풀오버, 2026-10-05).
주 그림과 빈 띠로 떨어져 **가장자리에 붙은 작은 덩어리**만 배경색으로 덮는다.
원본 파일은 건드리지 않는다.
"""
import hashlib
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "운동 이미지")
CODEX = os.path.join(SRC, "GPT 생성된 이미지")
SLICED_DIR = os.path.join(SRC, "_sliced")
OUT = os.path.join(ROOT, "public", "exercise-images")
DATA = os.path.join(ROOT, "src", "lib", "domain", "exercise-images.data.json")
MANIFEST = os.path.join(ROOT, "data", "exercise-image-manifest.json")
#: Codex 누적 매핑. 행의 `file`은 CODEX 폴더 기준 상대 경로다(묶음별 하위 폴더 포함).
CODEX_MAPPING = "전체160_UUID_파일매핑.json"

#: 가장 크게 그리는 곳은 운동 중 화면 72px(2026-10-05 추가)다. 폰 3배 밀도에서도 흐리지
#: 않게 320px로 둔다(이전 160px은 48px 목록 기준이었다). 목록·카드는 next/image가 줄여 보낸다.
SIZE = 320
INK = 60

#: 사용자 시트 slug → 카탈로그 이름들 (같은 운동의 다른 이름은 같은 그림)
SLICED = {
    "lat-pulldown": ["랫풀다운"],
    "face-pull": ["페이스풀"],
    "seated-cable-row": ["시티드 로우"],
    "seated-dumbbell-rear-lateral-raise": ["시티드 덤벨 리어 레터럴 레이즈"],
    "treadmill": ["트레드밀"],
    "ab-rollout": ["복근 롤아웃"],
    "bench-press": ["벤치프레스"],
    "barbell-back-squat": ["스쿼트", "바벨 백스쿼트"],
    "deadlift": ["데드리프트", "컨벤셔널 데드리프트"],
    "overhead-press": ["오버헤드 프레스"],
    "knee-push-up": ["니 푸시업"],
    "dumbbell-bench-press": ["덤벨 벤치프레스"],
    "dumbbell-squeeze-press": ["덤벨 스퀴즈 프레스"],
    "dumbbell-pullover": ["덤벨 풀오버"],
    "incline-dumbbell-fly": ["인클라인 덤벨 플라이"],
    "decline-dumbbell-fly": ["디클라인 덤벨 플라이"],
    "incline-bench-press-machine": ["인클라인 벤치프레스 머신"],
    "decline-push-up": ["디클라인 푸시업"],
    "standing-cable-fly": ["스탠딩 케이블 플라이"],
}

#: Codex PASS인데 동작이 틀려 **사용자 시트판을 대신 쓰는** 운동 (이름 → 이유).
#: 여기 있는 이름은 Codex 쪽을 건너뛴다. 이유를 반드시 적는다.
PREFER_SHEET = {
    # 2026-10-05 Codex 081-120: 상체를 세운 정면 자세 + 앞·옆 어깨 강조 → 앉은 사이드
    # 레터럴이다. 리어 레터럴은 상체를 숙이고 뒤 어깨를 써야 한다(시트판이 그 자세).
    "시티드 덤벨 리어 레터럴 레이즈": "upright seated lateral, not bent-over rear",
}

#: 누적 매핑 밖에서 온 Codex 묶음 (폴더, 매핑 파일). 행의 `file`은 그 폴더 기준 상대 경로이고
#: `\`가 섞여 있다. FAIL·file 없음은 건너뛴다. `final_qa`가 비어 있는 행은 `status`로 본다
#: (REUSE_READY = 사용자가 같은 동작이라고 확인한 기존 그림 재사용, NEW_PASS = 새 생성 통과).
#: 2026-10-05: 기록누락(과거 기록에 나온 운동 18개 — 직접 만든 운동 6개 포함, 사용자 확인 범위)
#:             인터벌누락(공식 인터벌 종목 7개 — 하이 니는 여기 PASS가 최신 후보)
EXTRA_BATCHES = [
    ("기록누락_2026-10-05", "적용가능_UUID_파일매핑.json"),
    ("인터벌누락_2026-10-05", "적용가능_UUID_파일매핑.json"),
    # 공식 프로그램 7개 중 유일하게 비어 있던 레그 컬(= 엎드려 하는 라잉 레그 컬 머신, 사용자 정의)
    ("마지막추가_레그컬_2026-10-05", "적용가능_UUID_파일매핑.json"),
]

#: Codex 그림을 같은 운동의 다른 이름에도 붙인다 (원래 이름 → 별칭들)
ALIASES = {
    "스쿼트": ["바벨 백스쿼트"],
    "데드리프트": ["컨벤셔널 데드리프트"],
}


# Generated resistance-band exercises added to the user catalog on 2026-10-09.
# Keep these UUID-matched images when rebuilding; custom exercise names stay private in the app JSON.
MANUAL_CUSTOM_IMAGE_IDS = [
    "4f47934b-e7a8-4618-8d24-085ebc297dde",
    "bef0d91e-ea01-4817-b00e-e5978a5bdbe8",
    "e5835092-9ce2-4cd6-ae4e-e71cde1d7583",
    "3ac56225-c8be-49bb-9997-5360e651882d",
    "aaf1b8e3-e12e-4d6f-846c-c1fd2cec768d",
]


# Manually approved app thumbnail for the catalog's machine-specific DY row.
# Preserve the checked-in source file when regenerating the UUID image map.
MANUAL_SEED_IMAGES = {
    "50aa51d7-6b63-4b88-a117-76a635d447ee": "DY 로우 머신",
}


def runs(on, gapmin):
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
    return merged


def erase_edge_fragments(im):
    """주 그림과 빈 띠로 떨어진, 가장자리에 붙은 작은 덩어리를 배경색으로 덮는다."""
    a = np.asarray(im).astype(int)
    h, w, _ = a.shape
    corners = np.concatenate([a[:6, :6].reshape(-1, 3), a[:6, -6:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    mask = np.abs(a - bg).sum(axis=2) > INK
    out = a.copy()
    erased = []
    for axis, size in ((1, h), (0, w)):  # axis=1 → 행 투영(위/아래), 0 → 열 투영(좌/우)
        segs = runs(mask.sum(axis=axis) > 2, gapmin=8)
        if len(segs) < 2:
            continue
        main = max(segs, key=lambda sg: sg[1] - sg[0])
        for sg in segs:
            touches_edge = sg[0] == 0 or sg[1] == size
            small = (sg[1] - sg[0]) < size * 0.15
            if sg is not main and touches_edge and small:
                if axis == 1:
                    out[sg[0]:sg[1], :] = bg
                else:
                    out[:, sg[0]:sg[1]] = bg
                erased.append(("행" if axis == 1 else "열", sg[0], sg[1]))
    return Image.fromarray(out.astype("uint8")), erased


def save(img, uuid):
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    img.save(os.path.join(OUT, f"{uuid}.webp"), "WEBP", quality=82, method=6)


def main():
    seeds = [e for e in json.load(open(MANIFEST, encoding="utf8"))["exercises"] if e["scope"] == "seed"]
    id_by_name = {e["name"]: e["exercise_id"] for e in seeds}
    name_by_id = {e["exercise_id"]: e["name"] for e in seeds}

    os.makedirs(OUT, exist_ok=True)
    data = {}

    # 1) Codex PASS
    rows = json.load(open(os.path.join(CODEX, CODEX_MAPPING), encoding="utf8"))
    for r in rows:
        if r.get("final_qa") != "PASS" or not r.get("file"):
            continue
        if r["name"] in PREFER_SHEET:
            print(f"Codex 판 건너뜀(시트판 우선)  {r['name']}: {PREFER_SHEET[r['name']]}")
            continue
        uid = r["exercise_id"]
        if name_by_id.get(uid) != r["name"]:
            raise SystemExit(f"Codex 행의 ID·이름이 매니페스트와 다르다: {uid} {r['name']}")
        img, erased = erase_edge_fragments(Image.open(os.path.join(CODEX, r["file"])).convert("RGB"))
        if erased:
            print(f"가장자리 조각 지움  {r['name']}: {erased}")
        save(img, uid)
        data[uid] = {"name": r["name"], "file": uid, "source": "gnd", "origin": "codex-pilot"}
        for alias in ALIASES.get(r["name"], []):
            data[id_by_name[alias]] = {"name": alias, "file": uid, "source": "gnd", "origin": "codex-pilot"}

    # 1-b) 누적 매핑 밖의 Codex 묶음 — 기본 운동은 매니페스트 이름과, 직접 만든 운동은
    #      '시드에 없는 ID'인지 대조한다. 직접 만든 운동의 이름은 남의 데이터라 연결표에 적지 않는다.
    for folder, mapping in EXTRA_BATCHES:
        base = os.path.join(CODEX, folder)
        for r in json.load(open(os.path.join(base, mapping), encoding="utf8")):
            ok = r.get("final_qa") == "PASS" or r.get("status") in ("NEW_PASS", "REUSE_READY")
            if not ok or r.get("final_qa") == "FAIL" or not r.get("file"):
                continue
            uid = r["exercise_id"]
            custom = uid not in name_by_id
            if not custom and name_by_id[uid] != r["name"]:
                raise SystemExit(f"{folder}: ID·이름이 매니페스트와 다르다: {uid} {r['name']}")
            path = os.path.join(base, r["file"].replace("\\", "/"))
            if r.get("sha256"):
                digest = hashlib.sha256(open(path, "rb").read()).hexdigest()
                if digest != r["sha256"]:
                    raise SystemExit(f"{folder}: 해시가 다르다 {r['name']} {path}")
            img, erased = erase_edge_fragments(Image.open(path).convert("RGB"))
            if erased:
                print(f"가장자리 조각 지움  {r['name']}: {erased}")
            save(img, uid)
            data[uid] = {
                "name": "" if custom else r["name"],
                "file": uid,
                "source": "gnd",
                "origin": f"codex-{folder}",
                **({"custom": True} if custom else {}),
            }

    # 2) 사용자 시트 — Codex에 없는 운동만
    for slug, names in SLICED.items():
        ids = [id_by_name[n] for n in names]
        todo = [(n, i) for n, i in zip(names, ids) if i not in data]
        if not todo:
            continue
        path = os.path.join(SLICED_DIR, f"{slug}.png")
        img, erased = erase_edge_fragments(Image.open(path).convert("RGB"))
        if erased:
            print(f"가장자리 조각 지움  {slug}: {erased}")
        file_id = todo[0][1]
        save(img, file_id)
        for n, i in todo:
            data[i] = {"name": n, "file": file_id, "source": "gnd", "origin": "user-sheet"}

    # 3) User-created band exercises with approved dark anatomical thumbnails.
    # Files are checked into public/exercise-images and must survive regeneration.
    for uid in MANUAL_CUSTOM_IMAGE_IDS:
        path = os.path.join(OUT, f"{uid}.webp")
        if not os.path.isfile(path):
            raise SystemExit(f"Custom band image missing: {uid}")
        with Image.open(path) as img:
            if img.format != "WEBP" or img.size != (SIZE, SIZE):
                raise SystemExit(f"Wrong band image format/dimensions: {uid}")
        data[uid] = {
            "name": "",
            "file": uid,
            "source": "gnd",
            "origin": "gnd-band-custom-2026-10-09",
            "custom": True,
        }

    # 4) Approved, checked-in seed exercise images not in the older source batches.
    for uid, name in MANUAL_SEED_IMAGES.items():
        if name_by_id.get(uid) != name:
            raise SystemExit(f"Manual seed ID/name mismatch: {uid} {name}")
        if uid in data:
            raise SystemExit(f"Manual seed ID collides with generated image: {uid}")
        path = os.path.join(OUT, f"{uid}.webp")
        if not os.path.isfile(path):
            raise SystemExit(f"Manual exercise thumbnail missing: {uid}")
        with Image.open(path) as img:
            if img.format != "WEBP" or img.size != (SIZE, SIZE):
                raise SystemExit(f"Wrong manual image format/dimensions: {uid}")
        data[uid] = {
            "name": name,
            "file": uid,
            "source": "gnd",
            "origin": "gnd-dy-row-2026-10-09",
        }

    # 연결표에 없는 낡은 파일 정리 (이 폴더는 이 스크립트만 쓴다)
    keep = {f"{v['file']}.webp" for v in data.values()}
    for f in os.listdir(OUT):
        if f not in keep:
            os.remove(os.path.join(OUT, f))

    ordered = dict(sorted(data.items(), key=lambda kv: (kv[1].get("custom", False), kv[1]["name"], kv[0])))
    with open(DATA, "w", encoding="utf8") as fh:
        json.dump(ordered, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    files = len(keep)
    kb = sum(os.path.getsize(os.path.join(OUT, f)) for f in keep) // 1024
    origins = {}
    for v in data.values():
        origins[v["origin"]] = origins.get(v["origin"], 0) + 1
    print(f"운동 {len(data)}개 · 그림 {files}장 · {kb}KB · 출처 {origins}")


if __name__ == "__main__":
    main()
