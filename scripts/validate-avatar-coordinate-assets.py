import json
import math
from pathlib import Path

from PIL import Image


MASTER_WIDTH = 1024
MASTER_HEIGHT = 1536
ITEM_COUNT = 6


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


def require_positive_integer(value: object, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise RuntimeError(f"{name}: expected a positive integer")
    return value


def require_positive_finite_number(value: object, name: str) -> int | float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RuntimeError(f"{name}: expected a positive finite number")
    if not math.isfinite(value) or value <= 0:
        raise RuntimeError(f"{name}: expected a positive finite number")
    if value != int(value):
        raise RuntimeError(f"{name}: expected a whole-pixel value")
    return value


def resolve_layer_source(root: Path, item_id: str, layer_id: str, src: object) -> Path:
    label = f"{item_id}/{layer_id}"
    if not isinstance(src, str) or not src:
        raise RuntimeError(f"{label}: missing required src")
    if not src.startswith("/avatar-coordinate-v2/"):
        raise RuntimeError(f"{label}: src must start with /avatar-coordinate-v2/: {src}")

    public_root = (root / "public").resolve()
    path = (public_root / src.lstrip("/")).resolve()
    if not path.is_relative_to(public_root):
        raise RuntimeError(f"{label}: src escapes public: {src}")
    if not path.is_file():
        raise RuntimeError(f"{label}: missing layer file {path}")
    return path


def validate_avatar_coordinate_assets(root: Path) -> None:
    root = root.resolve()
    base_path = root / "public/avatar-coordinate-v2/base/avatar-base-master.png"
    items_directory = root / "public/avatar-coordinate-v2/items"
    thumbnails_directory = root / "public/avatar-coordinate-v2/thumbnails"
    manifest_path = root / "src/lib/domain/avatar-coordinate-manifest.json"
    qa_directory = root / "docs/design-sources/avatar-coordinate-v2/qa"

    base = validate_rgba(base_path, (MASTER_WIDTH, MASTER_HEIGHT))
    placements = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(placements, dict):
        raise RuntimeError("manifest: expected an item object")
    if len(placements) != ITEM_COUNT:
        raise RuntimeError(f"expected {ITEM_COUNT} items, got {len(placements)}")

    layers: list[tuple[int | float, Image.Image, int, int, int, int]] = []
    cap_layers: list[tuple[int | float, Image.Image, int, int, int, int]] = []
    for item_id, item in placements.items():
        if not isinstance(item_id, str) or not item_id:
            raise RuntimeError("manifest: item id must be a nonempty string")
        if not isinstance(item, dict):
            raise RuntimeError(f"{item_id}: expected an item object")
        if not isinstance(item.get("slot"), str) or not item["slot"]:
            raise RuntimeError(f"{item_id}: missing nonempty slot")
        item_layers = item.get("layers")
        if not isinstance(item_layers, list) or not item_layers:
            raise RuntimeError(f"{item_id}: expected nonempty layers")

        layer_ids: set[str] = set()
        for layer in item_layers:
            if not isinstance(layer, dict):
                raise RuntimeError(f"{item_id}: each layer must be an object")
            layer_id = layer.get("id")
            if not isinstance(layer_id, str) or not layer_id:
                raise RuntimeError(f"{item_id}: layer id must be a nonempty string")
            if layer_id in layer_ids:
                raise RuntimeError(f"{item_id}: duplicate layer id {layer_id}")
            layer_ids.add(layer_id)

            label = f"{item_id}/{layer_id}"
            path = resolve_layer_source(root, item_id, layer_id, layer.get("src"))
            asset_width = require_positive_integer(layer.get("assetWidth"), f"{label}: assetWidth")
            asset_height = require_positive_integer(layer.get("assetHeight"), f"{label}: assetHeight")
            try:
                image = validate_rgba(path, (asset_width, asset_height))
            except RuntimeError as error:
                raise RuntimeError(f"{label}: {error}") from error

            x = require_positive_finite_number(layer.get("x"), f"{label}: x")
            y = require_positive_finite_number(layer.get("y"), f"{label}: y")
            width = require_positive_finite_number(layer.get("width"), f"{label}: width")
            height = require_positive_finite_number(layer.get("height"), f"{label}: height")
            z = require_positive_finite_number(layer.get("z"), f"{label}: z")
            if x + width > MASTER_WIDTH or y + height > MASTER_HEIGHT:
                raise RuntimeError(f"{label}: exceeds master canvas")

            composed_layer = (z, image, int(x), int(y), int(width), int(height))
            layers.append(composed_layer)
            if item_id == "gnd-cap-v2":
                cap_layers.append(composed_layer)
            print(
                f"PASS {label}: RGBA {image.width}x{image.height} -> "
                f"{int(x)},{int(y)} {int(width)}x{int(height)}"
            )

        thumbnail = validate_rgba(thumbnails_directory / f"{item_id}.webp", (192, 192))
        if (thumbnails_directory / f"{item_id}.webp").stat().st_size > 20_000:
            raise RuntimeError(f"{item_id}: thumbnail exceeds 20KB")
        print(f"PASS {item_id} thumbnail: RGBA {thumbnail.width}x{thumbnail.height}")

    if not cap_layers:
        raise RuntimeError("gnd-cap-v2: expected at least one layer")
    if not items_directory.is_dir():
        raise RuntimeError(f"missing items directory {items_directory}")

    qa_directory.mkdir(parents=True, exist_ok=True)
    for name, color in [("all-items-light.png", "#f6f1e5"), ("all-items-dark.png", "#11151a")]:
        canvas = Image.new("RGBA", (MASTER_WIDTH, MASTER_HEIGHT), color)
        canvas.alpha_composite(base)
        for _, image, x, y, width, height in sorted(layers, key=lambda layer: layer[0]):
            canvas.alpha_composite(image.resize((width, height), Image.Resampling.LANCZOS), (x, y))
        canvas.convert("RGB").save(qa_directory / name, quality=95)
        print(f"Wrote {qa_directory / name}")

    for name, color in [("cap-only-light.png", "#f6f1e5"), ("cap-only-dark.png", "#11151a")]:
        canvas = Image.new("RGBA", (MASTER_WIDTH, MASTER_HEIGHT), color)
        canvas.alpha_composite(base)
        for _, image, x, y, width, height in sorted(cap_layers, key=lambda layer: layer[0]):
            canvas.alpha_composite(image.resize((width, height), Image.Resampling.LANCZOS), (x, y))
        canvas.convert("RGB").save(qa_directory / name, quality=95)
        print(f"Wrote {qa_directory / name}")

    print("PASS base: RGBA 1024x1536")
    print("PASS all avatar coordinate assets")


if __name__ == "__main__":
    validate_avatar_coordinate_assets(Path.cwd())
