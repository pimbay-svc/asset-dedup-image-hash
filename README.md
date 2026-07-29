# asset-dedup-image-hash

[![Docker Image](https://img.shields.io/badge/docker.io-pimbay%2Fasset--dedup--image--hash-blue?style=flat-square&logo=docker)](https://hub.docker.com/r/pimbay/asset-dedup-image-hash)
[![Node Version](https://img.shields.io/badge/node-%3E%3D24-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Unlicense-green?style=flat-square)](LICENSE)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen?style=flat-square)](https://codeberg.org/pimbay-svc/asset-dedup-image-hash)
[![Mutation Score](https://img.shields.io/badge/MSI-100%25-brightgreen?style=flat-square)](https://codeberg.org/pimbay-svc/asset-dedup-image-hash)

Perceptual-image-hashing extension for `asset-dedup-core`.
Given one or more image paths on a shared volume, computes a perceptual hash per image and returns it — nothing is written to disk.
Communication is a single persistent Unix-domain-socket connection from `core` (this service is the server), never HTTP — see the cross-repo protocol spec for the full design.

## Quick Start (Local)

Requires Python 3 with `scripts/requirements.txt` installed — a local venv is the easiest way:

```bash
python3 -m venv scripts/.venv
scripts/.venv/bin/pip install -r scripts/requirements.txt
```

```bash
npm install
cp .env.example .env
# edit .env — SOCKET_PATH must point at a path this process can actually write
# (a volume shared with asset-dedup-core in production, any local directory for standalone dev)
# PYTHON_BIN is pre-set in .env.example to scripts/.venv/bin/python3, matching the venv created above
# the parent directory of SOCKET_PATH must already exist — this process does not create it

npm run dev
```

## Quick Start (Docker)

```bash
docker compose up --build
```

Builds the image (Node runtime + Python 3 + `scripts/requirements.txt` in the same container, see `docker/Dockerfile`) and mounts two named volumes shared with `asset-dedup-core`: one for the socket file, one (read-only — this service never writes to it) for source images.
No TCP port is published — the only interface this service has is the socket file on the shared volume.

## Configuration

Env-only.

| Variable               | Required | Description                                                              |
| ---------------------- | -------- | ------------------------------------------------------------------------ |
| `SOCKET_PATH`          | yes      | Path of the Unix domain socket this service listens on.                  |
| `PYTHON_BIN`           | no       | Python interpreter used to invoke the hashing worker. Default `python3`. |
| `IMAGEHASH_TIMEOUT_MS` | no       | Hard timeout for a single worker invocation. Default `10000`.            |

Full reference (all env vars, incl. `IMAGEHASH_WORKER_PATH`): **[docs/configuration.md](docs/configuration.md)**.

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

`npm run test:python` needs its own venv, separate from the one used to run the worker itself — set it up once:

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

```bash
scripts/dev/hash.sh --image /shared/frame-0.png
scripts/dev/hash.sh --image /shared/frame-0.png --algorithm dhash
scripts/dev/hash.sh --image /shared/frame-0.png --algorithm phash --hash-size 16
scripts/dev/hash.sh --image /shared/frame-0.png --algorithm phash --hash-size 16 --socket-path /sockets/image-hash.sock
```

Sends a `hash` op directly to a running instance over the socket — `IMAGE_PATH` must already be readable by this process (a path on the shared volume, not your host machine); only the path is sent, never file bytes.

## Architecture & Decisions

- **[docs/context.md](docs/context.md)** — current working state and non-obvious gotchas.
- **[docs/DECISIONS.md](docs/DECISIONS.md)** — why things are built the way they are, in the order the decisions were made.
- **[docs/CHANGELOG.md](docs/CHANGELOG.md)** — version history.

## License

Public domain — [Unlicense](LICENSE)

Created by [Jan Sarmir](https://pimbay.dev) · No conditions · No copyright

Bundled third-party dependencies and their licenses: **[docs/THIRD-PARTY-NOTICES.md](docs/THIRD-PARTY-NOTICES.md)**.
