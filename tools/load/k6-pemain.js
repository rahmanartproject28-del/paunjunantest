// Uji beban server PAUNJUNAN dengan k6 (https://k6.io).
// Menjalankan: k6 run -e BASE=https://game.domainanda.com tools/load/k6-pemain.js
// Tiap pemain virtual: masuk sebagai tamu, buka WebSocket ruang, bergerak, lalu memancing berulang (lempar → sentak → angkat).
import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:8787';
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const tCast = new Trend('waktu_lempar_ms'), okCatch = new Rate('tangkapan_sah');

export const options = {
  scenarios: {
    naik_bertahap: { executor: 'ramping-vus', startVUs: 0, stages: [
      { duration: '2m', target: 200 }, { duration: '3m', target: 1000 }, { duration: '5m', target: 2000 }, { duration: '2m', target: 0 },
    ] },
  },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<400'], waktu_lempar_ms: ['p(95)<300'] },
};
const J = { headers: { 'content-type': 'application/json' } };
const post = (path, body, token) => http.post(BASE + path, JSON.stringify(body), { headers: { 'content-type': 'application/json', 'x-auth-token': token || '' } });

export default function () {
  const g = post('/api/auth/guest', { name: 'Beban' + __VU });
  if (!check(g, { 'tamu dibuat': r => r.status === 200 })) return;
  const token = g.json('token');
  const spot = ['A1', 'B3', 'C2'][__VU % 3];
  ws.connect(WS, {}, sock => {
    sock.on('open', () => {
      sock.send(JSON.stringify({ t: 'join', token, room: spot }));
      let x = Math.random() * 10, z = Math.random() * 10;
      sock.setInterval(() => { x += Math.random() - 0.5; z += Math.random() - 0.5; sock.send(JSON.stringify({ t: 'state', x, z, yaw: 0, pose: 'wait' })); }, 200);
      sock.setTimeout(() => sock.close(), 60000);
    });
    // memancing sambil tersambung
    for (let i = 0; i < 4; i++) {
      const t0 = Date.now();
      const c = post('/api/fishing/cast', { spot, zone: 'far', sub: 'jauh' }, token);
      tCast.add(Date.now() - t0);
      if (c.status !== 200) { sleep(3); continue; }
      const cast = c.json();
      if (cast.biteIn) {
        sleep(cast.biteIn + 0.4);
        const h = post('/api/fishing/hook', { castId: cast.castId }, token);
        if (h.status === 200 && h.json('result') === 'hooked') {
          sleep(h.json('minFight') + 0.5);
          const l = post('/api/fishing/land', { hookId: h.json('hookId'), result: 'caught', keep: false }, token);
          okCatch.add(l.status === 200);
        }
      }
      sleep(2 + Math.random() * 3);
    }
  });
}
