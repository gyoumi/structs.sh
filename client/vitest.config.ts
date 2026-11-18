import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so tests don't load the type checker or
// Pigment plugins.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
