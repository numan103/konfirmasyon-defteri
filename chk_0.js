(function () {
    var saved = null;
    try { saved = localStorage.getItem('alfa-theme'); } catch (e) {}
    var initial = 'dark';
    if (saved === 'light') initial = 'light';
    if (location.search.indexOf('light=1') !== -1) initial = 'light';
    document.documentElement.setAttribute('data-theme', initial);
    function applyTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      var checked = t === 'light' ? 'true' : 'false';
      document.querySelectorAll('.theme-toggle, .theme-toggle-d').forEach(function (b) {
        b.setAttribute('aria-checked', checked);
      });
    }
    document.addEventListener('DOMContentLoaded', function () {
      var btns = document.querySelectorAll('.theme-toggle, .theme-toggle-d');
      if (!btns.length) return;
      btns.forEach(function (btn) {
        btn.setAttribute('aria-checked', initial === 'light' ? 'true' : 'false');
        btn.addEventListener('click', function () {
          var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
          try { localStorage.setItem('alfa-theme', cur); } catch (e) {}
          applyTheme(cur);
        });
      });
    });
  })();