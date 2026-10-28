import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const src = (sub: string) => resolve(__dirname, 'src', sub);

export default defineConfig({
  resolve: {
    alias: {
      '@docker': src('docker'),
      '@ui': src('ui'),
      '@utils': src('utils'),
      '@models': src('models'),
      '@theme': src('theme'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli.ts',
        'src/neo-blessed.d.ts',
        'src/theme.ts',
        'src/models/**',
        'src/ui/**',
        'src/docker/client.ts',
        'src/docker/images.ts',
        'src/docker/volumes.ts',
        'src/docker/compose.ts',
        'src/utils/external-terminal.ts',
      ],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 65,
        lines: 65,
      },
    },
  },
});
