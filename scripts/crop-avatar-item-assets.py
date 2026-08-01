import json
from pathlib import Path

from PIL import Image


ROOT = Path.cwd()
FULL_DIR = ROOT / "docs/design-sources/avatar-coordinate-v2/items/full"
OUTPUT_DIR = ROOT / "docs/design-sources/avatar-coordinate-v2/items"
PUBLIC_DIR = ROOT / "public/avatar-coordinate-v2/items"
PADDING = 4

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

bounds: dict[str, dict[str, int]] = {}
for source in sorted(FULL_DIR.glob("*.png")):
    image = Image.open(source).convert("RGBA")
    alpha_bbox = image.getchannel("A").getbbox()
    if alpha_bbox is None:
        raise RuntimeError(f"empty alpha image: {source}")

    left = max(0, alpha_bbox[0] - PADDING)
    top = max(0, alpha_bbox[1] - PADDING)
    right = min(image.width, alpha_bbox[2] + PADDING)
    bottom = min(image.height, alpha_bbox[3] + PADDING)
    cropped = image.crop((left, top, right, bottom))
    output = OUTPUT_DIR / source.name
    public = PUBLIC_DIR / source.name
    cropped.save(output)
    cropped.save(public)
    bounds[source.stem] = {
        "sourceX": left,
        "sourceY": top,
        "sourceWidth": right - left,
        "sourceHeight": bottom - top,
    }
    print(f"CROPPED {source.stem}: {cropped.width}x{cropped.height}")

(OUTPUT_DIR / "asset-bounds.json").write_text(
    json.dumps(bounds, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(f"Wrote {OUTPUT_DIR / 'asset-bounds.json'}")
