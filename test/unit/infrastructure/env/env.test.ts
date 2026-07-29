import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadEnv, NodeEnv } from '../../../../src/infrastructure/env/env.js';
import { EnvError } from '../../../../src/infrastructure/env/errors.js';

const validEnv = {
  SOCKET_PATH: '/sockets/image-hash.sock',
};

describe('loadEnv', () => {
  it('accepts a minimal valid environment and fills in defaults', () => {
    const env = loadEnv(validEnv);

    expect(env.SOCKET_PATH).toBe('/sockets/image-hash.sock');
    expect(env.NODE_ENV).toBe(NodeEnv.PRODUCTION);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.PYTHON_BIN).toBe('python3');
    expect(env.IMAGEHASH_WORKER_PATH).toBe(path.resolve(process.cwd(), 'scripts/imagehash_worker.py'));
    expect(env.IMAGEHASH_TIMEOUT_MS).toBe(10_000);
  });

  it('coerces numeric env vars from strings', () => {
    const env = loadEnv({ ...validEnv, IMAGEHASH_TIMEOUT_MS: '5000' });

    expect(env.IMAGEHASH_TIMEOUT_MS).toBe(5000);
  });

  it('accepts an explicit IMAGEHASH_WORKER_PATH override', () => {
    const env = loadEnv({ ...validEnv, IMAGEHASH_WORKER_PATH: './custom/worker.py' });

    expect(env.IMAGEHASH_WORKER_PATH).toBe('./custom/worker.py');
  });

  it('accepts an explicit PYTHON_BIN override', () => {
    const env = loadEnv({ ...validEnv, PYTHON_BIN: '/usr/bin/python3.12' });

    expect(env.PYTHON_BIN).toBe('/usr/bin/python3.12');
  });

  describe('rejects an invalid environment with EnvError', () => {
    it.each([
      { name: 'SOCKET_PATH is missing', overrides: {} },
      { name: 'NODE_ENV has an invalid value', overrides: { ...validEnv, NODE_ENV: 'staging' } },
      { name: 'IMAGEHASH_TIMEOUT_MS is non-numeric', overrides: { ...validEnv, IMAGEHASH_TIMEOUT_MS: 'not-a-number' } },
    ])('$name', ({ overrides }) => {
      expect(() => loadEnv(overrides)).toThrow(EnvError);
    });
  });
});
