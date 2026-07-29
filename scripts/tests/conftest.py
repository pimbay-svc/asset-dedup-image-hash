import io
import sys
from pathlib import Path

import pytest
from PIL import Image

# imagehash_worker.py lives one directory up from tests/, and isn't an
# installed package — insert its directory directly rather than requiring
# an editable install or PYTHONPATH env var for local/CI runs to agree.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _solid_image_bytes(width: int, height: int, mark_corner: bool = True) -> bytes:
    """
    A simple, deterministic JPEG: white background with a red square in the
    top-left corner. The corner mark makes the image asymmetric, so a test
    can tell "rotated" from "not rotated" by hash difference alone, without
    needing pixel-level inspection.
    """
    image = Image.new("RGB", (width, height), "white")
    if mark_corner:
        mark_size = min(20, width // 2, height // 2)
        for x in range(mark_size):
            for y in range(mark_size):
                image.putpixel((x, y), (255, 0, 0))

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=95)

    return buffer.getvalue()


@pytest.fixture
def upright_jpeg_bytes() -> bytes:
    return _solid_image_bytes(64, 96)


@pytest.fixture
def rotated_jpeg_with_exif_bytes() -> bytes:
    """
    Same visual content as upright_jpeg_bytes, but physically stored rotated
    90°, with an EXIF Orientation tag (8) instructing viewers to rotate it
    back — the same shape a real phone-camera photo takes when the sensor
    captured landscape data while the phone was held upright. A correct
    exif-aware hasher must treat this as visually identical to the upright
    version; a naive one (raw pixels only) will not.
    """
    piexif = pytest.importorskip("piexif", reason="only needed to author EXIF test fixtures")

    image = Image.new("RGB", (64, 96), "white")
    for x in range(20):
        for y in range(20):
            image.putpixel((x, y), (255, 0, 0))
    rotated = image.rotate(-90, expand=True)

    exif_bytes = piexif.dump({"0th": {piexif.ImageIFD.Orientation: 8}})
    buffer = io.BytesIO()
    rotated.save(buffer, format="JPEG", quality=95, exif=exif_bytes)

    return buffer.getvalue()


@pytest.fixture
def plain_png_bytes() -> bytes:
    """PNG carries no EXIF orientation data — used to confirm the fix is a no-op here."""
    image = Image.new("RGB", (64, 64), "blue")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")

    return buffer.getvalue()
