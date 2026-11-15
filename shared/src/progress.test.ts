import { describe, it, expect } from 'vitest';
import { Authority, MemoryStore, Social, makeMissions, DAILY_REWARDS, BADGES, type CatchRec } from './index';

function setup() {
  let t = 1_790_000_000;
  const st = new MemoryStore(), A = new Authority({ store: st, rng: Math.random, now: () => t }), S = new Social({ store: st, now: () => t });
  const fish = (i: number, species: CatchRec['species'], weight: number, tier = 1, spot = 'A1'): CatchRec => ({ id: 'f' + i, species, name: species, weight, length: 30, tier, stars: 3, spot, at: t, value: 10 });
  return { st, A, S, fish, tick: (s: number) => { t += s; } };
}

describe('misi harian', () => {
  it('sama untuk pemain & hari yang sama, berbeda antar-hari, jenis ikan sesuai level', () => {
    expect(makeMissions('p1', '20260927', 1)).toEqual(makeMissions('p1', '20260927', 1));
    expect(JSON.stringify(makeMissions('p1', '20260927', 1))).not.toBe(JSON.stringify(makeMissions('p1', '20260928', 1)));
    for (let d = 1; d <= 60; d++) for (const m of makeMissions('px' + d, '202609' + d, 1).list)
      if (m.species) expect(['nila', 'mujair', 'mas', 'patin', 'gabus', 'baung', 'toman', 'lele', 'bawal']).toContain(m.species); // level 1: danau + kolam pemancingan
    expect(makeMissions('p1', '20260927', 1).list.length).toBe(3);
  });
  it('tangkapan menambah progres, klaim sekali, bonus bila ketiganya selesai', async () => {
    const { st, A, S, fish } = setup();
    await st.savePlayer(A.newPlayer('p1', 'Andi'));
    let { player } = await S.progress('p1');
    const board = player.missions!;
    // penuhi semua misi dengan tangkapan yang cocok
    let i = 0;
    for (const m of board.list) for (let k = 0; k < 30 && ((await st.getPlayer('p1'))!.missions!.list.find(x => x.id === m.id)!.progress < m.target); k++)
      await S.onCatch('p1', 'Andi', fish(i++, m.species ?? 'nila', m.kind === 'kg' ? 5 : 1.2, m.kind === 'big' ? 2 : 1));
    player = (await st.getPlayer('p1'))!;
    expect(player.missions!.list.every(m => m.progress >= m.target)).toBe(true);
    await expect(S.claimMission('p1', 'tidak-ada')).rejects.toThrow(/berganti/);
    const c0 = player.coins;
    const r1 = await S.claimMission('p1', board.list[0].id); expect(r1.bonus).toBe(0);
    await expect(S.claimMission('p1', board.list[0].id)).rejects.toThrow(/sudah diambil/);
    await S.claimMission('p1', board.list[1].id);
    const r3 = await S.claimMission('p1', board.list[2].id); expect(r3.bonus).toBe(150);
    expect(r3.player.coins).toBe(c0 + board.list.reduce((a, m) => a + m.reward, 0) + 150);
  });
  it('misi belum selesai tidak bisa diklaim & berganti keesokan hari', async () => {
    const { st, A, S, tick } = setup();
    await st.savePlayer(A.newPlayer('p1', 'Andi'));
    const b1 = (await S.progress('p1')).player.missions!;
    await expect(S.claimMission('p1', b1.list[0].id)).rejects.toThrow(/belum selesai/);
    tick(86400);
    const b2 = (await S.progress('p1')).player.missions!;
    expect(b2.day).not.toBe(b1.day);
  });
});

describe('hadiah harian', () => {
  it('beruntun naik, hari ke-7 bonus umpan, bolong sehari kembali ke hari 1', async () => {
    const { st, A, S, tick } = setup();
    await st.savePlayer(A.newPlayer('p1', 'Andi'));
    for (let d = 1; d <= 7; d++) {
      const r = await S.claimDaily('p1'); expect(r.day).toBe(d); expect(r.coins).toBe(DAILY_REWARDS[d - 1]);
      if (d === 7) expect(r.player.bait.racik).toBe(5);
      await expect(S.claimDaily('p1')).rejects.toThrow(/sudah diambil/);
      tick(86400);
    }
    expect((await st.getPlayer('p1'))!.badges!.beruntun7).toBe('baru');
    tick(86400); // bolong sehari
    expect((await S.claimDaily('p1')).day).toBe(1);
  });
});

describe('lencana', () => {
  it('didapat otomatis dari tangkapan, hadiah diambil sekali', async () => {
    const { st, A, S, fish } = setup();
    const p = A.newPlayer('p1', 'Andi'); p.stats.catches = 1; await st.savePlayer(p);
    await S.onCatch('p1', 'Andi', fish(1, 'toman', 12, 3, 'B3'));
    let q = (await st.getPlayer('p1'))!;
    expect(q.badges!.pertama).toBe('baru'); expect(q.badges!.monster).toBe('baru');
    await expect(S.claimBadge('p1', 'ikan1000')).rejects.toThrow(/belum didapat/);
    const r = await S.claimBadge('p1', 'monster'); expect(r.coins).toBe(BADGES.find(b => b.id === 'monster')!.reward);
    await expect(S.claimBadge('p1', 'monster')).rejects.toThrow(/sudah diambil/);
    // penjelajah: tangkapan di 4 lokasi
    for (const [i, spot] of ['A1', 'S1', 'P1', 'L1'].entries()) await S.onCatch('p1', 'Andi', fish(10 + i, 'nila', 1, 1, spot));
    q = (await st.getPlayer('p1'))!; expect(q.badges!.penjelajah).toBe('baru');
  });
});
