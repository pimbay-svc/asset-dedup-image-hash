/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import type { ImageHasher } from '../../domain/provider/hasher.provider.js';
import type { ImagehashAlgorithm } from '../../domain/model/algorithm.model.js';
import { CorruptInputError } from '../../domain/errors.js';

export interface HashBatchConfig {
  algorithm: ImagehashAlgorithm;
  hashSize: number;
}

export interface HashInputItem {
  path: string;
}

export interface HashSuccess {
  hash: string;
}

export interface HashFailure {
  error: { code: string; message: string };
}

export type HashItemResult = HashSuccess | HashFailure;

export class ImageHashService {
  constructor(private readonly imageHasher: ImageHasher) {}

  /**
   * Hashes every item in `inputs`. A failure on one item never prevents the rest of the batch from
   * being attempted and reported — each item is handled independently and its result (success or
   * error) is reported under its own key, mirroring `inputs` exactly.
   */
  async hashBatch(
    config: HashBatchConfig,
    inputs: Record<string, HashInputItem>,
  ): Promise<Record<string, HashItemResult>> {
    const entries = await Promise.all(
      Object.entries(inputs).map(async ([id, item]): Promise<[string, HashItemResult]> => {
        return [id, await this.hashOne(config, item)];
      }),
    );

    return Object.fromEntries(entries);
  }

  private async hashOne(config: HashBatchConfig, item: HashInputItem): Promise<HashItemResult> {
    try {
      const hash = await this.imageHasher.hash(item.path, {
        algorithm: config.algorithm,
        hashSize: config.hashSize,
      });

      return { hash };
    } catch (err) {
      return { error: toErrorPayload(err) };
    }
  }
}

function toErrorPayload(err: unknown): { code: string; message: string } {
  if (err instanceof CorruptInputError) {
    return { code: 'corrupt_input', message: err.message };
  }

  return { code: 'internal_error', message: 'internal error during hash computation' };
}
