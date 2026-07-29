#!/usr/bin/env bash
# Usage: scripts/dev/hash.sh --image <path> [--algorithm <algo>] [--hash-size <n>] [--socket-path <path>]
#
# All parameters are named flags and can be given in any order. --image is the only required one.
#
# Examples:
#   scripts/dev/hash.sh --image /shared/asset-abc123/frame-0.png
#   scripts/dev/hash.sh --image /shared/asset-abc123/frame-0.png --algorithm dhash
#   scripts/dev/hash.sh --algorithm phash --hash-size 16 --image /shared/asset-abc123/frame-0.png
#   scripts/dev/hash.sh --socket-path /sockets/image-hash.sock --image /shared/asset-abc123/frame-0.png --algorithm phash --hash-size 16
#
# IMAGE_PATH must already be a path this extension can read directly — i.e. somewhere on the shared
# volume, not a path on your host machine. Only the path is sent over the socket, never file bytes.
set -euo pipefail

usage() {
  echo "usage: hash.sh --image <image-path-on-shared-volume> [--algorithm <algo>] [--hash-size <n>] [--socket-path <path>]" >&2
  exit 1
}

IMAGE_PATH=""
ALGORITHM="phash"
HASH_SIZE="8"
SOCKET_PATH="./var/dev/image-hash.sock"

while [ $# -gt 0 ]; do
  case "$1" in
    --image)
      IMAGE_PATH="${2:?--image requires a value}"
      shift 2
      ;;
    --algorithm)
      ALGORITHM="${2:?--algorithm requires a value}"
      shift 2
      ;;
    --hash-size)
      HASH_SIZE="${2:?--hash-size requires a value}"
      shift 2
      ;;
    --socket-path)
      SOCKET_PATH="${2:?--socket-path requires a value}"
      shift 2
      ;;
    -h | --help)
      usage
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage
      ;;
  esac
done

[ -n "$IMAGE_PATH" ] || usage

echo "hash op -> $SOCKET_PATH  (path: $IMAGE_PATH, algorithm: $ALGORITHM, hash_size: $HASH_SIZE)" >&2

npx tsx "$(dirname "$0")/hash-client.ts" "$SOCKET_PATH" "$IMAGE_PATH" "$ALGORITHM" "$HASH_SIZE"
