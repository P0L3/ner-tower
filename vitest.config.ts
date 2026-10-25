import { defineConfig, configDefaults } from 'vitest/config';

// Separate from vite.config.ts so tests don't load the single-file build plugin.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'src/**/*.live.test.ts'], // see vitest.live.config.ts
    environment: 'node',
  },
});
