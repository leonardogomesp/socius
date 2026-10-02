import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['apps/**/*.test.{ts,tsx}'], testTimeout: 15000, fileParallelism: false },
});
