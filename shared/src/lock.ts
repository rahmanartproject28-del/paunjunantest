/**
 * Kunci per kunci-teks (mis. per pemain): permintaan dengan kunci yang sama dijalankan berurutan,
 * kunci berbeda tetap berjalan bersamaan. Mencegah "pembaruan hilang" saat dua permintaan
 * membaca → mengubah → menyimpan data pemain yang sama di waktu bersamaan.
 * Berlaku dalam satu proses server (cukup untuk satu instans; banyak instans butuh kunci di database).
 */
export class KeyedLock {
  private tails = new Map<string, Promise<void>>();
  /** Jumlah kunci yang sedang dipegang/antre (untuk uji & pemantauan). */
  get size() { return this.tails.size; }

  /** Tunggu giliran; kembalikan fungsi pelepas. Pelepas aman dipanggil lebih dari sekali.
   *  `maxHoldMs`: kunci dilepas otomatis bila lupa dilepas (permintaan macet). */
  async acquire(key: string, maxHoldMs = 15000): Promise<() => void> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    let open!: () => void;
    const mine = new Promise<void>(r => { open = r; });
    const tail = prev.then(() => mine);
    this.tails.set(key, tail);
    await prev;
    let done = false;
    const timer = setTimeout(() => release(), maxHoldMs);
    (timer as { unref?: () => void }).unref?.();
    const release = () => {
      if (done) return; done = true; clearTimeout(timer); open();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    };
    return release;
  }

  /** Jalankan fn dengan kunci dipegang. */
  async run<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire(key);
    try { return await fn(); } finally { release(); }
  }
}
