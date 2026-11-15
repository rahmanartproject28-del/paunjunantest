// Server game PAUNJUNAN (Node.js + TypeScript).
// HTTP untuk aksi yang menentukan hasil (lempar, sentak, dapat ikan, toko),
// WebSocket untuk hal waktu nyata (posisi pemain, obrolan) per ruang.
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { WebSocketServer, WebSocket } from 'ws';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { websiteHtml } from './website';
import { googlePlay } from './googlePlay';
import { Accounts, MemoryAccounts, type AccountStore, type Mailer } from './accounts';
import {
  Authority, Social, Trades, AdminService, Billing, COIN_PACKS, GameError, MemoryStore, KeyedLock, isBanned, banMessage, cleanChat, cleanName, levelInfo, ROOM_CAPACITY, SNAP_HZ,
  type Store, type DocStore, type BackdropSlot, type ClientMsg, type ServerMsg, type NetPlayer, type WeatherId,
} from '@paunjunan/shared';

export interface ServerOptions { mailer?: Mailer; adminToken?: string; store?: Store & DocStore; accounts?: AccountStore; origins?: string[]; weather?: () => WeatherId; now?: () => number; logger?: boolean }

const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

export function buildServer(opts: ServerOptions = {}) {
  const store = opts.store ?? new MemoryStore();
  const admin = new AdminService(store, opts.now);
  const A = new Authority({ store, rng, weather: opts.weather ?? (() => 'cerah'), now: opts.now, rates: () => admin.effRates(), priceMul: () => admin.effPriceMul(), xpMul: () => admin.effXpMul(), auto: () => admin.effAuto() });
  const S = new Social({ store, now: opts.now ? () => opts.now!() : undefined });
  const T = new Trades({ store, now: opts.now ? () => opts.now!() : undefined });
  const gp = googlePlay();
  const bill = gp ? new Billing(store, gp.verify, opts.now, gp.consume) : null;
  const acc = new Accounts({ players: store, store: opts.accounts ?? new MemoryAccounts(), newPlayer: (id, n) => A.newPlayer(id, n), now: opts.now, mailer: opts.mailer });
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 32 * 1024 });

  app.register(cors, { origin: opts.origins ?? true });

  // pembatas laju sederhana per kunci
  const hits = new Map<string, { n: number; reset: number }>();
  function limit(key: string, max: number, perSec: number) {
    const now = Date.now(), h = hits.get(key);
    if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + perSec * 1000 }); return; }
    if (++h.n > max) throw new GameError('Terlalu banyak permintaan. Tunggu sebentar.', 429);
  }
  setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (h.reset < now) hits.delete(k); }, 60_000).unref();

  const tokenOf = (req: { headers: Record<string, unknown> }) => String(req.headers['x-auth-token'] ?? '');
  // pemain yang diblokir admin ditolak di semua rute pemain (status blokir di-cache 10 dtk; dibuang saat admin mengubahnya)
  const banCache = new Map<string, { t: number; ban: { until: number; reason: string } | undefined }>();
  async function checkBan(pid: string) {
    const now = Date.now(); let c = banCache.get(pid);
    if (!c || now - c.t > 10_000) { c = { t: now, ban: (await store.getPlayer(pid))?.banned }; banCache.set(pid, c); if (banCache.size > 5000) banCache.clear(); }
    if (c.ban && isBanned({ banned: c.ban }, (opts.now?.() ?? now / 1000))) throw new GameError(banMessage(c.ban), 403);
  }
  async function userOf(req: { headers: Record<string, unknown> }) {
    const pid = await acc.playerOf(tokenOf(req));
    if (!pid) throw new GameError('Silakan masuk dulu.', 401);
    await checkBan(pid);
    return pid;
  }

  // Satu pemain = satu antrean: permintaan POST dari pemain yang sama dijalankan berurutan
  // (dua ketukan cepat / dua HP tidak bisa saling menimpa koin, umpan, atau keranjang).
  const plock = new KeyedLock();
  type LockReq = { method: string; url: string; headers: Record<string, unknown>; pjUnlock?: (() => void) | null };
  app.addHook('preHandler', async (req: LockReq) => {
    if (req.method !== 'POST' || !req.url.startsWith('/api/') || req.url.startsWith('/api/auth/') || req.url.startsWith('/api/admin/')) return;
    const tok = tokenOf(req); if (!tok) return;
    const pid = await acc.playerOf(tok); if (!pid) return;
    req.pjUnlock = await plock.acquire('p:' + pid);
  });
  const unlock = async (req: LockReq) => { const u = req.pjUnlock; if (u) { req.pjUnlock = null; u(); } };
  app.addHook('onResponse', unlock);
  app.addHook('onRequestAbort', unlock);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof GameError) return reply.status(err.status).send({ ok: false, error: err.message });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    reply.status(status).send({ ok: false, error: status >= 500 ? 'Server sedang bermasalah.' : (err as Error).message });
  });

  const ok = <T extends object>(d: T) => ({ ok: true, ...d });
  const body = (req: { body: unknown }) => (req.body ?? {}) as Record<string, any>;

  app.get('/health', async () => ok({ time: Date.now(), online: [...rooms.values()].reduce((a, r) => a + r.size, 0) }));

  app.post('/api/auth/guest', async (req) => {
    limit('guest:' + req.ip, 10, 60);
    return ok(await acc.guest(cleanName(body(req).name)));
  });
  app.post('/api/auth/register', async (req) => {
    limit('reg:' + req.ip, 5, 600);
    const b = body(req);
    return ok(await acc.register({ username: b.username, email: b.email, password: b.password, pin: b.pin, guestToken: tokenOf(req) || undefined }));
  });
  app.post('/api/auth/login', async (req) => { limit('login:' + req.ip, 20, 600); const b = body(req); return ok(await acc.login(String(b.login ?? ''), String(b.password ?? ''))); });
  app.post('/api/auth/pin', async (req) => { limit('pin:' + req.ip, 20, 600); const b = body(req); return ok(await acc.pinLogin(String(b.device ?? ''), String(b.pin ?? ''))); });
  app.post('/api/auth/forgot', async (req) => { limit('forgot:' + req.ip, 5, 900); return ok(await acc.requestReset(String(body(req).login ?? ''))); });
  app.post('/api/auth/reset', async (req) => { limit('reset:' + req.ip, 10, 900); const b = body(req); return ok(await acc.resetPassword(String(b.login ?? ''), String(b.code ?? ''), String(b.password ?? ''))); });
  app.post('/api/auth/logout', async (req) => { await acc.logout(tokenOf(req), body(req).device); return ok({}); });
  app.post('/api/auth/password', async (req) => { limit('pw:' + req.ip, 10, 600); const b = body(req); return ok(await acc.changePassword(tokenOf(req), String(b.old ?? ''), String(b.new ?? ''))); });
  app.post('/api/account/delete', async (req) => {
    limit('del:' + req.ip, 5, 600);
    const pid = await acc.playerOf(tokenOf(req)), r = await acc.deleteAccount(tokenOf(req), body(req).password);
    if (pid) await T.forget(pid).catch(() => {});   // penawaran tukar ditarik, titipan dikembalikan ke penawar
    return ok(r);
  });

  app.get('/api/me', async (req) => { const p = await store.getPlayer((await userOf(req))); return ok({ player: p }); });
  app.addHook('onReady', async () => { await admin.load(); });
  app.get('/api/world', async () => ok({ world: await A.world(), motd: admin.cfg.motd, backdropAt: admin.cfg.backdropAt, hideFarTrees: !!admin.cfg.hideFarTrees, backdropBackAt: admin.cfg.backdropBackAt, bedAt: admin.cfg.bedAt, waterClarity: admin.cfg.waterClarity ?? 'jernih', species: admin.cfg.species ?? {}, event: admin.activeEvent() }));
  app.get('/api/event', async () => ok(await admin.eventBoard()));
  app.get('/api/backdrop', async (req, reply) => { reply.header('cache-control', 'public, max-age=300'); const s = String((req.query as { slot?: string }).slot ?? 'depan'); return ok({ url: await admin.backdrop((['depan', 'belakang', 'dasar'].includes(s) ? s : 'depan') as BackdropSlot) }); });

  // ---------- admin (header X-Admin-Token = ADMIN_TOKEN) ----------
  const ADMIN = opts.adminToken ?? process.env.ADMIN_TOKEN ?? '';
  function adminOf(req: { headers: Record<string, unknown>; ip: string }) {
    if (!ADMIN || ADMIN.length < 12) throw new GameError('Panel admin belum diaktifkan. Isi ADMIN_TOKEN (min. 12 karakter) di server.', 403);
    limit('admin:' + req.ip, 60, 60);
    const t = String(req.headers['x-admin-token'] ?? '');
    const a = Buffer.from(t), b = Buffer.from(ADMIN);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new GameError('Token admin salah.', 401);
    // website superadmin mengirim nama admin di X-Admin-By supaya log menunjukkan siapa yang mengubah
    const by = String(req.headers['x-admin-by'] ?? '').replace(/[^\w.@ -]/g, '').slice(0, 40);
    return 'admin@' + req.ip + (by ? ' / ' + by : '');
  }
  app.get('/api/admin/state', async (req) => { adminOf(req); return ok({ config: admin.cfg, stock: await admin.stock(), audit: (await admin.auditLog()).slice(0, 60) }); });
  app.post('/api/admin/config', async (req) => ok({ config: await admin.setConfig(body(req), adminOf(req)) }));
  app.post('/api/admin/stock', async (req) => { const b = body(req); return ok({ stock: await admin.setStock(String(b.spot), b.species, Number(b.n), adminOf(req)) }); });
  app.post('/api/admin/stock/reset', async (req) => ok({ stock: await admin.resetStock(String(body(req).spot), adminOf(req)) }));
  app.post('/api/admin/backdrop', async (req) => ok({ config: await admin.setBackdrop(String(body(req).url ?? ''), adminOf(req), (String(body(req).slot ?? 'depan')) as BackdropSlot) }));
  app.post('/api/admin/events', async (req) => ok({ config: await admin.setEvents(body(req).events, adminOf(req)) }));
  app.post('/api/admin/ban', async (req) => {
    const b = body(req), pid = String(b.playerId ?? '');
    const r = await admin.setBan(pid, b.minutes === null || b.minutes === -1 ? null : Number(b.minutes), String(b.reason ?? ''), adminOf(req));
    banCache.delete(pid);
    if (r.banned) for (const set of rooms.values()) for (const c of set) if (c.id === pid) { send(c, { t: 'error', msg: banMessage(r.banned) }); c.ws.close(4003, 'diblokir'); }
    return ok(r);
  });
  app.post('/api/admin/coins', async (req) => { const b = body(req); return ok(await admin.grantCoins(String(b.playerId), Number(b.coins), adminOf(req), String(b.reason ?? ''))); });

  app.post('/api/fishing/cast', async (req) => {
    const pid = await userOf(req); limit('cast:' + pid, 30, 60);
    const b = body(req);
    return ok(await A.cast(pid, { spot: String(b.spot), zone: b.zone, sub: b.sub }));
  });
  app.post('/api/fishing/hook', async (req) => ok(await A.hook((await userOf(req)), { castId: String(body(req).castId) })));
  app.post('/api/fishing/land', async (req) => {
    const pid = (await userOf(req)), b = body(req);
    const auto = b.auto === true;
    if (auto) limit('auto:' + pid, 12, 60);
    const r = await A.land(pid, { hookId: String(b.hookId), result: b.result === 'caught' ? 'caught' : 'lost', keep: b.keep !== false, auto });
    if (r.result === 'caught') {
      const ac = admin.effAuto();
      await S.onCatch(pid, r.player.name, r.catch, auto ? { missions: ac.missions, tours: ac.board } : {});
      if (r.catch.tier >= 2 && (!auto || ac.board)) broadcastAll({ t: 'catch', name: r.player.name, species: r.catch.name, weight: r.catch.weight });
    }
    return ok(r);
  });
  // hasil main luring: diperiksa ulang oleh aturan server, tidak masuk papan peringkat/turnamen
  app.post('/api/offline/sync', async (req) => {
    const pid = await userOf(req); limit('off:' + pid, 6, 60);
    const b = body(req);
    const r = await A.syncOffline(pid, { sid: b.sid ? String(b.sid) : undefined, catches: Array.isArray(b.catches) ? b.catches.slice(0, 400) : [], baitUsed: b.baitUsed ?? {}, released: Array.isArray(b.released) ? b.released.slice(0, 60).map(String) : [] });
    for (const c of r.landed) await S.onCatch(pid, r.player.name, c);
    return ok(r);
  });
  app.post('/api/basket/sell', async (req) => ok(await A.sellBasket((await userOf(req)))));
  app.post('/api/basket/release', async (req) => ok(await A.release((await userOf(req)), String(body(req).id))));
  app.post('/api/shop/bait', async (req) => ok(await A.buyBait((await userOf(req)), body(req).bait)));
  app.post('/api/shop/gear', async (req) => ok(await A.buyGear((await userOf(req)), body(req))));
  app.post('/api/equip', async (req) => ok(await A.equip((await userOf(req)), body(req))));
  // ---------- Fase 3 & 4 ----------
  const post = (path: string, fn: (pid: string, b: Record<string, any>) => Promise<object>, max = 30) =>
    app.post(path, async (req) => { const pid = await userOf(req); limit(path + pid, max, 60); return ok(await fn(pid, body(req))); });
  post('/api/look', (pid, b) => S.setLook(pid, b.look ?? {}));
  app.get('/api/progress', async (req) => ok(await S.progress(await userOf(req))));
  post('/api/missions/claim', (pid, b) => S.claimMission(pid, String(b.id)), 20);
  post('/api/daily/claim', (pid) => S.claimDaily(pid), 10);
  post('/api/badges/claim', (pid, b) => S.claimBadge(pid, String(b.id)), 30);
  app.get('/api/tournaments', async (req) => ok({ list: await S.tournaments(await userOf(req)) }));
  post('/api/tournaments/join', (pid, b) => S.joinTournament(pid, b.kind === 'mingguan' ? 'mingguan' : 'harian'));
  post('/api/tournaments/claim', (pid) => S.claimTournaments(pid), 10);
  post('/api/aquarium/add', (pid, b) => S.toAquarium(pid, String(b.id)));
  post('/api/aquarium/remove', (pid, b) => S.fromAquarium(pid, String(b.id), b.to === 'jual' ? 'jual' : 'lepas'));
  post('/api/aquarium/big', (pid) => S.buyBigAquarium(pid), 5);
  post('/api/basket/big', (pid) => A.buyBigBasket(pid), 5);
  app.get('/api/auto', async (req) => ok(await A.autoInfo(await userOf(req))));
  post('/api/aquarium/visitors', (pid) => S.claimVisitors(pid), 10);
  app.get('/api/market', async () => ok({ items: await S.market() }));
  post('/api/market/list', (pid, b) => S.listItem(pid, { kind: b.kind === 'line' ? 'line' : b.kind === 'bait' ? 'bait' : 'rod', item: String(b.item), price: Number(b.price), qty: Number(b.qty) }), 10);
  // ---------- tukar langsung antarpemain ----------
  post('/api/trade', (pid) => T.board(pid), 60);   // POST: ikut kunci per pemain (mengambil kiriman = menulis tas)
  app.get('/api/trade/inventory', async (req) => { const pid = await userOf(req); limit('inv' + pid, 40, 60); return ok(await T.inventory(String((req.query as { id?: string }).id ?? ''))); });
  post('/api/trade/propose', async (pid, b) => { const r = await T.propose(pid, { to: String(b.to ?? ''), give: b.give, want: b.want, note: b.note }); notify(r.trade.to, { t: 'trade', kind: 'baru', name: r.trade.fromName }); return r; }, 10);
  post('/api/trade/accept', async (pid, b) => { const r = await T.accept(pid, String(b.id)); notify(r.trade.from, { t: 'trade', kind: 'diterima', name: r.trade.toName }); return r; }, 20);
  post('/api/trade/decline', async (pid, b) => { const r = await T.decline(pid, String(b.id)); notify(r.trade.from, { t: 'trade', kind: 'ditolak', name: r.trade.toName }); return r; }, 20);
  post('/api/trade/cancel', (pid, b) => T.cancel(pid, String(b.id)), 20);
  post('/api/market/cancel', (pid, b) => S.cancelListing(pid, String(b.id)));
  post('/api/market/buy', (pid, b) => S.buyListing(pid, String(b.id)));
  app.get('/api/clubs', async (req) => ok(await S.clubs(await userOf(req))));
  const syncClub = async <T extends { player: { id: string; club?: string } }>(r: T) => { for (const set of rooms.values()) for (const c of set) if (c.id === r.player.id) c.club = r.player.club; return r; };
  post('/api/clubs/create', (pid, b) => S.createClub(pid, { name: String(b.name ?? ''), tag: String(b.tag ?? ''), icon: String(b.icon ?? '') }).then(syncClub), 5);
  post('/api/clubs/join', (pid, b) => S.joinClub(pid, String(b.id)).then(syncClub), 10);
  post('/api/clubs/leave', (pid) => S.leaveClub(pid).then(syncClub), 10);
  post('/api/clubs/claim', (pid) => S.claimClub(pid), 10);

  app.get('/api/leaderboard', async (req) => {
    const q = req.query as Record<string, string>;
    const kind = (['heaviest', 'most', 'level'].includes(q.kind) ? q.kind : 'heaviest') as 'heaviest';
    const since = q.period === 'week' ? Date.now() / 1000 - 7 * 86400 : q.period === 'all' ? 0 : Date.now() / 1000 - 86400;
    return ok({ rows: await store.leaderboard(kind, since, 50) });
  });

  // ---------- Fase 6: beli koin (Google Play) ----------
  app.get('/api/billing/packs', async () => ok({ packs: COIN_PACKS, enabled: !!bill }));
  app.post('/api/billing/redeem', async (req) => {
    const pid = await userOf(req); limit('bill:' + pid, 20, 600);
    if (!bill) throw new GameError('Pembelian koin belum diaktifkan di server.', 503);
    const b = body(req); return ok(await bill.redeem(pid, String(b.productId), String(b.token)));
  });

  // ---------- Fase 5: website peringkat publik ----------
  app.get('/papan', async (_req, reply) => { reply.header('content-type', 'text/html; charset=utf-8').header('cache-control', 'public, max-age=60'); return websiteHtml({ downloadUrl: process.env.DOWNLOAD_URL }); });
  app.get('/', async (_req, reply) => reply.redirect('/papan'));
  app.get('/api/public/tournaments', async () => ok({ list: (await S.tournaments('')).map(({ joined: _j, myBest: _b, myRank: _r, ...t }) => t) }));
  app.get('/api/public/stats', async () => {
    const since = Date.now() / 1000 - 86400;
    const most = await store.leaderboard('most', since, 100), heavy = await store.leaderboard('heaviest', since, 1);
    return ok({ online: [...rooms.values()].reduce((a, r) => a + r.size, 0), today: most.reduce((a, r) => a + r.value, 0), heaviest: heavy[0] ? { name: heavy[0].name, weight: heavy[0].value } : null });
  });

  // ---------- Waktu nyata: ruang berisi maksimal ROOM_CAPACITY pemain ----------
  interface Conn { ws: WebSocket; id: string; name: string; room: string; st: NetPlayer; lastChat: number; lastText: string; lastEmote: number; club?: string }
  const rooms = new Map<string, Set<Conn>>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const send = (c: Conn, m: ServerMsg) => { if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(m)); };
  function broadcast(room: string, m: ServerMsg, except?: Conn) { for (const c of rooms.get(room) ?? []) if (c !== except) send(c, m); }
  function broadcastAll(m: ServerMsg) { for (const r of rooms.keys()) broadcast(r, m); }
  /** Kirim kabar ke satu pemain (di ruang mana pun) bila sedang daring. */
  function notify(pid: string, m: ServerMsg) { for (const set of rooms.values()) for (const c of set) if (c.id === pid) send(c, m); }

  /** Pilih ruang: "B3" → "B3#1", "B3#2", … bila penuh. */
  function roomFor(base: string) {
    for (let i = 1; ; i++) { const k = base + '#' + i; if ((rooms.get(k)?.size ?? 0) < ROOM_CAPACITY) return k; }
  }

  wss.on('connection', (ws) => {
    let me: Conn | null = null;
    const timeout = setTimeout(() => { if (!me) ws.close(4001, 'join'); }, 5000);
    ws.on('message', async (raw) => {
      let m: ClientMsg;
      try { m = JSON.parse(String(raw)); } catch { return; }
      if (m.t === 'join' && !me) {
        const pid = await acc.playerOf(String(m.token));
        const p = pid && await store.getPlayer(pid);
        if (!p) { ws.send(JSON.stringify({ t: 'error', msg: 'Silakan masuk dulu.' } satisfies ServerMsg)); ws.close(); return; }
        if (isBanned(p, opts.now?.() ?? Date.now() / 1000)) { ws.send(JSON.stringify({ t: 'error', msg: banMessage(p.banned!) } satisfies ServerMsg)); ws.close(4003, 'diblokir'); return; }
        clearTimeout(timeout);
        const room = roomFor(String(m.room).replace(/[^A-Z0-9]/gi, '').slice(0, 6) || 'B3');
        me = { ws, id: p.id, name: p.name, room, lastChat: 0, lastText: '', lastEmote: 0, club: p.club, st: { id: p.id, name: p.name, x: 0, z: 0, yaw: 0, pose: 'idle', lv: levelInfo(p.xp).lv, look: p.look } };
        if (!rooms.has(room)) rooms.set(room, new Set());
        rooms.get(room)!.add(me);
        send(me, { t: 'welcome', you: p.id, room, players: [...rooms.get(room)!].filter(c => c !== me).map(c => c.st) });
        return;
      }
      if (!me) return;
      if (m.t === 'state') {
        const f = (v: unknown, a: number) => Math.max(-a, Math.min(a, Number(v) || 0));
        me.st.x = f(m.x, 500); me.st.z = f(m.z, 500); me.st.yaw = f(m.yaw, 10);
        me.st.pose = (['idle', 'cast', 'wait', 'fight', 'walk'] as const).includes(m.pose) ? m.pose : 'idle';
      } else if (m.t === 'chat') {
        const now = Date.now(), text = cleanChat(m.text);
        if (!text || now - me.lastChat < 2500 || text === me.lastText) { send(me, { t: 'error', msg: 'Tunggu sebentar sebelum mengirim lagi.' }); return; }
        me.lastChat = now; me.lastText = text;
        if (m.ch === 'klub') {
          if (!me.club) { send(me, { t: 'error', msg: 'Anda belum masuk klub.' }); return; }
          for (const set of rooms.values()) for (const c of set) if (c.club === me.club) send(c, { t: 'chat', id: me.id, name: me.name, text, at: now, ch: 'klub' });
        } else broadcastAll({ t: 'chat', id: me.id, name: me.name, text, at: now, ch: 'global' });
      } else if (m.t === 'emote') {
        const now = Date.now(); if (now - me.lastEmote < 1500) return; me.lastEmote = now;
        broadcast(me.room, { t: 'emote', id: me.id, e: String(m.e).slice(0, 12) }, me);
      } else if (m.t === 'ping') send(me, { t: 'pong', at: Number(m.at) || 0 });
    });
    ws.on('close', () => {
      clearTimeout(timeout);
      if (!me) return;
      const set = rooms.get(me.room); set?.delete(me);
      if (set && !set.size) rooms.delete(me.room); else broadcast(me.room, { t: 'left', id: me.id });
    });
  });

  // kirim posisi semua pemain di ruang yang sama, 5× per detik
  const snapTimer = setInterval(() => {
    for (const set of rooms.values()) {
      if (set.size < 2) continue;
      const players = [...set].map(c => c.st);
      const msg = JSON.stringify({ t: 'snap', players } satisfies ServerMsg);
      for (const c of set) if (c.ws.readyState === WebSocket.OPEN && c.ws.bufferedAmount < 64 * 1024) c.ws.send(msg);
    }
  }, 1000 / SNAP_HZ);
  snapTimer.unref();

  app.server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws')) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  app.addHook('onClose', async () => { clearInterval(snapTimer); for (const c of wss.clients) c.terminate(); wss.close(); });

  return { app, accounts: acc, social: S, admin, store, authority: A, rooms };
}
