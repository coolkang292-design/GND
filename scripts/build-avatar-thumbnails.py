from pathlib import Path

from PIL import Image


ROOT = Path.cwd()
SOURCE = ROOT / "docs/design-sources/avatar-coordinate-v2/items"
OUTPUT = ROOT / "public/avatar-coordinate-v2/thumbnails"
SIZE = 192
PADDING = 12

OUTPUT.mkdir(parents=True, exist_ok=True)
for source in sorted(SOURCE.glob("gnd-*-v2.png")):
    image = Image.open(source).convert("RGBA")
    image.thumbnail((SIZE - PADDING * 2, SIZE - PADDING * 2), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    x = (SIZE - image.width) // 2
    y = (SIZE - image.height) // 2
    canvas.alpha_composite(image, (x, y))
    target = OUTPUT / f"{source.stem}.webp"
    canvas.save(target, "WEBP", quality=82, method=6)
    print(f"WROTE {target}: {target.stat().st_size} bytes")
