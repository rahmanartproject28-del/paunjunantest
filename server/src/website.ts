// Fase 5 — website peringkat publik, dilayani langsung oleh server game (tanpa PHP terpisah).
// GET /papan → halaman satu berkas yang membaca /api/leaderboard, /api/public/tournaments, /api/public/stats.
import { SPECIES, SPECIES_IDS } from '@paunjunan/shared';

export function websiteHtml(opts: { downloadUrl?: string } = {}) {
  const names = Object.fromEntries(SPECIES_IDS.map(k => [k, SPECIES[k].name]));
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Papan Peringkat · PAUNJUNAN Mancing</title>
<meta name="description" content="Peringkat pemancing PAUNJUNAN: ikan terberat, tangkapan terbanyak, level, dan turnamen.">
<style>
:root{--bg:#0b1d1a;--card:#12302a;--ink:#f4f1e8;--dim:#a9b8b0;--gold:#f2b53a;--teal:#1fb28a;--line:rgba(255,255,255,.12)}
*{box-sizing:border-box}body{margin:0;font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:radial-gradient(circle at 20% 0,#17423a,var(--bg) 60%);color:var(--ink);min-height:100vh;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
header{max-width:900px;margin:0 auto;padding:28px 16px 8px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
header h1{margin:0;font-size:26px}header p{margin:2px 0 0;color:var(--dim)}.logo{font-size:40px}
.dl{margin-left:auto;background:linear-gradient(180deg,#ffd873,var(--gold));color:#2b1a02;font-weight:800;padding:10px 16px;border-radius:999px;text-decoration:none}
main{max-width:900px;margin:0 auto;padding:8px 16px 40px;display:grid;gap:16px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.stat{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 14px}.stat b{display:block;font-size:22px}.stat small{color:var(--dim)}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px}.card h2{margin:0 0 10px;font-size:18px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.tabs button{font:inherit;border:1px solid var(--line);background:transparent;color:var(--ink);padding:7px 12px;border-radius:999px;cursor:pointer}.tabs button.on{background:var(--gold);color:#2b1a02;border-color:var(--gold);font-weight:800}
table{width:100%;border-collapse:collapse}td{padding:9px 6px;border-top:1px solid var(--line)}td.r{width:44px;text-align:center;font-weight:900}td.v{text-align:right;font-weight:800;white-space:nowrap}td small{color:var(--dim)}
tr:nth-child(1) td.r{color:#e0a21a}tr:nth-child(2) td.r{color:#8fa0a8}tr:nth-child(3) td.r{color:#c9793a}
.tours{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.tour{border:1px solid var(--line);border-radius:14px;padding:10px 12px}.tour p{margin:4px 0;color:var(--dim);font-size:13px}
.empty{color:var(--dim);padding:10px 0}footer{text-align:center;color:var(--dim);font-size:12px;padding-bottom:24px}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#eef4f1;--card:#ffffff;--ink:#12302a;--dim:#5b6e66;--line:rgba(0,0,0,.1)}body{background:var(--bg)}}
</style></head><body>
<header><span class="logo">🎣</span><div><h1>Papan Peringkat PAUNJUNAN</h1><p>Danau Keramba · diperbarui otomatis setiap menit</p></div>${opts.downloadUrl ? `<a class="dl" href="${opts.downloadUrl}">Main sekarang</a>` : ''}</header>
<main>
  <section class="stats" id="stats"></section>
  <section class="card"><h2>🏆 Turnamen berjalan</h2><div class="tours" id="tours"><div class="empty">Memuat…</div></div></section>
  <section class="card"><h2>📊 Peringkat</h2>
    <div class="tabs" id="kind"><button data-k="heaviest" class="on">Ikan terberat</button><button data-k="most">Terbanyak</button><button data-k="level">Level</button></div>
    <div class="tabs" id="period"><button data-p="day" class="on">Hari ini</button><button data-p="week">Minggu ini</button><button data-p="all">Sepanjang masa</button></div>
    <table><tbody id="rows"><tr><td class="empty">Memuat…</td></tr></tbody></table></section>
</main>
<footer>PAUNJUNAN Mancing · data langsung dari server game</footer>
<script>
const NAMES=${JSON.stringify(names)};let kind='heaviest',period='day';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kg=v=>v<1?Math.round(v*1000)+' g':v.toLocaleString('id-ID',{maximumFractionDigits:2})+' kg';
const get=async u=>{const r=await fetch(u);const j=await r.json();if(!j.ok)throw new Error(j.error);return j};
async function rows(){const box=document.getElementById('rows');
  try{const j=await get('/api/leaderboard?kind='+kind+'&period='+(kind==='level'?'all':period));
    box.innerHTML=j.rows.length?j.rows.map((r,i)=>'<tr><td class="r">'+(i+1)+'</td><td>'+esc(r.name)+(r.species?'<br><small>'+esc(NAMES[r.species]||r.species)+'</small>':'')+'</td><td class="v">'+(kind==='heaviest'?kg(r.value):kind==='most'?r.value+' ekor':'Lv '+r.value)+'</td></tr>').join(''):'<tr><td class="empty">Belum ada data untuk periode ini.</td></tr>';
  }catch(e){box.innerHTML='<tr><td class="empty">Gagal memuat: '+esc(e.message)+'</td></tr>'}}
async function tours(){const box=document.getElementById('tours');
  try{const j=await get('/api/public/tournaments');box.innerHTML=j.list.map(t=>'<div class="tour"><b>'+esc(t.name)+'</b><p>'+esc(t.desc)+' · '+t.entrants+' peserta · berakhir '+Math.floor(t.endsIn/3600)+' jam lagi</p>'+(t.top.length?'<table>'+t.top.slice(0,5).map((r,i)=>'<tr><td class="r">'+(i+1)+'</td><td>'+esc(r.name)+'</td><td class="v">'+kg(r.best)+'</td></tr>').join('')+'</table>':'<p>Belum ada tangkapan.</p>')+'</div>').join('')}
  catch(e){box.innerHTML='<div class="empty">Gagal memuat turnamen.</div>'}}
async function stats(){try{const j=await get('/api/public/stats');document.getElementById('stats').innerHTML=
  [['🎣',j.online,'pemain online'],['🐟',j.today,'ikan hari ini'],['⚖️',j.heaviest?kg(j.heaviest.weight):'—',j.heaviest?'terberat: '+esc(j.heaviest.name):'terberat hari ini']].map(s=>'<div class="stat"><small>'+s[0]+' '+s[2]+'</small><b>'+s[1]+'</b></div>').join('')}catch(e){}}
document.querySelectorAll('#kind button').forEach(b=>b.onclick=()=>{kind=b.dataset.k;document.querySelectorAll('#kind button').forEach(x=>x.classList.toggle('on',x===b));document.getElementById('period').style.display=kind==='level'?'none':'flex';rows()});
document.querySelectorAll('#period button').forEach(b=>b.onclick=()=>{period=b.dataset.p;document.querySelectorAll('#period button').forEach(x=>x.classList.toggle('on',x===b));rows()});
const all=()=>{rows();tours();stats()};all();setInterval(all,60000);
</script></body></html>`;
}
