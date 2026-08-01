import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path.cwd()
SOURCE = ROOT / "docs/design-sources/avatar-coordinate-v2/base/avatar-base-master.png"
DATA = ROOT / "docs/design-sources/avatar-coordinate-v2/base/landmarks.json"
OUTPUT = ROOT / "docs/design-sources/avatar-coordinate-v2/qa/landmark-guide.png"


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.truetype("arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


landmarks = json.loads(DATA.read_text(encoding="utf-8"))
avatar = Image.open(SOURCE).convert("RGBA")
canvas = Image.new("RGBA", avatar.size, "#20252b")
canvas.alpha_composite(avatar)
draw = ImageDraw.Draw(canvas)

for name, region in landmarks["regions"].items():
    x = region["x"]
    y = region["y"]
    width = region["width"]
    height = region["height"]
    draw.rectangle((x, y, x + width, y + height), outline="#00e5ff", width=4)
    draw.text((x + 6, y + 6), name, fill="#00e5ff", font=font(20), stroke_width=2, stroke_fill="#000000")

for name, point in landmarks["points"].items():
    x = point["x"]
    y = point["y"]
    draw.ellipse((x - 7, y - 7, x + 7, y + 7), fill="#ff2d55", outline="white", width=2)
    draw.text((x + 10, y - 24), name, fill="white", font=font(18), stroke_width=2, stroke_fill="#000000")

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
canvas.convert("RGB").save(OUTPUT, quality=95)
print(f"Wrote {OUTPUT}")
