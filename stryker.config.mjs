// @ts-check

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  testRunner: 'vitest',

  ignorePatterns: [
    'dist/**',
    'var/**',
    'scripts/.venv/**',
    'scripts/tests/.venv/**',
    'scripts/tests/__pycache__/**',
    'test/unit/infrastructure/hasher/imagehashRunner.test.ts',
  ],
  mutate: [
    'src/**/*.ts',
    '!src/server.ts',
    '!src/presentation/uds/healthcheck.ts',
    '!src/infrastructure/hasher/imagehashRunner.ts',
  ],

  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',

  coverageAnalysis: 'perTest',
  ignoreStatic: true,

  thresholds: {
    high: 100,
    low: 100,
    break: 100,
  },

  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: {
    fileName: 'var/tests/mutation/index.html',
  },
  jsonReporter: {
    fileName: 'var/tests/mutation/report.json',
  },

  tempDirName: 'var/tests/.stryker-tmp',
};

export default config;
