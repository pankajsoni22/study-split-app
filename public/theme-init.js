// Runs before first paint. Mirrors src/lib/theme.ts (key + values must stay in sync).
(function () {
  try {
    var t = localStorage.getItem('ss.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: follow the system theme */ }
})();
