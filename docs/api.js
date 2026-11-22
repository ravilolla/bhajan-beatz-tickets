// Stand-in for google.script.run that calls the Apps Script backend over HTTPS.
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
