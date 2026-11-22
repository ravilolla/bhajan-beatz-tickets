// Stand-in for google.script.run that calls the Apps Script backend.
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
