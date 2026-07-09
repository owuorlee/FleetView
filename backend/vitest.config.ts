import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    // Forks pool avoids the vitest worker "Timeout calling fetch" seen with the
    // default threads pool on slower Windows machines.
    pool: 'forks',
  },
});
