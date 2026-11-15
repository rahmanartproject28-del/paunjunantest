import { describe, it, expect } from 'vitest';
import { Accounts, MemoryAccounts, hashSecret, checkSecret } from './accounts';
import { Authority, MemoryStore } from '@paunjunan/shared';

const inbox: { to: string; text: string }[] = [];
function setup() {
  let t = 1_000_000_000;
  const players = new MemoryStore(), store = new MemoryAccounts();
  const A = new Authority({ store: players, rng: Math.random, weather: () => 'cerah' });
  const acc = new Accounts({ players, store, newPlayer: (id, n) => A.newPlayer(id, n), now: () => t, mailer: async (to, _s, text) => { inbox.push({ to, text }); } });
  return { acc, players, store, A, tick: (ms: number) => { t += ms; } };
}
const REG = { username: 'rajanila', email: 'Raja@Contoh.id', password: 'rahasia123', pin: '481592' };

describe('akun', () => {
  it('lupa sandi: kode lewat email, sekali pakai, kedaluwarsa, tidak membocorkan akun', async () => {
    const { acc, tick } = setup(); inbox.length = 0;
    const r = await acc.register(REG);
    expect(await acc.requestReset('tidakada@contoh.id')).toEqual({ sent: true }); expect(inbox.length).toBe(0);
    await acc.requestReset('raja@contoh.id'); expect(inbox[0].to).toBe('raja@contoh.id');
    const code = inbox[0].text.match(/\b(\d{6})\b/)![1];
    await expect(acc.resetPassword('rajanila', '000000' === code ? '111111' : '000000', 'baru12345')).rejects.toThrow(/Kode salah/);
    const n = await acc.resetPassword('rajanila', code, 'baru12345');
    expect(await acc.playerOf(r.token)).toBe(null); expect(await acc.playerOf(n.token)).toBe(r.player.id);
    await expect(acc.resetPassword('rajanila', code, 'lagi12345')).rejects.toThrow(/Kode salah/); // sekali pakai
    await acc.requestReset('rajanila'); const c2 = inbox[1].text.match(/\b(\d{6})\b/)![1];
    tick(31 * 60000); await expect(acc.resetPassword('rajanila', c2, 'lagi12345')).rejects.toThrow(/kedaluwarsa/);
  });
  it('hash sandi bisa dicek dan tidak menyimpan teks asli', async () => {
    const h = await hashSecret('abc12345');
    expect(h.includes('abc12345')).toBe(false);
    expect(await checkSecret('abc12345', h)).toBe(true);
    expect(await checkSecret('abc12346', h)).toBe(false);
  });
  it('daftar lalu masuk dengan nama pengguna atau email', async () => {
    const { acc } = setup();
    const r = await acc.register(REG);
    expect(await acc.playerOf(r.token)).toBe(r.player.id);
    expect((await acc.login('RAJANILA', 'rahasia123')).player.id).toBe(r.player.id);
    expect((await acc.login('raja@contoh.id', 'rahasia123')).player.id).toBe(r.player.id);
    await expect(acc.login('rajanila', 'salah12345')).rejects.toThrow(/salah/);
  });
  it('menolak data daftar yang tidak valid atau ganda', async () => {
    const { acc } = setup();
    await expect(acc.register({ ...REG, username: 'ab' })).rejects.toThrow(/Nama pengguna/);
    await expect(acc.register({ ...REG, email: 'bukan-email' })).rejects.toThrow(/email/);
    await expect(acc.register({ ...REG, password: 'pendek1' })).rejects.toThrow(/sandi/);
    await expect(acc.register({ ...REG, pin: '111111' })).rejects.toThrow(/PIN/);
    await acc.register(REG);
    await expect(acc.register({ ...REG, email: 'lain@contoh.id' })).rejects.toThrow(/sudah dipakai/);
    await expect(acc.register({ ...REG, username: 'lain' })).rejects.toThrow(/sudah terdaftar/);
  });
  it('dikunci 10 menit setelah 5 kali salah sandi', async () => {
    const { acc, tick } = setup();
    await acc.register(REG);
    for (let i = 0; i < 5; i++) await expect(acc.login('rajanila', 'salahsalah1')).rejects.toThrow(/salah/);
    await expect(acc.login('rajanila', 'rahasia123')).rejects.toThrow(/Terlalu banyak/);
    tick(11 * 60000);
    expect((await acc.login('rajanila', 'rahasia123')).player.name).toBe('rajanila');
  });
  it('masuk cepat PIN hanya dengan token perangkat; 5 kali salah mencabut perangkat', async () => {
    const { acc } = setup();
    const r = await acc.register(REG);
    const p = await acc.pinLogin(r.device, '481592');
    expect(await acc.playerOf(p.token)).toBe(r.player.id);
    expect(await acc.playerOf(r.device)).toBe(null); // token perangkat bukan token sesi
    for (let i = 0; i < 4; i++) await expect(acc.pinLogin(r.device, '000001')).rejects.toThrow(/Sisa/);
    await expect(acc.pinLogin(r.device, '000001')).rejects.toThrow(/5 kali/);
    await expect(acc.pinLogin(r.device, '481592')).rejects.toThrow(/belum terdaftar/);
  });
  it('tamu yang mendaftar tetap membawa koin & tangkapannya', async () => {
    const { acc, players } = setup();
    const g = await acc.guest('Tamu');
    const p = (await players.getPlayer(g.player.id))!; p.coins = 777; await players.savePlayer(p);
    const r = await acc.register({ ...REG, guestToken: g.token });
    expect(r.player.id).toBe(g.player.id);
    expect(r.player.coins).toBe(777);
    expect(await acc.playerOf(g.token)).toBe(null); // token tamu lama dicabut
  });
  it('sesi kedaluwarsa setelah 60 hari', async () => {
    const { acc, tick } = setup();
    const g = await acc.guest('Tamu');
    tick(59 * 86400_000); expect(await acc.playerOf(g.token)).toBe(g.player.id);
    tick(2 * 86400_000); expect(await acc.playerOf(g.token)).toBe(null);
  });
  it('hapus akun menghapus pemain, akun, dan semua sesi', async () => {
    const { acc, players, store } = setup();
    const r = await acc.register(REG);
    await expect(acc.deleteAccount(r.token, 'salah12345')).rejects.toThrow(/salah/);
    await acc.deleteAccount(r.token, 'rahasia123');
    expect(await players.getPlayer(r.player.id)).toBe(null);
    expect(await store.findAccount('rajanila')).toBe(null);
    expect(await acc.playerOf(r.token)).toBe(null);
    await expect(acc.pinLogin(r.device, '481592')).rejects.toThrow();
  });
  it('ganti sandi mencabut sesi lama', async () => {
    const { acc } = setup();
    const r = await acc.register(REG);
    const n = await acc.changePassword(r.token, 'rahasia123', 'baru45678');
    expect(await acc.playerOf(r.token)).toBe(null);
    expect(await acc.playerOf(n.token)).toBe(r.player.id);
    expect((await acc.login('rajanila', 'baru45678')).player.id).toBe(r.player.id);
  });
});
