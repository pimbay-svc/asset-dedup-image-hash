/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { z } from 'zod';
import type { Cradle } from '../../../infrastructure/container.js';
import { ImagehashAlgorithm } from '../../../domain/model/algorithm.model.js';
import { validateHashSize } from '../../../domain/validation/hash.validation.js';
import { UdsServerMessage } from '../messages.js';

const HashRequestSchema = z.object({
  op: z.literal('hash'),
  config: z.object({
    algorithm: z.string(),
    hash_size: z.number(),
  }),
  inputs: z.record(z.string(), z.object({ path: z.string() })),
});

export type HashRequestMessage = z.infer<typeof HashRequestSchema>;

export interface HashResponseMessage {
  outputs: Record<string, unknown>;
}

const VALID_ALGORITHMS: string[] = Object.values(ImagehashAlgorithm);

function failAllWith(inputs: Record<string, { path: string }>, message: string): HashResponseMessage {
  const errorEntry = { error: { code: 'internal_error', message } };

  return { outputs: Object.fromEntries(Object.keys(inputs).map((id) => [id, errorEntry])) };
}

export async function handleHash(message: unknown, cradle: Cradle): Promise<HashResponseMessage | null> {
  const parsed = HashRequestSchema.safeParse(message);

  if (!parsed.success) {
    cradle.logger.warn({ err: parsed.error }, UdsServerMessage.MALFORMED_HASH_REQUEST);

    return null;
  }

  const { config, inputs } = parsed.data;

  if (!VALID_ALGORITHMS.includes(config.algorithm)) {
    return failAllWith(inputs, `unsupported algorithm "${config.algorithm}"`);
  }

  const algorithm = config.algorithm as ImagehashAlgorithm;
  const hashSizeError = validateHashSize(algorithm, config.hash_size);

  if (hashSizeError !== null) {
    return failAllWith(inputs, hashSizeError);
  }

  const outputs = await cradle.imageHashService.hashBatch({ algorithm, hashSize: config.hash_size }, inputs);

  return { outputs };
}
