import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { buildContainer } from '../../../src/infrastructure/container.js';
import { ImageHashService } from '../../../src/application/service/hash.service.js';
import { ImagehashRunner } from '../../../src/infrastructure/hasher/imagehashRunner.js';
import type { Env } from '../../../src/infrastructure/env/env.js';
import { makeEnv } from '../../helpers/env.js';

describe('buildContainer', () => {
  it('resolves imageHashService as an ImageHashService wired to a real ImagehashRunner', () => {
    const env = makeEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      SOCKET_PATH: path.join('/tmp', 'image-hash.sock'),
    });
    const built = buildContainer(env);

    const { cradle } = built.container;

    expect(cradle.imageHashService).toBeInstanceOf(ImageHashService);
    expect(cradle.imageHasher).toBeInstanceOf(ImagehashRunner);
  });

  it('uses CLASSIC injection — ImagehashRunner receives the exact registered env value, not the whole cradle', () => {
    const env = makeEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      SOCKET_PATH: path.join('/tmp', 'image-hash.sock'),
    });
    const built = buildContainer(env);

    const imageHasher = built.container.cradle.imageHasher as unknown as { env: Env };

    expect(imageHasher.env).toBe(env);
  });

  it('cleanup() resolves without throwing', async () => {
    const env = makeEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      SOCKET_PATH: path.join('/tmp', 'image-hash.sock'),
    });
    const built = buildContainer(env);

    await expect(built.cleanup()).resolves.toBeUndefined();
  });
});
