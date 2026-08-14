(function () {
      var ta = document.getElementById('tv-notes-ta');
      if (!ta) return;
      try { ta.value = localStorage.getItem('alfa-tv-notes') || ''; } catch (e) {}
      ta.addEventListener('input', function () { try { localStorage.setItem('alfa-tv-notes', ta.value); } catch (e) {} });
    })();