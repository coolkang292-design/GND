import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

from PIL import Image


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
VALIDATOR_PATH = REPOSITORY_ROOT / "scripts/validate-avatar-coordinate-assets.py"


def write_rgba(path: Path, size: tuple[int, int], color: tuple[int, int, int, int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    image.putpixel((size[0] // 2, size[1] // 2), color)
    image.save(path)


def load_validator(root: Path):
    previous_cwd = Path.cwd()
    os.chdir(root)
    try:
        spec = importlib.util.spec_from_file_location("avatar_coordinate_asset_validator", VALIDATOR_PATH)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        os.chdir(previous_cwd)


class ValidateAvatarCoordinateAssetsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        write_rgba(
            self.root / "public/avatar-coordinate-v2/base/avatar-base-master.png",
            (1024, 1536),
            (10, 20, 30, 255),
        )

        items: dict[str, dict[str, object]] = {}
        for index, item_id in enumerate(
            [
                "gnd-cap-v2",
                "gnd-sunglasses-v2",
                "gnd-hoodie-v2",
                "gnd-joggers-v2",
                "gnd-sneakers-v2",
                "gnd-watch-v2",
            ]
        ):
            thumbnail = self.root / f"public/avatar-coordinate-v2/thumbnails/{item_id}.webp"
            thumbnail.parent.mkdir(parents=True, exist_ok=True)
            thumbnail_image = Image.new("RGBA", (192, 192), (0, 0, 0, 0))
            thumbnail_image.putpixel((96, 96), (10, 20, 30, 255))
            thumbnail_image.save(thumbnail, format="WEBP", lossless=True)

            if item_id == "gnd-cap-v2":
                items[item_id] = {
                    "slot": "head",
                    "layers": [
                        {
                            "id": "crown",
                            "src": "/avatar-coordinate-v2/items/gnd-cap-v2/crown.png",
                            "assetWidth": 4,
                            "assetHeight": 4,
                            "x": 10,
                            "y": 10,
                            "width": 4,
                            "height": 4,
                            "z": 40,
                        },
                        {
                            "id": "brim",
                            "src": "/avatar-coordinate-v2/items/gnd-cap-v2/brim.png",
                            "assetWidth": 4,
                            "assetHeight": 4,
                            "x": 10,
                            "y": 10,
                            "width": 4,
                            "height": 4,
                            "z": 50,
                        },
                    ],
                }
                write_rgba(
                    self.root / "public/avatar-coordinate-v2/items/gnd-cap-v2/crown.png",
                    (4, 4),
                    (255, 0, 0, 255),
                )
                continue

            items[item_id] = {
                "slot": f"slot-{index}",
                "layers": [
                    {
                        "id": "main",
                        "src": f"/avatar-coordinate-v2/items/{item_id}.png",
                        "assetWidth": 4,
                        "assetHeight": 4,
                        "x": 100 + index * 10,
                        "y": 100,
                        "width": 4,
                        "height": 4,
                        "z": 30,
                    }
                ],
            }
            write_rgba(
                self.root / f"public/avatar-coordinate-v2/items/{item_id}.png",
                (4, 4),
                (0, 255, 0, 255),
            )

        manifest_path = self.root / "src/lib/domain/avatar-coordinate-manifest.json"
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(items), encoding="utf-8")

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_requires_every_layer_and_composes_in_z_order(self) -> None:
        validator = load_validator(self.root)

        with self.assertRaisesRegex(RuntimeError, r"gnd-cap-v2.*brim.*brim\.png"):
            validator.validate_avatar_coordinate_assets(self.root)

        write_rgba(
            self.root / "public/avatar-coordinate-v2/items/gnd-cap-v2/brim.png",
            (4, 4),
            (0, 0, 255, 255),
        )
        validator.validate_avatar_coordinate_assets(self.root)

        for filename in ["all-items-light.png", "all-items-dark.png", "cap-only-light.png", "cap-only-dark.png"]:
            qa_image = Image.open(self.root / f"docs/design-sources/avatar-coordinate-v2/qa/{filename}")
            self.assertEqual(qa_image.getpixel((12, 12)), (0, 0, 255))


if __name__ == "__main__":
    unittest.main()
