module.exports = {
  testEnvironment: 'node',
  // Only files ending in .test.js are suites; helpers under __tests__/helpers
  // are plain modules, not tests.
  testMatch: ['**/__tests__/**/*.test.js'],
  // Integration suites share one Postgres database and reset it between tests,
  // so suites must not run in parallel against each other.
  maxWorkers: 1,
};
