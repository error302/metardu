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
    'src/lib/engineering/*.ts',       // Kenya RDM 1.1 engineering computations
    '!src/lib/engineering/__tests__/*.test.ts',
    '!src/**/*.d.ts',
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
