module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/chatgpt/**/*.test.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', moduleResolution: 'node', esModuleInterop: true, target: 'ES2022', strict: true } }] },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testTimeout: 30000,
}
