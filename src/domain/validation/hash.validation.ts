/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { ImagehashAlgorithm } from '../model/algorithm.model.js';

/** Every `imagehash` algorithm rejects a hash_size below this. */
export const MIN_HASH_SIZE = 2;

/**
 * Returns an error message if `hashSize` is invalid for the given `algorithm`, or `null` if it's valid. Mirrors the
 * constraint enforced independently by `scripts/imagehash_worker.py`'s own `_validate_hash_size` (every algorithm
 * needs an integer >= `MIN_HASH_SIZE`; `whash` additionally needs a power of 2) — checked here too so a bad
 * `hash_size` fails the whole batch up front, the same way an unrecognized `algorithm` already does, instead of
 * spawning one worker process per input just to have each one independently reject it.
 */
export function validateHashSize(algorithm: ImagehashAlgorithm, hashSize: number): string | null {
  if (!Number.isInteger(hashSize) || hashSize < MIN_HASH_SIZE) {
    return `invalid hash_size for "${algorithm}" (must be an integer >= ${String(MIN_HASH_SIZE)}): ${String(hashSize)}`;
  }
  if (algorithm === ImagehashAlgorithm.WHASH && (hashSize & (hashSize - 1)) !== 0) {
    return `invalid hash_size for "whash" (must be a power of 2): ${String(hashSize)}`;
  }

  return null;
}
