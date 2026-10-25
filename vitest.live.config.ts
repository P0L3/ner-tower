import { defineConfig } from 'vitest/config';

// `npm run test:live`: tests that talk to real services. Never part of the default run.
export default defineConfig({
  test: {
    include: ['src/**/*.live.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
});
