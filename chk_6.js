// ============ Junior UID Kayıt ============
function submitJuniorForm() {
  const btn = document.getElementById('jf-submit');
  const r = document.getElementById('jf-result');
  const name = document.getElementById('jf-name').value.trim();
  const tg = document.getElementById('jf-tg').value.trim();
  const x = document.getElementById('jf-x').value.trim();
  const exp = document.getElementById('jf-exp').value;
  const market = document.getElementById('jf-market').value;
  const freq = document.getElementById('jf-freq').value;
  const method = document.getElementById('jf-method').value;
  const level = document.getElementById('jf-level').value;
  const time = document.getElementById('jf-time').value;
  const share = document.getElementById('jf-share').value;
  const why = document.getElementById('jf-why').value.trim();
  if (!name || !tg || !exp || !market || !freq || !method || !why) { r.textContent = 'Ad, Telegram, tecrübe, piyasa, sıklık, öğrenmek istediğin ve neden zorunlu.'; r.style.display = 'block'; r.style.color = '#ef4444'; return; }
  btn.disabled = true; btn.textContent = 'Gönderiliyor...';
  r.style.display = 'none';
  const payload = { type: 'junior', name, tg, x, exp, market, freq, method, level, time, share, why, date: new Date().toISOString() };
  saveApplication(payload, 'junior').then(res => {
    btn.disabled = false; btn.textContent = 'Başvur →';
    if (res.ok) {
      r.textContent = res.queued ? '✅ Başvurun bu cihazda kaydedildi. Supabase erişimi açılınca iletilir.' : t('pg.bas.okJunior');
      r.style.display = 'block'; r.style.color = '#22c55e';
      document.getElementById('junior-form').querySelectorAll('input, textarea, select').forEach(el => el.value = '');
    } else {
      r.textContent = t('pg.bas.errRetry'); r.style.display = 'block'; r.style.color = '#ef4444';
    }
  });
}
// ============ Başvurular (Supabase) ============
const APPLY_TABLE = 'applications';
function appsAllowed() {
  return !!(typeof AUTH !== 'undefined' && AUTH.user && (AUTH.user.email || '').toLowerCase() === ADMIN_EMAIL);
}
async function saveApplication(payload, type) {
  try {
    if (typeof AUTH !== 'undefined' && AUTH.client) {
      const { error } = await AUTH.client.from(APPLY_TABLE).insert({ type: type || payload.type || 'junior', payload: Object.assign({}, payload) });
      if (!error) return { ok: true };
    }
  } catch (e) { /* */ }
  try {
    const q = JSON.parse(localStorage.getItem('apply_queue') || '[]');
    q.push({ at: new Date().toISOString(), type: type || payload.type || 'junior', payload });
    localStorage.setItem('apply_queue', JSON.stringify(q));
    return { ok: true, queued: true };
  } catch (e) { /* */ }
  return { ok: false };
}
async function flushApplyQueue() {
  try {
    const q = JSON.parse(localStorage.getItem('apply_queue') || '[]');
    if (!q.length) return;
    const remaining = [];
    for (const it of q) {
      try {
        const { error } = await AUTH.client.from(APPLY_TABLE).insert({ type: it.type || 'junior', payload: it.payload });
        if (error) remaining.push(it);
      } catch (e) { remaining.push(it); }
    }
    localStorage.setItem('apply_queue', JSON.stringify(remaining));
  } catch (e) { /* */ }
  renderApps();
}
const AP_FIELDS = {
  junior: [['name', 'Ad'], ['tg', 'Telegram'], ['x', 'X'], ['exp', 'Tecrübe'], ['market', 'Piyasa'], ['freq', 'İşlem sıklığı'], ['method', 'Öğrenmek istediğin'], ['level', 'Seviye'], ['time', 'Günlük süre'], ['share', 'Chart paylaşımı'], ['why', 'Neden'], ['date', 'Tarih']],
  senior: [['name', 'Ad'], ['tg', 'Telegram'], ['x', 'X'], ['exp', 'Tecrübe'], ['market', 'Piyasa'], ['freq', 'Sıklık'], ['method', 'Analiz'], ['level', 'Seviye'], ['pnl', 'Son 6 ay'], ['pnl2', '2 aylık PnL'], ['payout', 'Payout'], ['lasttrade', 'Son işlem'], ['why', 'Neden'], ['date', 'Tarih']]
};
async function renderApps() {
  const list = document.getElementById('apps-list');
  if (!list) return;
  if (!appsAllowed()) { list.innerHTML = 'Bu sayfa yalnızca yöneticiye özeldir.'; return; }
  list.innerHTML = 'Yükleniyor...';
  let rows = [];
  let qErr = false;
  try {
    if (typeof AUTH !== 'undefined' && AUTH.client && AUTH.user) {
      const { data, error } = await AUTH.client.from(APPLY_TABLE).select('*').order('created_at', { ascending: false }).limit(300);
      if (error) qErr = true; else if (data) rows = data;
    } else qErr = true;
  } catch (e) { qErr = true; }
  let queued = [];
  try { queued = JSON.parse(localStorage.getItem('apply_queue') || '[]'); } catch (e) { /* */ }
  if (qErr && !rows.length && !queued.length) {
    list.innerHTML = '<div style="padding:26px;text-align:center;">Başvurular yüklenemedi. Supabase tablosunu kontrol et (<code>public.applications</code>).</div>';
    return;
  }
  list.innerHTML = '';
  if (queued.length) {
    const qb = document.createElement('div');
    qb.style.cssText = 'border:1px solid var(--amber);border-radius:12px;padding:12px 14px;margin-bottom:12px;font-size:12px;color:var(--amber);';
    qb.innerHTML = '<b>⚠ ' + queued.length + ' başvuru bu cihazda bekliyor</b> — Supabase\'e yazılamamış. <button class="path-btn" onclick="flushApplyQueue()" style="margin-left:8px;padding:5px 12px;font-size:11px;">Şimdi ilet</button>';
    list.appendChild(qb);
    rows = rows.concat(queued.map(x => ({ id: 'q_' + x.at, created_at: x.at, type: x.type || 'junior', payload: x.payload, queued: true })));
  }
  if (!rows.length) {
    list.innerHTML = '<div style="padding:26px;text-align:center;">Henüz başvuru yok.</div>';
    return;
  }
  rows.forEach(row => list.appendChild(renderAppsCard(row)));
}
function renderAppsCard(row) {
  const card = document.createElement('div');
  card.style.cssText = 'background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:12px;';
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;';
  const badge = document.createElement('span');
  const tkey = row.type === 'senior' ? 'senior' : 'junior';
  badge.textContent = tkey === 'senior' ? 'Senior' : 'Junior';
  badge.style.cssText = 'font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;border-radius:999px;padding:3px 9px;' + (tkey === 'senior' ? 'background:rgba(167,139,250,.16);color:#a78bfa;' : 'background:rgba(249,115,22,.16);color:#f97316;');
  head.appendChild(badge);
  if (row.queued) {
    const q = document.createElement('span');
    q.textContent = '⌛ bekliyor';
    q.style.cssText = 'font-size:10px;font-weight:700;color:var(--amber);';
    head.appendChild(q);
  }
  const dt = document.createElement('span');
  try { dt.textContent = new Date(row.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { dt.textContent = row.created_at || ''; }
  dt.style.cssText = 'margin-left:auto;font-size:11px;color:var(--text-3);';
  head.appendChild(dt);
  card.appendChild(head);
  const body = document.createElement('div');
  body.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px 14px;font-size:12px;';
  (AP_FIELDS[tkey] || []).forEach(pair => {
    const v = row.payload ? row.payload[pair[0]] : undefined;
    if (v === undefined || v === '') return;
    const item = document.createElement('div');
    item.innerHTML = '<div style="color:var(--text-3);font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">' + esc(pair[1]) + '</div><div style="margin-top:2px;color:var(--text);word-break:break-word;">' + esc(String(v)) + '</div>';
    body.appendChild(item);
  });
  card.appendChild(body);
  const foot = document.createElement('div');
  foot.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:10px;';
  const del = document.createElement('button');
  del.type = 'button';
  del.textContent = '🗑 Sil';
  del.style.cssText = 'margin-left:auto;padding:5px 14px;font-size:11px;font-weight:700;border-radius:8px;border:1px solid rgba(239,68,68,.4);color:#ef4444;background:transparent;cursor:pointer;';
  del.addEventListener('click', () => { deleteApplication(row.id, row.queued); });
  foot.appendChild(del);
  card.appendChild(foot);
  return card;
}
async function deleteApplication(id, queued) {
  if (!window.confirm('Bu başvuru silinsin mi?')) return;
  if (queued) {
    try {
      const q = JSON.parse(localStorage.getItem('apply_queue') || '[]');
      const at = String(id).replace(/^q_/, '');
      localStorage.setItem('apply_queue', JSON.stringify(q.filter(x => x.at !== at)));
    } catch (e) { /* */ }
    renderApps();
    return;
  }
  try {
    const { error } = await AUTH.client.from(APPLY_TABLE).delete().eq('id', id);
    if (error) { window.alert('Silinemedi: ' + (error.message || 'hata')); return; }
  } catch (e) { window.alert('Silinemedi: ' + (e.message || 'hata')); return; }
  renderApps();
}
// ============ Chat Widget ============
const CHAT_KEY = 'alfa-chat-v3';
const CHAT_API = '/api/chat-admin';
let chatHistory = [];
let chatFallbackCount = 0;
let chatLiveRequested = false;
function chatSid() {
  let s = localStorage.getItem('alfa-chat-sid');
  if (!s) { s = Date.now().toString(36) + Math.random().toString(36).slice(2,9); localStorage.setItem('alfa-chat-sid', s); }
  return s;
}
function loadChat() {
  try {
    const d = localStorage.getItem(CHAT_KEY);
    if (d) {
      chatHistory = JSON.parse(d);
      const last = chatHistory[chatHistory.length - 1];
      if (last && last.time && (Date.now() - new Date(last.time).getTime() > 1800000)) {
        chatHistory = [];
      }
    } else { chatHistory = []; }
  } catch(e) { chatHistory = []; }
  chatFallbackCount = 0;
  chatLiveRequested = false;
}
function saveChat() { try { localStorage.setItem(CHAT_KEY, JSON.stringify(chatHistory)); } catch(e) {} }
function toggleChat() {
  const p = document.getElementById('chat-popup');
  if (!p) return;
  const isOpen = p.classList.contains('open');
  if (isOpen) { closeChat(); return; }
  p.classList.add('open');
  document.getElementById('chat-btn').textContent = '✕';
  renderChat();
  setTimeout(() => document.getElementById('chat-input').focus(), 100);
}
function closeChat() {
  document.getElementById('chat-popup').classList.remove('open');
  document.getElementById('chat-btn').textContent = '💬';
}
function chatEndSession() {
  if (chatLiveRequested) {
    if (!confirm('Canlı desteği sonlandır? Konuşma geçmişin silinir.')) return;
  } else if (!chatHistory.length) {
    return;
  } else {
    if (!confirm('Sohbet geçmişini temizle? Tüm konuşma silinir.')) return;
  }
  chatHistory = [];
  chatFallbackCount = 0;
  chatLiveRequested = false;
  saveChat();
  renderChat();
}
function renderChat() {
  const body = document.getElementById('chat-body');
  if (!body) return;
  if (!chatHistory.length && !chatLiveRequested) {
    body.innerHTML =
      `<div class="chat-options"><div class="co-title">👋 Alfa Traders'a hoş geldin! Nasıl yardımcı olabilirim?</div><div class="co-btn" onclick="chatStartAI()">🤖 Yapay Zekâ ile Hızlı Çözüm</div><div class="co-btn co-live" onclick="chatStartLive()">👤 Canlı Bir Kişiyle Konuş</div></div>`;
    body.scrollTop = body.scrollHeight;
    return;
  }
  const liveBtn = chatFallbackCount >= 2 && !chatLiveRequested ? `<div class="chat-live-btn" onclick="requestLiveSupport()">👤 ${t('chat.live')}</div>` : '';
  body.innerHTML = chatHistory.map(m => `<div class="chat-msg ${m.role}">${esc(m.text)}</div>`).join('') + liveBtn;
  body.scrollTop = body.scrollHeight;
}
function chatStartAI() {
  chatHistory = [
    { role: 'bot', text: 'Harika! Sana nasıl yardımcı olabilirim? Sorunu yaz, hemen cevaplayayım.', time: new Date().toISOString() },
  ];
  saveChat(); renderChat();
  setTimeout(() => document.getElementById('chat-input').focus(), 100);
}
function chatStartLive() {
  requestLiveSupport();
}
function requestLiveSupport() {
  const body = document.getElementById('chat-body');
  const saved = getChatUserInfo();
  body.innerHTML = `<div class="chat-live-form"><div class="clf-title">👤 Canlı destek için bilgilerin:</div><input type="text" id="clf-firstname" placeholder="Adın" value="${esc(saved.firstName)}" /><input type="text" id="clf-lastname" placeholder="Soyadın" value="${esc(saved.lastName)}" /><input type="email" id="clf-email" placeholder="E-posta" value="${esc(saved.email)}" /><button class="clf-btn" onclick="submitLiveSupport()">Bağlan</button></div>`;
  body.scrollTop = body.scrollHeight;
}
function caDelete(sid) {
  if (!confirm('Bu konuşmayı tamamen sil? Tüm mesajlar kalıcı olarak gider.')) return;
  // Önce yerelden sil, sonra API'a bildir
  if (caSelectedSid === sid) { caSelectedSid = null; document.getElementById('ca-msgs').innerHTML = ''; document.getElementById('ca-reply-box').classList.add('hidden'); }
  caAllMsgs = caAllMsgs.filter(m => m.sessionId !== sid);
  caReadSessions.delete(sid);
  updateChatBadge();
  renderAdminChat();
  fetch(CHAT_API, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid }) }).catch(() => {});
}
function getChatUserInfo() {
  try { return JSON.parse(localStorage.getItem('alfa-chat-user')) || { firstName:'', lastName:'', email:'' }; } catch(e) { return { firstName:'', lastName:'', email:'' }; }
}
function saveChatUserInfo(firstName, lastName, email) {
  try { localStorage.setItem('alfa-chat-user', JSON.stringify({ firstName, lastName, email })); } catch(e) {}
}
function submitLiveSupport() {
  const firstName = document.getElementById('clf-firstname').value.trim();
  const lastName = document.getElementById('clf-lastname').value.trim();
  const email = document.getElementById('clf-email').value.trim();
  if (!firstName || !lastName) { alert('Lütfen adını ve soyadını gir.'); return; }
  saveChatUserInfo(firstName, lastName, email);
  chatLiveRequested = true;
  const fullName = firstName + ' ' + lastName;
  const msg = '👤 Canlı destek istiyorum.\nİsim: ' + fullName + '\nE-posta: ' + (email || 'belirtilmedi');
  chatHistory.push({ role: 'user', text: msg, time: new Date().toISOString() });
  chatHistory.push({ role: 'admin', text: '📞 Canlı destek talebin alındı. En kısa sürede sana dönüş yapacağız.', time: new Date().toISOString() });
  saveChat(); renderChat();
  const sid = chatSid();
  fetch(CHAT_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, role: 'user', name: fullName, text: 'Canlı destek talebi - ' + fullName + (email ? ' (' + email + ')' : '') }) }).catch(() => {});
}
const AI_URL = '/api/ai';
function sendChatMsg() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  chatHistory.push({ role: 'user', text, time: new Date().toISOString() });
  // Kullanıcı canlı destek istiyorsa direkt butonu göster (AI yanıtını bekleme)
  if (/canlı destek|müşteri temsilcisi|gerçek kişi|biriyle görüş|temsilci|operatör|yetkili|insanla konuş/i.test(text) && !chatLiveRequested) {
    chatFallbackCount = Math.max(chatFallbackCount, 2);
  }
  saveChat(); renderChat();
  // Sadece canlı destek aktifken admin API'ına gönder
  if (chatLiveRequested) {
    const sid = chatSid();
    fetch(CHAT_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, role: 'user', text }) }).catch(() => {});
  }
  if (BAS_GS_URL) {
    fetch(BAS_GS_URL, { method: 'POST', mode: 'no-cors', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ type: 'chat', message: text, date: new Date().toISOString() }) }).catch(() => {});
  }
  const thinkId = Date.now();
  chatHistory.push({ role: 'bot', text: t('chat.thinking'), _id: thinkId });
  saveChat(); renderChat();
  fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) })
    .then(r => r.json())
    .then(data => {
      let reply = data.reply || getAutoReply(text);
      const isFallback = !data.reply || getAutoReply(text).includes('cevap veremedi');
      if (isFallback) chatFallbackCount++;
      // Buton zaten gösterilecekse gereksiz yere tekrar mesaj ekleme
      const idx = chatHistory.findIndex(m => m._id === thinkId);
      if (idx !== -1) { chatHistory[idx] = { role: 'bot', text: reply }; }
      else { chatHistory.push({ role: 'bot', text: reply }); }
      saveChat(); renderChat();
    })
    .catch(() => {
      const reply = getAutoReply(text);
      chatFallbackCount++;
      // Buton zaten gösterilecekse gereksiz yere tekrar mesaj ekleme
      const idx = chatHistory.findIndex(m => m._id === thinkId);
      if (idx !== -1) { chatHistory[idx] = { role: 'bot', text: reply }; }
      saveChat(); renderChat();
    });
}
let chatPoll = null;
function startChatPoll() {
  clearInterval(chatPoll);
  chatPoll = setInterval(() => {
    const p = document.getElementById('chat-popup');
    if (!p || !p.classList.contains('open')) return;
    const sid = chatSid();
    fetch(CHAT_API + '?t=' + Date.now()).then(r => r.json()).then(msgs => {
      const myMsgs = msgs.filter(m => m.sessionId === sid);
      // Session silinmişse (admin tarafından) local history'i temizle
      if (!myMsgs.length && chatHistory.some(h => h.role === 'admin')) {
        chatHistory = []; saveChat(); renderChat(); return;
      }
      const adminMsgs = myMsgs.filter(m => m.role === 'admin');
      let added = false;
      adminMsgs.forEach(m => {
        if (!chatHistory.some(h => h.time === m.time && h.role === 'admin')) {
          chatHistory.push({ role: 'admin', text: m.text, time: m.time }); added = true;
        }
      });
      if (added) { saveChat(); renderChat(); }
    }).catch(() => {});
  }, 4000);
}
startChatPoll();
function getAutoReply(t) {
  const s = t.toLowerCase();
  if (/merhaba|selam|hey|iyi günler/i.test(s)) return 'Merhaba! 👋 Nasıl yardımcı olabilirim?';
  if (/kayıt|kaydol|nasıl.*katıl|referans|üye/i.test(s)) return 'Bybit veya OKX referans linklerinden birini kullanarak kaydolabilirsin. UID\'ni girip topluluğa katılabilirsin.';
  if (/eğitim|edu|öğren|video|ders|kurs/i.test(s)) return '📚 Ana menüde "Alfa Edu" bölümüne bak — teknik analiz, temel analiz, psikoloji ve onchain dersleri var.';
  if (/topluluk|grup|telegram|sohbet/i.test(s)) return '💬 Telegram: https://t.me/alfatradersweb';
  if (/işlem|trade|analiz|piyasa|grafik/i.test(s)) return 'Topluluk akışında işlem ve analiz paylaşımlarını bulabilirsin.';
  return '🤖 Cevap veremedim.';
}
// ============ Admin Chat Paneli (WhatsApp benzeri) ============
let caAllMsgs = [];
let caSelectedSid = null;
let caPollTimer = null;
let caReadSessions = new Set();
let caLastCount = 0;

function updateChatBadge() {
  const badge = document.getElementById('chat-unread-badge');
  const badgeM = document.getElementById('chat-unread-badge-m');
  if (!badge && !badgeM) return;
  const sessions = {};
  caAllMsgs.forEach(m => {
    if (!sessions[m.sessionId]) sessions[m.sessionId] = [];
    sessions[m.sessionId].push(m);
  });
  let unread = 0;
  Object.keys(sessions).forEach(sid => {
    if (caReadSessions.has(sid)) return;
    const msgs = sessions[sid];
    if (msgs.some(m => m.role === 'user')) unread++;
  });
  const show = unread > 0;
  const text = unread > 9 ? '9+' : unread;
  [badge, badgeM].forEach(b => {
    if (!b) return;
    if (show) { b.textContent = text; b.classList.remove('hidden'); }
    else { b.classList.add('hidden'); }
  });
}

function renderAdminChat() {
  fetch(CHAT_API + '?t=' + Date.now()).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(msgs => {
    const newCount = (msgs || []).length;
    const changed = newCount !== caLastCount;
    caAllMsgs = msgs || [];
    caLastCount = newCount;
    updateChatBadge();
    const list = document.getElementById('ca-list');
    const msgsDiv = document.getElementById('ca-msgs');
    const empty = document.getElementById('ca-empty');
    const replyBox = document.getElementById('ca-reply-box');
    if (!list) return;
    // Değişiklik yoksa sadece badge güncelle
    if (!changed && caSelectedSid) { if (replyBox) replyBox.classList.remove('hidden'); return; }
    const sessions = {};
    caAllMsgs.forEach(m => {
      if (!sessions[m.sessionId]) sessions[m.sessionId] = [];
      sessions[m.sessionId].push(m);
    });
    const sids = Object.keys(sessions);
    if (!sids.length) {
      list.innerHTML = '<div style="color:var(--text-3);font-size:12px;padding:20px;text-align:center;">' + t('pg.chat.noMsgs') + '</div>';
      if (msgsDiv) msgsDiv.innerHTML = ''; empty.style.display = 'block'; replyBox.classList.add('hidden');
      return;
    }
    empty.style.display = 'none';
    // Sol liste
    list.innerHTML = sids.map(sid => {
      const ms = sessions[sid];
      const last = ms[ms.length - 1];
      const unread = !caReadSessions.has(sid) && ms.some(m => m.role === 'user');
      const preview = last.text.substring(0, 30) + (last.text.length > 30 ? '...' : '');
      const time = new Date(last.time).toLocaleString('tr-TR', {hour:'2-digit',minute:'2-digit'});
      // Kullanıcı adını bul: name field'ı varsa kullan, yoksa ilk mesajdan çıkar
      const firstMsg = sessions[sid].find(m => m.role === 'user');
      const userName = last.name || (firstMsg && firstMsg.name) || (firstMsg && firstMsg.text.match(/Canlı destek talebi - (.+?)(?:$|\s*\()/)?.[1]) || sid.substring(0, 6);
      return `<div class="ca-item${caSelectedSid === sid ? ' on' : ''}" data-sid="${sid}"><div onclick="caSelect('${sid}')" style="flex:1;cursor:pointer;">${esc(userName)}${unread ? '<span class="ca-badge">!</span>' : ''}<div class="ca-meta">${esc(preview)} · ${time}</div></div><span class="ca-del" onclick="event.stopPropagation();caDelete('${sid}')" title="Konuşmayı kapat">✕</span></div>`;
    }).join('');
    // İlk seferde son konuşmayı seç
    if (!caSelectedSid || !sessions[caSelectedSid]) caSelectedSid = sids[sids.length - 1];
    showSessionMsgs(sessions, replyBox, msgsDiv);
  }).catch(() => {});
}
function showSessionMsgs(sessions, replyBox, msgsDiv) {
  if (!caSelectedSid || !sessions || !sessions[caSelectedSid]) return;
  caReadSessions.add(caSelectedSid);
  const ms = sessions[caSelectedSid];
  msgsDiv.innerHTML = ms.map(m => `<div class="ca-msg ${m.role === 'user' ? 'u' : 'a'}"><div class="ca-meta">${m.role === 'user' ? 'Kullanıcı' : 'Admin'} · ${new Date(m.time).toLocaleString('tr-TR', {hour:'2-digit',minute:'2-digit'})}</div><div>${esc(m.text)}</div></div>`).join('');
  msgsDiv.scrollTop = msgsDiv.scrollHeight;
  replyBox.classList.remove('hidden');
  updateChatBadge();
}
function caSelect(sid) {
  caSelectedSid = sid;
  caReadSessions.add(sid);
  document.querySelectorAll('.ca-item').forEach(c => c.classList.toggle('on', c.dataset.sid === sid));
  const sessions = {}; caAllMsgs.forEach(m => { if (!sessions[m.sessionId]) sessions[m.sessionId] = []; sessions[m.sessionId].push(m); });
  showSessionMsgs(sessions, document.getElementById('ca-reply-box'), document.getElementById('ca-msgs'));
}
function startAdminChatPoll() {
  clearInterval(caPollTimer);
  caPollTimer = setInterval(() => {
    const p = document.getElementById('page-chat-admin');
    if (!p || p.classList.contains('hidden')) return;
    renderAdminChat();
  }, 5000);
}
// Nav'da bildirim rozetini güncelle (her 8 sn'de bir)
setInterval(() => {
  fetch(CHAT_API + '?t=' + Date.now()).then(r => r.json()).then(msgs => {
    caAllMsgs = msgs || [];
    updateChatBadge();
  }).catch(() => {});
}, 8000);
// ============ Günün Sözü Ticker (Ders Defteri'nden) ============
function showDailyQuote() {
  const el = document.getElementById('ticker-text');
  const au = document.getElementById('ticker-author');
  if (!el) return;
  let text = '', author = '';
  const active = lessonsData?.lessons?.filter(l => l.active) || [];
  if (active.length > 0) {
    // Ders Defteri'ndeki aktif derslerden rastgele birini seç
    const pick = active[Math.floor(Math.random() * active.length)];
    text = pick.text; author = pick.src || 'Ders Defteri';
  } else {
    // Hiç aktif ders yoksa fallback
    text = 'Ders Defteri\'ne bir not ekle, burada görünsün.';
    author = 'Alfa Traders';
  }
  el.textContent = '\u201c' + text + '\u201d';
  if (au) au.textContent = '\u2014 ' + author;
}
showDailyQuote();
loadChat();
loadFeed();
document.addEventListener('DOMContentLoaded', renderFeed);
setTimeout(renderFeed, 100);
initSfxPaste();
initAutoReload();
loadSfx();