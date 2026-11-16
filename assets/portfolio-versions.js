(function(root) {
  'use strict';
  root.AlfaPortfolioVersions = {
    open: async function(options) {
      var old = document.getElementById('ap2-versions-dialog');
      if (old) { old.showModal(); return; }
      var dialog = document.createElement('dialog'); dialog.id = 'ap2-versions-dialog';
      dialog.style.cssText = 'max-width:720px;width:90vw;max-height:85vh;overflow:auto;background:var(--card,#152030);color:var(--text,#eee);border:1px solid #52647d;border-radius:12px;padding:20px';
      var title = document.createElement('h2'); title.textContent = 'Portföy sürüm geçmişi';
      var note = document.createElement('p');
      note.textContent = 'Son 100 kayıt sunucuda korunur. Önceki sürüme dönüş de yeni bir sürüm oluşturur. Bu, bağımsız bir veritabanı yedeği değildir; önemli kayıtları JSON olarak da indir.';
      var close = document.createElement('button'); close.textContent = 'Kapat'; close.onclick = function() { dialog.close(); };
      dialog.addEventListener('close', function() { dialog.remove(); });
      var status = document.createElement('p'); status.setAttribute('role','status');
      var list = document.createElement('div'), more = document.createElement('button');
      more.textContent = 'Daha eski kayıtlar'; more.hidden = true;
      var busy = false;
      async function request(url, init) {
        var response = await options.fetch(url, init);
        var body = await response.json();
        if (!response.ok) throw new Error(response.status === 409 ? 'Başka cihazda kayıt değişti. Önce güncel portföyü yükle.' :
          response.status === 401 ? 'Oturum doğrulanamadı. Yeniden giriş yap.' : 'İşlem tamamlanamadı (' + response.status + ').');
        return body;
      }
      async function load(before) {
        status.textContent = 'Sürümler yükleniyor…'; more.disabled = true;
        try {
          var data = await request('/api/edu-shared?kind=portfolio&versions=1' + (before ? '&before=' + before : ''));
          if (!Array.isArray(data.versions)) throw new Error('Sürüm yanıtı doğrulanamadı.');
          data.versions.forEach(function(version) {
            var row = document.createElement('div'); row.style.cssText = 'padding:12px 0;border-bottom:1px solid #52647d';
            var text = document.createElement('p');
            text.textContent = '#' + version.id + ' · ' + new Date(version.revision).toLocaleString('tr-TR') +
              ' · ' + version.position_count + ' pozisyon · ' + version.sale_count + ' satış · ' + version.action;
            var download = document.createElement('button'); download.textContent = 'JSON indir';
            download.onclick = async function() {
              try {
                var result = await request('/api/edu-shared?kind=portfolio&version=' + version.id);
                root.AlfaPortfolioRecovery.download(result.version.data, 'sunucu-surum-' + version.id);
                status.textContent = 'JSON yedeği indirildi.';
              } catch(e) { status.textContent = e.message; }
            };
            var restore = document.createElement('button'); restore.textContent = 'Bu sürüme dön'; restore.style.marginLeft = '8px';
            restore.onclick = async function() {
              if (busy || !options.canRestore()) return;
              if (!confirm('#' + version.id + ' sürümüne dönülsün mü? (' + version.position_count + ' pozisyon, ' + version.sale_count +
                ' satış) Mevcut portföy de sunucuda sürüm olarak korunacak.')) return;
              busy = true; restore.disabled = true;
              status.textContent = 'Sürüm geri yükleniyor…';
              try {
                var saved = await request('/api/edu-shared?kind=portfolio', { method: 'POST',
                  headers: { 'Content-Type':'application/json' },
                  body: JSON.stringify({ action:'restore', confirmation:'RESTORE', versionId:version.id, revision:options.revision() }) });
                if (!saved.backedUp || !saved.versionId) throw new Error('Sunucu kaydı doğrulanamadı.');
                await options.onRestored(); dialog.close();
              } catch(e) {
                options.onWriteFailure(e.message);
                status.textContent = e.message + ' Sonuç belirsizse otomatik tekrar yapılmaz; yerel kopya korunur.';
              } finally { busy = false; restore.disabled = false; }
            };
            row.append(text, download, restore); list.append(row);
          });
          status.textContent = data.versions.length ? 'Sürümler sunucudan okundu.' : 'Bu aralıkta sürüm bulunamadı.';
          more.hidden = !data.nextBefore;
          more.onclick = function() { load(data.nextBefore); };
        } catch(e) { status.textContent = e.message; }
        finally { more.disabled = false; }
      }
      dialog.append(title,note,close,status,list,more); document.body.append(dialog); dialog.showModal();
      await load();
    }
  };
})(globalThis);
