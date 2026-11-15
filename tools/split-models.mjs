// Pecah .glb menjadi JSON + gambar .webp terpisah + buffer (.wasm) supaya bisa dimuat di mana saja
// (termasuk halaman yang memblokir gambar blob:). GLTFLoader tidak peduli ekstensi file.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const SRC = 'game/public/assets', OUT = 'game/public/assets/m';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.glb'))) {
  const n = f.replace('.glb', '');
  const doc = await io.read(SRC + '/' + f);
  doc.getRoot().listTextures().forEach((t, i) => t.setURI(`${n}_${i}.${t.getMimeType() === 'image/png' ? 'png' : t.getMimeType() === 'image/jpeg' ? 'jpg' : 'webp'}`));
  doc.getRoot().listBuffers().forEach(b => b.setURI(n + '.bin.wasm'));
  const { json, resources } = await io.writeJSON(doc);
  fs.writeFileSync(`${OUT}/${n}.json`, JSON.stringify(json));
  for (const [uri, data] of Object.entries(resources)) fs.writeFileSync(`${OUT}/${uri}`, data);
  console.log(n, Object.keys(resources).join(' '));
}
