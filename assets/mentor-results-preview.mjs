import { renderMentorCurve, renderMentorEvaluation, resultTeasers } from './mentor-curve.mjs?v=2';
const API = '/api/ai?mentorTrades=1';
const trade = document.getElementById('lp-live-trades'), bias = document.getElementById('lp-live-bias'), results = document.getElementById('lp-live-results'), home = document.getElementById('home-results-panel');
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
for (const node of [trade, bias, results]) if (node) node.dataset.mentorOwned = 'true';
let summaryPromise, summaryAt = 0, user = '', epoch = 0, lastTier = '';
function uid() { try { return AUTH.user?.id || ''; } catch { return ''; } }
function premiumLink(host, text = 'İşlem planları ve grafikler premium’a özel. Premium’u aç →') {
  const a = el('a', text); a.href = '?page=erisim'; a.className = 'mentor-preview-cta'; a.dataset.nav = ''; host.appendChild(a);
}
function place() {
  if (!home) return;
  const current = uid(), tier = typeof SITE !== 'undefined' ? SITE.tier : '';
  const target = document.getElementById(current && tier === 'ref' ? 'home-results-bottom' : 'home-results-slot');
  if (target && home.parentElement !== target) target.appendChild(home);
}
async function refresh() {
  const current = uid(), tier = typeof SITE !== 'undefined' ? SITE.tier : '';
  place();
  if (current === user && tier === lastTier && summaryPromise && Date.now() - summaryAt < 60000) return;
  if (Date.now() - summaryAt >= 60000) summaryPromise = null;
  user = current; lastTier = tier; const run = ++epoch;
  for (const node of [results, home]) node?.replaceChildren(el('p', 'Sonuçlar yükleniyor…'));
  if (bias) { bias.replaceChildren(el('p', 'Canlı bias ve yön görüşleri premium üyelere özeldir.')); premiumLink(bias); }
  if (!summaryPromise) { summaryAt = Date.now(); summaryPromise = fetch(API + '&summary=1', { cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error(); return r.json(); }).catch(error => { summaryPromise = null; throw error; }); }
  try {
    const data = await summaryPromise;
    if (run !== epoch) return;
    for (const node of [trade]) if (node) {
      const curve = el('div'); curve.className = 'mentor-curve'; renderMentorCurve(curve, data.summary);
      node.replaceChildren(curve); premiumLink(node);
    }
    if (!current) {
      if (results) { results.replaceChildren(el('p', 'Sonuçlanan işlemlerin sembol ve R özetini görmek için ücretsiz kaydol.')); premiumLink(results, 'Ücretsiz hesabınla sonuçları gör →'); results.lastChild.href = '?page=home'; results.lastChild.onclick = event => { event.preventDefault(); document.getElementById('auth-gate')?.classList.add('open'); }; }
      if (home) {
        const curve = el('div'); curve.className = 'mentor-curve'; renderMentorCurve(curve, data.summary);
        home.replaceChildren(curve);
      }
      return;
    }
    const response = await window.siteFetch(API + '&results=1', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const out = await response.json();
    if (run !== epoch || current !== uid()) return;
    const records = out.records || [];
    if (results) { resultTeasers(results, records); premiumLink(results); }
    if (home) {
      const card = el('div', undefined, 'mentor-evaluation');
      renderMentorEvaluation(card, records, { title:'Kasım · kümülatif sonuçlar' });
      home.replaceChildren(card);
      const count = document.getElementById('home-results-count');
      if (count) count.textContent = records.length;
    }
  } catch {
    if (run === epoch) for (const node of [trade, home, results]) node?.replaceChildren(el('p', 'Sonuç özeti şu an alınamıyor. Daha sonra tekrar deneyebilirsin.'));
  }
}
new MutationObserver(refresh).observe(document.body, { attributes: true, attributeFilter: ['class','data-page'] });
window.AlfaMentorPreview = { refresh };
window.addEventListener('focus', refresh);
refresh();
