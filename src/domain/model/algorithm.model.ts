/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
export const ImagehashAlgorithm = {
  PHASH: 'phash',
  DHASH: 'dhash',
  AVERAGE_HASH: 'average_hash',
  WHASH: 'whash',
} as const;

export type ImagehashAlgorithm = (typeof ImagehashAlgorithm)[keyof typeof ImagehashAlgorithm];
