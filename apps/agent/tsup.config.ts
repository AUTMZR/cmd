import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

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
  // Bake version into the bundle so it doesn't depend on ../package.json at runtime
  // (the bundle is shipped to ~/.autmzr-command/ where no package.json lives).
  define: {
    __AUTMZR_AGENT_VERSION__: JSON.stringify(pkgVersion),
  },
  // Shim require() for ESM — ws + its bundled deps call require('events'), require('stream'), etc.
  banner: {
    js: "import{createRequire as __pcCreateRequire}from'module';const require=__pcCreateRequire(import.meta.url);",
  },
});
