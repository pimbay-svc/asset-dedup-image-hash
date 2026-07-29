# Third-Party Notices

This project itself is released under [The Unlicense](../LICENSE).
It bundles or invokes the following third-party software, each under its own license.

## npm dependencies

Full list with versions and licenses: run `npx license-checker --summary --production --excludePrivatePackages` — don't hand-maintain a duplicate of `package.json`/`package-lock.json` here.
Every transitive dependency currently resolved is verified directly against each package's own `package.json` `license` field, not assumed; none of it is copyleft.

Direct runtime dependencies — listed even though none carry an attribution requirement, so a reader doesn't have to run the tool just to see there's nothing unusual here:

| Package  | License | Note |
| -------- | ------- | ---- |
| `awilix` | MIT     | —    |
| `pino`   | MIT     | —    |
| `zod`    | MIT     | —    |

## Python dependencies (`scripts/requirements.txt`)

Installed into the Python environment `PYTHON_BIN` points at, used only by `scripts/imagehash_worker.py` — never imported by the Node.js/TypeScript code, which only spawns `python3` as a subprocess (see "External process invoked" below).
Verified directly against each package's own declared license metadata (`pip show`/`importlib.metadata`), not assumed; all permissive.

| Package      | License                                                                | Note                                                   |
| ------------ | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| `ImageHash`  | BSD-2-Clause                                                           | The `phash`/`dhash`/`average_hash`/`whash` algorithms. |
| `Pillow`     | MIT-CMU                                                                | Image decoding, EXIF-orientation handling.             |
| `numpy`      | BSD-3-Clause (plus a few small bundled permissive-licensed components) | Transitive, via `ImageHash`/`scipy`.                   |
| `scipy`      | BSD-3-Clause-style                                                     | Transitive, via `ImageHash`'s `whash` implementation.  |
| `PyWavelets` | MIT / BSD-3-Clause                                                     | Transitive, via `ImageHash`'s `whash` implementation.  |

## External process invoked (not linked)

`python3` runs as a separate OS process, invoked via CLI arguments with the source image streamed to `stdin` and the hash read back from `stdout` — never linked into this project's own Node.js/TypeScript build output.
This is what keeps the above Python dependencies' licenses from applying to this project's own JavaScript/TypeScript code; see `AGENTS.md` before changing how the worker is invoked.

| Tool                                      | Invoked for                                                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `python3` + `scripts/imagehash_worker.py` | Computing a perceptual hash for one image per invocation (`src/infrastructure/hasher/imagehashRunner.ts`). |

## Notes

This is not legal advice.
`python3 scripts/imagehash_worker.py` is invoked by `ImagehashRunner` with `node:child_process.spawn`, given CLI arguments and image bytes over `stdin`, with the hash read back from `stdout` — no Python source or object code is compiled into, statically linked, or dynamically linked against this project's own Node.js/TypeScript code.
This is treated as the standard "mere aggregation" / separate-process boundary that keeps the Python dependencies above from propagating their licenses to this project's own code; the Docker image ships both under their own separate licenses (this project's under [The Unlicense](../LICENSE), the Python dependencies under their own permissive licenses as listed above), see `../README.md`, "License".
