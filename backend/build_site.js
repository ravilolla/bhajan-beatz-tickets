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
// Uses JSONP (a <script> tag) so browsers' cross-site (CORS) rules never get in the way.
(function () {
  var n = 0;
  function call(fn, args, ok, fail) {
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
    s.src = window.BB_API + '?fn=' + encodeURIComponent(fn) + '&args=' + encodeURIComponent(JSON.stringify(args)) + '&callback=' + cb;
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
fs.writeFileSync(path.join(out, 'check.html'), `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bhakti Beats · Connection check</title><meta name="robots" content="noindex"><link rel="stylesheet" href="style.css">
<script src="config.js"></script><script src="api.js"></script></head><body><div class="wrap">
<div class="brand"><div class="k">BHAKTI BEATS</div><h1>Connection check</h1></div>
<div class="card"><p id="r">Checking…</p><p class="fine" id="u" style="text-align:left;word-break:break-all"></p></div></div>
<script>
  document.getElementById('u').textContent = 'Backend: ' + window.BB_API;
  google.script.run.withSuccessHandler(function (v) {
    document.getElementById('r').innerHTML = v >= 3 ? '<span class="pill ok">Connected</span> Backend version ' + v + '. Everything is wired up.'
      : '<span class="pill warn">Old backend</span> Version ' + v + '. Paste the latest Code.gs and deploy a New version.';
  }).withFailureHandler(function (e) {
    document.getElementById('r').innerHTML = '<span class="pill bad">Not connected</span> ';
    document.getElementById('r').appendChild(document.createTextNode(e.message + ' Most likely the latest Code.gs is not deployed yet (Deploy, Manage deployments, pencil, New version), or the backend link above is not your current /exec link.'));
  }).apiVersion();
</script></body></html>
`);
fs.writeFileSync(path.join(out, '.nojekyll'), '');

const pages = { Register: ['index.html', 'Register'], Ticket: ['ticket.html', 'Your ticket'],
                Door: ['door.html', 'Door check-in'], Report: ['report.html', 'Report'] };
for (const [src, [file, title]] of Object.entries(pages)) {
  let h = fs.readFileSync(path.join(dir, src + '.html'), 'utf8');
  h = h.replace('<base target="_top">', '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
                '<title>Bhakti Beats · ' + title + '</title>' + (src === 'Door' || src === 'Report' ? '<meta name="robots" content="noindex">' : ''))
       .replace("<?!= include('Style'); ?>", '<link rel="stylesheet" href="style.css"><script src="config.js"></script><script src="api.js"></script>')
       .replace(/<\?= S\.(\w+) \?>/g, (_, k) => typeof S[k] === 'number' ? String(S[k]) : esc(S[k]))
       .replace(/<\?= priceLabel \?>/g, esc(priceLabel))
       .replace(/<\?= appUrl \?>/g, "(location.href.replace(/[^\\/]*([?#].*)?$/, '') + 'ticket.html')")
       .replace(/<\?= ticketId \?>/g, "(new URLSearchParams(location.search).get('t') || '')");
  if (/<\?/.test(h)) throw new Error(src + ': unconverted template tag left: ' + h.match(/<\?[^>]*\?>/)[0]);
  fs.writeFileSync(path.join(out, file), h);
}
console.log('Site built in ' + out + ' using API ' + API);
