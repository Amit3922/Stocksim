// Virtual stock simulator - real live prices (Yahoo Finance), fake money. Zero dependencies. Node 18+.
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const UA = { 'User-Agent': 'Mozilla/5.0 (stock-sim personal use)' };


const cache = new Map(); // symbol -> {t, data}
async function quote(sym) {
  sym = sym.toUpperCase().trim();
  const c = cache.get(sym);
  if (c && Date.now() - c.t < 8000) return c.data;
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=5m&range=1d`, { headers: UA });
  if (!r.ok) throw new Error(`No data for ${sym}`);
  const j = await r.json();
  const res = j.chart && j.chart.result && j.chart.result[0];
  if (!res) throw new Error(`Unknown symbol ${sym}`);
  const m = res.meta;
  const closes = (res.indicators.quote[0].close || []).filter(x => x != null);
  const data = {
    symbol: sym, name: m.shortName || m.longName || sym, currency: m.currency,
    price: m.regularMarketPrice, prevClose: m.chartPreviousClose ?? m.previousClose,
    points: closes, time: m.regularMarketTime,
  };
  cache.set(sym, { t: Date.now(), data });
  return data;
}

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise(ok => { let s = ''; req.on('data', d => s += d); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { ok({}); } }); });

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/quotes') {
      const syms = (u.searchParams.get('symbols') || '').split(',').filter(Boolean);
      const out = {};
      await Promise.all(syms.map(async s => { try { out[s] = await quote(s); } catch (e) { out[s] = { symbol: s, error: e.message }; } }));
      return send(res, 200, out);
    }
    if (u.pathname === '/api/search') {
      const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(u.searchParams.get('q') || '')}&quotesCount=6&newsCount=0`, { headers: UA });
      const j = await r.json();
      return send(res, 200, (j.quotes || []).filter(q => q.symbol).map(q => ({ symbol: q.symbol, name: q.shortname || q.longname || '', type: q.quoteType })));
    }
    // static
    const f = path.join(__dirname, 'public', u.pathname === '/' ? 'index.html' : u.pathname);
    if (!f.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(f)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
  } catch (e) { send(res, 500, { error: e.message }); }
}).listen(PORT, '0.0.0.0', () => console.log(`Stock sim running → http://localhost:${PORT}`));
