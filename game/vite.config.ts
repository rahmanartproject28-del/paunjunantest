import { defineConfig } from 'vite';
import path from 'node:path';

const EZ = path.resolve(import.meta.dirname, '../node_modules/@dgreenheck/ez-tree/src/lib');

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173 },
  resolve: { alias: [
    { find: 'ez-tree-src', replacement: EZ },
    // EZ-Tree memuat 20 tekstur 1K. Ganti dengan versi kecil kita (256 px, webp) supaya ringan di HP.
    { find: /^\.\/textures(\.js)?$/, replacement: path.resolve(import.meta.dirname, 'src/world/ezTextures.ts') },
  ] },
  optimizeDeps: { exclude: ['ez-tree-src', 'ez-tree-src/index.js'] },
  build: { target: 'es2020', chunkSizeWarningLimit: 1500, assetsInlineLimit: 0 },
});
