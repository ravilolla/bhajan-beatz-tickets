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
fs.writeFileSync(path.join(out, 'api.js'), `// Stand-in for google.script.run that calls the Apps Script backend over HTTPS.
(function () {
  function call(fn, args, ok, fail) {
    fetch(window.BB_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                           body: JSON.stringify({ fn: fn, args: args }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j.ok) { if (ok) ok(j.result); } else if (fail) fail(new Error(j.error)); })
      .catch(function () { if (fail) fail(new Error('Could not reach the server. Please check your connection and try again.')); });
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
