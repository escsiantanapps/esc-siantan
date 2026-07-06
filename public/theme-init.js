// Init tema (dark/light) sebelum React mount agar tidak ada FOUC.
// File terpisah supaya CSP script-src bisa strict ('self' tanpa 'unsafe-inline').
(function () {
  var stored = localStorage.getItem('esc-theme');
  var dark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
})();
