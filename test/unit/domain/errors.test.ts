import { describe, it, expect } from 'vitest';
import { CorruptInputError, InternalExtractionError } from '../../../src/domain/errors.js';

describe('CorruptInputError', () => {
  describe('workerRejected()', () => {
    it.each([
      {
        name: 'uses the worker stderr as the message when present',
        stderr: 'unrecognized image format',
        expected: 'unrecognized image format',
      },
      {
        name: 'falls back to a generic message when stderr is empty',
        stderr: '',
        expected: 'could not process image (corrupt or unsupported format)',
      },
    ])('$name', ({ stderr, expected }) => {
      const err = CorruptInputError.workerRejected(stderr);

      expect(err).toBeInstanceOf(CorruptInputError);
      expect(err.name).toBe('CorruptInputError');
      expect(err.message).toBe(expected);
    });
  });

  it('unreadableFile() includes the underlying error message', () => {
    const err = CorruptInputError.unreadableFile(new Error('ENOENT: no such file or directory'));

    expect(err.message).toBe('could not read image file: ENOENT: no such file or directory');
  });
});

describe('InternalExtractionError', () => {
  it('timedOut() includes the configured timeout in milliseconds', () => {
    const err = InternalExtractionError.timedOut(10_000);

    expect(err).toBeInstanceOf(InternalExtractionError);
    expect(err.name).toBe('InternalExtractionError');
    expect(err.message).toBe('imagehash worker timed out after 10000ms');
  });

  it('spawnFailed() includes the underlying spawn error message', () => {
    const err = InternalExtractionError.spawnFailed(new Error('ENOENT'));

    expect(err.message).toBe('failed to start imagehash worker: ENOENT');
  });

  describe('workerExited()', () => {
    it.each([
      {
        name: 'uses stderr as the message when present',
        code: 3,
        stderr: 'unexpected internal failure',
        expected: 'unexpected internal failure',
      },
      {
        name: 'falls back to a generic message with the exit code when stderr is empty',
        code: 3,
        stderr: '',
        expected: 'imagehash worker exited with code 3',
      },
      {
        name: 'renders a null exit code (killed by signal) in the fallback message',
        code: null,
        stderr: '',
        expected: 'imagehash worker exited with code null',
      },
    ])('$name', ({ code, stderr, expected }) => {
      const err = InternalExtractionError.workerExited(code, stderr);

      expect(err.message).toBe(expected);
    });
  });
});
