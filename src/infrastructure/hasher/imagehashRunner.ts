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

/**
 * Swallows EPIPE on the worker's stdin: on a large input, the worker can exit and close its end of the pipe before
 * the source stream finishes writing to it, and an unhandled 'error' here would otherwise crash the process.
 */
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
        /* v8 ignore next 3 -- setTimeout fires only once, so `settled` can't already be true;
           guard kept only for symmetry with the 'error'/'close' handlers below. */
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
        /* v8 ignore next 3 -- would need a spawn-level error after the timeout already settled
           this promise, i.e. a hung process still erroring afterwards; not realistic. */
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

      // Kept separate so its own docstring above can explain the EPIPE hazard on its own terms.
      suppressEpipe(child.stdin);

      // A missing/unreadable source file is CorruptInputError, not an internal fault.
      const source = createReadStream(imagePath);
      source.on('error', (err) => {
        /* v8 ignore next 3 -- would need the source file to error after the worker's own
           handler already settled this promise, i.e. the child exiting before its stdin
           finishes erroring; not a sequence a real ENOENT/EACCES produces. */
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
