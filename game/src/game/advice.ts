// Saran saat spot sepi: pindah spot, ganti jarak lempar / sub-zona, ganti umpan.
// Murni (tanpa DOM/three) supaya bisa diuji. Angka stok diambil dari data bawaan spot (perkiraan),
// keramaian spot saat ini dari server (world.spots[].activity) bila ada.
import { DEFAULT_SPOTS, BAITS, WEATHER, spotRates, type BaitId, type Zone, type SubZone, type WeatherId, type Player } from '@paunjunan/shared';

export interface QuietCtx {
  spot: string; loc: string; zone: Zone; sub: SubZone; dist: number;
  player: Pick<Player, 'bait' | 'curBait'>;
  weather: WeatherId;
  /** keramaian spot dari server: id → sepi/sedang/ramai */
  activity?: Record<string, 'sepi' | 'sedang' | 'ramai'>;
  /** lemparan kosong berturut-turut */
  empty: number;
}
export type AdviceAct = 'map' | 'bait' | 'far' | 'near' | 'none';
export interface Advice { text: string; act: AdviceAct; actLabel?: string; baitTo?: BaitId; spotTo?: string }

const RANK = { sepi: 0, sedang: 1, ramai: 2 } as const;
const SUB_NAME: Partial<Record<SubZone, string>> = { keramba: 'sela petak keramba', lepas: 'perairan lepas', dermaga: 'dekat tiang dermaga' };

/** Perkiraan peluang sambar (relatif) untuk spot/zona/umpan tertentu, dari stok bawaan spot. */
export function expectRate(spot: string, zone: Zone | '', sub: SubZone | '', bait: BaitId, weather: WeatherId) {
  const def = DEFAULT_SPOTS.find(s => s.id === spot); if (!def) return 0;
  return spotRates(def.stock, zone, sub, weather, bait).total;
}

/** Daftar saran urut dari yang paling berguna (maks. 3). */
export function quietAdvice(c: QuietCtx): Advice[] {
  const out: Advice[] = [];
  const here = DEFAULT_SPOTS.find(s => s.id === c.spot);
  const sameLoc = DEFAULT_SPOTS.filter(s => s.loc === c.loc && s.id !== c.spot);
  const actHere = c.activity?.[c.spot];
  const cur = expectRate(c.spot, c.zone, c.sub, c.player.curBait, c.weather);

  // 1) spot lain di lokasi ini sedang lebih ramai (menurut server), atau stok bawaannya jauh lebih banyak
  const better = sameLoc
    .map(s => ({ s, act: c.activity?.[s.id], r: expectRate(s.id, '', '', c.player.curBait, c.weather) }))
    .filter(x => actHere && x.act ? RANK[x.act] > RANK[actHere] : x.r > cur * 1.35)
    .sort((a, b) => (b.act ? RANK[b.act] : 0) - (a.act ? RANK[a.act] : 0) || b.r - a.r)[0];
  if (better && (actHere === 'sepi' || c.empty >= 2 || !c.activity)) {
    out.push({ text: `${better.s.name} sedang ${better.act ?? 'lebih ramai'}. Coba pindah ke sana.`, act: 'map', actLabel: 'Buka peta', spotTo: better.s.id });
  }

  // 2) jarak lempar: ikan di spot ini lebih banyak di zona lain
  if (here) {
    const other: Zone = c.zone === 'near' ? 'far' : 'near';
    const rOther = expectRate(c.spot, other, '', c.player.curBait, c.weather), rZone = expectRate(c.spot, c.zone, '', c.player.curBait, c.weather);
    if (rOther > rZone * 1.2) out.push(other === 'far'
      ? { text: `Lempar lebih jauh (lebih dari 12 m). Lemparan tadi ${Math.round(c.dist)} m.`, act: 'far' }
      : { text: 'Lempar lebih dekat (kurang dari 12 m), ikan di sini banyak di pinggir.', act: 'near' });
    // sub-zona khusus (keramba / perairan lepas / dermaga)
    const subs = (['keramba', 'lepas', 'dermaga'] as SubZone[]).filter(s => s !== c.sub)
      .map(s => ({ s, r: expectRate(c.spot, '', s, c.player.curBait, c.weather) }))
      .filter(x => x.r > expectRate(c.spot, '', c.sub, c.player.curBait, c.weather) * 1.25 && (x.s !== 'keramba' || c.loc === 'danau') && (x.s !== 'dermaga' || c.spot === 'A1' || c.spot === 'D1'))
      .sort((a, b) => b.r - a.r)[0];
    if (subs && out.length < 3) out.push({ text: `Arahkan umpan ke ${SUB_NAME[subs.s]}.`, act: 'none' });
  }

  // 3) umpan: umpan lain di tas memberi peluang jauh lebih besar di spot ini
  const owned = (Object.keys(c.player.bait) as BaitId[]).filter(b => b !== c.player.curBait && (c.player.bait[b] ?? 0) > 0 && BAITS[b]);
  const best = owned.map(b => ({ b, r: expectRate(c.spot, c.zone, c.sub, b, c.weather) })).sort((a, b) => b.r - a.r)[0];
  if (best && best.r > cur * 1.25) out.push({ text: `Ganti umpan ke ${BAITS[best.b].name} (punya ${c.player.bait[best.b]}). Ikan di sini lebih suka itu.`, act: 'bait', actLabel: 'Ganti umpan', baitTo: best.b });
  else if (!best && cur > 0 && c.empty >= 2) {
    // tidak punya umpan lain: sarankan beli umpan yang paling cocok untuk spot ini
    const shop = (Object.keys(BAITS) as BaitId[]).filter(b => b !== c.player.curBait)
      .map(b => ({ b, r: expectRate(c.spot, c.zone, c.sub, b, c.weather) })).sort((a, b) => b.r - a.r)[0];
    if (shop && shop.r > cur * 1.3) out.push({ text: `Umpan ${BAITS[shop.b].name} lebih cocok di sini (${BAITS[shop.b].price} koin di Toko).`, act: 'bait', actLabel: 'Lihat umpan', baitTo: shop.b });
  }

  // 4) cuaca (fakta dari aturan: hujan 1,4×, kabut 1,15×)
  if (out.length === 0 && c.weather === 'cerah') out.push({ text: `Sabar sebentar, atau tunggu cuaca berkabut/hujan: ikan ${Math.round((WEATHER.hujan.mul - 1) * 100)}% lebih aktif saat hujan.`, act: 'none' });
  if (out.length === 0) out.push({ text: 'Belum ada yang menyambar. Gulung lalu lempar lagi ke titik lain.', act: 'none' });
  return out.slice(0, 3);
}
