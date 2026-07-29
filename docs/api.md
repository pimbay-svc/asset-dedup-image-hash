# API Reference

`core` opens a single persistent Unix domain socket connection to this service and keeps it open, reconnecting on drop — see `AGENTS.md`, "UDS connection lifecycle".
Every message, both directions, is length-prefixed JSON: `[4-byte big-endian length][UTF-8 JSON payload]` (`src/infrastructure/uds/framing.ts`).
There is no per-request connect/disconnect and no auth — the socket file itself, reachable only on the shared volume, is the trust boundary.

Socket path: `SOCKET_PATH` (see [docs/configuration.md](configuration.md)).
Requests are dispatched by their `op` field (`src/presentation/uds/server.ts`); an unrecognized `op` is logged and silently ignored — no error frame is sent back, since there's no request id to correlate a reply to on a fire-and-forget bad message.
A `hash` message that doesn't match the expected shape at all (missing/malformed `config` or `inputs`, or a frame that isn't even a JSON object) is treated the same way — logged and dropped, no response frame.

## Error format

Per-item errors (not connection- or transport-level failures) share one shape, keyed under `outputs[<id>].error`:

```json
{ "code": "corrupt_input", "message": "human-readable message" }
```

| Code             | Meaning                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `corrupt_input`  | The image itself is unreadable/malformed — empty file, unrecognized format, truncated data the worker can't decode — or the given path couldn't be read at all (missing file, permission error). |
| `internal_error` | `python3`/the worker script failed to start, timed out, or crashed for reasons unrelated to the input file's validity — also used for a request-level problem like an unsupported `algorithm`.   |

A failure on one item in a batch never prevents the rest from being attempted — each input is handled independently, and its result (success or error, never both) is reported under its own key in `outputs`, mirroring the request's `inputs` keys exactly.

---

## `op: "hash"`

Computes a perceptual hash for each input image.
Handled by `src/presentation/uds/socket/hash.socket.ts`.

**Request**

```json
{
  "op": "hash",
  "config": {
    "algorithm": "phash",
    "hash_size": 16
  },
  "inputs": {
    "id1": { "path": "/shared/frame-0.png" },
    "id2": { "path": "/shared/frame-1.png" }
  }
}
```

| Field              | Type                                                    | Description                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.algorithm` | `"phash"` \| `"dhash"` \| `"average_hash"` \| `"whash"` | Which perceptual-hash algorithm to compute — passed straight through to `imagehash_worker.py`'s `<impl>` argument. Invalid value fails the whole batch (see below), not per item. |
| `config.hash_size` | `number`                                                | Grid size passed to the `imagehash` library (e.g. `8` → 8×8 → 64-bit hash; `16` → 16×16 → 256-bit hash).                                                                          |
| `inputs.<id>.path` | `string`                                                | Absolute path to the source image, already readable on the shared volume — never file bytes. `<id>` is request-scoped only and can repeat across separate requests.               |

**Response**

```json
{
  "outputs": {
    "id1": { "hash": "a1b2c3d4e5f6a7b8" },
    "id2": { "hash": "b2c3d4e5f6a7b8a1" }
  }
}
```

One entry per input key, in the same shape as the request's `inputs`: either `{ "hash": string }` on success (a lowercase hex string, `hash_size * hash_size / 4` characters long) or `{ "error": { "code", "message" } }` on failure — never both.
Nothing is written to disk; the hash string is the entire result.

**Errors**

| Code             | Cause                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `corrupt_input`  | Per item. The image at that path couldn't be read, or the worker couldn't decode it as an image.                                                                                                                                                                                                                                                                                                                                                             |
| `internal_error` | Per item, for a `python3`/worker process failure unrelated to the input (missing interpreter, missing worker script, timeout, or a `hash_size` invalid for the given `algorithm` — e.g. `whash` requires a power of 2); or for every item in the batch at once if `config.algorithm` isn't a recognized value — a malformed request-level config is reported the same way for every `id` in `inputs`, rather than silently substituting a default algorithm. |

**Example** (using `scripts/dev/hash.sh`, which speaks this protocol directly — there is no `curl` equivalent since this isn't HTTP):

```bash
scripts/dev/hash.sh --image /shared/frame-0.png --algorithm phash --hash-size 16
```

---

Any other `op` value is logged as a warning and ignored; no response frame is sent.
