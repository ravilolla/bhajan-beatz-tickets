// Stand-in for google.script.run that calls the Apps Script backend.
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
