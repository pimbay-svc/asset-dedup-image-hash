import subprocess
import sys
from pathlib import Path

import pytest
from PIL import UnidentifiedImageError

from imagehash_worker import SUPPORTED_IMPLS, compute_hash

WORKER_SCRIPT = Path(__file__).resolve().parent.parent / "imagehash_worker.py"


# ---------------------------------------------------------------------------
# compute_hash() — the testable core, no subprocess involved
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("impl_name", sorted(SUPPORTED_IMPLS))
def test_computes_a_hash_for_every_supported_impl(upright_jpeg_bytes, impl_name):
    hash_fn = SUPPORTED_IMPLS[impl_name]

    result = compute_hash(upright_jpeg_bytes, hash_fn, hash_size=8)

    assert isinstance(result, str)
    assert len(result) == 16  # 8x8 grid -> 64-bit hash -> 16 hex chars
    int(result, 16)  # raises ValueError if not valid hex


def test_hash_size_16_produces_a_256_bit_hash(upright_jpeg_bytes):
    result = compute_hash(upright_jpeg_bytes, SUPPORTED_IMPLS["phash"], hash_size=16)

    assert len(result) == 64  # 16x16 grid -> 256-bit hash -> 64 hex chars


def test_is_deterministic_for_identical_input(upright_jpeg_bytes):
    first = compute_hash(upright_jpeg_bytes, SUPPORTED_IMPLS["phash"], hash_size=8)
    second = compute_hash(upright_jpeg_bytes, SUPPORTED_IMPLS["phash"], hash_size=8)

    assert first == second


def test_raises_value_error_on_empty_data():
    with pytest.raises(ValueError):
        compute_hash(b"", SUPPORTED_IMPLS["phash"], hash_size=8)


def test_raises_unidentified_image_error_on_garbage_bytes():
    with pytest.raises(UnidentifiedImageError):
        compute_hash(b"this is not an image", SUPPORTED_IMPLS["phash"], hash_size=8)


# ---------------------------------------------------------------------------
# EXIF orientation — the actual reason compute_hash exists as a separate,
# directly testable function: this is the behavior the refactor was for.
# ---------------------------------------------------------------------------


def test_exif_rotation_matches_visually_identical_upright_image(
    upright_jpeg_bytes, rotated_jpeg_with_exif_bytes
):
    upright_hash = compute_hash(upright_jpeg_bytes, SUPPORTED_IMPLS["phash"], hash_size=8)
    rotated_hash = compute_hash(rotated_jpeg_with_exif_bytes, SUPPORTED_IMPLS["phash"], hash_size=8)

    assert upright_hash == rotated_hash


def test_png_without_exif_is_unaffected(plain_png_bytes):
    # No orientation tag to apply — exif_transpose must be a no-op, and the
    # hash must simply reflect the pixels as-is.
    result = compute_hash(plain_png_bytes, SUPPORTED_IMPLS["phash"], hash_size=8)

    assert isinstance(result, str)
    assert len(result) == 16


# ---------------------------------------------------------------------------
# CLI / exit-code contract — subprocess-level, exercising main() exactly as
# imagehashRunner.ts invokes it (spawn + stdin + argv + exit code + stdout).
# ---------------------------------------------------------------------------


def run_worker(args: list[str], stdin_bytes: bytes) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(WORKER_SCRIPT), *args],
        input=stdin_bytes,
        capture_output=True,
        timeout=10,
    )


def test_cli_success_writes_hash_to_stdout_with_exit_0(upright_jpeg_bytes):
    result = run_worker(["phash", "8"], upright_jpeg_bytes)

    assert result.returncode == 0
    assert len(result.stdout.decode()) == 16


def test_cli_wrong_argc_exits_2():
    result = run_worker(["phash"], b"")

    assert result.returncode == 2
    assert b"usage:" in result.stderr


def test_cli_unsupported_impl_exits_2(upright_jpeg_bytes):
    result = run_worker(["not-a-real-impl", "8"], upright_jpeg_bytes)

    assert result.returncode == 2
    assert b"unsupported impl" in result.stderr


def test_cli_non_integer_hash_size_exits_2(upright_jpeg_bytes):
    result = run_worker(["phash", "not-a-number"], upright_jpeg_bytes)

    assert result.returncode == 2


def test_cli_non_positive_hash_size_exits_2(upright_jpeg_bytes):
    result = run_worker(["phash", "0"], upright_jpeg_bytes)

    assert result.returncode == 2


@pytest.mark.parametrize("impl_name", sorted(SUPPORTED_IMPLS))
def test_cli_hash_size_below_minimum_exits_2(upright_jpeg_bytes, impl_name):
    # hash_size=1 passes the `<= 0` check but is rejected by every impl's own minimum
    # (imagehash raises ValueError below 2) — this must be a clean exit 2, not exit 1.
    result = run_worker([impl_name, "1"], upright_jpeg_bytes)

    assert result.returncode == 2
    assert b"must be >= 2" in result.stderr


def test_cli_whash_non_power_of_two_hash_size_exits_2(upright_jpeg_bytes):
    result = run_worker(["whash", "10"], upright_jpeg_bytes)

    assert result.returncode == 2
    assert b"power of 2" in result.stderr
    # Regression guard for the original bug: whash's own AssertionError must never leak as
    # an unhandled traceback into stderr.
    assert b"Traceback" not in result.stderr
    assert b"AssertionError" not in result.stderr


def test_cli_whash_power_of_two_hash_size_succeeds(upright_jpeg_bytes):
    result = run_worker(["whash", "16"], upright_jpeg_bytes)

    assert result.returncode == 0
    assert len(result.stdout.decode()) == 64  # 16x16 grid -> 256-bit hash -> 64 hex chars


def test_cli_empty_stdin_exits_1():
    result = run_worker(["phash", "8"], b"")

    assert result.returncode == 1
    assert b"no image data received" in result.stderr


def test_cli_corrupt_image_exits_1():
    result = run_worker(["phash", "8"], b"not an image at all")

    assert result.returncode == 1
    assert b"could not identify image file" in result.stderr
