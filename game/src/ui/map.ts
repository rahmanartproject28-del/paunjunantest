// Peta danau: gambar dasar (air, daratan, bukit) dibuat sekali dari layout.ts, lalu bangunan,
// titian, spot, dan pemain digambar di atasnya. Dipakai untuk peta mini dan peta besar.
import {
  lakeE, groundH, KERAMBA, BRIDGES, HUTS, HUT, DOCK, RAFT, GATE, LOKET, WARUNG, AQUA, SPOT_PLACES, YARD, LAKE, IS_DANAU, PADS, LOC,
} from '../world/layout';

export const MAP_BOUNDS = IS_DANAU ? { x0: -112, x1: 112, z0: -122, z1: 42 }
  : LOC === 'serene' ? { x0: -130, x1: 190, z0: -372, z1: 40 }
  : LOC === 'laut' ? { x0: -22, x1: 22, z0: -16, z1: 16 }
  : LOC === 'pantai' ? { x0: -150, x1: 150, z0: -95, z1: 55 }
  : { x0: LAKE.cx - LAKE.rx * 0.75, x1: LAKE.cx + LAKE.rx * 0.75, z0: LAKE.cz - LAKE.rz * 0.9, z1: LAKE.cz + LAKE.rz * 0.9 };
// piksel per meter gambar dasar: lokasi besar memakai resolusi lebih rendah supaya cepat dibuat
const PPM = Math.min(1.5, (LOC === 'serene' ? 330 : 520) / Math.max(MAP_BOUNDS.x1 - MAP_BOUNDS.x0, MAP_BOUNDS.z1 - MAP_BOUNDS.z0));

export interface MapDyn {
  me: { x: number; z: number; yaw: number };
  others: { x: number; z: number; name: string }[];
  activity: Record<string, string>;
  route?: { x: number; z: number }[] | null;
  pin?: { x: number; z: number } | null;
}
export interface View { cx: number; cz: number; scale: number; w: number; h: number }

let base: HTMLCanvasElement | null = null;
/** Gambar dasar dibuat sekali (±80 ribu titik, sekitar 0,1–0,3 detik di HP). */
export function mapBase() {
  if (base) return base;
  const { x0, x1, z0, z1 } = MAP_BOUNDS;
  const W = Math.round((x1 - x0) * PPM), H = Math.round((z1 - z0) * PPM);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + i / PPM, z = z0 + j / PPM;
    const e = lakeE(x, z), h = groundH(x, z);
    let r: number, gg: number, b: number;
    if (e < 1 && h < 0.05) {
      const d = Math.min(1, -h / 7.5);           // kedalaman
      r = 70 - 40 * d; gg = 150 - 60 * d; b = 170 - 40 * d;
    } else {
      // bayangan bukit sederhana dari kemiringan
      const sx = groundH(x + 1, z) - h, sz = groundH(x, z + 1) - h;
      const shade = Math.max(0.55, Math.min(1.25, 1 - (sx * 0.5 + sz * 0.7) * 0.6));
      const hh = Math.min(1, h / 30);
      r = (92 + 70 * hh) * shade; gg = (132 + 20 * hh) * shade; b = (70 + 40 * hh) * shade;
      const sandE = LOC === 'pantai' ? 1.55 : LOC === 'laut' ? 1.25 : LOC === 'sungai' ? 1.06 : 1.03;
      if (e < sandE && h < 3) { const k = LOC === 'pantai' || LOC === 'laut' ? 0.75 : 0.4; r = r * (1 - k) + 222 * k; gg = gg * (1 - k) + 200 * k; b = b * (1 - k) + 140 * k; } // pasir tepi
    }
    const k = (j * W + i) * 4; img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // halaman darat
  if (IS_DANAU) g.fillStyle = 'rgba(200,178,130,0.55)'; else g.fillStyle = 'rgba(0,0,0,0)';
  g.fillRect((YARD.x0 - x0) * PPM, (YARD.z0 - z0) * PPM, (YARD.x1 - YARD.x0) * PPM, (YARD.z1 - YARD.z0) * PPM);
  base = c;
  return c;
}

export const toScreen = (v: View, x: number, z: number) => ({ x: (x - v.cx) * v.scale + v.w / 2, y: (z - v.cz) * v.scale + v.h / 2 });
export const toWorld = (v: View, sx: number, sy: number) => ({ x: (sx - v.w / 2) / v.scale + v.cx, z: (sy - v.h / 2) / v.scale + v.cz });

const ACT_COL: Record<string, string> = { sepi: '#8a96a4', sedang: '#ffd873', ramai: '#ff9a3c' };

export function drawMap(g: CanvasRenderingContext2D, v: View, d: MapDyn, opts: { labels?: boolean; mini?: boolean } = {}) {
  const { x0, z0 } = MAP_BOUNDS;
  g.save();
  g.fillStyle = LOC === 'laut' || LOC === 'pantai' ? '#1f5a80' : '#2b4a3a'; g.fillRect(0, 0, v.w, v.h);
  const b = mapBase(), s = v.scale / PPM, o = toScreen(v, x0, z0);
  g.imageSmoothingEnabled = true;
  g.drawImage(b, o.x, o.y, b.width * s, b.height * s);
  const P = (x: number, z: number) => toScreen(v, x, z);
  const L = (w: number) => Math.max(1, w * v.scale);
  // keramba
  g.strokeStyle = '#6b4a2a'; g.lineWidth = L(0.6);
  for (let z = KERAMBA.z1; z >= KERAMBA.z0 - 0.01; z -= KERAMBA.cell) { const a = P(KERAMBA.x0, z), c = P(KERAMBA.x1, z); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(c.x, c.y); g.stroke(); }
  for (let x = KERAMBA.x0; x <= KERAMBA.x1 + 0.01; x += KERAMBA.cell) { const a = P(x, KERAMBA.z0), c = P(x, KERAMBA.z1); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(c.x, c.y); g.stroke(); }
  g.fillStyle = '#8a3a24';
  for (const h of HUTS) { const a = P(h.x - HUT.body[0], h.z - HUT.body[1]); g.fillRect(a.x, a.y, HUT.body[0] * 2 * v.scale, HUT.body[1] * 2 * v.scale); }
  // titian & dermaga
  g.strokeStyle = '#c9a86a'; g.lineCap = 'round';
  for (const br of BRIDGES) { g.lineWidth = L(br.w); const a = P(br.a.x, br.a.z), c = P(br.b.x, br.b.z); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(c.x, c.y); g.stroke(); }
  g.fillStyle = '#b08a55';
  { const a = P(DOCK.x0, DOCK.z0); g.fillRect(a.x, a.y, (DOCK.x1 - DOCK.x0) * v.scale, (DOCK.z1 - DOCK.z0) * v.scale); }
  // pijakan khusus: batu besar, dermaga nelayan, kapal
  for (const p of PADS) {
    g.fillStyle = p.s === 'batu' ? '#8a8578' : p.s === 'kapal' ? '#e8e2d4' : '#b08a55';
    const a = P(p.x, p.z);
    if (p.r) { g.beginPath(); g.arc(a.x, a.y, Math.max(2, p.r * v.scale), 0, 7); g.fill(); }
    else if (p.s === 'kapal') { const w = p.w! * v.scale, d = p.d! * v.scale; g.beginPath(); g.moveTo(a.x, a.y - d / 2 - w * 0.6); g.lineTo(a.x + w / 2, a.y - d / 2 + w * 0.3); g.lineTo(a.x + w / 2, a.y + d / 2); g.lineTo(a.x - w / 2, a.y + d / 2); g.lineTo(a.x - w / 2, a.y - d / 2 + w * 0.3); g.closePath(); g.fill(); g.strokeStyle = '#1a3a6a'; g.lineWidth = 1.5; g.stroke(); if (p.block) { const c = P(p.block.x, p.block.z); g.fillStyle = '#8a5a3a'; g.fillRect(c.x - p.block.w / 2 * v.scale, c.y - p.block.d / 2 * v.scale, p.block.w * v.scale, p.block.d * v.scale); } }
    else g.fillRect(a.x - p.w! / 2 * v.scale, a.y - p.d! / 2 * v.scale, p.w! * v.scale, p.d! * v.scale);
  }
  // rakit rumput
  g.save(); { const a = P(RAFT.x, RAFT.z); g.translate(a.x, a.y); g.rotate(-RAFT.yaw); g.fillStyle = '#5a7a2e'; g.fillRect(-RAFT.w / 2 * v.scale, -RAFT.len / 2 * v.scale, RAFT.w * v.scale, RAFT.len * v.scale); } g.restore();
  // bangunan halaman
  const icon = (x: number, z: number, e: string, label?: string) => {
    const a = P(x, z); g.font = `${opts.mini ? 11 : 15}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, a.x, a.y);
    if (label && opts.labels) { g.font = 'bold 10px system-ui'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; g.strokeText(label, a.x, a.y + 13); g.fillText(label, a.x, a.y + 13); }
  };
  if (IS_DANAU && (v.scale > 1.2 || opts.labels)) { icon(GATE.x, GATE.z, '🚪', 'Gapura'); icon(LOKET.x, LOKET.z, '🎫', 'Loket'); icon(WARUNG.x, WARUNG.z, '🏪', 'Warung'); icon(AQUA.x, AQUA.z, '🐠', 'Akuarium'); }
  // rute jalan otomatis
  if (d.route && d.route.length) {
    g.strokeStyle = 'rgba(255,216,115,.9)'; g.lineWidth = 2.5; g.setLineDash([5, 4]);
    g.beginPath(); const m0 = P(d.me.x, d.me.z); g.moveTo(m0.x, m0.y);
    for (const q of d.route) { const a = P(q.x, q.z); g.lineTo(a.x, a.y); }
    g.stroke(); g.setLineDash([]);
  }
  // spot
  for (const sp of SPOT_PLACES) {
    const a = P(sp.pos.x, sp.pos.z), r = opts.mini ? 5 : 9;
    g.fillStyle = ACT_COL[d.activity[sp.id]] ?? '#ffd873'; g.strokeStyle = '#13201b'; g.lineWidth = 2;
    g.beginPath(); g.arc(a.x, a.y, r, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#13201b'; g.font = `bold ${opts.mini ? 7 : 9}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sp.id, a.x, a.y + 0.5);
    if (opts.labels) { g.font = 'bold 11px system-ui'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.65)'; g.lineWidth = 3; const t = sp.label.replace(/ [A-Z]\d$/, ''); g.strokeText(t, a.x, a.y + 17); g.fillText(t, a.x, a.y + 17); }
  }
  // pemain lain
  for (const p of d.others) {
    const a = P(p.x, p.z); g.fillStyle = '#7ec8ff'; g.strokeStyle = '#070b10'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(a.x, a.y, opts.mini ? 3 : 4.5, 0, 7); g.fill(); g.stroke();
    if (opts.labels) { g.font = '10px system-ui'; g.fillStyle = '#dff1ff'; g.textAlign = 'left'; g.fillText(p.name, a.x + 6, a.y); }
  }
  // tanda tujuan
  if (d.pin) { const a = P(d.pin.x, d.pin.z); g.font = '22px system-ui'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('📍', a.x, a.y + 2); }
  // saya: panah arah hadap
  { const a = P(d.me.x, d.me.z); g.translate(a.x, a.y); g.rotate(-d.me.yaw); const r = opts.mini ? 7 : 9;
    g.fillStyle = '#ffffff'; g.strokeStyle = '#e0463a'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, -r); g.lineTo(r * 0.7, r * 0.8); g.lineTo(0, r * 0.35); g.lineTo(-r * 0.7, r * 0.8); g.closePath(); g.fill(); g.stroke(); }
  g.restore();
}

/** Peta mini bundar (utara di atas), berpusat pada pemain. */
export function drawMinimap(cv: HTMLCanvasElement, d: MapDyn) {
  const dpr = Math.min(2, devicePixelRatio || 1), size = cv.clientWidth || 120;
  if (cv.width !== Math.round(size * dpr)) { cv.width = cv.height = Math.round(size * dpr); }
  const g = cv.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);
  g.save(); g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 1, 0, 7); g.clip();
  drawMap(g, { cx: d.me.x, cz: d.me.z, scale: 1.6, w: size, h: size }, d, { mini: true });
  // kerucut pandang pemain (seperti peta mini di gambar konsep)
  const fx = -Math.sin(d.me.yaw), fz = -Math.cos(d.me.yaw), a0 = Math.atan2(fz, fx), R = size * 0.5;
  const cg = g.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, R);
  cg.addColorStop(0, 'rgba(255,255,255,0.38)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = cg; g.beginPath(); g.moveTo(size / 2, size / 2); g.arc(size / 2, size / 2, R, a0 - 0.6, a0 + 0.6); g.closePath(); g.fill();
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 1, 0, 7); g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold 10px system-ui'; g.textAlign = 'center'; g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 3; g.fillText('U', size / 2, 12); g.shadowBlur = 0;
}
