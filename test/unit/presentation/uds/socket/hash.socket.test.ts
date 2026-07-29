import { describe, it, expect, vi } from 'vitest';
import { handleHash } from '../../../../../src/presentation/uds/socket/hash.socket.js';
import type { Cradle } from '../../../../../src/infrastructure/container.js';
import { UdsServerMessage } from '../../../../../src/presentation/uds/messages.js';
import { fakeCradle } from '../../../../helpers/cradle.js';
import { fakeLogger } from '../../../../helpers/logger.js';

describe('handleHash', () => {
  it('delegates a valid request to imageHashService.hashBatch', async () => {
    const hashBatch = vi.fn().mockResolvedValue({ id1: { hash: 'deadbeef' } });
    const cradle = fakeCradle({ imageHashService: { hashBatch } as unknown as Cradle['imageHashService'] });

    const response = await handleHash(
      {
        op: 'hash',
        config: { algorithm: 'phash', hash_size: 8 },
        inputs: { id1: { path: '/shared/a.png' } },
      },
      cradle,
    );

    expect(hashBatch).toHaveBeenCalledWith({ algorithm: 'phash', hashSize: 8 }, { id1: { path: '/shared/a.png' } });
    expect(response).toEqual({ outputs: { id1: { hash: 'deadbeef' } } });
  });

  describe('fails every input with internal_error for a bad request-level config, without calling the service', () => {
    it.each([
      {
        name: 'an unrecognized algorithm',
        config: { algorithm: 'bogus-algorithm', hash_size: 8 },
        expected: 'unsupported algorithm "bogus-algorithm"',
      },
      {
        name: 'a hash_size invalid for the given algorithm',
        config: { algorithm: 'whash', hash_size: 10 },
        expected: 'invalid hash_size for "whash" (must be a power of 2): 10',
      },
    ])('$name', async ({ config, expected }) => {
      const hashBatch = vi.fn();
      const cradle = fakeCradle({ imageHashService: { hashBatch } as unknown as Cradle['imageHashService'] });

      const response = await handleHash(
        {
          op: 'hash',
          config,
          inputs: { id1: { path: '/shared/a.png' }, id2: { path: '/shared/b.png' } },
        },
        cradle,
      );

      expect(hashBatch).not.toHaveBeenCalled();
      expect(response?.outputs.id1).toEqual({ error: { code: 'internal_error', message: expected } });
      expect(response?.outputs.id2).toEqual({ error: { code: 'internal_error', message: expected } });
    });
  });

  describe('returns null and logs a warning for a structurally malformed message, without calling the service', () => {
    it.each([
      { name: 'message is null', message: null },
      { name: 'message is a bare string', message: 'not an object' },
      { name: 'message is an array', message: [] },
      { name: 'op is missing', message: { config: { algorithm: 'phash', hash_size: 8 }, inputs: {} } },
      { name: 'op is not "hash"', message: { op: 'ping', config: { algorithm: 'phash', hash_size: 8 }, inputs: {} } },
      { name: 'config is missing entirely', message: { op: 'hash', inputs: {} } },
      {
        name: 'config.algorithm is missing',
        message: { op: 'hash', config: { hash_size: 8 }, inputs: {} },
      },
      {
        name: 'config.hash_size is a string instead of a number',
        message: { op: 'hash', config: { algorithm: 'phash', hash_size: '8' }, inputs: {} },
      },
      { name: 'inputs is missing entirely', message: { op: 'hash', config: { algorithm: 'phash', hash_size: 8 } } },
      {
        name: 'an inputs entry has no path',
        message: { op: 'hash', config: { algorithm: 'phash', hash_size: 8 }, inputs: { id1: {} } },
      },
    ])('$name', async ({ message }) => {
      const hashBatch = vi.fn();
      const logger = fakeLogger();
      const cradle = fakeCradle({
        imageHashService: { hashBatch } as unknown as Cradle['imageHashService'],
        logger,
      });

      const response = await handleHash(message, cradle);

      expect(response).toBeNull();
      expect(hashBatch).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.anything() as unknown }),
        UdsServerMessage.MALFORMED_HASH_REQUEST,
      );
    });
  });
});
