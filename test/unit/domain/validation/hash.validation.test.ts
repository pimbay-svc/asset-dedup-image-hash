/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { describe, it, expect } from 'vitest';
import { ImagehashAlgorithm } from '../../../../src/domain/model/algorithm.model.js';
import { MIN_HASH_SIZE, validateHashSize } from '../../../../src/domain/validation/hash.validation.js';

describe('validateHashSize', () => {
  describe('accepts', () => {
    it.each([
      { name: 'phash at the minimum', algorithm: ImagehashAlgorithm.PHASH, hashSize: MIN_HASH_SIZE },
      { name: 'dhash at the minimum', algorithm: ImagehashAlgorithm.DHASH, hashSize: MIN_HASH_SIZE },
      { name: 'average_hash at the minimum', algorithm: ImagehashAlgorithm.AVERAGE_HASH, hashSize: MIN_HASH_SIZE },
      {
        name: 'whash at the minimum (also a power of 2)',
        algorithm: ImagehashAlgorithm.WHASH,
        hashSize: MIN_HASH_SIZE,
      },
      {
        name: 'phash with a non-power-of-2 size (only whash requires one)',
        algorithm: ImagehashAlgorithm.PHASH,
        hashSize: 10,
      },
      {
        name: 'dhash with a non-power-of-2 size (only whash requires one)',
        algorithm: ImagehashAlgorithm.DHASH,
        hashSize: 10,
      },
      {
        name: 'average_hash with a non-power-of-2 size (only whash requires one)',
        algorithm: ImagehashAlgorithm.AVERAGE_HASH,
        hashSize: 10,
      },
      { name: 'whash with a larger power of 2', algorithm: ImagehashAlgorithm.WHASH, hashSize: 16 },
    ])('$name', ({ algorithm, hashSize }) => {
      expect(validateHashSize(algorithm, hashSize)).toBeNull();
    });
  });

  describe('rejects', () => {
    it.each([
      {
        name: 'phash below the minimum',
        algorithm: ImagehashAlgorithm.PHASH,
        hashSize: MIN_HASH_SIZE - 1,
        expected: /must be an integer >= 2/,
      },
      {
        name: 'dhash below the minimum',
        algorithm: ImagehashAlgorithm.DHASH,
        hashSize: MIN_HASH_SIZE - 1,
        expected: /must be an integer >= 2/,
      },
      {
        name: 'average_hash below the minimum',
        algorithm: ImagehashAlgorithm.AVERAGE_HASH,
        hashSize: MIN_HASH_SIZE - 1,
        expected: /must be an integer >= 2/,
      },
      {
        name: 'whash below the minimum',
        algorithm: ImagehashAlgorithm.WHASH,
        hashSize: MIN_HASH_SIZE - 1,
        expected: /must be an integer >= 2/,
      },
      {
        name: 'a non-integer hash_size',
        algorithm: ImagehashAlgorithm.PHASH,
        hashSize: 8.5,
        expected: /must be an integer >= 2/,
      },
      {
        name: 'whash with a non-power-of-2 size',
        algorithm: ImagehashAlgorithm.WHASH,
        hashSize: 10,
        expected: /must be a power of 2/,
      },
    ])('$name', ({ algorithm, hashSize, expected }) => {
      expect(validateHashSize(algorithm, hashSize)).toMatch(expected);
    });
  });
});
