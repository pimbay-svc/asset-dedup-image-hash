/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import type { ImageHasher, HashOptions } from '../../domain/provider/hasher.provider.js';
import { CorruptInputError, InternalExtractionError } from '../../domain/errors.js';
import type { Env } from '../env/env.js';

/** `imagehash_worker.py`'s documented exit codes — see the script's own docstring. */
const WorkerExitCode = {
  UNPROCESSABLE_INPUT: 1,
  BAD_ARGUMENTS: 2,
} as const;

export function suppressEpipe(stdin: NodeJS.WritableStream): void {
  stdin.on('error', () => undefined);
}

/**
 * Streams the image file straight from its shared-volume path into the worker's stdin — no base64 round-trip,
 * since the socket protocol only ever carries a path. Invocation and exit-code handling otherwise carries over
 * unchanged from `asset-dedup-core`'s pre-extraction `imagehashRunner.ts`.
 */
export class ImagehashRunner implements ImageHasher {
  constructor(private readonly env: Env) {}

  hash(imagePath: string, options: HashOptions): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(this.env.PYTHON_BIN, [
        this.env.IMAGEHASH_WORKER_PATH,
        options.algorithm,
        String(options.hashSize),
      ]);

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let settled = false;

      const timer = setTimeout(() => {
        /* v8 ignore next 3 -- a setTimeout callback only ever fires once; `settled` cannot
           already be true the first (and only) time this runs, so this guard exists only for
           defensive symmetry with the 'error'/'close' handlers below. */
        if (settled) {
          return;
        }
        settled = true;
        child.kill('SIGKILL');
        reject(InternalExtractionError.timedOut(this.env.IMAGEHASH_TIMEOUT_MS));
      }, this.env.IMAGEHASH_TIMEOUT_MS);

      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      child.on('error', (err) => {
        /* v8 ignore next 3 -- reachable only if 'error' fires after the timeout already settled
           this promise, which would require a hung process to still emit a spawn-level error
           afterwards; not something a well-behaved or even misbehaving python3 does. */
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(InternalExtractionError.spawnFailed(err));
      });

      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);

        const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();

        if (code === WorkerExitCode.UNPROCESSABLE_INPUT) {
          reject(CorruptInputError.workerRejected(stderr));

          return;
        }
        if (code !== 0) {
          reject(InternalExtractionError.workerExited(code, stderr));

          return;
        }

        resolve(Buffer.concat(stdoutChunks).toString('utf-8').trim());
      });

      // See suppressEpipe()'s own docstring for why this exists and why it's a separate function.
      suppressEpipe(child.stdin);

      // Reading the source file is itself a possible failure mode (missing file, permission error) distinct from
      // anything the worker process reports — surfaced as CorruptInputError since it means the given path wasn't
      // a usable image, not an internal fault of this service.
      const source = createReadStream(imagePath);
      source.on('error', (err) => {
        /* v8 ignore next 3 -- reachable only if the source file errors after the worker's own
           'close'/'error'/timeout handler already settled this promise, which would require the
           child process to exit before its stdin pipe finishes erroring — not a sequence a real
           filesystem error (ENOENT, EACCES) produces in practice. */
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        child.kill('SIGKILL');
        reject(CorruptInputError.unreadableFile(err));
      });
      source.pipe(child.stdin);
    });
  }
}
