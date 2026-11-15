import { describe, it, expect } from 'vitest';
import { backAction, type BackState } from './mobile';

const base: BackState = { sheet: false, lossCard: false, mode: 'wait', autoOn: false, autoWalk: false, inGame: true };

describe('tombol Kembali Android', () => {
  it('menutup lapisan teratas lebih dulu', () => {
    expect(backAction({ ...base, sheet: true, lossCard: true, mode: 'fight', autoOn: true })).toBe('closeSheet');
    expect(backAction({ ...base, lossCard: true, autoOn: true })).toBe('closeLoss');
  });
  it('tidak memutus adu tarik / kartu tangkapan', () => {
    expect(backAction({ ...base, mode: 'fight' })).toBe('holdFight');
    expect(backAction({ ...base, mode: 'landing' })).toBe('holdFight');
    expect(backAction({ ...base, mode: 'trophy', autoOn: true })).toBe('holdTrophy');
  });
  it('menghentikan otomatis & jalan otomatis sebelum keluar danau', () => {
    expect(backAction({ ...base, autoOn: true })).toBe('stopAuto');
    expect(backAction({ ...base, mode: 'walk', autoWalk: true })).toBe('stopWalk');
    expect(backAction({ ...base, mode: 'walk' })).toBe('toMenu');
  });
  it('keluar aplikasi hanya dari menu utama (dengan konfirmasi)', () => {
    expect(backAction({ ...base, mode: 'menu', inGame: false })).toBe('askExit');
  });
});
