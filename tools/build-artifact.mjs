// Bangun satu berkas HTML untuk artifact claude.ai (atau hosting statis mana pun):
// - three.js dimuat dari cdn.jsdelivr.net lewat import map (tidak dibundel)
// - EZ-Tree diganti pohon prosedural ringan (src/artifact/ezTreeLite.ts)
// - semua aset (model GLB + tekstur) ditanam sebagai data base64
// Pakai: node tools/build-artifact.mjs  → game/dist-artifact/paunjunan.html
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), G = path.join(root, 'game');
const esbuild = await import(process.env.ESBUILD_PATH ?? 'esbuild');
const THREE_VER = '0.186.1', CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VER}`;

// 1) model glTF (json + bin + webp) → GLB dengan gambar sebagai data URI
const mdir = path.join(G, 'public/assets/m'), glb = {};
for (const f of fs.readdirSync(mdir).filter(f => f.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(mdir, f), 'utf8'));
  const bin = fs.readFileSync(path.join(mdir, j.buffers[0].uri));
  delete j.buffers[0].uri; j.buffers[0].byteLength = bin.length;
  for (const im of j.images ?? []) if (im.uri && !im.uri.startsWith('data:')) {
    const ext = path.extname(im.uri).slice(1).replace('jpg', 'jpeg');
    im.uri = `data:image/${ext};base64,` + fs.readFileSync(path.join(mdir, im.uri)).toString('base64');
  }
  let js = Buffer.from(JSON.stringify(j)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const bn = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546C67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + bn.length, 8);
  const c = (buf, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(buf.length, 0); b.writeUInt32LE(type, 4); return Buffer.concat([b, buf]); };
  glb['assets/m/' + f] = Buffer.concat([h, c(js, 0x4E4F534A), c(bn, 0x004E4942)]).toString('base64');
}
// 2) tekstur → data URI
const tdir = path.join(G, 'public/assets/tex'), tex = {};
for (const f of fs.readdirSync(tdir)) tex['assets/tex/' + f] = `data:image/${path.extname(f).slice(1).replace('jpg', 'jpeg')};base64,` + fs.readFileSync(path.join(tdir, f)).toString('base64');

// 3) bundel kode (three dari CDN)
const r = await esbuild.build({
  entryPoints: [path.join(G, 'src/artifact/entry.ts')], bundle: true, format: 'esm', minify: true, write: false, target: 'es2020',
  external: ['three', 'three/*'],
  alias: {
    // EZ-Tree asli (MIT, disalin ke vendor/ez-tree) — pohon pinus & ek realistis; teksturnya diganti versi kecil kita
    'ez-tree-src/index.js': path.join(root, 'vendor/ez-tree/lib/index.js'),
    '@capacitor/core': path.join(G, 'src/artifact/capacitor.ts'), '@capacitor/haptics': path.join(G, 'src/artifact/capacitor.ts'), '@capacitor/app': path.join(G, 'src/artifact/capacitor.ts'),
    '@paunjunan/shared': path.join(root, 'shared/src/index.ts'),
  },
  plugins: [{ name: 'ez-tex', setup(b) { b.onResolve({ filter: /^\.\/textures(\.js)?$/ }, a => a.importer.includes('ez-tree') ? { path: path.join(G, 'src/world/ezTextures.ts') } : undefined); } }],
  loader: { '.css': 'empty' }, logLevel: 'warning',
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// 4) HTML satu berkas
const src = fs.readFileSync(path.join(G, 'index.html'), 'utf8');
const body = src.slice(src.indexOf('<body>') + 6, src.indexOf('</body>')).replace(/<script type="module"[^>]*><\/script>/, '');
const css = fs.readFileSync(path.join(G, 'src/style.css'), 'utf8');
const importMap = { imports: { three: `${CDN}/build/three.module.js`, 'three/examples/jsm/': `${CDN}/examples/jsm/`, 'three/addons/': `${CDN}/examples/jsm/` } };
const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#0b1d1a"><title>PAUNJUNAN Mancing — prototipe</title>
<style>${css}</style>
<script type="importmap">${JSON.stringify(importMap)}</script>
</head><body>${body}
<script>window.__PJ_GLB=${JSON.stringify(glb)};window.__PJ_ASSETS=${JSON.stringify(tex)};</script>
<script type="module">${js}</script>
</body></html>`;
const out = path.join(G, 'dist-artifact'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'paunjunan.html'), html);
console.log('Selesai: game/dist-artifact/paunjunan.html · ' + (html.length / 1048576).toFixed(2) + ' MB');
