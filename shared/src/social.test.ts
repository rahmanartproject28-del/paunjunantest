import { describe, it, expect } from 'vitest';
import { Authority, MemoryStore, Social, START_BAIT, TOURS, TOUR_PARTICIPATION, CLUB_TARGET_KG, CLUB_REWARD, MARKET_FEE, AQ_SIZE, weekKey, dayKey, type CatchRec } from './index';

function setup() {
  let t = 1_790_000_000;
  const st = new MemoryStore();
  const A = new Authority({ store: st, rng: Math.random, now: () => t });
  const S = new Social({ store: st, now: () => t });
  const mk = async (id: string, coins = 2000) => { const p = A.newPlayer(id, id.toUpperCase()); p.coins = coins; await st.savePlayer(p); return p; };
  const fish = (id: string, species: CatchRec['species'], weight: number, tier = 1): CatchRec => ({ id, species, name: species, weight, length: 30, tier, stars: 3, spot: 'B3', at: t, value: Math.round(weight * 10) });
  return { st, A, S, mk, fish, tick: (s: number) => { t += s; }, get t() { return t; } };
}

describe('kosmetik', () => {
  it('membeli barang sekali, memakai lagi gratis, menolak barang tak dikenal', async () => {
    const { S, mk, st } = setup(); await mk('a', 600);
    let r = await S.setLook('a', { hat: 'caping', hatColor: 'merah' }); expect(r.spent).toBe(400);
    r = await S.setLook('a', { hat: 'pet' }); expect(r.spent).toBe(0);
    r = await S.setLook('a', { hat: 'caping' }); expect(r.spent).toBe(0);
    expect((await st.getPlayer('a'))!.look!.hat).toBe('caping');
    await expect(S.setLook('a', { shirt: 'jas-emas' })).rejects.toThrow(/tidak ditemukan/);
    await expect(S.setLook('a', { shirt: 'rompi' })).rejects.toThrow(/Koin tidak cukup/);
  });
});

describe('turnamen', () => {
  it('hanya tangkapan setelah daftar yang dihitung; hadiah juara diambil setelah hari berakhir', async () => {
    const { S, mk, fish, tick, st } = setup(); await mk('a'); await mk('b'); await mk('c');
    await S.onCatch('a', 'A', fish('x0', 'mas', 9)); // belum daftar: tidak dihitung
    for (const id of ['a', 'b', 'c']) await S.joinTournament(id, 'harian');
    await expect(S.joinTournament('a', 'harian')).rejects.toThrow(/sudah terdaftar/);
    await S.onCatch('a', 'A', fish('x1', 'mas', 2.5)); await S.onCatch('b', 'B', fish('x2', 'patin', 4)); await S.onCatch('c', 'C', fish('x3', 'nila', 0.5)); await S.onCatch('a', 'A', fish('x4', 'nila', 1));
    const [d] = await S.tournaments('a');
    expect(d.top.map(r => r.name)).toEqual(['B', 'A', 'C']); expect(d.myBest).toBe(2.5); expect(d.myRank).toBe(2);
    expect((await S.claimTournaments('b')).rewards.length).toBe(0); // belum selesai
    tick(86400);
    const before = (await st.getPlayer('b'))!.coins;
    const rb = await S.claimTournaments('b'); expect(rb.rewards[0].coins).toBe(TOURS[0].prizes[0]); expect(rb.player.coins).toBe(before + TOURS[0].prizes[0]);
    expect((await S.claimTournaments('b')).rewards.length).toBe(0); // tidak bisa dua kali
    expect((await S.claimTournaments('c')).rewards[0].coins).toBe(TOURS[0].prizes[2]);
  });
  it('Raja Nila hanya menghitung nila dan memotong biaya daftar', async () => {
    const { S, mk, fish, st } = setup(); await mk('a', 100);
    await S.joinTournament('a', 'mingguan'); expect((await st.getPlayer('a'))!.coins).toBe(100 - TOURS[1].join);
    await S.onCatch('a', 'A', fish('m', 'toman', 12)); await S.onCatch('a', 'A', fish('n', 'nila', 1.2));
    expect((await S.tournaments('a'))[1].myBest).toBe(1.2);
    await mk('z', 10); await expect(S.joinTournament('z', 'mingguan')).rejects.toThrow(/Koin/);
  });
  it('kunci hari & minggu mengikuti WIB', () => {
    const t = Date.UTC(2026, 8, 27, 17, 30) / 1000; // Minggu 27 Sep 17.30 UTC = Senin 28 Sep 00.30 WIB
    expect(dayKey(t)).toBe('20260928'); expect(weekKey(t)).not.toBe(weekKey(t - 3600));
  });
});

describe('akuarium', () => {
  it('pindah dari keranjang, kapasitas, tiket pengunjung 20 jam', async () => {
    const { S, mk, fish, st, tick } = setup(); const p = await mk('a', 1000);
    p.basket = Array.from({ length: 8 }, (_, i) => fish('f' + i, 'mas', 1, i === 0 ? 3 : 1)); await st.savePlayer(p);
    for (let i = 0; i < AQ_SIZE; i++) await S.toAquarium('a', 'f' + i);
    await expect(S.toAquarium('a', 'f6')).rejects.toThrow(/penuh/);
    await S.buyBigAquarium('a'); await S.toAquarium('a', 'f6');
    const v = await S.claimVisitors('a'); expect(v.coins).toBe(10 + 25 + 3 * 6);
    await expect(S.claimVisitors('a')).rejects.toThrow(/lagi dalam/);
    tick(20 * 3600); expect((await S.claimVisitors('a')).coins).toBeGreaterThan(0);
    const sold = await S.fromAquarium('a', 'f1', 'jual'); expect(sold.player.aquarium!.length).toBe(6);
  });
});

describe('pasar', () => {
  it('pasang, beli (penjual dapat 90%), tarik kembali, dan aturan barang', async () => {
    const { S, mk, st } = setup(); const a = await mk('a', 0); a.rods.push('karbon'); await st.savePlayer(a); await mk('b', 500);
    await expect(S.listItem('a', { kind: 'rod', item: 'pemula', price: 50 })).rejects.toThrow(/pemula/);
    await expect(S.listItem('a', { kind: 'rod', item: 'karbon', price: 2 })).rejects.toThrow(/minimal/);
    const { listing } = await S.listItem('a', { kind: 'rod', item: 'karbon', price: 300 });
    expect((await st.getPlayer('a'))!.rods.includes('karbon')).toBe(false);
    await expect(S.buyListing('a', listing.id)).rejects.toThrow(/sendiri/);
    const r = await S.buyListing('b', listing.id);
    expect(r.player.coins).toBe(200); expect(r.player.rods.includes('karbon')).toBe(true);
    expect((await st.getPlayer('a'))!.coins).toBe(0); // belum diambil: pembeli tidak menulis data penjual
    const got = await S.collectPaid('a'); expect(got.coins).toBe(Math.floor(300 * (1 - MARKET_FEE)));
    expect((await st.getPlayer('a'))!.coins).toBe(Math.floor(300 * (1 - MARKET_FEE)));
    expect((await S.collectPaid('a')).coins).toBe(0); // tidak bisa diambil dua kali
    await expect(S.buyListing('b', listing.id)).rejects.toThrow(/terjual/);
    const b = (await st.getPlayer('b'))!; b.lines.push('pe'); await st.savePlayer(b);
    const l2 = await S.listItem('b', { kind: 'line', item: 'pe', price: 40 });
    await S.cancelListing('b', l2.listing.id); expect((await st.getPlayer('b'))!.lines.includes('pe')).toBe(true);
  });
  it('jual umpan per bungkus: stok umpan dipotong, pembeli dapat jumlahnya, hasil diambil lewat progres', async () => {
    const { S, mk, st } = setup(); const a = await mk('a', 0); a.bait = { udang: 30, cacing: 5 }; await st.savePlayer(a); await mk('b', 100);
    await expect(S.listItem('a', { kind: 'bait', item: 'cacing', qty: 6, price: 20 })).rejects.toThrow(/hanya 5/);
    await expect(S.listItem('a', { kind: 'bait', item: 'udang', qty: 0, price: 20 })).rejects.toThrow(/1–/);
    const { listing } = await S.listItem('a', { kind: 'bait', item: 'udang', qty: 20, price: 60 });
    expect((await st.getPlayer('a'))!.bait.udang).toBe(10);
    const r = await S.buyListing('b', listing.id); expect(r.player.bait.udang).toBe(START_BAIT + 20); expect(r.player.coins).toBe(40);
    await S.progress('a'); expect((await st.getPlayer('a'))!.coins).toBe(Math.floor(60 * (1 - MARKET_FEE)));
    const l2 = await S.listItem('a', { kind: 'bait', item: 'cacing', qty: 5, price: 10 }); await S.cancelListing('a', l2.listing.id);
    expect((await st.getPlayer('a'))!.bait.cacing).toBe(5);
  });
  it('dua pembeli bersamaan: hanya satu yang dapat', async () => {
    const { S, mk, st } = setup(); const a = await mk('a'); a.rods.push('tegar'); await st.savePlayer(a); await mk('b'); await mk('c');
    const { listing } = await S.listItem('a', { kind: 'rod', item: 'tegar', price: 100 });
    const res = await Promise.allSettled([S.buyListing('b', listing.id), S.buyListing('c', listing.id)]);
    expect(res.filter(x => x.status === 'fulfilled').length).toBe(1);
  });
  it('satu pembeli, dua barang bersamaan, koin cukup untuk satu: hanya satu terbeli dan koin tidak minus', async () => {
    const { S, mk, st } = setup(); const a = await mk('a'); a.rods.push('tegar', 'karbon'); await st.savePlayer(a); await mk('b', 120);
    const l1 = (await S.listItem('a', { kind: 'rod', item: 'tegar', price: 100 })).listing;
    const l2 = (await S.listItem('a', { kind: 'rod', item: 'karbon', price: 100 })).listing;
    const res = await Promise.allSettled([S.buyListing('b', l1.id), S.buyListing('b', l2.id)]);
    expect(res.filter(x => x.status === 'fulfilled').length).toBe(1);
    const b = (await st.getPlayer('b'))!;
    expect(b.coins).toBe(20);
    expect(b.rods.filter(r => r === 'tegar' || r === 'karbon').length).toBe(1);
    expect((await S.market()).length).toBe(1);
  });
});

describe('klub', () => {
  it('buat, gabung, target mingguan dari tangkapan, hadiah sekali, keluar', async () => {
    const { S, mk, fish, st } = setup(); await mk('a'); await mk('b');
    const { club } = await S.createClub('a', { name: 'Pemburu Toman', tag: 'pt', icon: '🐟' });
    expect(club.tag).toBe('PT');
    await expect(S.createClub('b', { name: 'Lain', tag: 'PT', icon: '🐟' })).rejects.toThrow(/sudah dipakai/);
    await S.joinClub('b', club.id);
    await expect(S.claimClub('b')).rejects.toThrow(/belum tercapai/);
    await S.onCatch('a', 'A', fish('t1', 'toman', CLUB_TARGET_KG - 10)); await S.onCatch('b', 'B', fish('t2', 'toman', 12));
    expect((await S.clubs('a')).mine!.kg).toBe(CLUB_TARGET_KG + 2);
    const before = (await st.getPlayer('b'))!.coins;
    expect((await S.claimClub('b')).player.coins).toBe(before + CLUB_REWARD);
    await expect(S.claimClub('b')).rejects.toThrow(/sudah diambil/);
    await S.leaveClub('a'); const c = (await S.clubs('b')).mine!; expect(c.owner).toBe('b');
    await S.leaveClub('b'); expect((await S.clubs('b')).list.length).toBe(0);
  });
});

describe('permata', () => {
  it('didapat dari misi (+2, bonus tiga misi +5) dan lencana (+5), tidak bisa diambil dua kali', async () => {
    const { S, mk, st, t } = setup();
    const p = await mk('gem');
    const { ensureMissions, GEMS } = await import('./progress');
    const b = ensureMissions(p, t);
    for (const m of b.list) m.progress = m.target;
    p.stats.catches = 1; await st.savePlayer(p);
    let r = await S.claimMission('gem', b.list[0].id); expect(r.gems).toBe(GEMS.mission); expect(r.player.gems).toBe(2);
    await S.claimMission('gem', b.list[1].id);
    r = await S.claimMission('gem', b.list[2].id); expect(r.gems).toBe(GEMS.mission + GEMS.allMissions); expect(r.player.gems).toBe(11);
    await expect(S.claimMission('gem', b.list[2].id)).rejects.toThrow();
    const bd = await S.claimBadge('gem', 'pertama'); expect(bd.player.gems).toBe(16);
  });
});
