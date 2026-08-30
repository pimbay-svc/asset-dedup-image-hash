# asset-dedup-image-hash

Perceptual-image-hashing extension for `asset-dedup-core`. Given one or more image paths on a shared volume, it computes a perceptual hash per image and returns it — nothing is written to disk. Communication is a single persistent Unix-domain-socket connection from `core` (this service is the server), never HTTP.

## Quick Start

```bash
docker run --rm \
  -v sockets:/sockets \
  -v shared-assets:/shared:ro \
  -e SOCKET_PATH=/sockets/image-hash.sock \
  pimbay/asset-dedup-image-hash:latest
```

No TCP port is published — the only interface this service has is the socket file on the shared volume. `SOCKET_PATH` must point at a location also reachable by `asset-dedup-core`, which connects to it as a client.

## Docker Compose

```yaml
services:
  image-hash:
    image: pimbay/asset-dedup-image-hash:latest
    environment:
      NODE_ENV: production
      LOG_LEVEL: info
      SOCKET_PATH: /sockets/image-hash.sock
      IMAGEHASH_TIMEOUT_MS: 10000
    volumes:
      - sockets:/sockets
      - shared-assets:/shared:ro
    restart: unless-stopped

volumes:
  sockets:
  shared-assets:
```

The `sockets` volume must also be mounted into `asset-dedup-core` so it can connect as a client. `shared-assets` is mounted read-only here — this service never writes to source images.

## Environment Variables

| Variable                | Required | Default                            | Description                                                                            |
| ----------------------- | -------- | ---------------------------------- | -------------------------------------------------------------------------------------- |
| `SOCKET_PATH`           | Yes      | —                                  | Path of the Unix domain socket this service listens on inside the container            |
| `PYTHON_BIN`            | No       | `python3`                          | Python interpreter used to invoke the hashing worker                                   |
| `IMAGEHASH_WORKER_PATH` | No       | `/app/scripts/imagehash_worker.py` | Path to the worker script                                                              |
| `IMAGEHASH_TIMEOUT_MS`  | No       | `10000`                            | Hard timeout (ms) for a single worker invocation; exceeding it kills the child process |
| `NODE_ENV`              | No       | `production`                       | `development` \| `production` \| `test`                                                |
| `LOG_LEVEL`             | No       | `info`                             | pino level: `trace`\|`debug`\|`info`\|`warn`\|`error`\|`fatal`\|`silent`               |

All numeric values must be positive integers.

## Volumes

| Container path | Description                                                               |
| -------------- | ------------------------------------------------------------------------- |
| `/sockets`     | Holds the Unix domain socket file; must be shared with `asset-dedup-core` |
| `/shared`      | Read-only source images this service hashes on request                    |

Both volumes must exist and be writable/readable before the container starts; this service does not create `/sockets`' parent directory structure beyond the socket file itself.

## Ports / Sockets

| Port / Path                | Protocol    | Description                                                                                                                                                                         |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/sockets/image-hash.sock` | Unix socket | Length-prefixed JSON protocol (server side); one op, `hash`, computes a perceptual hash per input image (`phash`/`dhash`/`average_hash`/`whash`) and returns `{ "outputs": {...} }` |

No HTTP port is exposed.

## Tags

| Tag      | Description                         |
| -------- | ----------------------------------- |
| `latest` | latest stable release               |
| `1.0`    | major.minor — updated on each patch |
| `1.0.0`  | exact version                       |

Images are published to both registries on each release:

```bash
docker pull pimbay/asset-dedup-image-hash:latest
docker pull ghcr.io/pimbay-svc/asset-dedup-image-hash:latest
```

## License

Public domain — Unlicense

Created by Jan Sarmir · No conditions · No copyright
