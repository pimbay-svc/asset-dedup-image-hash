import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnv, type Env } from '../../src/infrastructure/env/env.js';

// Allow the local dev machine's venv-resolved python to be picked up when running tests outside
// of Docker, same as PYTHON_BIN would resolve in production.
const LOCAL_VENV_PYTHON = path.resolve(process.cwd(), 'scripts/.venv/bin/python3');
const PYTHON_BIN = process.env.PYTHON_BIN ?? (existsSync(LOCAL_VENV_PYTHON) ? LOCAL_VENV_PYTHON : 'python3');
const WORKER_PATH = path.resolve(process.cwd(), 'scripts/imagehash_worker.py');

/**
 * Builds a valid `Env` for tests via the real `loadEnv`/zod validation, so fixtures stay honest
 * about coercion/defaults. Pass overrides as strings, exactly as they'd appear in `process.env`.
 */
export function makeEnv(overrides: Partial<Record<string, string>> = {}): Env {
  return loadEnv({
    SOCKET_PATH: '/sockets/x.sock',
    PYTHON_BIN,
    IMAGEHASH_WORKER_PATH: WORKER_PATH,
    IMAGEHASH_TIMEOUT_MS: '10000',
    ...overrides,
  });
}
