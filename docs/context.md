# Context

> Working memory, not a historical record.
> Continuously edited, not append-only — unlike DECISIONS.md.
> When something here resolves: delete it if it was only ever local/temporary, or promote it to DECISIONS.md if it turned out to matter beyond this moment.
> Don't let resolved items pile up here.

## Current focus

Nothing in progress — repo is in a stable, maintenance state.

## Open questions

None currently.

## Known limitations / non-goals (for now)

- **Paths in, a hash string out — no output files, no `OUTPUT_DIR`.**
  Socket messages carry only paths and metadata, never raw file bytes (see spec, "Binary data policy").
  `ImagehashRunner.hash()` reads the input image directly from its given path (streamed into the worker's stdin) and returns a hash string — there's no output artifact on the shared volume the way `video-frame-extract`/`pdf-page-extract` produce PNG files, so there's no `OUTPUT_DIR`, no filename convention, and no TTL sweep in this service.
  If you find yourself wanting to add one, that almost certainly means the feature belongs in a different extension, not here.

- **`scripts/.venv` and `scripts/tests/.venv` can end up in a broken state if not recreated cleanly.** Running `python3 -m venv` over an _existing_ venv directory doesn't fully rebuild it — if the directory was created under a different Python version, or copied/extracted from elsewhere (e.g. a stale archive), you can end up with a `pip` script whose shebang points at a `python3` that no longer exists (`cannot execute: required file not found`), or a broken `lib64 -> lib` symlink. If either venv acts up, `rm -rf` it and recreate from scratch rather than debugging in place:
  ```bash
  rm -rf scripts/.venv && python3 -m venv scripts/.venv && scripts/.venv/bin/pip install -r scripts/requirements.txt
  rm -rf scripts/tests/.venv && python3 -m venv scripts/tests/.venv && scripts/tests/.venv/bin/pip install -r scripts/tests/requirements.txt
  ```

## Implementation notes

- **`core` is the client, this service is the server.**
  `core` opens the connection to this service's Unix domain socket and keeps it open, reconnecting on drop — not the other way around.
  `presentation/uds/server.ts` accepts connections via `net.createServer`; it never initiates an outbound connection to `core`.
  A connection only becomes "active" once it sends its first valid frame, not merely on accept — this is what lets the Docker healthcheck (a short-lived connect-and-close probe with no `op` sent) coexist with the real, persistent connection from `core` without racing it.
  If you're touching connection-lifecycle logic, read the comment at the top of `buildUdsServer` first; the healthcheck race is easy to reintroduce by treating any accepted connection as authoritative.

- **The worker's exit-code contract is load-bearing.**
  `scripts/imagehash_worker.py` exits `0` (hash on stdout), `1` (unprocessable input — bad/corrupt image data), or `2` (bad CLI arguments — unsupported `impl`, non-integer or non-positive `hash_size`, wrong argc).
  `ImagehashRunner.hash()` maps exit `1` to `CorruptInputError` and everything else non-zero (including `2`, a spawn error, or a timeout) to `InternalExtractionError`.
  This means a missing `IMAGEHASH_WORKER_PATH` also surfaces as `InternalExtractionError` for free: `python3 /no/such/worker.py` itself exits with CPython's own code `2` for "can't open file", which happens to land in the same bucket as the worker's own bad-argument exit — no special-casing needed, but don't rely on that coincidence surviving a change to how the worker is invoked (e.g. switching to `python3 -m`).

- **Testing real subprocesses and a real socket.**
  `test/fixtures/sample.png` (a real 64×64 PNG generated via Pillow) and `test/fixtures/corrupt.png` (garbage bytes, not a real image) back `imagehashRunner.test.ts`'s real `python3 scripts/imagehash_worker.py` runs — nothing is mocked at the OS level.
  `test/fixtures/bin/fake-python-hangs.sh` is a small fake-binary test double used to deterministically hit the timeout branch that a real, well-behaved `python3` won't reliably produce on demand.
  `suppressEpipe()` (the `child.stdin` error guard — see its own docstring) is deliberately pulled out of `ImagehashRunner.hash()`'s inline callbacks into its own top-level function specifically so it has a direct, deterministic unit test: whether a real subprocess actually triggers an EPIPE within any given test run is an OS-timing race (confirmed by trial — it didn't reproduce reliably even under a 2MB payload), but calling the extracted function with a fake `EventEmitter` and asserting it doesn't throw is not. A ~2MB random-bytes payload — generated at runtime into an OS tmp dir by the test itself (`beforeAll` in `imagehashRunner.test.ts`), not a committed fixture in `test/fixtures/` — still backs a real-subprocess EPIPE regression test alongside the deterministic one, as a smoke test for the actual wiring. It's not itself required to pass reliably to cover the line.
  `server.test.ts` (integration) drives a real `net.Server`/`net.Socket` pair rather than mocking the socket layer — connection-lifecycle bugs (the healthcheck race above, in particular) don't show up in a mocked socket.
  `npm run test:coverage` targets 100% for the TypeScript side.
  `../vitest.config.ts`'s `coverage.exclude` currently contains `server.ts` (bootstrap composition root) and `presentation/uds/healthcheck.ts` (a standalone script invoked directly by Docker `HEALTHCHECK`, never imported by the app itself).
  The Python worker has its own separate test suite (`npm run test:python`, i.e. pytest against `scripts/tests/`) — it isn't part of the Vitest coverage run and never will be, since it's a different language and process boundary; see `scripts/tests/test_imagehash_worker.py` for both direct `compute_hash()` unit tests and subprocess-level CLI/exit-code contract tests.

- **Package identity.**
  `"name": "@pimbay/asset-dedup-image-hash"`, `"private": true` — a deployed service (image on `ghcr.io`/Docker Hub), not an npm library.
  Don't remove `private: true`.

## Ideas / future plans

None currently.
