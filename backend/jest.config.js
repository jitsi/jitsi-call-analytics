/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: [ '<rootDir>/src', '<rootDir>/test' ],
    testMatch: [ '**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts' ],
    transform: {
        '^.+.ts$': 'ts-jest'
    },
    collectCoverageFrom: [ 'src/**/*.ts', '!src/**/*.d.ts', '!src/**/index.ts' ],
    coverageDirectory: 'coverage',
    coverageReporters: [ 'text', 'lcov', 'html' ],
    moduleFileExtensions: [ 'ts', 'js', 'json', 'node' ],
    testTimeout: 30000, // 30 seconds for processing dump files
    setupFilesAfterEnv: [ '<rootDir>/jest.setup.js' ],
    cacheDirectory: '/tmp/jest_cache'
};
