# AGENTS.md — asset-dedup-image-hash

## Project Overview

Perceptual-image-hashing extension for `asset-dedup-core`.
Given one or more image paths on a shared volume, computes a perceptual hash per image and returns it — nothing else, nothing written to disk.
Combining hashes, resolving which algorithm to use for a given asset, and calling other extensions are explicitly out of scope; `core` decides all of that and sends this service only an explicit `algorithm`/`hash_size` per request.
Communication is a single persistent client connection from `core` (this service is the server), length-prefixed JSON frames, id-keyed batch request/response — never HTTP.
Full cross-repo protocol spec lives outside this repo.
License: Unlicense. Runtime: Node.js >= 24, Python 3 (for `scripts/imagehash_worker.py`).

## Commands

```bash
npm install
npm run dev               # tsx watch --env-file=.env
npm run js:build          # tsc -p tsconfig.build.json
npm run js:lint           # eslint src test — check only
npm run js:lint:fix       # eslint src test --fix
npm run js:format         # prettier --check . — check only
npm run js:format:fix     # prettier --write .
npm run js:typecheck      # tsc --noEmit
npm run start             # run compiled dist/
npm run test:unit         # vitest run test/unit
npm run test:integration  # vitest run test/integration
npm run test:all          # both
npm run test:coverage     # both, --coverage
npm run test:mutation     # stryker run — MSI 100 gate
npm run test:python       # pytest against scripts/imagehash_worker.py, from scripts/tests/.venv
scripts/dev/hash.sh       # sends a hash op over the UDS socket, see README
```

Requires `python3` with `scripts/requirements.txt` installed (or `PYTHON_BIN` pointing at a venv that has them) for `npm run dev`, `test:unit`, `test:integration` — the hashing path shells out to `scripts/imagehash_worker.py` directly against real fixture images in `test/fixtures/`, nothing is mocked at the OS level.
`test:python` needs its own venv at `scripts/tests/.venv` with `scripts/tests/requirements.txt` installed (that file itself pulls in `scripts/requirements.txt` — see its `-r ../requirements.txt` line).

`js:typecheck` exists because `js:build` may exclude `test/` and ESLint doesn't reliably catch every type error — it's the authoritative compile gate, always run alongside `js:lint`/`test`.

## Code Style

- **TS strict**, no unexplained `any` — prefer `unknown` + narrowing.
- **Named exports only.**
- **Interfaces for public contracts**, `type` for unions/internal shapes.
- **Explicit return types** on public functions/methods.
- **Small files**, one responsibility each.
- **No blind barrels** (`export * from`) — re-export explicitly.
- **No raw `enum`, ever — including `const enum`** — use `export const AnyType = {...} as const; export type AnyType = (typeof AnyType)[keyof typeof AnyType];`.
- **Named-constructor exceptions** — no inline `new SomeError(...)`.
- **Log/console message text lives in a `messages.ts` next to its module**, not inline at the call site.
- **Zod for config/env boundary validation** — never hand-rolled.
- **Socket wire format is `snake_case`** (`op`, `algorithm`, `hash_size`), internal TS is `camelCase` — map at the dispatch boundary (`hash.socket.ts`), never a raw pass-through of an internal camelCase shape.
- **Config**: env-only, zod-validated before use, grouped into one `Env` value (`infrastructure/env/env.ts`) — business logic depends on `env.PYTHON_BIN` etc., not on scattered `process.env` reads; no YAML file, no `CONFIG_PATH`.
- **Logging**: `pino`, structured — `no-console` is an ESLint error.
  Pretty-print only in dev — a `NODE_ENV` typo enabling it in prod has bitten us before.
- **Comments** only where non-obvious; always in English (Python and TypeScript alike).
- **Caret-pin to the tested patch** (`^13.0.5`, not `^13.0`); Python deps pin exact (`imagehash==4.3.1`), matching `scripts/requirements.txt`'s existing convention.
- **Markdown**: semantic linebreaks (one sentence/clause per line).
- **Docs discipline**: no "Project Layout" section in READMEs — the tree speaks for itself.

## Architecture

### Core — always applies

```
domain/
  model/*.model.ts     — domain vocabulary that isn't a plain entity (see "Domain vocabulary vs DTO" below)
  provider/*.provider.ts — non-repository port interfaces
  validation/*.validation.ts — pure domain validation functions
application/
  service/*.service.ts — orchestration/business logic
infrastructure/
  container.ts          — awilix container, CLASSIC mode
  env/*.ts, logger.ts, <adapter>/*.ts — mechanism-named adapters implementing domain/provider interfaces
presentation/
  uds/server.ts                    — buildUdsServer(): net.Server, connection lifecycle, single-active-connection policy
  uds/healthcheck.ts               — standalone script for Docker HEALTHCHECK, self-connects to the socket
  uds/socket/*.socket.ts
```

- **DI**: awilix, CLASSIC mode — constructor param names must match cradle keys exactly (fails silently at resolve time otherwise).
- **Singletons**: anything with shared mutable state (the `imageHasher`, `imageHashService`) is a container singleton, never instantiated ad hoc; `env` and `logger` are registered via `asValue`.
- **Domain vocabulary vs DTO**: would this type mean the same thing if the wire format changed?
  Yes → domain; no (shapes only a boundary) → DTO, lives where consumed.

### Subprocess delegation

`scripts/imagehash_worker.py` (Python, `imagehash`/`Pillow`, both permissively licensed) runs as a separate OS process, invoked via CLI args + stdin, never linked in — see `docs/THIRD-PARTY-NOTICES.md` before changing invocation.

## Testing

- **Vitest**, `test/unit/` + `test/integration/`, mirroring `src/` 1:1. **pytest**, `scripts/tests/`, against `scripts/imagehash_worker.py` directly — two separate toolchains, two separate coverage stories.
- Split is not mock-vs-real-I/O — a unit test can touch real I/O if that's a detail of the one module under test.
  - **unit/** — exercises exactly one module. `ImagehashRunner`'s own unit tests run a real `python3 scripts/imagehash_worker.py` against fixture images in `test/fixtures/` (including a small fake-binary test double in `test/fixtures/bin/` for a deterministic timeout) — nothing is mocked at the OS level, see "Commands" above.
  - **integration/** — composes ≥2 modules, or crosses a framework boundary (DI container wiring real classes; a real UDS `net.Server`/`net.Socket` pair in `server.test.ts`).
- **Coverage: 100%** — hard gate (`npm run test:coverage`, `vitest.config.ts` `coverage.thresholds`).
  `coverage.exclude` is short and every entry justified: `server.ts` (bootstrap composition root), `presentation/uds/healthcheck.ts` (standalone Docker-invoked script, not part of the app process).
- **Mutation score: 100% (MSI)** — `stryker.config.mjs`, `npm run test:mutation`.
- Every bug fix gets a regression test, ideally one that would have caught it before the fix.
- A few genuinely unreachable defensive branches (a timer callback that can't fire after `clearTimeout` already ran) are marked `/* v8 ignore next */` with a comment explaining why, rather than covered with contrived tests.

## Guardrails

- No new deps (npm or pip) without proposing them explicitly.
- Targeted diffs — don't rewrite a file for a small fix.
- No unrequested docs/test scaffolding.
- Don't move `docker/Dockerfile` stages/`COPY` paths without checking build context (relative to context, not the Dockerfile).
- Don't change `scripts/imagehash_worker.py`'s exit-code contract without updating both `ImagehashRunner`'s mapping and `scripts/tests/test_imagehash_worker.py`'s CLI-contract tests together.
- Ask before changing a DI registration's lifetime.
- Domain vs application vs infrastructure placement unclear → ask, don't guess.
