module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  coverageProvider: 'v8',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        strict: false,
        noEmit: false,
      },
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(delaunator|robust-predicates)/)',
  ],
  moduleNameMapper: {
    '^@/lib/workers/tinWorkerUrl$': '<rootDir>/tests/__mocks__/tinWorkerUrl.ts',
    '^delaunator$': '<rootDir>/tests/__mocks__/delaunator.ts',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  collectCoverageFrom: [
    // AUDIT FIX (M11, 2026-07-02): Expanded coverage collection from
    // just src/lib/engineering/ to include all critical lib modules.
    'src/lib/engineering/*.ts',
    'src/lib/engine/**/*.ts',
    'src/lib/survey/**/*.ts',
    'src/lib/geodesy/**/*.ts',
    'src/lib/validation/**/*.ts',
    'src/lib/auth/**/*.ts',
    'src/lib/offline/**/*.ts',
    'src/lib/audit/**/*.ts',
    'src/lib/security/**/*.ts',
    'src/lib/workers/**/*.ts',
    // Excludes
    '!src/**/*.test.ts',
    '!src/**/*.test.tsx',
    '!src/**/__tests__/**',
    '!src/**/*.d.ts',
    '!src/**/__mocks__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 55,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/lib/engineering/': {
      branches: 55,
      functions: 55,
      lines: 55,
      statements: 55,
    },
  },
}
