// Builds the public GitHub Pages site from the same page files Apps Script uses.
// Usage: node build_site.js <apps-script-exec-url> [outDir=site]
// Event text, price and party size are read from SETTINGS in Code.gs, so edit them there and rebuild.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = __dirname;
const api = process.argv[2];
const out = path.resolve(process.argv[3] || path.join(dir, '..', 'docs'));
if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(api || '')) {
  console.error('Pass the web app URL ending in /exec, e.g. node build_site.js https://script.google.com/macros/s/XXXX/exec');
  process.exit(1);
}
// Plain /macros/s/ form avoids Google's multi-account issues.
const API = api.replace(/\/a\/macros\/[^/]+\/s\//, '/macros/s/').replace(/\/a\/[^/]+\/macros\/s\//, '/macros/s/');

const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8') + '\n;this.__S = SETTINGS;', ctx);
const S = ctx.__S;
const price = Number(S.PRICE_PER_PERSON) || 0;
const priceLabel = price > 0 ? '$' + price + ' per person (Zelle or cash)' : 'Free entry';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'style.css'),
  fs.readFileSync(path.join(dir, 'Style.html'), 'utf8').replace(/<\/?style>/g, '').trim() + '\n');
fs.writeFileSync(path.join(out, 'config.js'), 'window.BB_API = ' + JSON.stringify(API) + ';\n');
fs.writeFileSync(path.join(out, 'api.js'), `// Stand-in for google.script.run that calls the Apps Script backend.
// Uses fetch without cookies, falling back to JSONP (a <script> tag).
(function () {
  var n = 0;
  // Primary path: fetch with credentials omitted, so Google never sees the visitor's sign-in cookies
  // (phones signed in to several Google accounts otherwise get Google's "unable to open the file" page).
  function call(fn, args, ok, fail) {
    var rid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    var url = window.BB_API + '?fn=' + encodeURIComponent(fn) + '&args=' + encodeURIComponent(JSON.stringify(args)) + '&rid=' + rid + '&callback=__bbcb';
    if (!window.fetch) return jsonp(fn, args, ok, fail, rid);
    var ctl = window.AbortController ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, 25000);
    fetch(url, { credentials: 'omit', cache: 'no-store', redirect: 'follow', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        clearTimeout(t);
        txt = txt.trim(); var a = txt.indexOf('__bbcb('), b = txt.lastIndexOf(')');
        if (a !== 0 || b < 0) throw new Error('bad');
        var j = JSON.parse(txt.slice(7, b));
        if (j && j.ok) { if (ok) ok(j.result); } else if (fail) fail(new Error((j && j.error) || 'Something went wrong.'));
      })
      .catch(function () { clearTimeout(t); jsonp(fn, args, ok, fail, rid); });
  }
  function jsonp(fn, args, ok, fail, rid) {
    var cb = '__bb' + Date.now() + '_' + (n++), done = false, s = document.createElement('script');
    function finish() { done = true; clearTimeout(t); try { delete window[cb]; } catch (e) { window[cb] = undefined; } s.remove(); }
    var t = setTimeout(function () {
      if (done) return; finish();
      if (fail) fail(new Error('The server did not answer. Please try again in a moment.'));
    }, 25000);
    window[cb] = function (j) {
      if (done) return; finish();
      if (j && j.ok) { if (ok) ok(j.result); } else if (fail) fail(new Error((j && j.error) || 'Something went wrong.'));
    };
    s.onerror = function () { if (done) return; finish(); if (fail) fail(new Error('Could not reach the server. Please check your connection and try again.')); };
    s.src = window.BB_API + '?fn=' + encodeURIComponent(fn) + '&args=' + encodeURIComponent(JSON.stringify(args)) + '&rid=' + rid + '&callback=' + cb;
    document.head.appendChild(s);
  }
  function runner(ok, fail) {
    return new Proxy({}, { get: function (_, k) {
      if (k === 'withSuccessHandler') return function (f) { return runner(f, fail); };
      if (k === 'withFailureHandler') return function (f) { return runner(ok, f); };
      return function () { call(k, Array.prototype.slice.call(arguments), ok, fail); };
    } });
  }
  window.google = { script: { run: runner(null, null) } };
})();
`);
// Connection check page for troubleshooting.
const V = Date.now().toString(36); // cache-buster so phones never keep an old api.js
fs.writeFileSync(path.join(out, 'check.html'), `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bhajan Beatz · Connection check</title><meta name="robots" content="noindex"><link rel="stylesheet" href="style.css?v=${V}">
<script src="config.js?v=${V}"></script></head><body><div class="wrap">
<div class="brand"><div class="k">BHAJAN BEATZ</div><h1>Connection check</h1><div class="where">Site build ${V}</div></div>
<div class="card"><p><b>Test A (direct)</b><br><span id="a">Checking…</span></p><p><b>Test B (script)</b><br><span id="b">Checking…</span></p>
<p class="fine" id="u" style="text-align:left;word-break:break-all"></p></div></div>
<script>
  function $(i) { return document.getElementById(i); }
  $('u').textContent = 'Backend: ' + window.BB_API + ' · ' + navigator.userAgent;
  var url = window.BB_API + '?fn=apiVersion&args=%5B%5D&callback=__bbcb&rid=chk' + Date.now();
  fetch(url, { credentials: 'omit', cache: 'no-store' }).then(function (r) {
    return r.text().then(function (t) { $('a').textContent = (t.indexOf('__bbcb(') >= 0 ? 'OK ' : 'FAILED ') + 'HTTP ' + r.status + ' from ' + (r.url || '').split('?')[0].slice(0, 60) + ' : ' + t.slice(0, 140); });
  }).catch(function (e) { $('a').textContent = 'FAILED ' + e.name + ': ' + e.message; });
  window.__chk = function (j) { $('b').textContent = 'OK ' + JSON.stringify(j); };
  var s = document.createElement('script'); s.src = window.BB_API + '?fn=apiVersion&args=%5B%5D&callback=__chk&rid=chs' + Date.now();
  s.onerror = function () { $('b').textContent = 'FAILED (script could not load: Google returned an error or sign-in page)'; };
  document.head.appendChild(s);
  setTimeout(function () { if (/Checking/.test($('b').textContent)) $('b').textContent = 'FAILED (no answer in 20s)'; }, 20000);
</script></body></html>
`);
fs.writeFileSync(path.join(out, '.nojekyll'), '');
for (const img of ['logo.jpg', 'banner.jpg']) if (fs.existsSync(path.join(dir, img))) fs.copyFileSync(path.join(dir, img), path.join(out, img));

const pages = { Register: ['index.html', 'Register'], Ticket: ['ticket.html', 'Your ticket'],
                Door: ['door.html', 'Door check-in'], Report: ['report.html', 'Report'] };
for (const [src, [file, title]] of Object.entries(pages)) {
  let h = fs.readFileSync(path.join(dir, src + '.html'), 'utf8');
  h = h.replace('<base target="_top">', '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
                '<title>Bhajan Beatz · ' + title + '</title>' + (src === 'Door' || src === 'Report' ? '<meta name="robots" content="noindex">' : ''))
       .replace("<?!= include('Style'); ?>", '<link rel="stylesheet" href="style.css?v=' + V + '"><script src="config.js?v=' + V + '"></script><script src="api.js?v=' + V + '"></script>')
       .replace(/<\?= S\.(\w+) \?>/g, (_, k) => typeof S[k] === 'number' ? String(S[k]) : esc(S[k]))
       .replace(/<\?= priceLabel \?>/g, esc(priceLabel))
       .replace(/<\?= appUrl \?>/g, "(location.href.replace(/[^\\/]*([?#].*)?$/, '') + 'ticket.html')")
       .replace(/<\?= ticketId \?>/g, "(new URLSearchParams(location.search).get('t') || '')");
  if (/<\?/.test(h)) throw new Error(src + ': unconverted template tag left: ' + h.match(/<\?[^>]*\?>/)[0]);
  fs.writeFileSync(path.join(out, file), h);
}
console.log('Site built in ' + out + ' using API ' + API);
