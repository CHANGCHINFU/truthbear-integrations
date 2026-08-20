import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: false,
  treeshake: true,
  // Keep the published bundle dependency-free: the AI SDK and zod are the host app's.
  external: ['ai', 'zod'],
});
