// Menyiapkan aset 3D gratis: dikecilkan & dikompres supaya ringan di HP.
// Jalankan: node tools/prepare-assets.mjs  (butuh folder assets-raw berisi file asli)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, dedup, prune, weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
import fs from 'fs';
import path from 'path';
import { recolorTop, recolorPants } from './recolor.mjs';

const RAW = process.env.RAW || '/home/claude/assets-raw';
const EZ = 'node_modules/@dgreenheck/ez-tree/src';
const OUT = 'game/public/assets';
fs.mkdirSync(OUT + '/tex', { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });

async function squeeze(doc, size = 512) {
  await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }));
}
async function glb(src, dst, fn, size = 512) {
  const doc = await io.read(src);
  if (fn) await fn(doc);
  for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose();
  await squeeze(doc, size);
  await io.write(dst, doc);
  console.log(dst, (fs.statSync(dst).size / 1024).toFixed(0) + ' KB');
}

// 1) Pemancing: lepas topi koboi, warnai ulang baju jadi jersey pancing, celana gelap
await glb(RAW + '/readyplayer.me.glb', OUT + '/angler.glb', async (doc) => {
  const root = doc.getRoot();
  for (const mesh of root.listMeshes()) { mesh.setWeights([]); for (const prim of mesh.listPrimitives()) for (const t of prim.listTargets()) { prim.removeTarget(t); t.dispose(); } }
  for (const node of root.listNodes()) {
    const m = node.getMesh();
    if (m && m.listPrimitives().some(p => p.getMaterial()?.getName() === 'Wolf3D_Headwear')) { node.dispose(); }
  }
  // potong ekor jas (jas pengantin) supaya jadi jaket pendek sebatas pinggul
  for (const mesh of root.listMeshes()) if (mesh.getName() === 'Wolf3D_Outfit_Top') for (const prim of mesh.listPrimitives()) {
    const pa = prim.getAttribute('POSITION'), arr = pa.getArray().slice();
    for (let i = 0; i < arr.length; i += 3) if (arr[i+1] < 0.975) arr[i+1] = 0.975;
    pa.setArray(arr);
  }
  for (const mat of root.listMaterials()) {
    const tex = mat.getBaseColorTexture();
    if (!tex) continue;
    if (mat.getName() === 'Wolf3D_Outfit_Top') tex.setImage(await (await recolorTop(tex.getImage(), 1024)).jpeg({ quality: 88 }).toBuffer()).setMimeType('image/jpeg');
    if (mat.getName() === 'Wolf3D_Outfit_Bottom') tex.setImage(await (await recolorPants(tex.getImage(), 1024)).jpeg({ quality: 88 }).toBuffer()).setMimeType('image/jpeg');
  }
});
// 2) Ikan (model realistis, diwarnai per jenis di dalam game)
await glb(RAW + '/BarramundiFish.glb', OUT + '/fish.glb', null, 512);
// 3) Burung dan batu
for (const n of ['Stork', 'Parrot']) fs.copyFileSync(RAW + '/' + n + '.glb', OUT + '/' + n.toLowerCase() + '.glb');
for (const n of ['rock1', 'rock2']) await glb(EZ + '/app/public/' + n + '.glb', OUT + '/' + n + '.glb', async (d) => { await MeshoptSimplifier.ready; await d.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.18, error: 0.02 })); }, 256);
// 4) Tekstur
const tex = async (src, name, size, fmt = 'webp', opts = {}) => {
  let s = sharp(src).resize(size, size);
  s = fmt === 'webp' ? s.webp({ quality: 80, ...opts }) : s.jpeg({ quality: 82 });
  await s.toFile(OUT + '/tex/' + name + '.' + fmt);
};
await tex(RAW + '/waternormals.jpg', 'waternormals', 512, 'jpg');
await tex(RAW + '/grasslight-big.jpg', 'grass', 512);
await tex(EZ + '/app/public/dirt_color.jpg', 'dirt', 512);
await tex(EZ + '/app/public/dirt_normal.jpg', 'dirt_n', 256);
for (const b of ['oak', 'willow', 'pine', 'birch']) {
  await tex(EZ + `/lib/assets/bark/${b}_color_1k.jpg`, `bark_${b}`, 256);
  await tex(EZ + `/lib/assets/bark/${b}_normal_1k.jpg`, `bark_${b}_n`, 256);
}
for (const l of ['oak', 'ash', 'aspen', 'pine']) await tex(EZ + `/lib/assets/leaves/${l}_color.png`, `leaf_${l}`, 256, 'webp', { alphaQuality: 90 });
{ // rumput tinggi (alfa)
  const d = await io.read(EZ + '/app/public/grass.glb');
  const img = d.getRoot().listTextures()[0].getImage();
  await sharp(img).resize(256, 256).webp({ quality: 80, alphaQuality: 90 }).toFile(OUT + '/tex/grass_blade.webp');
}
let total = 0; const walk = (p) => { for (const f of fs.readdirSync(p)) { const q = path.join(p, f); fs.statSync(q).isDirectory() ? walk(q) : total += fs.statSync(q).size; } };
walk(OUT); console.log('TOTAL', (total/1024/1024).toFixed(2), 'MB');
await import('./split-models.mjs');
