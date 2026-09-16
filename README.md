# asset-dedup-image-hash

[![Docker Image](https://img.shields.io/badge/docker.io-pimbay%2Fasset--dedup--image--hash-blue?style=flat-square&logo=docker)](https://hub.docker.com/r/pimbay/asset-dedup-image-hash)
[![Node Version](https://img.shields.io/badge/node-%3E%3D24-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Unlicense-green?style=flat-square)](LICENSE)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen?style=flat-square)](https://codeberg.org/pimbay-svc/asset-dedup-image-hash)
[![Mutation Score](https://img.shields.io/badge/MSI-100%25-brightgreen?style=flat-square)](https://codeberg.org/pimbay-svc/asset-dedup-image-hash)

Perceptual-image-hashing extension for `asset-dedup-core`.
Given one or more image paths on a shared volume, it computes a perceptual hash per image and returns it — nothing is written to disk.
`core` decides which algorithm to use and sends this service only an explicit `algorithm`/`hash_size` per request; combining hashes or calling other extensions is out of scope here.
Communication is a single persistent connection from `core` (this service is the server), length-prefixed JSON frames over a Unix domain socket — never HTTP.

## Quick Start (Local)

```bash
git clone https://codeberg.org/pimbay-svc/asset-dedup-image-hash
cd asset-dedup-image-hash
npm install
cp .env.example .env
npm run dev
```

Requires Python 3 with `scripts/requirements.txt` installed — a local venv is the easiest way, and `.env.example` already points `PYTHON_BIN` at it:

```bash
python3 -m venv scripts/.venv
scripts/.venv/bin/pip install -r scripts/requirements.txt
```

## Quick Start (Docker)

```bash
docker compose up --build
```

Builds the image (Node runtime + Python 3 + `scripts/requirements.txt` in the same container, see `docker/Dockerfile`) and mounts two named volumes shared with `asset-dedup-core`: one for the socket file, one (read-only — this service never writes to it) for source images.
No TCP port is published — the only interface this service has is the socket file on the shared volume.

Published images (built from the same tag, pushed to both registries on release — see `.github/workflows/release.yml`):

```bash
docker pull pimbay/asset-dedup-image-hash:latest
docker pull ghcr.io/pimbay-svc/asset-dedup-image-hash:latest
```

Full container reference (volumes, tags, standalone `docker run`): **[docker/README.md](docker/README.md)**.

## Usage

The smallest useful thing this service does: hash one local file over the socket and see its result.
`scripts/dev/hash.sh` sends a `hash` op directly to a running instance — no full `core` client setup needed.

```bash
scripts/dev/hash.sh --image /shared/photo.jpg --algorithm phash --hash-size 16 --socket-path /path/to/image-hash.sock
```

```text
hash op -> /path/to/image-hash.sock  (path: /shared/photo.jpg, algorithm: phash, hash_size: 16)
{
  "outputs": {
    "id1": {
      "hash": "9139c4f6894d8a1f9b9eea69a2332dc06ca5769670a3131ff66835e3d631893c"
    }
  }
}
```

`--algorithm` (`phash`/`dhash`/`average_hash`/`whash`), `--hash-size`, and `--socket-path` are all optional:

```bash
scripts/dev/hash.sh --image /shared/photo.jpg
scripts/dev/hash.sh --image /shared/photo.jpg --algorithm dhash
scripts/dev/hash.sh --image /shared/photo.jpg --algorithm phash --hash-size 16
scripts/dev/hash.sh --image /shared/photo.jpg --algorithm phash --hash-size 16 --socket-path /sockets/image-hash.sock
```

The image path must already be readable by the running instance — a path on the shared volume, not your host machine; only the path is sent, never file bytes.

## Configuration

| Variable               | Required | Description                                                              |
| ---------------------- | -------- | ------------------------------------------------------------------------ |
| `SOCKET_PATH`          | yes      | Path of the Unix domain socket this service listens on.                  |
| `PYTHON_BIN`           | no       | Python interpreter used to invoke the hashing worker. Default `python3`. |
| `IMAGEHASH_TIMEOUT_MS` | no       | Hard timeout for a single worker invocation. Default `10000`.            |

Full reference (all env vars, incl. `IMAGEHASH_WORKER_PATH`, `NODE_ENV`, `LOG_LEVEL`): **[docs/configuration.md](docs/configuration.md)**.

## API

Not HTTP — a length-prefixed JSON protocol over a private Unix domain socket shared with `asset-dedup-core`; no auth beyond the socket file itself being reachable only on that shared volume.

| Op     | Description                                                                          | Success response       |
| ------ | ------------------------------------------------------------------------------------ | ---------------------- |
| `hash` | Computes a perceptual hash per input image (`phash`/`dhash`/`average_hash`/`whash`). | `{ "outputs": {...} }` |

Full request/response shapes, error codes, and a usage example: **[docs/api.md](docs/api.md)**.

## Testing

```bash
npm run test:unit          # includes real python3 worker runs against test/fixtures/ — nothing mocked at the OS level
npm run test:integration   # real DI container wiring, a real UDS socket pair
npm run test:all           # both
npm run test:coverage      # both, with a coverage report (target: 100%, enforced)
npm run test:mutation      # StrykerJS mutation testing (target: 100% MSI, enforced) — no Python needed
npm run test:python        # pytest against scripts/imagehash_worker.py directly (needs scripts/tests/.venv)
```

`test:unit`/`test:integration` need the Python venv from **Quick Start (Local)**.
`test:python` needs its own, separate venv:

```bash
python3 -m venv scripts/tests/.venv
scripts/tests/.venv/bin/pip install -r scripts/tests/requirements.txt
```

## Development Helpers

```bash
npm run js:lint       # check
npm run js:lint:fix   # fix
npm run js:format     # check
npm run js:format:fix # fix
npm run js:typecheck  # tsc --noEmit
```

## Architecture & Decisions

- **[docs/context.md](docs/context.md)** — current working state: what's in progress, what's next.
- **[docs/DECISIONS.md](docs/DECISIONS.md)** — why things are built the way they are, in the order the decisions were made.
- **[docs/CHANGELOG.md](docs/CHANGELOG.md)** — version history.

## License

Public domain — [Unlicense](LICENSE)

Created by [Jan Sarmir](https://pimbay.dev) · No conditions · No copyright

Bundled third-party dependencies and their licenses: **[docs/THIRD-PARTY-NOTICES.md](docs/THIRD-PARTY-NOTICES.md)**.
