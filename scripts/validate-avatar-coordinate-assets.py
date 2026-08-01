import json
from pathlib import Path

from PIL import Image


ROOT = Path.cwd()
MASTER_WIDTH = 1024
MASTER_HEIGHT = 1536
BASE = ROOT / "public/avatar-coordinate-v2/base/avatar-base-master.png"
ITEMS = ROOT / "public/avatar-coordinate-v2/items"
THUMBNAILS = ROOT / "public/avatar-coordinate-v2/thumbnails"
PLACEMENT = ROOT / "src/lib/domain/avatar-coordinate-manifest.json"
QA = ROOT / "docs/design-sources/avatar-coordinate-v2/qa"


def validate_rgba(path: Path, expected_size: tuple[int, int] | None = None) -> Image.Image:
    image = Image.open(path)
    if image.mode != "RGBA":
        raise RuntimeError(f"{path}: expected RGBA, got {image.mode}")
    if expected_size and image.size != expected_size:
        raise RuntimeError(f"{path}: expected {expected_size}, got {image.size}")
    alpha = image.getchannel("A")
    if alpha.getbbox() is None:
        raise RuntimeError(f"{path}: empty alpha")
    corners = [
        alpha.getpixel((0, 0)),
        alpha.getpixel((image.width - 1, 0)),
        alpha.getpixel((0, image.height - 1)),
        alpha.getpixel((image.width - 1, image.height - 1)),
    ]
    if any(value > 8 for value in corners):
        raise RuntimeError(f"{path}: opaque corner {corners}")
    return image.convert("RGBA")


base = validate_rgba(BASE, (MASTER_WIDTH, MASTER_HEIGHT))
placements = json.loads(PLACEMENT.read_text(encoding="utf-8"))
if len(placements) != 6:
    raise RuntimeError(f"expected 6 items, got {len(placements)}")

layers: list[tuple[int, Image.Image, int, int, int, int]] = []
for item_id, placement in placements.items():
    path = ITEMS / f"{item_id}.png"
    image = validate_rgba(path, (placement["assetWidth"], placement["assetHeight"]))
    x, y = placement["x"], placement["y"]
    width, height = placement["width"], placement["height"]
    if x < 0 or y < 0 or width <= 0 or height <= 0:
        raise RuntimeError(f"{item_id}: invalid placement")
    if x + width > MASTER_WIDTH or y + height > MASTER_HEIGHT:
        raise RuntimeError(f"{item_id}: exceeds master canvas")
    layers.append((placement["z"], image, x, y, width, height))
    print(f"PASS {item_id}: RGBA {image.width}x{image.height} -> {x},{y} {width}x{height}")
    thumbnail = validate_rgba(THUMBNAILS / f"{item_id}.webp", (192, 192))
    if (THUMBNAILS / f"{item_id}.webp").stat().st_size > 20_000:
        raise RuntimeError(f"{item_id}: thumbnail exceeds 20KB")
    print(f"PASS {item_id} thumbnail: RGBA 192x192")

QA.mkdir(parents=True, exist_ok=True)
for name, color in [("all-items-light.png", "#f6f1e5"), ("all-items-dark.png", "#11151a")]:
    canvas = Image.new("RGBA", (MASTER_WIDTH, MASTER_HEIGHT), color)
    canvas.alpha_composite(base)
    for _, image, x, y, width, height in sorted(layers, key=lambda layer: layer[0]):
        resized = image.resize((width, height), Image.Resampling.LANCZOS)
        canvas.alpha_composite(resized, (x, y))
    canvas.convert("RGB").save(QA / name, quality=95)
    print(f"Wrote {QA / name}")

cap = placements["gnd-cap-v2"]
cap_image = validate_rgba(
    ITEMS / "gnd-cap-v2.png",
    (cap["assetWidth"], cap["assetHeight"]),
).resize((cap["width"], cap["height"]), Image.Resampling.LANCZOS)
for name, color in [("cap-only-light.png", "#f6f1e5"), ("cap-only-dark.png", "#11151a")]:
    canvas = Image.new("RGBA", (MASTER_WIDTH, MASTER_HEIGHT), color)
    canvas.alpha_composite(base)
    canvas.alpha_composite(cap_image, (cap["x"], cap["y"]))
    canvas.convert("RGB").save(QA / name, quality=95)
    print(f"Wrote {QA / name}")

print("PASS base: RGBA 1024x1536")
print("PASS all avatar coordinate assets")
