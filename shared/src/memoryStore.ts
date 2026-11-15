import type { Store, Player, CatchRec, LeaderRow } from './authority';
import type { SpeciesId } from './data';
import { levelInfo } from './rules';

/** Penyimpanan di memori. Dipakai uji, server pengembangan, dan dasar penyimpanan perangkat. */
export class MemoryStore implements Store {
  players = new Map<string, Player>();
  stock = new Map<string, Partial<Record<SpeciesId, number>>>();
  catches: (CatchRec & { playerId: string; playerName: string })[] = [];
  docs = new Map<string, unknown>();
  onChange?: () => void;
  async getDoc<T>(key: string) { const d = this.docs.get(key); return d === undefined ? null : structuredClone(d) as T; }
  /** Atomik di satu proses: fungsi dijalankan pada salinan, disimpan hanya bila tidak melempar galat. */
  private chain: Promise<unknown> = Promise.resolve();
  updateDoc<T>(key: string, fn: (cur: T | null) => T | Promise<T>): Promise<T> {
    const run = this.chain.then(async () => { const cur = this.docs.has(key) ? structuredClone(this.docs.get(key)) as T : null; const nx = await fn(cur); this.docs.set(key, structuredClone(nx)); this.onChange?.(); return nx; });
    this.chain = run.catch(() => {}); return run;
  }

  async getPlayer(id: string) { const p = this.players.get(id); return p ? structuredClone(p) : null; }
  async savePlayer(p: Player) { this.players.set(p.id, structuredClone(p)); this.onChange?.(); }
  async topCatches(since: number, until: number, species: SpeciesId | null, limit: number) {
    const best = new Map<string, { name: string; weight: number; species: SpeciesId; at: number }>();
    for (const c of this.catches) {
      if (c.at < since || c.at > until || (species && c.species !== species)) continue;
      const b = best.get(c.playerId); if (!b || c.weight > b.weight) best.set(c.playerId, { name: c.playerName, weight: c.weight, species: c.species, at: c.at });
    }
    return [...best.values()].sort((a, b) => b.weight - a.weight || a.at - b.at).slice(0, limit);
  }
  async deletePlayer(id: string) { this.players.delete(id); this.catches = this.catches.filter(c => c.playerId !== id); this.onChange?.(); }
  async getStock(spot: string) { const s = this.stock.get(spot); return s ? { ...s } : null; }
  async initStock(spot: string, s: Partial<Record<SpeciesId, number>>) { this.stock.set(spot, { ...s }); this.onChange?.(); }
  async takeStock(spot: string, k: SpeciesId) {
    const s = this.stock.get(spot); if (!s || (s[k] ?? 0) < 1) return false;
    s[k] = (s[k] ?? 0) - 1; this.onChange?.(); return true;
  }
  async putStock(spot: string, k: SpeciesId) { const s = this.stock.get(spot); if (s) { s[k] = (s[k] ?? 0) + 1; this.onChange?.(); } }
  async addCatch(playerId: string, playerName: string, c: CatchRec) {
    this.catches.push({ ...c, playerId, playerName });
    if (this.catches.length > 5000) this.catches.splice(0, this.catches.length - 5000);
    this.onChange?.();
  }
  async leaderboard(kind: 'heaviest' | 'most' | 'level', since: number, limit: number): Promise<LeaderRow[]> {
    if (kind === 'level') {
      return [...this.players.values()].map(p => ({ playerId: p.id, name: p.name, value: levelInfo(p.xp).lv }))
        .sort((a, b) => b.value - a.value).slice(0, limit);
    }
    const by = new Map<string, LeaderRow>();
    for (const c of this.catches) {
      if (c.at < since) continue;
      const r = by.get(c.playerId) ?? { playerId: c.playerId, name: c.playerName, value: 0 };
      if (kind === 'most') r.value++;
      else if (c.weight > r.value) { r.value = c.weight; r.species = c.species; r.at = c.at; }
      by.set(c.playerId, r);
    }
    return [...by.values()].sort((a, b) => b.value - a.value).slice(0, limit);
  }
  toJSON() { return { players: [...this.players.values()], stock: Object.fromEntries(this.stock), catches: this.catches, docs: Object.fromEntries(this.docs) as Record<string, unknown> }; }
  load(d: ReturnType<MemoryStore['toJSON']>) {
    this.players = new Map(d.players.map(p => [p.id, p]));
    this.stock = new Map(Object.entries(d.stock));
    this.catches = d.catches ?? [];
    this.docs = new Map(Object.entries(d.docs ?? {}));
  }
}
