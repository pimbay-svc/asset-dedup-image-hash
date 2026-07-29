import { describe, it, expect } from 'vitest';
import { ImageHashService } from '../../../src/application/service/hash.service.js';
import { ImagehashAlgorithm } from '../../../src/domain/model/algorithm.model.js';
import { CorruptInputError, InternalExtractionError } from '../../../src/domain/errors.js';
import type { ImageHasher, HashOptions } from '../../../src/domain/provider/hasher.provider.js';

class FakeImageHasher implements ImageHasher {
  constructor(private readonly behavior: (imagePath: string, options: HashOptions) => Promise<string>) {}

  hash(imagePath: string, options: HashOptions): Promise<string> {
    return this.behavior(imagePath, options);
  }
}

describe('ImageHashService', () => {
  it('returns a hash for every successful item, mirroring the input keys', async () => {
    const hasher = new FakeImageHasher((imagePath) => Promise.resolve(`hash-of-${imagePath}`));
    const service = new ImageHashService(hasher);

    const outputs = await service.hashBatch(
      { algorithm: ImagehashAlgorithm.PHASH, hashSize: 8 },
      { id1: { path: '/shared/a.png' } },
    );

    expect(outputs).toEqual({ id1: { hash: 'hash-of-/shared/a.png' } });
  });

  it('reports one item failing without affecting the rest of the batch', async () => {
    const hasher = new FakeImageHasher((imagePath) => {
      if (imagePath === '/shared/bad.png') {
        return Promise.reject(CorruptInputError.workerRejected('could not identify image file'));
      }

      return Promise.resolve('deadbeef');
    });
    const service = new ImageHashService(hasher);

    const outputs = await service.hashBatch(
      { algorithm: ImagehashAlgorithm.PHASH, hashSize: 8 },
      { id1: { path: '/shared/good.png' }, id2: { path: '/shared/bad.png' } },
    );

    expect(outputs.id1).toEqual({ hash: 'deadbeef' });
    expect(outputs.id2).toEqual({ error: { code: 'corrupt_input', message: 'could not identify image file' } });
  });

  describe('maps a rejecting error to a generic internal_error (no internal detail leaked)', () => {
    it.each([
      {
        name: 'a domain InternalExtractionError',
        rejection: InternalExtractionError.workerExited(1, 'python3 ENOENT: /tmp/x'),
      },
      { name: 'an unexpected non-domain error (safety net)', rejection: new Error('unexpected') },
    ])('$name', async ({ rejection }) => {
      const hasher = new FakeImageHasher(() => Promise.reject(rejection));
      const service = new ImageHashService(hasher);

      const outputs = await service.hashBatch(
        { algorithm: ImagehashAlgorithm.PHASH, hashSize: 8 },
        { id1: { path: '/shared/a.png' } },
      );

      expect(outputs.id1).toEqual({
        error: { code: 'internal_error', message: 'internal error during hash computation' },
      });
    });
  });

  it('produces exactly one output entry per input key, no more no fewer', async () => {
    const hasher = new FakeImageHasher(() => Promise.resolve('deadbeef'));
    const service = new ImageHashService(hasher);

    const outputs = await service.hashBatch(
      { algorithm: ImagehashAlgorithm.PHASH, hashSize: 8 },
      { id1: { path: '/shared/a.png' }, id2: { path: '/shared/b.png' } },
    );

    expect(Object.keys(outputs).sort()).toEqual(['id1', 'id2']);
  });
});
