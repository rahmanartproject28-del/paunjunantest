const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [,, url = '?auto=1&tier=sedang&h=10.4&w=cerah', out = 'shot', W = '1536', H = '1024', wait = '9000', evalJs = ''] = process.argv;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +W, height: +H } });
  p.on('console', m => { const t = m.text(); if ((m.type() === 'error' || /error/i.test(t)) && !/Mismatch between texture/.test(t)) console.log('[' + m.type() + ']', t.slice(0, 300)); });
  p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0, 400)));
  await p.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/, async (route) => {
    const rel = route.request().url().replace(/^.*three@[^/]+\//, '');
    const f = path.join('/home/claude/threejs', rel);
    if (fs.existsSync(f)) route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(f) });
    else { console.log('MISSING', rel); route.fulfill({ status: 404, body: '' }); }
  });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  await p.goto('http://localhost:8765/w/paunjunan/game/dist-artifact/paunjunan.html' + url);
  await p.waitForTimeout(+wait);
  if (evalJs) { console.log('EVAL', JSON.stringify(await p.evaluate(evalJs)).slice(0, 1500)); await p.waitForTimeout(2500); }
  console.log('STATE', JSON.stringify(await p.evaluate(() => (window).__pj || null)));
  const err = await p.evaluate(() => { const e = document.getElementById('errBox'); return e && !e.hidden ? e.textContent : ''; });
  if (err) console.log('ERRBOX', err.slice(0, 800));
  if (process.env.PRE) console.log("PRE", JSON.stringify(await p.evaluate(process.env.PRE)));
  await p.screenshot({ timeout: 120000, path: `/home/claude/chk/g3/${out}.png` });
  await b.close();
})();
