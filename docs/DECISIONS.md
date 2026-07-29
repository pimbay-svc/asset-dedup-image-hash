# Decisions

> Append-only architectural decision log — the "why", not the "what's next" (that's context.md).
> One entry per decision: what was decided and why, not a discussion transcript.
> If it's a cheap/local implementation detail → docs/context.md instead.
> If it's a pattern repeated across multiple repos → AGENTS.md instead, not here.

## Extracted from `asset-dedup-core` into its own UDS extension

**Date:** 2026-07-28

**Decision:** Standalone UDS extension — `core` is the client, this service is the server; requests carry only a path and `algorithm`/`hash_size`, responses carry only a hash string.

**Why:** consistent with the same split already made for `video-frame-extract` and `pdf-page-extract` — `core` no longer needs to hold or transmit full file contents for anything it can instead point another process at, and each hashing/extraction concern can now scale, deploy, and fail independently of `core` itself.
Unlike those two extensions, this one produces no output artifact at all (just a hash string), so it carries none of their shared-volume-writing machinery (`OUTPUT_DIR`, filename convention, TTL sweep) — see `docs/context.md`.

**Alternatives considered:** keep perceptual hashing inside `asset-dedup-core` itself (as `infrastructure/hasher/imagehashRunner.ts`, invoked in-process against a base64-decoded request body).

## Stream the source file into the worker's stdin instead of reading a full buffer first

**Date:** 2026-07-28

**Decision:** Stream directly from the file path (`createReadStream(imagePath).pipe(child.stdin)`).

**Why:** the original buffer-based approach existed because the source data started life as a base64 string in an HTTP request body — decoding it to a buffer was already unavoidable before it could go anywhere. That step no longer exists: the socket protocol hands this service a path, not bytes, so reading the whole file into memory first would be pure overhead with no corresponding decode step to justify it.
A read error on the source (missing file, permission denied) is surfaced as `CorruptInputError` via the stream's own `'error'` event, kept separate from the worker process's own exit-code-driven error handling.

**Alternatives considered:** keep `asset-dedup-core`'s original approach (read/decode the entire image into a `Buffer` first, then `child.stdin.write(buffer)`).
