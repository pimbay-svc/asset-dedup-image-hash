# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [Unreleased]

## [1.0.1] - 2026-08-31

### Added

- `buildUdsServer` now removes a stale socket file left behind by an unclean shutdown before binding.

## [1.0.0] - 2026-08-15

### Added

- Unix-domain-socket hashing service: `core` is the client, this service is the server, connecting once and staying open (`docs/DECISIONS.md`, 2026-07-28) — no HTTP, no auth beyond the shared-volume socket file itself.
- Single `op: "hash"` request/response over the socket (see `docs/api.md`), plus a standalone `presentation/uds/healthcheck.ts` script invoked directly by Docker `HEALTHCHECK`, not exposed as a network endpoint.
- Perceptual hashing only — four algorithms (`phash`, `dhash`, `average_hash`, `whash`) via `scripts/imagehash_worker.py` (Python, `imagehash`/`Pillow`), reused unchanged from `asset-dedup-core`'s pre-extraction implementation.
- Input images are read directly from a shared-volume path and streamed into the worker's stdin — never a base64 buffer over the socket, never read fully into memory first.
