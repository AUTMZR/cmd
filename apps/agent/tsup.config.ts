import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  minify: true,
  splitting: false,
  clean: true,
  // Bundle everything so agent.js works as a single file on machines without node_modules.
  noExternal: ['ws', '@autmzr/command-protocol', '@autmzr/plugin-api'],
  // Shim require() for ESM — ws + its bundled deps call require('events'), require('stream'), etc.
  banner: {
    js: "import{createRequire as __pcCreateRequire}from'module';const require=__pcCreateRequire(import.meta.url);",
  },
});
