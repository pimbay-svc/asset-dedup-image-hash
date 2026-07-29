# Configuration Reference

Env-only — there is no `config.yaml`, no `CONFIG_PATH`.
Everything is validated by a single zod schema at startup (`src/infrastructure/env/env.ts`, `EnvSchema`); a broken or missing required value throws `EnvError` immediately, before the socket server starts listening, rather than accepting connections with silently wrong behavior.

`README.md`'s Configuration section lists the handful of variables needed to get Quick Start running.
This is the full reference — every variable, its type, default, and validation rule.

## Environment variables

| Variable                | Required | Default                                                       | Description                                                                                                                                                                                                               |
| ----------------------- | -------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`              | no       | `production`                                                  | `development` \| `production` \| `test`. Controls log pretty-printing (`src/infrastructure/logger.ts`) — see `AGENTS.md` on why a typo here enabling pretty-print in prod has bitten us before.                           |
| `LOG_LEVEL`             | no       | `info`                                                        | pino level: `trace`\|`debug`\|`info`\|`warn`\|`error`\|`fatal`\|`silent`.                                                                                                                                                 |
| `SOCKET_PATH`           | yes      | —                                                             | Filesystem path of the Unix domain socket this service listens on (`net.createServer().listen(SOCKET_PATH)`). Must be on a location `core` can also reach — a volume shared with `asset-dedup-core` in production.        |
| `PYTHON_BIN`            | no       | `python3`                                                     | Path to the Python interpreter used to invoke `scripts/imagehash_worker.py`, or a bare name resolved via `PATH`. Point this at a venv's interpreter for local dev if the worker's dependencies aren't installed globally. |
| `IMAGEHASH_WORKER_PATH` | no       | `scripts/imagehash_worker.py` resolved from the process's cwd | Path to the worker script.                                                                                                                                                                                                |
| `IMAGEHASH_TIMEOUT_MS`  | no       | `10000`                                                       | Hard timeout for a single `imagehash_worker.py` invocation. Exceeding it kills the child process (`SIGKILL`) and fails that call with `internal_error`.                                                                   |

All numeric variables are parsed with `z.coerce.number()` (so `"10000"` and `10000` are both accepted) and must be positive integers; a non-numeric or non-positive value fails startup validation the same as a missing required variable.

## Schema source of truth

`src/infrastructure/env/env.ts` (`EnvSchema`) is authoritative — if this document and that file ever disagree, the file wins and this document is stale.
`.env.example` mirrors the same variables with inline comments for local development; keep both in sync when adding or changing a variable.

## Not configurable via env

- **Algorithm and hash size** are per-request, sent by `core` in the `hash` op's `config` field (`algorithm`, `hash_size`) — see [docs/api.md](api.md). There is no server-side default or override for either.
- **Which images this service ever sees** is entirely `core`'s decision — this service has no mime-type or file-extension logic of its own (see `AGENTS.md`, "Project Overview").
