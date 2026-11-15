// Versi artifact: aset 3D ditanam di halaman (window.__PJ_ASSETS / __PJ_GLB) karena halaman artifact
// hanya berisi satu berkas dan memblokir gambar blob:. Pemuat three.js diarahkan ke data itu.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const W = window as unknown as { __PJ_ASSETS?: Record<string, string>; __PJ_GLB?: Record<string, string>; createImageBitmap?: unknown };
const A = W.__PJ_ASSETS ?? {}, G = W.__PJ_GLB ?? {};
// GLTFLoader memakai ImageBitmapLoader (fetch + blob) bila ada; paksa TextureLoader (elemen <img>, data: diizinkan)
try { W.createImageBitmap = undefined; } catch { /* */ }
const il = THREE.ImageLoader.prototype.load;
THREE.ImageLoader.prototype.load = function (this: THREE.ImageLoader, url: string, ...rest: unknown[]) {
  return (il as (...a: unknown[]) => HTMLImageElement).call(this, A[url] ?? url, ...rest);
} as typeof il;
const la = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = function (this: GLTFLoader, url: string, onProgress?: (e: ProgressEvent) => void) {
  const b64 = G[url];
  if (!b64) return la.call(this, url, onProgress);
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  this.manager.itemStart(url);
  return this.parseAsync(bin.buffer, '').finally(() => this.manager.itemEnd(url));
} as typeof la;
