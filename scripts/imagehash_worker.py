#!/usr/bin/env python3
"""
Stdin-piped perceptual image hash worker for asset-dedup-image-hash.

Usage:
    python3 imagehash_worker.py <impl> <hash_size>

Reads raw image bytes from stdin, computes the requested perceptual hash
using the `imagehash` library, and writes the resulting hex string to
stdout. No temp files are created — image bytes are streamed in and
processed via an in-memory buffer.

Exit codes:
    0  success, hash written to stdout
    1  the input could not be decoded/processed as an image
    2  invalid arguments (unsupported impl, non-integer/non-positive/impl-incompatible
       hash_size, wrong argc, or any other unexpected failure unrelated to the input data)

On any non-zero exit, an explanation is written to stderr; the calling
Node.js process (see src/infrastructure/hasher/imagehashRunner.ts) surfaces
exit code 1 as `corrupt_input` and exit code 2 as `internal_error`.

`compute_hash` is the testable core: given already-validated arguments, it
turns image bytes into a hash string, or raises. `main` owns only argv/stdin
parsing and the exit-code mapping — see scripts/tests/test_imagehash_worker.py
for unit tests against compute_hash directly, plus a handful of subprocess-
level tests against main() for the exit-code contract itself.
"""
import io
import sys

from PIL import Image, ImageOps, UnidentifiedImageError
import imagehash

# Maps the `impl` argument (as sent in a socket request's `config.algorithm`) to the
# corresponding `imagehash` module function. Keys must exactly match the
# ImagehashAlgorithm constants in src/domain/model/algorithm.model.ts.
SUPPORTED_IMPLS = {
    "phash": imagehash.phash,
    "dhash": imagehash.dhash,
    "average_hash": imagehash.average_hash,
    "whash": imagehash.whash,
}

MIN_HASH_SIZE = 2


def _validate_hash_size(impl_name: str, hash_size: int) -> str | None:
    """Returns an error message if hash_size is invalid for the given impl, else None."""
    if hash_size < MIN_HASH_SIZE:
        return f"invalid hash_size for \"{impl_name}\" (must be >= {MIN_HASH_SIZE}): {hash_size}"
    if impl_name == "whash" and hash_size & (hash_size - 1) != 0:
        return f"invalid hash_size for \"whash\" (must be a power of 2): {hash_size}"

    return None


def compute_hash(data: bytes, hash_fn, hash_size: int) -> str:
    """
    Turns raw image bytes into a hex hash string using an already-resolved
    hash function (one of the values in SUPPORTED_IMPLS) and hash_size.

    Raises:
        ValueError            — data is empty.
        UnidentifiedImageError — data is not a recognizable image format.
        OSError                — data looked like an image but failed to load
                                  (e.g. truncated file).

    All three map to exit code 1 in main() — they're "bad input data"
    failures, distinct from the exit-code-2 "bad arguments" failures that
    main() rejects before ever calling this function.
    """
    if not data:
        raise ValueError("no image data received")

    image = Image.open(io.BytesIO(data))
    # Rotates/flips the pixel buffer to match what a browser or photo viewer
    # actually displays, per the EXIF Orientation tag, and strips the tag
    # from the result. A no-op for images with no EXIF orientation data
    # (most PNG/GIF, most non-camera JPEGs) — safe to always apply.
    image = ImageOps.exif_transpose(image)
    image.load()

    return str(hash_fn(image, hash_size=hash_size))


def main() -> int:
    if len(sys.argv) != 3:
        sys.stderr.write("usage: imagehash_worker.py <impl> <hash_size>\n")
        return 2

    impl_name = sys.argv[1]
    hash_fn = SUPPORTED_IMPLS.get(impl_name)
    if hash_fn is None:
        supported = ", ".join(sorted(SUPPORTED_IMPLS))
        sys.stderr.write(f"unsupported impl \"{impl_name}\" (supported: {supported})\n")
        return 2

    try:
        hash_size = int(sys.argv[2])
    except ValueError:
        sys.stderr.write(f"invalid hash_size (must be an integer): {sys.argv[2]}\n")
        return 2

    if hash_size <= 0:
        sys.stderr.write(f"invalid hash_size (must be positive): {hash_size}\n")
        return 2

    size_error = _validate_hash_size(impl_name, hash_size)
    if size_error is not None:
        sys.stderr.write(f"{size_error}\n")
        return 2

    data = sys.stdin.buffer.read()

    try:
        result_hash = compute_hash(data, hash_fn, hash_size)
    except ValueError as err:
        sys.stderr.write(f"{err}\n")
        return 1
    except UnidentifiedImageError:
        sys.stderr.write("could not identify image file (corrupt or unsupported format)\n")
        return 1
    except OSError as err:
        sys.stderr.write(f"failed to load image: {err}\n")
        return 1
    except Exception as err:
        sys.stderr.write(f"unexpected error computing hash: {err}\n")
        return 2

    sys.stdout.write(result_hash)
    return 0


if __name__ == "__main__":
    sys.exit(main())
