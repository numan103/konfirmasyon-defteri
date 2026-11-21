export function speechChunks(text, limit = 260) {
  const words = String(text || '').replace(/[#*_`]/g, '').replace(/\s+/g, ' ').trim().split(' ');
  const chunks = []; let current = '';
  for (const word of words) {
    if (!word) continue;
    if (current && current.length + word.length + 1 > limit) { chunks.push(current); current = ''; }
    if (word.length > limit) {
      if (current) { chunks.push(current); current = ''; }
      const chars = Array.from(word);
      while (chars.length) chunks.push(chars.splice(0, limit).join(''));
    } else current += (current ? ' ' : '') + word;
  }
  if (current) chunks.push(current);
  return chunks;
}
let active = null;
export function stopArticleSpeech() { if (active) active.stop(); }
export function speechControls(text, title = '') {
  const root = document.createElement('div'); root.className = 'article-speech';
  const play = document.createElement('button'); play.type = 'button'; play.className = 'btn'; play.textContent = '🔊 Sesli dinle';
  const stop = document.createElement('button'); stop.type = 'button'; stop.className = 'btn'; stop.textContent = '■ Durdur'; stop.hidden = true;
  const rate = document.createElement('select'); rate.setAttribute('aria-label', 'Seslendirme hızı');
  for (const speed of [.8, 1, 1.2, 1.5]) { const option = document.createElement('option'); option.value = speed; option.textContent = speed + '×'; rate.append(option); } rate.value = '1';
  const status = document.createElement('span'); status.className = 'hint'; status.setAttribute('role', 'status');
  root.append(play, stop, rate, status);
  const supported = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  const body = String(text || '').trim();
  if (!supported || !body) {
    play.disabled = true; rate.disabled = true;
    status.textContent = supported ? 'Seslendirme için yazı metni gerekli; PDF dosyası tek başına seslendirilmez.' : 'Bu tarayıcı sesli okumayı desteklemiyor.';
    return root;
  }
  let token = 0, paused = false, speaking = false, index = 0, utterance = null;
  const chunks = speechChunks((title ? title + '. ' : '') + body);
  function reset(cancel = true) {
    token++; speaking = false; paused = false; utterance = null;
    if (active?.root === root) { active = null; if (cancel) window.speechSynthesis.cancel(); }
    play.textContent = '🔊 Sesli dinle'; play.setAttribute('aria-pressed', 'false'); stop.hidden = true; rate.disabled = false; status.textContent = '';
  }
  function next(generation) {
    if (generation !== token || !speaking) return;
    if (!root.isConnected || index >= chunks.length) { reset(); return; }
    utterance = new SpeechSynthesisUtterance(chunks[index]); utterance.lang = 'tr-TR'; utterance.rate = Number(rate.value);
    const voice = window.speechSynthesis.getVoices().find(v => /^tr(?:-|_)/i.test(v.lang));
    if (voice) utterance.voice = voice;
    status.textContent = (index + 1) + ' / ' + chunks.length;
    utterance.onend = () => { if (generation !== token) return; index++; next(generation); };
    utterance.onerror = event => { if (generation !== token) return; reset(); if (!['canceled', 'interrupted'].includes(event.error)) status.textContent = 'Seslendirme başlatılamadı. Tekrar dene veya cihazındaki Türkçe ses ayarını kontrol et.'; };
    window.speechSynthesis.speak(utterance);
  }
  play.onclick = () => {
    if (speaking) {
      paused = !paused;
      if (paused) window.speechSynthesis.pause(); else window.speechSynthesis.resume();
      play.textContent = paused ? '▶ Devam et' : '⏸ Duraklat'; return;
    }
    stopArticleSpeech(); window.speechSynthesis.cancel();
    speaking = true; paused = false; index = 0; const generation = ++token;
    active = { root, stop: reset }; stop.hidden = false; rate.disabled = true;
    play.textContent = '⏸ Duraklat'; play.setAttribute('aria-pressed', 'true'); next(generation);
  };
  stop.onclick = () => reset();
  return root;
}
if (typeof window !== 'undefined') {
  window.AlfaArticleSpeech = { controls: speechControls, stop: stopArticleSpeech };
  window.addEventListener('pagehide', stopArticleSpeech);
  let lastPage = document.body.dataset.page;
  new MutationObserver(() => {
    const page = document.body.dataset.page;
    if (page !== lastPage || (active && !active.root.isConnected)) stopArticleSpeech();
    lastPage = page;
  }).observe(document.body, { attributes: true, attributeFilter: ['data-page'], childList: true, subtree: true });
}
