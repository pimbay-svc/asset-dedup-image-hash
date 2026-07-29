import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ImagehashRunner, suppressEpipe } from '../../../../src/infrastructure/hasher/imagehashRunner.js';
import { ImagehashAlgorithm } from '../../../../src/domain/model/algorithm.model.js';
import { CorruptInputError, InternalExtractionError } from '../../../../src/domain/errors.js';
import { makeEnv } from '../../../helpers/env.js';

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures');
const SAMPLE_IMAGE = path.join(FIXTURES_DIR, 'sample.png'); // real 64x64 PNG
const CORRUPT_IMAGE = path.join(FIXTURES_DIR, 'corrupt.png'); // not a real image
const MISSING_IMAGE = path.join(FIXTURES_DIR, 'does-not-exist.png');

const FAKE_PYTHON_HANGS = path.join(FIXTURES_DIR, 'bin/fake-python-hangs.sh');
const FAKE_PYTHON_EXIT1_NO_STDERR = path.join(FIXTURES_DIR, 'bin/fake-python-exit1-no-stderr.sh');
const FAKE_PYTHON_EXIT3_NO_STDERR = path.join(FIXTURES_DIR, 'bin/fake-python-exit3-no-stderr.sh');

describe('suppressEpipe', () => {
  it('attaches an error listener that swallows the error without throwing or rejecting anything', () => {
    const stdin = new EventEmitter() as unknown as NodeJS.WritableStream;

    suppressEpipe(stdin);

    expect(() => {
      (stdin as unknown as EventEmitter).emit('error', new Error('EPIPE'));
    }).not.toThrow();
  });
});

describe('ImagehashRunner', () => {
  let tempDir: string;
  let largeGarbagePath: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'image-hash-runner-test-'));
    largeGarbagePath = path.join(tempDir, 'large-garbage.bin');
    // Generated here rather than committed as a fixture: a ~2MB random-bytes file adds real
    // weight to the repo/checkout for a single test's benefit, and generating it fresh removes
    // any dependency on the file surviving zip/git transfer intact.
    await writeFile(largeGarbagePath, randomBytes(2 * 1024 * 1024));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('computes a hash for a real image, sized to the requested hash_size', async () => {
    const runner = new ImagehashRunner(makeEnv());

    const hash = await runner.hash(SAMPLE_IMAGE, { algorithm: ImagehashAlgorithm.PHASH, hashSize: 8 });

    expect(hash).toMatch(/^[0-9a-f]{16}$/); // 8x8 grid -> 64-bit hash -> 16 hex chars
  });

  it('produces a longer hash for a larger hash_size', async () => {
    const runner = new ImagehashRunner(makeEnv());

    const hash = await runner.hash(SAMPLE_IMAGE, { algorithm: ImagehashAlgorithm.PHASH, hashSize: 16 });

    expect(hash).toMatch(/^[0-9a-f]{64}$/); // 16x16 grid -> 256-bit hash -> 64 hex chars
  });

  it('is deterministic for identical input', async () => {
    const runner = new ImagehashRunner(makeEnv());

    const first = await runner.hash(SAMPLE_IMAGE, { algorithm: ImagehashAlgorithm.DHASH, hashSize: 8 });
    const second = await runner.hash(SAMPLE_IMAGE, { algorithm: ImagehashAlgorithm.DHASH, hashSize: 8 });

    expect(first).toBe(second);
  });

  describe('supports every algorithm the worker script advertises', () => {
    it.each(Object.values(ImagehashAlgorithm))('%s', async (algorithm) => {
      const runner = new ImagehashRunner(makeEnv());

      const hash = await runner.hash(SAMPLE_IMAGE, { algorithm, hashSize: 8 });

      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  it('rejects an unreadable/corrupt image with CorruptInputError', async () => {
    const runner = new ImagehashRunner(makeEnv());

    await expect(runner.hash(CORRUPT_IMAGE, { algorithm: ImagehashAlgorithm.PHASH, hashSize: 8 })).rejects.toThrow(
      CorruptInputError,
    );
  });

  it('rejects a missing input file with CorruptInputError without ever starting the worker', async () => {
    const runner = new ImagehashRunner(makeEnv());

    await expect(runner.hash(MISSING_IMAGE, { algorithm: ImagehashAlgorithm.PHASH, hashSize: 8 })).rejects.toThrow(
      CorruptInputError,
    );
  });

  it('uses a generic message when the worker exits with the unprocessable-input code but writes nothing to stderr', async () => {
    const runner = new ImagehashRunner(makeEnv({ PYTHON_BIN: FAKE_PYTHON_EXIT1_NO_STDERR }));

    await expect(runner.hash(SAMPLE_IMAGE, { algorithm: ImagehashAlgorithm.PHASH, hashSize: 8 })).rejects.toThrow(
      'could not process image (corrupt or unsupported format)',
    );
  });

  it('uses a generic message when the worker exits with an unexpected code and writes nothing to stderr', async () => {
    const runner = new ImagehashRunner(makeEnv({ PYTHON_BIN: FAKE_PYTHON_EXIT3_NO_STDERR }));

    await expect(runner.hash(SAMPLE_IMAGE, { algorithm: ImagehashAlgorithm.PHASH, hashSize: 8 })).rejects.toThrow(
      'imagehash worker exited with code 3',
    );
  });

  it('does not crash when the worker closes stdin before the input finishes writing (EPIPE)', async () => {
    // fake-python-exit1-no-stderr.sh closes its stdin fd immediately, before reading anything.
    // A 2MB input guarantees multiple stdin writes, so the write-after-close EPIPE is hit
    // deterministically (unlike a small file, which can finish in a single write before the
    // process has even closed its end) — regression test for the child.stdin 'error' handler,
    // see docs/DECISIONS.md.
    const runner = new ImagehashRunner(makeEnv({ PYTHON_BIN: FAKE_PYTHON_EXIT1_NO_STDERR }));

    // The assertion itself is almost secondary here — what this test is really for is that
    // awaiting this doesn't crash the test process with an unhandled 'error' event.
    await expect(runner.hash(largeGarbagePath, { algorithm: ImagehashAlgorithm.PHASH, hashSize: 8 })).rejects.toThrow(
      'could not process image (corrupt or unsupported format)',
    );
  });

  describe('throws InternalExtractionError for worker-invocation failures', () => {
    it.each([
      { name: 'the python binary cannot be found', overrides: { PYTHON_BIN: 'this-binary-does-not-exist' } },
      { name: 'the worker script path does not exist', overrides: { IMAGEHASH_WORKER_PATH: '/no/such/worker.py' } },
      {
        name: 'the worker exceeds its timeout',
        overrides: { PYTHON_BIN: FAKE_PYTHON_HANGS, IMAGEHASH_TIMEOUT_MS: '300' },
      },
    ])('$name', async ({ overrides }) => {
      const runner = new ImagehashRunner(makeEnv(overrides));

      await expect(runner.hash(SAMPLE_IMAGE, { algorithm: ImagehashAlgorithm.PHASH, hashSize: 8 })).rejects.toThrow(
        InternalExtractionError,
      );
    });
  });
});
