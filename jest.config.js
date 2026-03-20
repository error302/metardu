module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  collectCoverageFrom: [
    'src/lib/engine/*.ts',           // Core engine only — not solution wrappers
    '!src/lib/engine/testFixtures.ts',
    '!src/lib/engine/leastSquares.ts', // 800-line numerical solver, tested indirectly
    '!src/lib/engine/index.ts',        // Barrel file
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 55,   // Numerical engines have many defensive guards hard to test
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/lib/engine/': {
      branches: 55,   // Scientific computing: guards for edge cases, NaN, degenerate inputs
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
}
