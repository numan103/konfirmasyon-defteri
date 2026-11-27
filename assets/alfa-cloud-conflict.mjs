import { chartDialog } from './alfa-chart-ui.mjs?v=5';

export function sameSettings(a, b) {
  const stable = value => value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
    : value;
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

// Resolving is deliberately read/compare/write/read, never a blind retry.
export async function resolveCloudChoice({ choice, readLocal, load, save, archive, apply, finish, valid = () => true }) {
  const local = structuredClone(readLocal());
  const remote = await load();
  if (!valid() || !remote?.settings || !remote.revision) throw Error('Bulut sürümü okunamadı; senkronizasyon kapalı kaldı');
  if (!await archive(local)) throw Error('Yerel yedek kaydedilemedi; işlem durduruldu');
  let chosen = remote.settings, revision = remote.revision;
  if (choice === 'local') {
    if (!valid() || !sameSettings(readLocal(), local)) throw Error('Yerel ayarlar değişti; tekrar seçin');
    const result = await save(local, remote.revision);
    if (!result?.ok) throw Error('Bulut kaydı doğrulanamadı; çakışma devam ediyor');
    chosen = local; revision = result.revision;
  } else if (choice !== 'cloud') throw Error('Geçersiz seçim');
  const verified = await load();
  if (!valid() || !sameSettings(readLocal(), local) || verified?.revision !== revision || !sameSettings(verified?.settings, chosen)) {
    throw Error('Sürümler değişti veya doğrulanamadı; senkronizasyon kapalı kaldı');
  }
  if (choice === 'cloud') await apply(chosen);
  await finish(verified);
  return verified;
}

export function openCloudConflict(options) {
  const modal = chartDialog(`<h3>Bulut kayıt çakışması</h3>
    <p>Yerel sürüm korunuyor. Seçiminiz doğrulanana kadar otomatik senkronizasyon kapalıdır.</p>
    <p role="status" id="conflict-result"></p>
    <div class="settings-actions"><button id="conflict-local">Yereli Koru</button>
    <button id="conflict-cloud">Bulutu Kullan</button><button id="conflict-export">Dışa Aktar</button>
    <button id="conflict-close">Kapat</button></div>`);
  const result = modal.box.querySelector('#conflict-result');
  modal.box.querySelector('#conflict-close').onclick = modal.close;
  modal.box.querySelector('#conflict-export').onclick = () => {
    if (options.valid && !options.valid()) {
      result.textContent = 'Hesap veya bağlam değişti; çakışma penceresini yeniden açın';
      return;
    }
    const blob = new Blob([JSON.stringify({ scope: options.scope, settings: options.readLocal() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'alfa-chart-conflict.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    result.textContent = 'Yerel sürüm dışa aktarıldı; çakışma henüz çözülmedi';
  };
  for (const choice of ['local', 'cloud']) modal.box.querySelector('#conflict-' + choice).onclick = async () => {
    const buttons = modal.box.querySelectorAll('button');
    buttons.forEach(button => { button.disabled = true; });
    try {
      await resolveCloudChoice({ ...options, choice });
      result.textContent = 'Seçilen sürüm doğrulandı · senkronizasyon açıldı';
      options.onResolved?.();
    } catch (error) { result.textContent = error.message; }
    finally { buttons.forEach(button => { button.disabled = false; }); }
  };
  return modal;
}
