/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import type { ImagehashAlgorithm } from '../model/algorithm.model.js';

export interface HashOptions {
  algorithm: ImagehashAlgorithm;
  hashSize: number;
}

export interface ImageHasher {
  hash(imagePath: string, options: HashOptions): Promise<string>;
}
