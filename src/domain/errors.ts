/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
export abstract class AssetDedupImageHashExtensionError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The image file itself is unreadable/malformed (empty input, unrecognized format, truncated
 * data the worker can't decode). Maps to the spec's `corrupt_input` per-item error code.
 */
export class CorruptInputError extends AssetDedupImageHashExtensionError {
  private constructor(message: string) {
    super(message);
  }

  /** The worker itself exited with `WorkerExitCode.UNPROCESSABLE_INPUT`. */
  static workerRejected(stderr: string): CorruptInputError {
    return new CorruptInputError(stderr || 'could not process image (corrupt or unsupported format)');
  }

  /** Reading the source file from its given path failed (missing, permission denied, ...). */
  static unreadableFile(cause: Error): CorruptInputError {
    return new CorruptInputError(`could not read image file: ${cause.message}`);
  }
}

/**
 * The imagehash worker failed to start, timed out, crashed, or rejected its own arguments for
 * reasons unrelated to the input file's validity. Maps to the spec's `internal_error` per-item
 * error code.
 */
export class InternalExtractionError extends AssetDedupImageHashExtensionError {
  private constructor(message: string) {
    super(message);
  }

  static timedOut(timeoutMs: number): InternalExtractionError {
    return new InternalExtractionError(`imagehash worker timed out after ${String(timeoutMs)}ms`);
  }

  static spawnFailed(cause: Error): InternalExtractionError {
    return new InternalExtractionError(`failed to start imagehash worker: ${cause.message}`);
  }

  /** Any non-zero exit code other than `WorkerExitCode.UNPROCESSABLE_INPUT`. */
  static workerExited(code: number | null, stderr: string): InternalExtractionError {
    return new InternalExtractionError(stderr || `imagehash worker exited with code ${String(code)}`);
  }
}
