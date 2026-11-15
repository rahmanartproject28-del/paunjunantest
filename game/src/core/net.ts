// Sambungan waktu nyata ke server (WebSocket): posisi pemain lain & obrolan.
import type { ClientMsg, ServerMsg, NetPlayer, PlayerPose } from '@paunjunan/shared';

export class Net {
  ws: WebSocket | null = null; you = ''; room = '';
  onPlayers: (p: NetPlayer[]) => void = () => {};
  onChat: (m: Extract<ServerMsg, { t: 'chat' }>) => void = () => {};
  onCatch: (m: Extract<ServerMsg, { t: 'catch' }>) => void = () => {};
  onEmote: (m: Extract<ServerMsg, { t: 'emote' }>) => void = () => {};
  onError: (msg: string) => void = () => {};
  onTrade: (m: Extract<ServerMsg, { t: 'trade' }>) => void = () => {};
  private players = new Map<string, NetPlayer>();
  private retry = 1000; private closed = false;
  constructor(private url: string, private token: string) {}

  connect(room: string) {
    this.closed = false; this.room = room;
    const u = this.url.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
    try { this.ws = new WebSocket(u); } catch { return; }
    this.ws.onopen = () => { this.retry = 1000; this.send({ t: 'join', room, token: this.token }); };
    this.ws.onmessage = (e) => {
      let m: ServerMsg; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') { this.you = m.you; this.room = m.room; this.players = new Map(m.players.map(p => [p.id, p])); this.onPlayers([...this.players.values()]); }
      else if (m.t === 'snap') { this.players = new Map(m.players.map(p => [p.id, p])); this.onPlayers([...this.players.values()]); }
      else if (m.t === 'left') { this.players.delete(m.id); this.onPlayers([...this.players.values()]); }
      else if (m.t === 'chat') this.onChat(m);
      else if (m.t === 'catch') this.onCatch(m);
      else if (m.t === 'emote') this.onEmote(m);
      else if (m.t === 'error') this.onError(m.msg);
      else if (m.t === 'trade') this.onTrade(m);
    };
    this.ws.onclose = () => { if (!this.closed) setTimeout(() => this.connect(this.room), this.retry = Math.min(15000, this.retry * 2)); };
  }
  send(m: ClientMsg) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  state(x: number, z: number, yaw: number, pose: PlayerPose) { this.send({ t: 'state', x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, yaw: Math.round(yaw * 100) / 100, pose }); }
  close() { this.closed = true; this.ws?.close(); }
  /** Aplikasi kembali ke depan: sambung ulang sekarang bila putus (jangan menunggu jeda percobaan sampai 15 dtk). */
  wake() {
    if (this.closed) return;
    const st = this.ws?.readyState;
    if (st === WebSocket.OPEN || st === WebSocket.CONNECTING) return;
    this.retry = 1000; if (this.ws) this.ws.onclose = null; this.connect(this.room);
  }
}
