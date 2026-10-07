import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src/js') } },
  test: {
    include: ['tests/unit/**/*.test.js', 'tests/functions/**/*.test.js'],
    environment: 'node',
  },
});
