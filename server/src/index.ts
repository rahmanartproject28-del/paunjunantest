import { buildServer } from './app';
import { MemoryStore } from '@paunjunan/shared';
import { MemoryAccounts } from './accounts';
import fs from 'node:fs';
import { makeMailer } from './mailer';

// Penyimpanan: MySQL bila DB_HOST diisi, selain itu memori + berkas JSON (pengembangan).
const origins = process.env.ALLOWED_ORIGINS?.split(',').map((s: string) => s.trim()).filter(Boolean);
const port = Number(process.env.PORT ?? 8787);

async function main() {
  const mailer = await makeMailer();
  let opts: Parameters<typeof buildServer>[0];
  if (process.env.DB_HOST) {
    const { MysqlStore } = await import('./mysqlStore');
    const db = new MysqlStore({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306), user: process.env.DB_USER ?? '', password: process.env.DB_PASS ?? '', database: process.env.DB_NAME ?? '' });
    await db.ping();
    setInterval(() => db.purgeSessions().catch(() => {}), 3600_000).unref();
    console.log('Penyimpanan: MySQL ' + process.env.DB_HOST);
    opts = { store: db, accounts: db, origins, logger: true, mailer };
  } else {
    const FILE = process.env.DATA_FILE ?? 'data.json';
    const store = new MemoryStore(), accounts = new MemoryAccounts();
    try { const d = JSON.parse(fs.readFileSync(FILE, 'utf8')); store.load(d); if (d.auth) accounts.load(d.auth); } catch { /* berkas belum ada */ }
    let t: NodeJS.Timeout | undefined;
    const save = () => { clearTimeout(t); t = setTimeout(() => fs.writeFileSync(FILE, JSON.stringify({ ...store.toJSON(), auth: accounts.toJSON() })), 1000); };
    store.onChange = save; accounts.onChange = save;
    console.log('Penyimpanan: berkas ' + FILE + ' (isi DB_HOST untuk MySQL)');
    opts = { store, accounts, origins, logger: true, mailer };
  }
  const { app } = buildServer(opts);
  await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
  console.log('PAUNJUNAN server jalan di port ' + port);
}
main().catch(e => { console.error(e); process.exit(1); });
