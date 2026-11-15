// Mewarnai ulang tekstur baju avatar menjadi jersey pancing (tanpa logo/merek).
import sharp from 'sharp';
export async function recolorTop(buf, size = 512) {
  const { data, info } = await sharp(buf).resize(size, size).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  const JACKET = [34, 38, 44], ACCENT = [24, 150, 118], SHIRT = [236, 238, 240], TRIM = [230, 232, 235];
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i+1], b = data[i+2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0, L = (0.3*r + 0.59*g + 0.11*b) / 255;
    let col, k;
    if (sat < 0.16 && mx > 150) { col = ACCENT; k = 0.5 + 0.6*L; }              // kemeja putih -> kaos dalam hijau toska
    else if (r > 150 && r > b + 40 && g < 120 && sat > 0.4) { col = JACKET; k = 1.0; }    // bunga mawar -> hilang
    else if (b > g + 10 && r > g + 10) { col = [52, 58, 66]; k = 0.55 + 0.9*L; }         // rompi ungu -> panel abu gelap
    else if (g > r && g > b) { col = JACKET; k = 1.0; }                                  // daun -> hilang
    else if (mx < 130 && r > g && g >= b && sat > 0.35) { col = [58, 50, 44]; k = 0.6 + L; }        // kancing cokelat
    else { col = JACKET; k = 0.55 + 1.1*L; }                                             // jas -> jersey gelap
    // pola titik-titik halftone halus di badan (seperti jersey pancing)
    for (let c = 0; c < 3; c++) out[i+c] = Math.max(0, Math.min(255, col[c]*k));
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } });
}
export async function recolorPants(buf, size = 512, tint = [46, 48, 52]) {
  const { data, info } = await sharp(buf).resize(size, size).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i+1], b = data[i+2], L = (0.3*r + 0.59*g + 0.11*b)/255;
    const isBelt = Math.max(r,g,b) < 90;
    const k = isBelt ? 0.5 + L : 0.5 + 1.0*L;
    const t = isBelt ? [40, 32, 26] : tint;
    for (let c = 0; c < 3; c++) out[i+c] = Math.max(0, Math.min(255, t[c]*k));
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } });
}
